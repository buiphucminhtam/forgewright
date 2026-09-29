import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { TrajectoryLedger } from '../runtime/trajectory-ledger.js';
import {
  assertPrivateDataAbsent,
  canonicalJson,
  createReadOnlyTrajectorySummarizer,
  parseCandidateLesson,
  parseLearningRegistry,
  type LearningRegistryRepository,
} from './learning-foundry.js';
import {
  createLearningFoundryToolRuntime,
  type HostLearningBinding,
  type LearningFoundryToolRuntimeFactory,
  type VerifiedTaskEvidenceRequest,
  type VerifiedTaskEvidenceResult,
} from './learning-foundry-runtime.js';

const execFileAsync = promisify(execFile);
const FRAMEWORK_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MAX_RECORD_BYTES = 4 * 1024 * 1024;
const NATIVE_RUNTIME = '.forgewright/runtime';
const DESCRIPTOR_PATH = `${NATIVE_RUNTIME}/native-task-context.json`;
const REGISTRY_PATH = `${NATIVE_RUNTIME}/learning/registry.json`;
const CANDIDATES_PATH = `${NATIVE_RUNTIME}/learning/candidates`;
const LEDGER_PATH = `${NATIVE_RUNTIME}/trajectory-ledgers`;
const SHA = z.string().regex(/^[a-f0-9]{64}$/);
const ID = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

export const NATIVE_TASK_DESCRIPTOR_SCHEMA = 'forgewright-native-task-context/v1' as const;
const safeRelative = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !isAbsolute(value) &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      value.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Unsafe relative path',
  );
const runtimePath = safeRelative.refine(
  (value) => value.startsWith(`${NATIVE_RUNTIME}/`),
  'Outside native runtime',
);
const descriptorSchema = z
  .object({
    schema: z.literal(NATIVE_TASK_DESCRIPTOR_SCHEMA),
    projectId: ID,
    taskId: ID,
    contractPath: runtimePath,
    evidencePaths: z
      .array(safeRelative.refine((value) => value.startsWith('.forgewright/verify/')))
      .min(1)
      .max(32)
      .refine((values) => new Set(values).size === values.length),
    ledgerId: ID,
    ledgerRoot: z.literal(LEDGER_PATH).optional(),
    registryPath: z.literal(REGISTRY_PATH).optional(),
    candidatesDir: z.literal(CANDIDATES_PATH).optional(),
  })
  .strict();
export type NativeTaskDescriptor = z.infer<typeof descriptorSchema>;

/** Validate every parent, then compare the opened inode before reading any bytes. */
function confinedPath(rootInput: string, path: string, allowMissing = false): string {
  const root = realpathSync(rootInput);
  safeRelative.parse(path);
  const parts = path.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = join(current, parts[i]);
    let info;
    try {
      info = lstatSync(current);
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error('NATIVE_PATH_UNAVAILABLE');
    }
    if (info.isSymbolicLink() || (i < parts.length - 1 && !info.isDirectory()))
      throw new Error('NATIVE_PATH_UNSAFE');
    const actual = relative(root, realpathSync(current));
    if (actual.startsWith('..') || isAbsolute(actual)) throw new Error('NATIVE_PATH_ESCAPE');
  }
  return current;
}

function readScoped(root: string, path: string, maximum = MAX_RECORD_BYTES): Buffer {
  const full = confinedPath(root, path);
  const before = lstatSync(full);
  if (!before.isFile() || before.nlink !== 1 || before.size > maximum)
    throw new Error('NATIVE_RECORD_UNSAFE');
  const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(fd);
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > maximum
    )
      throw new Error('NATIVE_RECORD_CHANGED');
    // Revalidate parents before the read. A substituted inode cannot pass the comparison above.
    confinedPath(root, path);
    const buffer = Buffer.alloc(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, Math.min(16384, buffer.length - offset), null);
      if (count === 0) break;
      offset += count;
    }
    const bytes = buffer.subarray(0, offset);
    const after = fstatSync(fd);
    if (
      bytes.length > maximum ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs
    )
      throw new Error('NATIVE_RECORD_CHANGED');
    return bytes;
  } finally {
    closeSync(fd);
  }
}

function jsonScoped(root: string, path: string): unknown {
  const raw = readScoped(root, path);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  return JSON.parse(text) as unknown;
}

