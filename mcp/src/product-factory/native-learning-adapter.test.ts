import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';
import {
  existsSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { TrajectoryLedger, canonicalJson } from '../runtime/trajectory-ledger.js';
import { createEmptyLearningRegistry } from './learning-foundry.js';
import {
  createNativeLearningRuntimeFactory,
  inspectNativeLearning,
  readCurrentBinding,
  readNativeTaskDescriptor,
  verifyAcceptedTaskEvidence,
  writeNativeTaskDescriptor,
  type NativeTaskDescriptor,
} from './native-learning-adapter.js';

const framework = resolve(process.cwd(), '..');
const roots: string[] = [];
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function tempDir(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-learning-e2e-')));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function terminalLedger(
  root: string,
  planDigest: string,
  outcome: 'completed' | 'failed' = 'completed',
) {
  const ledger = new TrajectoryLedger({
    root: join(root, '.forgewright/runtime/trajectory-ledgers'),
    ledgerId: 'task-ledger',
  });
  const now = Date.now();
  await ledger.append({
    eventId: 'opened',
    kind: 'trajectory.opened',
    occurredAtMs: now - 100,
    causalEventIds: [],
    payload: {
      objectiveDigest: planDigest,
      workspaceId: 'project-fixture',
      sessionId: 'task-fixture',
      origin: 'test-only',
      writerEpoch: 1,
      rootScopeId: 'local',
    },
  });
  const started = await ledger.append({
    eventId: 'finalization-started',
    kind: 'finalization.started',
    occurredAtMs: now - 90,
    causalEventIds: ['opened'],
    payload: { reasonCode: 'complete', deadlineAtMs: now + 1000 },
  });
  const summary = {
    status: 'complete' as const,
    disposedCount: 0,
    failedDisposerCount: 0,
    timedOutDisposerCount: 0,
    unresolvedOperationCount: 0,
    unresolvedScopeCount: 0,
    unresolvedDisposerCount: 0,
    deadlineAtMs: now + 1000,
    quiescence: 'confirmed' as const,
  };
  await ledger.append({
    eventId: 'finalization-receipt',
    kind: 'finalization.receipt',
    occurredAtMs: now - 80,
    causalEventIds: ['finalization-started'],
    payload: {
      ...summary,
      predecessorSequence: started.tip.sequence,
      predecessorHash: started.tip.hash!,
      receiptDigest: digest(
        canonicalJson({
          ...summary,
          predecessorTip: { sequence: started.tip.sequence, hash: started.tip.hash! },
        }),
      ),
    },
  });
  await ledger.append({
    eventId: 'terminal',
    kind: 'trajectory.terminal',
    occurredAtMs: now - 70,
    causalEventIds: ['finalization-receipt'],
    payload: {
      outcome,
      summaryDigest: planDigest,
      cleanupOutcome: 'completed',
      quiescence: 'confirmed',
      receiptEventId: 'finalization-receipt',
    },
  });
}

async function fixture(options: { ledgerPlan?: string; outcome?: 'completed' | 'failed' } = {}) {
  const root = tempDir();
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-b', 'main');
  git('config', 'user.email', 'tests@example.invalid');
  git('config', 'user.name', 'Local native fixture');
  // Real acceptance assertion and negative behavior, not an empty exit-zero shell script.
  writeFileSync(
    join(root, 'test_rule.py'),
    [
      'import pytest',
      'def bounded_value(value):',
      '    if not isinstance(value, int) or isinstance(value, bool) or value < 0: raise ValueError("invalid")',
      '    return value',
      'def test_local_rule():',
      '    assert bounded_value(7) == 7',
      '    with pytest.raises(ValueError): bounded_value(-1)',
      '    with pytest.raises(ValueError): bounded_value(True)',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(root, '.gitignore'),
    '.forgewright/runtime/\n.forgewright/verify/\n__pycache__/\n.pytest_cache/\n',
  );
  git('add', 'test_rule.py', '.gitignore');
  git('commit', '-m', 'local acceptance fixture');
  mkdirSync(join(root, '.forgewright/runtime/learning'), { recursive: true });
  // A real spawned MCP requires the unchanged project policy before evidence capture.
  copyFileSync(
    join(framework, '.forgewright/execution-policy.yaml'),
    join(root, '.forgewright/execution-policy.yaml'),
  );
  const contractCode =
    'import sys,json;sys.path.insert(0,sys.argv[1]);from scripts.runtime.execution_contract import lock_execution_contract;print(json.dumps(lock_execution_contract({"requirements":"Verify bounded local input","acceptance_criteria":["Local input rule accepts valid input and rejects invalid input"],"out_of_scope":["No network"],"task_class":"standard"},[{"scope_id":"local"}]),ensure_ascii=False))';
  const contract = JSON.parse(
    execFileSync('python3', ['-I', '-B', '-c', contractCode, framework], {
      cwd: framework,
      encoding: 'utf8',
    }),
  );
  writeFileSync(join(root, '.forgewright/runtime/locked-contract.json'), JSON.stringify(contract));
  const registryPath = join(root, '.forgewright/runtime/learning/registry.json');
  writeFileSync(
    registryPath,
    JSON.stringify(createEmptyLearningRegistry('native-registry')) + '\n',
  );
  await terminalLedger(root, options.ledgerPlan ?? contract.digest, options.outcome);
  const descriptor: NativeTaskDescriptor = {
    schema: 'forgewright-native-task-context/v1',
    projectId: 'project-fixture',
    taskId: 'task-fixture',
    contractPath: '.forgewright/runtime/locked-contract.json',
    evidencePaths: ['.forgewright/verify/native-fixture.json'],
    ledgerId: 'task-ledger',
  };
  writeNativeTaskDescriptor(root, descriptor);
  execFileSync(
    'python3',
    [
      '-B',
      join(framework, 'scripts/lite/run_check.py'),
      '--turn',
      'native-fixture',
      '--acceptance',
      'ac-local=Local input rule accepts valid input and rejects invalid input',
      '--test-ref',
      'test_rule.py::test_local_rule',
      '--tier',
      'integration',
      '--phase',
      'verification',
      '--negative-path',
      'Invalid local input is rejected',
      '--negative-path-binding',
      'negative-local=Invalid local input is rejected|ac-local|test_rule.py::test_local_rule',
      '--limitations',
      'Test-only local task; not a production outcome or performance claim',
      '--change-kind',
      'feature',
      '--risk',
      'standard',
      '--implementer-id',
      'local-fixture-implementer',
      '--reviewer-status',
      'pending',
      'python3',
      '-m',
      'pytest',
      '-q',
      '-p',
      'no:cacheprovider',
      'test_rule.py::test_local_rule',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  const evidencePath = join(root, descriptor.evidencePaths[0]);
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const args = {
    projectId: descriptor.projectId,
    taskId: descriptor.taskId,
    planDigest: contract.digest,
    sourceRevision: git('rev-parse', 'HEAD'),
    treeFingerprint: evidence.tree_sha,
    acceptanceCriteriaDigest: digest(canonicalJson(contract.acceptance_criteria)),
    sourceVerifierSha256s: [digest(readFileSync(evidencePath))],
    trigger: 'Rejected invalid local input',
    correction: 'Require nonnegative integer values and exclude booleans',
    scope: 'local',
  };
  return {
    root,
    descriptor,
    contract,
    evidencePath,
    registryPath,
    args,
    runtime: createNativeLearningRuntimeFactory(root)(),
  };
}

async function withNativeClient<T>(
  root: string,
  mode: 'local' | 'production',
  action: (client: Client) => Promise<T>,
  installedEntry?: string,
): Promise<T> {
  const runtimeRoot = join(root, '.forgewright/runtime/protocol-smoke');
  mkdirSync(join(runtimeRoot, 'home'), { recursive: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [installedEntry ?? join(framework, 'mcp/build/index.js')],
    cwd: root,
    stderr: 'pipe',
    maxBufferSize: 256 * 1024,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: join(runtimeRoot, 'home'),
      LANG: process.env.LANG ?? 'en_US.UTF-8',
      TMPDIR: tmpdir(),
      ...(installedEntry ? {} : { FORGEWRIGHT_DIR: framework }),
      FORGEWRIGHT_WORKSPACE: root,
      FORGEWRIGHT_RUNTIME_MODE: mode,
      FORGEWRIGHT_CALLER_ID: 'native-protocol-test',
      FORGEWRIGHT_CONTAINMENT_PROFILE: 'application',
      FORGEWRIGHT_MCP_LEASE_ROOT: join(runtimeRoot, 'leases'),
      FORGEWRIGHT_TRAJECTORY_ROOT: join(runtimeRoot, 'trajectories'),
      FORGEWRIGHT_TRAJECTORY_ID: 'protocol-session',
      FORGEWRIGHT_SESSION_ID: 'protocol-session',
      FORGEWRIGHT_TELEMETRY_DIR: join(root, '.forgewright/telemetry'),
      FORGEWRIGHT_LIFECYCLE_SHUTDOWN_TIMEOUT_MS: '5000',
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
  let diagnostics = '';
  transport.stderr?.on('data', (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString('utf8')).slice(-8192);
  });
  const client = new Client({ name: 'forgewright-native-protocol-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await action(client);
  } catch (error) {
    if (error instanceof Error) error.message += `\nNative process diagnostics: ${diagnostics}`;
    throw error;
  } finally {
    await client.close();
    await transport.close();
    expect(transport.pid).toBeNull();
  }
}

describe('native-learning-adapter', () => {
  it('real stdio works in the copied canonical installation without checkout helpers', async () => {
    const f = await fixture();
    const installation = join(tempDir(), 'mcp-server');
    mkdirSync(installation);
    cpSync(join(framework, 'mcp/build'), join(installation, 'build'), { recursive: true });
    copyFileSync(join(framework, 'mcp/package.json'), join(installation, 'package.json'));
    // Match this package's resolved dependencies, not a hoisted incompatible
    // major version (the workspace also contains a separate Zod v4 package).
    const dependencies = Object.keys(
      JSON.parse(readFileSync(join(framework, 'mcp/package.json'), 'utf8')).dependencies,
    );
    for (const name of dependencies) {
      const local = join(framework, 'mcp/node_modules', name);
      const source = existsSync(local) ? local : join(framework, 'node_modules', name);
      const destination = join(installation, 'node_modules', name);
      mkdirSync(dirname(destination), { recursive: true });
      symlinkSync(source, destination, 'dir');
    }
    execFileSync(
      'bash',
      [
        '-c',
        'source "$1"; FORGEWRIGHT_DIR="$2"; CANONICAL_STAGE_DIR="$3"; stage_runtime_support',
        'stage-support',
        join(framework, 'scripts/mcp/forgewright-mcp-setup.sh'),
        framework,
        installation,
      ],
      { cwd: installation },
    );
    for (const name of ['evidence_common.py', 'policy-check.sh', 'telemetry.sh']) {
      expect(readFileSync(join(installation, 'runtime-support/scripts/lite', name))).toEqual(
        readFileSync(join(framework, 'scripts/lite', name)),
      );
    }
    const packagedTree = execFileSync(
      'python3',
      [
        '-I',
        '-B',
        '-c',
        'import sys; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from scripts.lite.evidence_common import worktree_fingerprint; print(worktree_fingerprint(Path(sys.argv[2])))',
        join(installation, 'runtime-support'),
        f.root,
      ],
      { cwd: join(installation, 'runtime-support'), encoding: 'utf8' },
    ).trim();
    expect(packagedTree).toBe(f.args.treeFingerprint);
    const before = readFileSync(f.registryPath);
    await withNativeClient(
      f.root,
      'local',
      async (client) => {
        const result = await client.callTool({
          name: 'fw_record_learning_candidate',
          arguments: f.args,
        });
        expect(
          (result.structuredContent as Record<string, unknown> | undefined)?.status,
          JSON.stringify(result),
        ).toBe('candidate_created');
        expect((result.structuredContent as Record<string, unknown> | undefined)?.promoted).toBe(
          false,
        );
        expect(readFileSync(f.registryPath)).toEqual(before);
      },
      join(installation, 'build/index.js'),
    );
  }, 90000);

  it.each(['local', 'production'] as const)(
    'real stdio %s reaches bounded candidate intake with all gates enabled',
    async (mode) => {
      const f = await fixture();
      const registryBefore = readFileSync(f.registryPath);
      await withNativeClient(f.root, mode, async (client) => {
        const names = (await client.listTools()).tools.map((tool) => tool.name);
        expect(names).toContain('fw_record_learning_candidate');
        const accepted = await client.callTool({
          name: 'fw_record_learning_candidate',
          arguments: f.args,
        });
        expect(accepted.isError, JSON.stringify(accepted)).not.toBe(true);
        expect(
          (accepted.structuredContent as Record<string, unknown> | undefined)?.status,
          JSON.stringify(accepted),
        ).toBe('candidate_created');
        expect((accepted.structuredContent as Record<string, unknown> | undefined)?.promoted).toBe(
          false,
        );
        const id = (accepted.structuredContent as Record<string, unknown> | undefined)
          ?.candidateId as string;
        expect(
          existsSync(join(f.root, '.forgewright/runtime/learning/candidates', id + '.json')),
        ).toBe(true);
        expect(readFileSync(f.registryPath)).toEqual(registryBefore);
        const wrongTask = await client.callTool({
          name: 'fw_record_learning_candidate',
          arguments: { ...f.args, taskId: 'other-task' },
        });
        expect((wrongTask.structuredContent as Record<string, unknown> | undefined)?.status).toBe(
          'rejected',
        );
        const evidence = await client.callTool({
          name: 'fw_record_learning_candidate',
          arguments: { ...f.args, sourceVerifierSha256s: ['0'.repeat(64)] },
        });
        expect((evidence.structuredContent as Record<string, unknown> | undefined)?.status).toBe(
          'rejected',
        );
        const escaped = await client.callTool({
          name: 'fw_record_learning_candidate',
          arguments: { ...f.args, path: '../outside.json', command: 'echo rejected' },
        });
        expect(escaped.isError).toBe(true);
        expect(escaped.content).toContainEqual({
          type: 'text',
          text: 'CONTAINMENT_INVALID_ARGUMENTS',
        });
        const unknown = await client.callTool({
          name: 'fw_record_learning_candidate_typo',
          arguments: f.args,
        });
        expect(unknown.isError).toBe(true);
        expect(unknown.content).toContainEqual({ type: 'text', text: 'CONTAINMENT_UNKNOWN_TOOL' });
        writeFileSync(
          join(f.root, '.forgewright/execution-policy.yaml'),
          'mode: altered-test-policy\n',
        );
        const changed = await client.callTool({
          name: 'fw_record_learning_candidate',
          arguments: f.args,
        });
        expect(changed.isError).toBe(true);
        expect(changed.content).toContainEqual({
          type: 'text',
          text: 'CONTAINMENT_POLICY_CHANGED',
        });
        expect(readFileSync(f.registryPath)).toEqual(registryBefore);
      });
    },
    90000,
  );

  it('real stdio without a descriptor reaches missing-host validation rather than unknown-tool denial', async () => {
    const f = await fixture();
    rmSync(join(f.root, '.forgewright/runtime/native-task-context.json'));
    await withNativeClient(f.root, 'local', async (client) => {
      const result = await client.callTool({
        name: 'fw_record_learning_candidate',
        arguments: f.args,
      });
      expect(result.isError).toBe(true);
      expect(result.content).toContainEqual({
        type: 'text',
        text: 'LEARNING_HOST_CAPABILITY_UNAVAILABLE',
      });
      expect(readFileSync(f.registryPath).length).toBeGreaterThan(0);
    });
  }, 60000);

  it('reads and writes task descriptor and inspects status', () => {
    const root = tempDir();
    expect(inspectNativeLearning(root).status).toBe('disabled');
    expect(readNativeTaskDescriptor(root)).toBeNull();
    const descriptor: NativeTaskDescriptor = {
      schema: 'forgewright-native-task-context/v1',
      projectId: 'project-fixture',
      taskId: 'task-fixture',
      contractPath: '.forgewright/runtime/locked-contract.json',
      evidencePaths: ['.forgewright/verify/fixture.json'],
      ledgerId: 'task-ledger',
    };
    writeNativeTaskDescriptor(root, descriptor);
    expect(readNativeTaskDescriptor(root)).toEqual(descriptor);
    expect(inspectNativeLearning(root).status).toBe('awaiting-task-evidence');
  });

  it('runs real end-to-end native candidate intake from verified task evidence', async () => {
    const f = await fixture();
    const before = readFileSync(f.registryPath);
    expect(inspectNativeLearning(f.root).status).toBe('ready-for-intake');
    expect((await readCurrentBinding(f.root))?.treeFingerprint).toBe(f.args.treeFingerprint);
    const result = await f.runtime.execute('fw_record_learning_candidate', f.args);
    expect(result.structuredContent.status, JSON.stringify(result.structuredContent)).toBe(
      'candidate_created',
    );
    expect(result.structuredContent.promoted).toBe(false);
    const candidateId = result.structuredContent.candidateId as string;
    expect(
      existsSync(join(f.root, '.forgewright/runtime/learning/candidates', candidateId + '.json')),
    ).toBe(true);
    expect(readFileSync(f.registryPath)).toEqual(before);
    expect(
      (await f.runtime.execute('fw_record_learning_candidate', { ...f.args, taskId: 'wrong-task' }))
        .structuredContent.reason,
    ).toBe('wrong_task');
    expect(
      (
        await f.runtime.execute('fw_record_learning_candidate', {
          ...f.args,
          planDigest: digest('other-plan'),
        })
      ).structuredContent.reason,
    ).toBe('stale_or_mismatched_plan');
    expect(
      (
        await f.runtime.execute('fw_record_learning_candidate', {
          ...f.args,
          trigger: 'Bearer sk-1234567890abcdef123456',
        })
      ).structuredContent.code,
    ).toBe('LEARNING_PRIVACY_REJECTED');
    writeFileSync(join(f.root, 'test_rule.py'), '# changed after verification\n');
    expect(
      (await f.runtime.execute('fw_record_learning_candidate', f.args)).structuredContent.status,
    ).toBe('rejected');
  }, 60000);

  it.each(['output', 'exit_code', 'timestamp_utc', 'acceptance_criteria', 'schema_version'])(
    'rejects tampered %s even when the caller refreshes the outer file hash',
    async (field) => {
      const f = await fixture();
      const evidence = JSON.parse(readFileSync(f.evidencePath, 'utf8'));
      if (field === 'output') evidence.output += 'changed';
      if (field === 'exit_code') evidence.exit_code = 1;
      if (field === 'timestamp_utc') evidence.timestamp_utc = '2000-01-01T00:00:00Z';
      if (field === 'acceptance_criteria') evidence.acceptance_criteria = [];
      if (field === 'schema_version') evidence.schema_version = '1';
      writeFileSync(f.evidencePath, JSON.stringify(evidence));
      f.args.sourceVerifierSha256s = [digest(readFileSync(f.evidencePath))];
      const result = await verifyAcceptedTaskEvidence(f.root, f.args);
      expect(result.status).not.toBe('PASS');
      expect(readFileSync(f.registryPath).length).toBeGreaterThan(0);
    },
    30000,
  );

  it('rejects a terminal ledger for another objective', async () => {
    const f = await fixture({ ledgerPlan: digest('unrelated-transport-session') });
    expect((await verifyAcceptedTaskEvidence(f.root, f.args)).status).not.toBe('PASS');
  }, 30000);

  it('rejects a failed terminal outcome', async () => {
    const f = await fixture({ outcome: 'failed' });
    expect((await verifyAcceptedTaskEvidence(f.root, f.args)).status).not.toBe('PASS');
  }, 30000);

  it('rejects arbitrary descriptor paths and metadata symlinks', () => {
    const root = tempDir();
    const desc: NativeTaskDescriptor = {
      schema: 'forgewright-native-task-context/v1',
      projectId: 'project-fixture',
      taskId: 'task-fixture',
      contractPath: '.forgewright/runtime/locked-contract.json',
      evidencePaths: ['.forgewright/verify/file.json'],
      ledgerId: 'task-ledger',
    };
    expect(() =>
      writeNativeTaskDescriptor(root, { ...desc, contractPath: '../outside.json' }),
    ).toThrow();
    const outside = tempDir();
    symlinkSync(outside, join(root, '.forgewright'));
    expect(() => writeNativeTaskDescriptor(root, desc)).toThrow();
    expect(existsSync(join(outside, 'runtime/native-task-context.json'))).toBe(false);
  });
});
