import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ToolExecutionGateway } from '../runtime/tool-execution-gateway.js';
import { TrajectoryLedger, canonicalJson } from '../runtime/trajectory-ledger.js';
import {
  createLearningFoundryToolRuntime,
  HostLearningBinding,
  LearningFoundryToolRuntime,
  LearningFoundryToolRuntimeFactory,
} from '../product-factory/learning-foundry-runtime.js';
import {
  createEmptyLearningRegistry,
  InMemoryLearningRegistryRepository,
  issueLocalTestLearningHostCapability,
  LearningFoundry,
  parseCandidateLesson,
} from '../product-factory/learning-foundry.js';
import { registerTools } from './tools.js';

type Request = {
  params: { name: string; arguments?: Record<string, unknown> };
};
type Handler = (request: Request) => Promise<{
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
}>;

const temporaryDirectories: string[] = [];
let registrySeq = 0;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function workspace(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forgewright-e2-foundry-'));
  temporaryDirectories.push(directory);
  return directory;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function receiptDigest(summary: Record<string, unknown>, sequence: number, hash: string) {
  return createHash('sha256')
    .update(canonicalJson({ ...summary, predecessorTip: { sequence, hash } }), 'utf8')
    .digest('hex');
}

async function createTestTerminalLedger(options: {
  workspaceId: string;
  sessionId: string;
  objectiveDigest: string;
  quiescence?: 'confirmed' | 'not_confirmed';
  terminal?: boolean;
}) {
  const root = workspace();
  const ledger = new TrajectoryLedger({ root, ledgerId: 'traj-' + options.sessionId });
  await ledger.append({
    eventId: 'opened',
    kind: 'trajectory.opened',
    occurredAtMs: 1,
    causalEventIds: [],
    payload: {
      objectiveDigest: options.objectiveDigest,
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
      origin: 'test-only',
      writerEpoch: 1,
      rootScopeId: 'root-scope',
    },
  });

  if (options.terminal === false) {
    return { ledger, tip: await ledger.tip() };
  }

  const started = await ledger.append({
    eventId: 'finalization-started',
    kind: 'finalization.started',
    occurredAtMs: 2,
    causalEventIds: ['opened'],
    payload: { reasonCode: 'complete', deadlineAtMs: 100 },
  });

  const quiescence = options.quiescence ?? 'confirmed';
  const receiptSummary = {
    status: 'complete' as const,
    disposedCount: 0,
    failedDisposerCount: 0,
    timedOutDisposerCount: 0,
    unresolvedOperationCount: 0,
    unresolvedScopeCount: 0,
    unresolvedDisposerCount: 0,
    deadlineAtMs: 100,
    quiescence,
  };

  await ledger.append({
    eventId: 'finalization-receipt',
    kind: 'finalization.receipt',
    occurredAtMs: 3,
    causalEventIds: [started.event.eventId],
    payload: {
      ...receiptSummary,
      predecessorSequence: started.tip.sequence,
      predecessorHash: started.tip.hash!,
      receiptDigest: receiptDigest(receiptSummary, started.tip.sequence, started.tip.hash!),
    },
  });

  await ledger.append({
    eventId: 'terminal',
    kind: 'trajectory.terminal',
    occurredAtMs: 4,
    causalEventIds: ['finalization-receipt'],
    payload: {
      outcome: 'completed',
      summaryDigest: options.objectiveDigest,
      cleanupOutcome: 'completed',
      quiescence,
      receiptEventId: 'finalization-receipt',
    },
  });

  return { ledger, tip: await ledger.tip() };
}

async function createLocalFoundryEnvironment() {
  const registryId = 'reg-e2-' + ++registrySeq;
  const initialRegistry = createEmptyLearningRegistry(registryId);
  const repository = new InMemoryLearningRegistryRepository(initialRegistry);
  const hostCapability = await issueLocalTestLearningHostCapability({
    registryId,
    issuerId: 'trusted-host-issuer',
    verifierId: 'forge-bench-verifier',
  });
  const foundry = new LearningFoundry({
    mode: 'maintenance',
    implementerId: 'implementer-one',
    freshnessHorizonMs: 10_000,
    now: () => 4,
    repository,
    hostCapability,
    comparisonVerifier: async (p) => structuredClone(p),
    reviewVerifier: async (r) => structuredClone(r),
  });
  return { registryId, repository, hostCapability, foundry };
}

function harness(
  runtime: LearningFoundryToolRuntime,
  runtimeFactory: LearningFoundryToolRuntimeFactory = () => runtime,
) {
  const handlers: unknown[] = [];
  const server = {
    setRequestHandler: (_schema: unknown, handler: unknown) => handlers.push(handler),
  };
  const gateway = new ToolExecutionGateway({
    policyEvaluator: { evaluate: async () => ({ action: 'allow' }) },
    middleware: {
      tool_sandbox: { enabled: false },
      quality_gate: { enabled: false },
      verification: { enabled: false },
      context_offload: { enabled: false },
      session_deduplication: { enabled: false },
    },
  });

  registerTools(server as never, gateway, {
    learningFoundryRuntimeFactory: runtimeFactory,
  });

  const listHandler = handlers[0] as () => Promise<{
    tools: Array<{ name: string; description: string }>;
  }>;
  const callHandler = handlers[1] as Handler;

  return {
    listTools: () => listHandler(),
    callTool: (name: string, args: Record<string, unknown>) =>
      callHandler({ params: { name, arguments: args } }),
  };
}

describe('E2: Outcome-bound Learning Foundry MCP Tool Integration', () => {
  it('registers fw_record_learning_candidate in MCP tool list', async () => {
    const runtime = createLearningFoundryToolRuntime();
    const client = harness(runtime);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'fw_record_learning_candidate');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('Learning Foundry');
  });

  it('default unsupported: returns unsupported when host dependencies are absent', async () => {
    const runtime = createLearningFoundryToolRuntime();
    const client = harness(runtime);

    const result = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: digest('plan-1'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Missing bounds check',
      correction: 'Add safe bounds check',
    });

    expect(result.structuredContent?.status).toBe('unsupported');
    expect(result.structuredContent?.code).toBe('LEARNING_HOST_CAPABILITY_UNAVAILABLE');
  });

  it('missing host dependency: returns unsupported if any required host component is missing', async () => {
    const { foundry, repository } = await createLocalFoundryEnvironment();

    // Missing verifyAcceptedTaskEvidence
    const runtime = createLearningFoundryToolRuntime({
      foundry,
      repository,
      readCurrentBinding: () => ({
        projectId: 'proj-1',
        planDigest: digest('plan-1'),
        sourceRevision: 'a'.repeat(40),
        treeFingerprint: digest('tree-1'),
        acceptanceCriteriaDigest: digest('ac-1'),
      }),
    });
    const client = harness(runtime);

    const result = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: digest('plan-1'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Missing bounds check',
      correction: 'Add safe bounds check',
    });

    expect(result.structuredContent?.status).toBe('unsupported');
  });

  it('caller-only PASS / fake hashes: rejected when host verifier returns non-PASS', async () => {
    const { foundry, repository } = await createLocalFoundryEnvironment();
    const binding: HostLearningBinding = {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: digest('plan-1'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
    };

    const runtime = createLearningFoundryToolRuntime({
      foundry,
      repository,
      readCurrentBinding: () => binding,
      verifyAcceptedTaskEvidence: async () => ({
        status: 'FAIL',
        reason: 'test_assertion_failed',
      }),
    });
    const client = harness(runtime);

    const result = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: digest('plan-1'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Error occurred',
      correction: 'Fixed error',
    });

    expect(result.structuredContent?.status).toBe('rejected');
    expect(result.structuredContent?.reason).toBe('test_assertion_failed');
    expect(result.structuredContent?.promoted).toBe(false);
  });

  it('wrong project/task/plan/revision/tree/AC: rejected against host binding', async () => {
    const { foundry, repository } = await createLocalFoundryEnvironment();
    const binding: HostLearningBinding = {
      projectId: 'proj-expected',
      taskId: 'task-expected',
      planDigest: digest('plan-expected'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-expected'),
      acceptanceCriteriaDigest: digest('ac-expected'),
    };

    const runtime = createLearningFoundryToolRuntime({
      foundry,
      repository,
      readCurrentBinding: () => binding,
      verifyAcceptedTaskEvidence: async () => ({ status: 'PASS' }),
    });
    const client = harness(runtime);

    // Wrong project
    const r1 = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-wrong',
      taskId: 'task-expected',
      planDigest: digest('plan-expected'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-expected'),
      acceptanceCriteriaDigest: digest('ac-expected'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Trigger',
      correction: 'Correction',
    });
    expect(r1.structuredContent?.reason).toBe('wrong_project');

    // Wrong task
    const r2 = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-expected',
      taskId: 'task-wrong',
      planDigest: digest('plan-expected'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-expected'),
      acceptanceCriteriaDigest: digest('ac-expected'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Trigger',
      correction: 'Correction',
    });
    expect(r2.structuredContent?.reason).toBe('wrong_task');

    // Stale plan
    const r3 = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-expected',
      taskId: 'task-expected',
      planDigest: digest('plan-wrong'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-expected'),
      acceptanceCriteriaDigest: digest('ac-expected'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Trigger',
      correction: 'Correction',
    });
    expect(r3.structuredContent?.reason).toBe('stale_or_mismatched_plan');

    // Stale revision
    const r4 = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-expected',
      taskId: 'task-expected',
      planDigest: digest('plan-expected'),
      sourceRevision: 'b'.repeat(40),
      treeFingerprint: digest('tree-expected'),
      acceptanceCriteriaDigest: digest('ac-expected'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Trigger',
      correction: 'Correction',
    });
    expect(r4.structuredContent?.reason).toBe('stale_or_mismatched_revision');

    // Stale tree
    const r5 = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-expected',
      taskId: 'task-expected',
      planDigest: digest('plan-expected'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-wrong'),
      acceptanceCriteriaDigest: digest('ac-expected'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Trigger',
      correction: 'Correction',
    });
    expect(r5.structuredContent?.reason).toBe('stale_or_mismatched_tree');

    // Stale AC
    const r6 = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-expected',
      taskId: 'task-expected',
      planDigest: digest('plan-expected'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-expected'),
      acceptanceCriteriaDigest: digest('ac-wrong'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Trigger',
      correction: 'Correction',
    });
    expect(r6.structuredContent?.reason).toBe('stale_or_mismatched_ac');
  });

  it('mismatched verifier: rejected when verified evidence digests differ from request', async () => {
    const { foundry, repository } = await createLocalFoundryEnvironment();
    const binding: HostLearningBinding = {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: digest('plan-1'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
    };

    const runtime = createLearningFoundryToolRuntime({
      foundry,
      repository,
      readCurrentBinding: () => binding,
      verifyAcceptedTaskEvidence: async () => ({
        status: 'PASS',
        matching: {
          ...binding,
          sourceVerifierSha256s: [digest('other-verifier')],
        },
      }),
    });
    const client = harness(runtime);

    const result = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: digest('plan-1'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
      sourceVerifierSha256s: [digest('requested-verifier')],
      trigger: 'Fix error',
      correction: 'Apply fix',
    });

    expect(result.structuredContent?.status).toBe('rejected');
    expect(result.structuredContent?.reason).toBe('verifier_mismatch');
  });

  it('missing/stale/nonterminal/corrupt ledger: rejected when host ledger is not confirmed terminal', async () => {
    const { foundry, repository } = await createLocalFoundryEnvironment();
    const planDig = digest('plan-1');
    const binding: HostLearningBinding = {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: planDig,
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
    };

    // Non-terminal ledger
    const { ledger, tip } = await createTestTerminalLedger({
      workspaceId: 'proj-1',
      sessionId: 'task-1',
      objectiveDigest: planDig,
      terminal: false,
    });

    const runtime = createLearningFoundryToolRuntime({
      foundry,
      repository,
      readCurrentBinding: () => binding,
      verifyAcceptedTaskEvidence: async () => ({
        status: 'PASS',
        matching: {
          ...binding,
          sourceVerifierSha256s: [digest('v-1')],
        },
        ledger,
        expectedTip: tip,
      }),
    });
    const client = harness(runtime);

    const result = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: planDig,
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Fix error',
      correction: 'Apply fix',
    });

    expect(result.structuredContent?.status).toBe('rejected');
    expect(result.structuredContent?.reason).toBe('corrupt_or_missing_ledger');
  });

  it('host drift during verification: rejected when host binding drifts', async () => {
    const { foundry, repository } = await createLocalFoundryEnvironment();
    const planDig = digest('plan-1');
    let bindingCallCount = 0;
    const initialBinding: HostLearningBinding = {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: planDig,
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
    };

    const { ledger, tip } = await createTestTerminalLedger({
      workspaceId: 'proj-1',
      sessionId: 'task-1',
      objectiveDigest: planDig,
    });

    const runtime = createLearningFoundryToolRuntime({
      foundry,
      repository,
      readCurrentBinding: () => {
        bindingCallCount++;
        if (bindingCallCount > 1) {
          // Binding changed during verification!
          return { ...initialBinding, sourceRevision: 'f'.repeat(40) };
        }
        return initialBinding;
      },
      verifyAcceptedTaskEvidence: async () => ({
        status: 'PASS',
        matching: {
          ...initialBinding,
          sourceVerifierSha256s: [digest('v-1')],
        },
        ledger,
        expectedTip: tip,
      }),
    });
    const client = harness(runtime);

    const result = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: planDig,
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Fix error',
      correction: 'Apply fix',
    });

    expect(result.structuredContent?.status).toBe('rejected');
    expect(result.structuredContent?.reason).toBe('host_drift_detected');
  });

  it('privacy / unknown fields / size: rejects unknown properties and secret data', async () => {
    const { foundry, repository } = await createLocalFoundryEnvironment();
    const runtime = createLearningFoundryToolRuntime({
      foundry,
      repository,
      readCurrentBinding: () => ({
        projectId: 'proj-1',
        taskId: 'task-1',
        planDigest: digest('plan-1'),
        sourceRevision: 'a'.repeat(40),
        treeFingerprint: digest('tree-1'),
        acceptanceCriteriaDigest: digest('ac-1'),
      }),
      verifyAcceptedTaskEvidence: async () => ({ status: 'PASS' }),
    });
    const client = harness(runtime);

    // Unknown field
    const r1 = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: digest('plan-1'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Trigger',
      correction: 'Correction',
      unauthorizedField: 'malicious',
    });
    expect(r1.isError).toBe(true);
    expect(r1.structuredContent?.code).toBe('LEARNING_INVALID_ARGUMENTS');

    // Secrets in trigger
    const r2 = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-1',
      taskId: 'task-1',
      planDigest: digest('plan-1'),
      sourceRevision: 'a'.repeat(40),
      treeFingerprint: digest('tree-1'),
      acceptanceCriteriaDigest: digest('ac-1'),
      sourceVerifierSha256s: [digest('v-1')],
      trigger: 'Bearer sk-1234567890abcdef credential leaked',
      correction: 'Remove secret',
    });
    expect(r2.isError).toBe(true);
    expect(r2.structuredContent?.code).toBe('LEARNING_PRIVACY_REJECTED');
  });

  it('successful locally verified candidate with registry unchanged and promoted false', async () => {
    const { foundry, repository } = await createLocalFoundryEnvironment();
    const planDig = digest('plan-verified-1');
    const verifierSha = digest('verifier-sha-1');
    const binding: HostLearningBinding = {
      projectId: 'proj-verified',
      taskId: 'task-verified',
      planDigest: planDig,
      sourceRevision: 'c'.repeat(40),
      treeFingerprint: digest('tree-fingerprint'),
      acceptanceCriteriaDigest: digest('ac-digest-1'),
    };

    const { ledger, tip } = await createTestTerminalLedger({
      workspaceId: 'proj-verified',
      sessionId: 'task-verified',
      objectiveDigest: planDig,
    });

    const registryBefore = await repository.read();

    const runtime = createLearningFoundryToolRuntime({
      foundry,
      repository,
      readCurrentBinding: () => binding,
      verifyAcceptedTaskEvidence: async () => ({
        status: 'PASS',
        matching: {
          ...binding,
          sessionId: 'task-verified',
          sourceVerifierSha256s: [verifierSha],
        },
        ledger,
        expectedTip: tip,
      }),
    });
    const client = harness(runtime);

    const result = await client.callTool('fw_record_learning_candidate', {
      projectId: 'proj-verified',
      taskId: 'task-verified',
      planDigest: planDig,
      sourceRevision: 'c'.repeat(40),
      treeFingerprint: digest('tree-fingerprint'),
      acceptanceCriteriaDigest: digest('ac-digest-1'),
      sourceVerifierSha256s: [verifierSha],
      trigger: 'Type check failed on optional query parameter handling',
      correction: 'Explicitly check for undefined before accessing parameter properties',
      scope: 'test-scope',
    });

    expect(result.structuredContent?.status).toBe('candidate_created');
    expect(result.structuredContent?.promoted).toBe(false);
    expect(result.structuredContent?.candidateId).toBeDefined();

    const candidate = result.structuredContent?.candidate;
    expect(candidate).toBeDefined();

    const parsed = parseCandidateLesson(candidate);
    expect(parsed.candidateSha256).toBe(result.structuredContent?.candidateId);
    expect(parsed.rootCause).toContain('Type check failed');
    expect(parsed.correction).toContain('Explicitly check for undefined');
    expect(parsed.sourceVerifierSha256s).toEqual([verifierSha]);
    expect(parsed.usefulCount).toBe(1);
    expect(parsed.harmfulCount).toBe(0);

    // Verify registry is UNCHANGED: no automatic promotion
    const registryAfter = await repository.read();
    expect(registryAfter.revision).toBe(registryBefore.revision);
    expect(registryAfter.registrySha256).toBe(registryBefore.registrySha256);
    expect(registryAfter.history.length).toBe(0);
    expect(registryAfter.usedCandidateSha256s.length).toBe(0);
  });
});