function writeScoped(root: string, path: string, value: unknown, immutable = false): void {
  if (path !== DESCRIPTOR_PATH && !path.startsWith(`${CANDIDATES_PATH}/`))
    throw new Error('NATIVE_WRITE_SCOPE_DENIED');
  const data = Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
  if (data.length > 256 * 1024) throw new Error('NATIVE_RECORD_TOO_LARGE');
  const target = confinedPath(root, path, true);
  const parent = dirname(target);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  confinedPath(root, relative(realpathSync(root), parent));
  const parentIdentity = lstatSync(parent);
  if (immutable && existsSync(target)) {
    if (!readScoped(root, path).equals(data)) throw new Error('NATIVE_IMMUTABLE_CONFLICT');
    return;
  }
  if (path.startsWith(`${CANDIDATES_PATH}/`) && readdirSync(parent).length >= 256)
    throw new Error('NATIVE_CANDIDATE_CAPACITY');
  const temporary = `${target}.tmp-${randomBytes(12).toString('hex')}`;
  const fd = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let owned = true;
  try {
    confinedPath(root, relative(realpathSync(root), parent));
    const currentParent = lstatSync(parent);
    if (currentParent.dev !== parentIdentity.dev || currentParent.ino !== parentIdentity.ino)
      throw new Error('NATIVE_PARENT_CHANGED');
    let offset = 0;
    while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
    fsyncSync(fd);
    confinedPath(root, path, true);
    if (lstatSync(parent).ino !== parentIdentity.ino) throw new Error('NATIVE_PARENT_CHANGED');
    renameSync(temporary, target);
    owned = false;
  } finally {
    closeSync(fd);
    if (owned) {
      try {
        unlinkSync(temporary);
      } catch {
        /* only our exclusive temporary */
      }
    }
  }
}

export function getNativeTaskDescriptorPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, DESCRIPTOR_PATH);
}
export function readNativeTaskDescriptor(workspaceRoot: string): NativeTaskDescriptor | null {
  try {
    return descriptorSchema.parse(jsonScoped(workspaceRoot, DESCRIPTOR_PATH));
  } catch {
    return null;
  }
}
export function writeNativeTaskDescriptor(
  workspaceRoot: string,
  descriptor: NativeTaskDescriptor,
): void {
  writeScoped(realpathSync(workspaceRoot), DESCRIPTOR_PATH, descriptorSchema.parse(descriptor));
}

const boundedText = z.string().trim().min(1).max(4096);
const contractSchema = z
  .object({
    version: z.literal(1),
    status: z.literal('locked'),
    task_class: z.enum(['quick', 'standard', 'deep']),
    objective: boundedText,
    acceptance_criteria: z.array(z.string().trim().min(1).max(512)).min(1).max(32),
    scope_ids: z.array(z.string().min(1).max(512)).min(1).max(32),
    out_of_scope: z.array(z.string().max(512)).max(32),
    replan_triggers: z.array(z.string().min(1).max(128)).max(16),
    phase_policy: z
      .object({
        planning: z
          .object({ phase: z.literal('planning'), tier: z.string(), reasoning_effort: z.string() })
          .strict(),
        execution: z.object({ reasoning_by_tier: z.record(z.string()) }).strict(),
        audit: z
          .object({ phase: z.literal('audit'), tier: z.string(), reasoning_effort: z.string() })
          .strict(),
      })
      .strict(),
    digest: SHA,
  })
  .strict();
function readContract(root: string, descriptor: NativeTaskDescriptor) {
  const contract = contractSchema.parse(jsonScoped(root, descriptor.contractPath));
  const { digest: expected, ...core } = contract;
  if (digest(canonicalJson(core)) !== expected) throw new Error('NATIVE_CONTRACT_DIGEST_MISMATCH');
  return contract;
}

const processEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(?:PYTHON|GIT_|FORGEWRIGHT_|NODE_OPTIONS|RESPONSE_CONTENT|FILES_TO_CHECK)/.test(key),
    ),
  );
/** Reuse the installed, existing fingerprint implementation; consumer code is never imported. */
async function snapshot(rootInput: string): Promise<{ head: string; tree: string }> {
  const root = realpathSync(rootInput);
  const options = {
    cwd: FRAMEWORK_ROOT,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    env: processEnv(),
  };
  const { stdout: headOutput } = await execFileAsync(
    'git',
    ['-C', root, 'rev-parse', 'HEAD'],
    options,
  );
  const head = headOutput.trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) throw new Error('NATIVE_GIT_HEAD_INVALID');
  const fixedReadOnlyProgram =
    'import sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from scripts.lite.evidence_common import worktree_fingerprint; print(worktree_fingerprint(Path(sys.argv[2])))';
  const { stdout } = await execFileAsync(
    'python3',
    ['-I', '-B', '-c', fixedReadOnlyProgram, FRAMEWORK_ROOT, root],
    options,
  );
  const tree = stdout.trim();
  if (!/^TREE:[a-f0-9]{64}$/.test(tree)) throw new Error('NATIVE_TREE_UNAVAILABLE');
  const { stdout: after } = await execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD'], options);
  if (after.trim() !== head) throw new Error('NATIVE_REVISION_DRIFT');
  return { head, tree };
}

export async function readCurrentBinding(
  workspaceRoot: string,
): Promise<HostLearningBinding | null> {
  try {
    const root = realpathSync(workspaceRoot);
    const descriptor = readNativeTaskDescriptor(root);
    if (!descriptor) return null;
    const contextFingerprint = digest(readScoped(root, DESCRIPTOR_PATH));
    const contract = readContract(root, descriptor);
    const current = await snapshot(root);
    if (digest(readScoped(root, DESCRIPTOR_PATH)) !== contextFingerprint) return null;
    return {
      projectId: descriptor.projectId,
      taskId: descriptor.taskId,
      planDigest: contract.digest,
      sourceRevision: current.head,
      treeFingerprint: current.tree,
      acceptanceCriteriaDigest: digest(canonicalJson(contract.acceptance_criteria)),
      contextFingerprint,
      workspaceFingerprint: digest(root),
    };
  } catch {
    return null;
  }
}

const acceptanceSchema = z.object({
  id: z.string().min(1).max(128),
  claim: z.string().min(1).max(4096),
  test_refs: z.array(z.string().min(1).max(1024)).min(1).max(64),
});
const evidenceSchema = z
  .object({
    schema_version: z.literal('2'),
    phase: z.enum(['green', 'verification']),
    exit_code: z.literal(0),
    output: z
      .string()
      .min(1)
      .max(1024 * 1024),
    output_sha256: SHA,
    output_truncated: z.literal(false),
    workspace: z.string().min(1).max(4096),
    tree_sha: z.string().regex(/^TREE:[a-f0-9]{64}$/),
    timestamp_utc: z.string().datetime({ offset: true }),
    turn: z.string().min(1).max(128),
    command: z.array(z.string().max(4096)).min(1).max(128),
    acceptance_criteria: z.array(acceptanceSchema).min(1).max(64),
    test_refs: z.array(z.string().min(1).max(1024)).min(1).max(64),
    negative_paths: z.array(z.string().min(1).max(4096)).min(1).max(64),
    negative_path_bindings: z
      .array(
        z.object({
          id: z.string().min(1),
          claim: z.string().min(1),
          acceptance_ids: z.array(z.string()).min(1),
          test_refs: z.array(z.string()).min(1),
        }),
      )
      .min(1)
      .max(64),
    execution: z
      .object({
        runner: z.string().min(1),
        entrypoints: z.array(z.string()).min(1).max(64),
        test_refs: z.array(z.string()).min(1).max(64),
      })
      .strict(),
    tier: z.enum(['unit', 'contract', 'integration', 'runtime', 'e2e', 'security', 'review']),
    implementer_id: z.string().min(3).max(128),
    reviewer: z
      .object({
        status: z.enum(['not_required', 'pending', 'independent-approved']),
        id: z.string().optional(),
        evidence_ref: z.string().optional(),
      })
      .passthrough(),
    limitations: z.array(z.string()).max(64),
    change_kind: z.string().min(1),
    risk: z.enum(['quick', 'standard', 'hard']).optional(),
  })
  .passthrough();

function derivedInvocation(
  root: string,
  command: string[],
): { runner: string; entrypoints: string[] } {
  const executable = basename(command[0]);
  let runner: string;
  let candidates: string[];
  if (['pytest', 'py.test', 'vitest', 'jest', 'mocha', 'playwright'].includes(executable)) {
    runner = executable;
    candidates = command.slice(1);
  } else if (
    /^python(?:[0-9]+(?:\.[0-9]+)*[a-z]*)?$/.test(executable) &&
    command[1] === '-m' &&
    command[2] === 'pytest'
  ) {
    runner = 'pytest';
    candidates = command.slice(3);
  } else if (
    /^python(?:[0-9]+(?:\.[0-9]+)*[a-z]*)?$/.test(executable) &&
    command[1] &&
    !command[1].startsWith('-')
  ) {
    runner = 'python-script';
    candidates = [command[1]];
  } else if (
    ['node', 'ruby', 'perl'].includes(executable) &&
    command[1] &&
    !command[1].startsWith('-')
  ) {
    runner = `${executable}-script`;
    candidates = [command[1]];
  } else if (
    ['sh', 'bash', 'zsh', 'dash'].includes(executable) &&
    command[1] &&
    !command[1].startsWith('-')
  ) {
    runner = 'shell-script';
    candidates = [command[1]];
  } else if (command[0].includes('/')) {
    runner = 'project-executable';
    candidates = [command[0]];
  } else throw new Error('NATIVE_UNSUPPORTED_VERIFIER_COMMAND');
  const entrypoints: string[] = [];
  for (const candidate of candidates) {
    const [file, ...suffix] = candidate.split('::');
    if (file.startsWith('-')) continue;
    const path = isAbsolute(file) ? relative(root, file) : file.replace(/^\.\//, '');
    try {
      readScoped(root, path);
      entrypoints.push(path + (suffix.length ? `::${suffix.join('::')}` : ''));
    } catch {
      /* options are not verifier paths; required refs are checked below */
    }
  }
  if (!entrypoints.length) throw new Error('NATIVE_VERIFIER_NOT_INVOKED');
  return { runner, entrypoints: [...new Set(entrypoints)].sort() };
}

function validateEvidence(
  root: string,
  raw: Buffer,
  binding: HostLearningBinding,
  acceptedClaims: Set<string>,
  requireReview: boolean,
): void {
  const evidence = evidenceSchema.parse(
    JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(raw)),
  );
  if (!evidence.output.trim() || digest(evidence.output) !== evidence.output_sha256)
    throw new Error('NATIVE_OUTPUT_INVALID');
  assertPrivateDataAbsent(evidence.output);
  if (realpathSync(evidence.workspace) !== root || evidence.tree_sha !== binding.treeFingerprint)
    throw new Error('NATIVE_EVIDENCE_STALE');
  const age = Date.now() - Date.parse(evidence.timestamp_utc);
  if (!Number.isFinite(age) || age < 0 || age > 60 * 60 * 1000)
    throw new Error('NATIVE_EVIDENCE_AGE');
  const invocation = derivedInvocation(root, evidence.command);
  if (
    invocation.runner !== evidence.execution.runner ||
    canonicalJson(invocation.entrypoints) !==
      canonicalJson([...evidence.execution.entrypoints].sort()) ||
    canonicalJson(evidence.execution.test_refs) !== canonicalJson(evidence.test_refs)
  )
    throw new Error('NATIVE_EXECUTION_MANIFEST_MISMATCH');
  const invoked = new Set(invocation.entrypoints);
  if (evidence.test_refs.some((ref) => !invoked.has(ref)))
    throw new Error('NATIVE_UNINVOKED_VERIFIER');
  for (const criterion of evidence.acceptance_criteria) {
    if (criterion.test_refs.some((ref) => !invoked.has(ref)))
      throw new Error('NATIVE_UNINVOKED_ACCEPTANCE');
    acceptedClaims.add(criterion.claim);
  }
  for (const negative of evidence.negative_path_bindings) {
    if (
      !evidence.negative_paths.includes(negative.claim) ||
      negative.test_refs.some((ref) => !invoked.has(ref)) ||
      negative.acceptance_ids.some((id) => !evidence.acceptance_criteria.some((ac) => ac.id === id))
    )
      throw new Error('NATIVE_NEGATIVE_BINDING_INVALID');
  }
  if (requireReview || evidence.risk === 'hard') {
    if (evidence.reviewer.status !== 'independent-approved' || !evidence.reviewer.evidence_ref)
      throw new Error('NATIVE_INDEPENDENT_REVIEW_REQUIRED');
    const reviewPath = evidence.reviewer.evidence_ref.startsWith('.forgewright/verify/')
      ? evidence.reviewer.evidence_ref
      : `.forgewright/verify/${evidence.reviewer.evidence_ref}`;
    const review = jsonScoped(root, reviewPath) as Record<string, unknown>;
    if (
      review.schema_version !== 'review-2' ||
      review.namespace !== 'forgewright-review-v2' ||
      typeof review.timestamp_utc !== 'string' ||
      Date.parse(review.timestamp_utc) < Date.parse(evidence.timestamp_utc) ||
      Date.parse(review.timestamp_utc) > Date.now() ||
      review.status !== 'independent-approved' ||
      review.implementer_id !== evidence.implementer_id ||
      typeof review.reviewer_id !== 'string' ||
      review.reviewer_id.length < 3 ||
      review.reviewer_id === evidence.implementer_id ||
      review.reviewer_id !== evidence.reviewer.id ||
      review.workspace !== root ||
      review.tree_sha !== evidence.tree_sha ||
      review.turn !== evidence.turn ||
      review.evidence_sha256 !== digest(canonicalJson(evidence)) ||
      canonicalJson(review.acceptance_ids) !==
        canonicalJson(evidence.acceptance_criteria.map((item) => item.id).sort()) ||
      canonicalJson(review.negative_path_bindings) !==
        canonicalJson(evidence.negative_path_bindings)
    )
      throw new Error('NATIVE_REVIEW_BINDING_INVALID');
  }
}

export async function verifyAcceptedTaskEvidence(
  workspaceRoot: string,
  request: VerifiedTaskEvidenceRequest,
): Promise<VerifiedTaskEvidenceResult> {
  let stage = 'binding';
  try {
    const root = realpathSync(workspaceRoot);
    const descriptor = readNativeTaskDescriptor(root);
    const binding = await readCurrentBinding(root);
    if (!descriptor || !binding)
      return { status: 'UNVERIFIED', reason: 'native_context_unavailable' };
    for (const key of [
      'projectId',
      'taskId',
      'planDigest',
      'sourceRevision',
      'treeFingerprint',
      'acceptanceCriteriaDigest',
    ] as const) {
      if (request[key] !== binding[key])
        return { status: 'FAIL', reason: 'task_or_evidence_binding_mismatch' };
    }
    const contract = readContract(root, descriptor);
    stage = 'evidence';
    const claims = new Set<string>();
    const hashes: string[] = [];
    for (const evidencePath of descriptor.evidencePaths) {
      const raw = readScoped(root, evidencePath);
      validateEvidence(root, raw, binding, claims, contract.task_class === 'deep');
      hashes.push(digest(raw));
    }
    if (
      canonicalJson([...hashes].sort()) !==
        canonicalJson([...request.sourceVerifierSha256s].sort()) ||
      contract.acceptance_criteria.some((claim) => !claims.has(claim))
    )
      return { status: 'FAIL', reason: 'verifier_or_acceptance_mismatch' };
    stage = 'ledger';
    const ledgerRoot = confinedPath(root, descriptor.ledgerRoot ?? LEDGER_PATH);
    confinedPath(root, `${descriptor.ledgerRoot ?? LEDGER_PATH}/${descriptor.ledgerId}`);
    const ledger = new TrajectoryLedger({ root: ledgerRoot, ledgerId: descriptor.ledgerId });
    const events = await ledger.reconstruct();
    const opened = events[0];
    const terminal = events.at(-1);
    if (
      opened?.kind !== 'trajectory.opened' ||
      opened.payload.workspaceId !== binding.projectId ||
      opened.payload.sessionId !== binding.taskId ||
      opened.payload.objectiveDigest !== binding.planDigest ||
      terminal?.kind !== 'trajectory.terminal' ||
      terminal.payload.outcome !== 'completed' ||
      terminal.payload.quiescence !== 'confirmed'
    )
      return { status: 'FAIL', reason: 'task_ledger_not_accepted' };
    const expectedTip = await ledger.tip();
    stage = 'summary';
    await createReadOnlyTrajectorySummarizer().summarizeTrajectory({ ledger, expectedTip });
    if (canonicalJson(await readCurrentBinding(root)) !== canonicalJson(binding))
      return { status: 'FAIL', reason: 'host_drift_detected' };
    return {
      status: 'PASS',
      matching: { ...request, sessionId: request.taskId, sourceVerifierSha256s: hashes },
      ledger,
      expectedTip,
    };
  } catch (error) {
    const reason =
      error instanceof z.ZodError
        ? `native_evidence_schema:${error.issues
            .map((issue) => issue.path.join('.'))
            .slice(0, 5)
            .join(',')}`
        : error instanceof Error && /^NATIVE_[A-Z_]+$/.test(error.message)
          ? error.message.toLowerCase()
          : error instanceof Error && /^LEARNING_[A-Z_]+$/.test(error.message)
            ? `${stage}:${error.message.toLowerCase()}`
            : `native_evidence_validation_failed:${stage}`;
    return { status: 'UNVERIFIED', reason };
  }
}

export function persistCandidateProposal(
  workspaceRoot: string,
  input: Record<string, unknown>,
): void {
  const candidate = parseCandidateLesson(input);
  assertPrivateDataAbsent(candidate);
  writeScoped(
    workspaceRoot,
    `${CANDIDATES_PATH}/${candidate.candidateSha256}.json`,
    candidate,
    true,
  );
}

export function inspectNativeLearning(workspaceRoot: string): {
  status: 'disabled' | 'awaiting-task-evidence' | 'ready-for-intake';
  descriptor: NativeTaskDescriptor | null;
} {
  const descriptor = readNativeTaskDescriptor(workspaceRoot);
  if (!descriptor) return { status: 'disabled', descriptor: null };
  try {
    readContract(workspaceRoot, descriptor);
    for (const path of descriptor.evidencePaths) readScoped(workspaceRoot, path);
    parseLearningRegistry(jsonScoped(workspaceRoot, descriptor.registryPath ?? REGISTRY_PATH));
    confinedPath(workspaceRoot, `${descriptor.ledgerRoot ?? LEDGER_PATH}/${descriptor.ledgerId}`);
    return { status: 'ready-for-intake', descriptor };
  } catch {
    return { status: 'awaiting-task-evidence', descriptor };
  }
}

export function createNativeLearningRuntimeFactory(
  workspaceRoot: string,
): LearningFoundryToolRuntimeFactory {
  return () => ({
    async execute(name, args) {
      const root = realpathSync(workspaceRoot);
      const descriptor = readNativeTaskDescriptor(root);
      if (!descriptor) return createLearningFoundryToolRuntime().execute(name, args);
      const initialContext = digest(readScoped(root, DESCRIPTOR_PATH));
      const registryPath = descriptor.registryPath ?? REGISTRY_PATH;
      let initialRegistry;
      try {
        initialRegistry = parseLearningRegistry(jsonScoped(root, registryPath));
      } catch {
        return {
          isError: true,
          content: [{ type: 'text', text: 'NATIVE_TASK_EVIDENCE_UNAVAILABLE' }],
          structuredContent: { status: 'awaiting-task-evidence', promoted: false },
        };
      }
      const repository: LearningRegistryRepository = {
        registryId: initialRegistry.registryId,
        async read() {
          return parseLearningRegistry(jsonScoped(root, registryPath));
        },
        async transact() {
          throw new Error('NATIVE_INTAKE_HAS_NO_PROMOTION_AUTHORITY');
        },
      };
      const runtime = createLearningFoundryToolRuntime({
        summarizer: createReadOnlyTrajectorySummarizer(),
        repository,
        readCurrentBinding: () => readCurrentBinding(root),
        verifyAcceptedTaskEvidence: (request) => verifyAcceptedTaskEvidence(root, request),
        persistCandidateProposal: async (candidate) => {
          if (digest(readScoped(root, DESCRIPTOR_PATH)) !== initialContext)
            throw new Error('NATIVE_CONTEXT_DRIFT');
          const accepted = await verifyAcceptedTaskEvidence(root, {
            projectId: args.projectId as string,
            taskId: args.taskId as string,
            planDigest: args.planDigest as string,
            sourceRevision: args.sourceRevision as string,
            treeFingerprint: args.treeFingerprint as string,
            acceptanceCriteriaDigest: args.acceptanceCriteriaDigest as string,
            sourceVerifierSha256s: args.sourceVerifierSha256s as string[],
          });
          if (accepted.status !== 'PASS') throw new Error('NATIVE_EVIDENCE_DRIFT');
          if (canonicalJson(await repository.read()) !== canonicalJson(initialRegistry))
            throw new Error('NATIVE_REGISTRY_DRIFT');
          persistCandidateProposal(root, candidate as unknown as Record<string, unknown>);
        },
      });
      return runtime.execute(name, args);
    },
  });
}
