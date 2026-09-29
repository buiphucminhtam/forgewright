import { TrajectoryLedger, type LedgerTip } from '../runtime/trajectory-ledger.js';
import {
  type SanitizedTrajectorySummary,
  assertPrivateDataAbsent,
  clusterAndDedupeTrajectorySummaries,
  createCandidateLesson,
  LearningFoundry,
  type LearningRegistryRepository,
} from './learning-foundry.js';

export const LEARNING_FOUNDRY_TOOL_NAMES = ['fw_record_learning_candidate'] as const;

export type LearningFoundryToolName = (typeof LEARNING_FOUNDRY_TOOL_NAMES)[number];

export function isLearningFoundryToolName(name: string): name is LearningFoundryToolName {
  return (LEARNING_FOUNDRY_TOOL_NAMES as readonly string[]).includes(name);
}

export const LEARNING_FOUNDRY_TOOL_ERROR_CODES = [
  'LEARNING_HOST_CAPABILITY_UNAVAILABLE',
  'LEARNING_INVALID_ARGUMENTS',
  'LEARNING_PRIVACY_REJECTED',
  'LEARNING_UNAVAILABLE',
] as const;

export type LearningFoundryToolErrorCode = (typeof LEARNING_FOUNDRY_TOOL_ERROR_CODES)[number];

export class LearningFoundryToolError extends Error {
  constructor(
    readonly code: LearningFoundryToolErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LearningFoundryToolError';
  }
}

export function learningFoundryToolErrorCode(error: unknown): LearningFoundryToolErrorCode {
  if (
    error instanceof LearningFoundryToolError &&
    LEARNING_FOUNDRY_TOOL_ERROR_CODES.includes(error.code)
  ) {
    return error.code;
  }
  return 'LEARNING_UNAVAILABLE';
}

export interface HostLearningBinding {
  projectId: string;
  taskId?: string;
  planDigest: string;
  sourceRevision: string;
  treeFingerprint: string;
  acceptanceCriteriaDigest: string;
  contextFingerprint?: string;
  workspaceFingerprint?: string;
}

export interface VerifiedTaskEvidenceRequest {
  projectId: string;
  taskId?: string;
  planDigest: string;
  sourceRevision: string;
  treeFingerprint: string;
  acceptanceCriteriaDigest: string;
  sourceVerifierSha256s: string[];
}

export interface VerifiedTaskEvidenceResult {
  status: 'PASS' | 'FAIL' | 'UNVERIFIED' | 'REQUIRES_HUMAN_REVIEW';
  matching?: {
    projectId: string;
    taskId?: string;
    planDigest: string;
    sourceRevision: string;
    treeFingerprint: string;
    acceptanceCriteriaDigest: string;
    sessionId?: string;
    sourceVerifierSha256s: string[];
  };
  ledger?: TrajectoryLedger;
  expectedTip?: LedgerTip;
  reason?: string;
}

export interface TrajectorySummarizerLike {
  summarizeTrajectory(input: {
    ledger: TrajectoryLedger;
    expectedTip: LedgerTip;
  }): Promise<Readonly<SanitizedTrajectorySummary>>;
}

export interface LearningFoundryToolRuntimeOptions {
  foundry?: LearningFoundry;
  summarizer?: TrajectorySummarizerLike;
  repository?: LearningRegistryRepository;
  readCurrentBinding?: () => Promise<HostLearningBinding | null> | HostLearningBinding | null;
  verifyAcceptedTaskEvidence?: (
    request: VerifiedTaskEvidenceRequest,
  ) => Promise<VerifiedTaskEvidenceResult>;
  persistCandidateProposal?: (candidate: Record<string, unknown>) => Promise<void> | void;
}

export interface LearningFoundryToolResult {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
}

export interface LearningFoundryToolRuntime {
  execute(
    toolName: LearningFoundryToolName,
    arguments_: Record<string, unknown>,
  ): Promise<LearningFoundryToolResult>;
}

export type LearningFoundryToolRuntimeFactory = () => LearningFoundryToolRuntime;

const ALLOWED_ARG_KEYS = new Set([
  'projectId',
  'taskId',
  'planDigest',
  'sourceRevision',
  'treeFingerprint',
  'acceptanceCriteriaDigest',
  'sourceVerifierSha256s',
  'trigger',
  'correction',
  'scope',
]);

const HASH_64 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SAFE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function createLearningFoundryToolRuntime(
  options: LearningFoundryToolRuntimeOptions = {},
): LearningFoundryToolRuntime {
  return {
    async execute(
      toolName: LearningFoundryToolName,
      arguments_: Record<string, unknown>,
    ): Promise<LearningFoundryToolResult> {
      if (toolName !== 'fw_record_learning_candidate') {
        throw new LearningFoundryToolError('LEARNING_INVALID_ARGUMENTS', 'Unknown tool');
      }

      // 1. Host dependency gate: summarizer/foundry, repository, and callbacks required
      const summarizer = options.summarizer ?? options.foundry;
      if (
        !summarizer ||
        typeof summarizer.summarizeTrajectory !== 'function' ||
        !options.repository ||
        typeof options.readCurrentBinding !== 'function' ||
        typeof options.verifyAcceptedTaskEvidence !== 'function'
      ) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'LEARNING_HOST_CAPABILITY_UNAVAILABLE' }],
          structuredContent: {
            status: 'unsupported',
            code: 'LEARNING_HOST_CAPABILITY_UNAVAILABLE',
            reason:
              'Required host components (foundry, repository, readCurrentBinding, verifyAcceptedTaskEvidence) are missing or unverified. Promotion authority unavailable.',
          },
        };
      }

      // 2. Strict bounded request validation
      if (!arguments_ || typeof arguments_ !== 'object' || Array.isArray(arguments_)) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'LEARNING_INVALID_ARGUMENTS' }],
          structuredContent: {
            status: 'rejected',
            code: 'LEARNING_INVALID_ARGUMENTS',
            reason: 'Arguments must be an object',
          },
        };
      }

      // Reject unknown keys
      for (const key of Object.keys(arguments_)) {
        if (!ALLOWED_ARG_KEYS.has(key)) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'LEARNING_INVALID_ARGUMENTS' }],
            structuredContent: {
              status: 'rejected',
              code: 'LEARNING_INVALID_ARGUMENTS',
              reason: 'Unknown field: ' + key,
            },
          };
        }
      }

      const {
        projectId,
        taskId,
        planDigest,
        sourceRevision,
        treeFingerprint,
        acceptanceCriteriaDigest,
        sourceVerifierSha256s,
        trigger,
        correction,
        scope = 'default',
      } = arguments_ as Record<string, unknown>;

      // Check strictly typed non-coerced values
      if (
        typeof projectId !== 'string' ||
        projectId.length < 1 ||
        projectId.length > 128 ||
        !SAFE_ID.test(projectId) ||
        typeof taskId !== 'string' ||
        taskId.length < 1 ||
        taskId.length > 128 ||
        !SAFE_ID.test(taskId) ||
        typeof planDigest !== 'string' ||
        !HASH_64.test(planDigest) ||
        typeof sourceRevision !== 'string' ||
        !GIT_SHA.test(sourceRevision) ||
        typeof treeFingerprint !== 'string' ||
        treeFingerprint.length < 1 ||
        treeFingerprint.length > 128 ||
        typeof acceptanceCriteriaDigest !== 'string' ||
        !HASH_64.test(acceptanceCriteriaDigest) ||
        typeof trigger !== 'string' ||
        trigger.length < 1 ||
        trigger.length > 1024 ||
        typeof correction !== 'string' ||
        correction.length < 1 ||
        correction.length > 2048 ||
        typeof scope !== 'string' ||
        scope.length < 1 ||
        scope.length > 64 ||
        !SAFE_ID.test(scope)
      ) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'LEARNING_INVALID_ARGUMENTS' }],
          structuredContent: {
            status: 'rejected',
            code: 'LEARNING_INVALID_ARGUMENTS',
            reason: 'Malformed or oversized argument fields',
          },
        };
      }

      if (
        !Array.isArray(sourceVerifierSha256s) ||
        sourceVerifierSha256s.length < 1 ||
        sourceVerifierSha256s.length > 64
      ) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'LEARNING_INVALID_ARGUMENTS' }],
          structuredContent: {
            status: 'rejected',
            code: 'LEARNING_INVALID_ARGUMENTS',
            reason: 'sourceVerifierSha256s must be a non-empty array of at most 64 hashes',
          },
        };
      }

      for (const item of sourceVerifierSha256s) {
        if (typeof item !== 'string' || !HASH_64.test(item)) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'LEARNING_INVALID_ARGUMENTS' }],
            structuredContent: {
              status: 'rejected',
              code: 'LEARNING_INVALID_ARGUMENTS',
              reason: 'Every source verifier hash must be a lowercase 64-hex SHA-256',
            },
          };
        }
      }

      // Check duplicates
      const uniqueVerifiers = new Set(sourceVerifierSha256s);
      if (uniqueVerifiers.size !== sourceVerifierSha256s.length) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'LEARNING_INVALID_ARGUMENTS' }],
          structuredContent: {
            status: 'rejected',
            code: 'LEARNING_INVALID_ARGUMENTS',
            reason: 'Duplicate source verifier hashes are not allowed',
          },
        };
      }

      // 3. Privacy check on trigger and correction
      try {
        assertPrivateDataAbsent(trigger, 'trigger');
        assertPrivateDataAbsent(correction, 'correction');
      } catch {
        return {
          isError: true,
          content: [{ type: 'text', text: 'LEARNING_PRIVACY_REJECTED' }],
          structuredContent: {
            status: 'rejected',
            code: 'LEARNING_PRIVACY_REJECTED',
            reason: 'Trigger or correction contains sensitive credentials or raw prompt tokens',
          },
        };
      }

      // 4. Pre-verification check against current host binding
      const initialBinding = await options.readCurrentBinding();
      if (!initialBinding) {
        return {
          content: [{ type: 'text', text: 'BINDING_UNAVAILABLE' }],
          structuredContent: {
            status: 'rejected',
            reason: 'binding_unavailable',
            message: 'Current host binding is not available',
            promoted: false,
          },
        };
      }

      if (initialBinding.projectId !== projectId) {
        return {
          content: [{ type: 'text', text: 'PROJECT_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'wrong_project',
            message: 'Project does not match current host binding',
            promoted: false,
          },
        };
      }

      if (initialBinding.taskId && initialBinding.taskId !== taskId) {
        return {
          content: [{ type: 'text', text: 'TASK_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'wrong_task',
            message: 'Task ID does not match current host binding',
            promoted: false,
          },
        };
      }

      if (initialBinding.planDigest !== planDigest) {
        return {
          content: [{ type: 'text', text: 'PLAN_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'stale_or_mismatched_plan',
            message: 'Plan digest does not match current host binding',
            promoted: false,
          },
        };
      }

      if (initialBinding.sourceRevision !== sourceRevision) {
        return {
          content: [{ type: 'text', text: 'REVISION_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'stale_or_mismatched_revision',
            message: 'Source revision does not match current host binding',
            promoted: false,
          },
        };
      }

      if (initialBinding.treeFingerprint !== treeFingerprint) {
        return {
          content: [{ type: 'text', text: 'TREE_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'stale_or_mismatched_tree',
            message: 'Tree fingerprint does not match current host binding',
            promoted: false,
          },
        };
      }

      if (initialBinding.acceptanceCriteriaDigest !== acceptanceCriteriaDigest) {
        return {
          content: [{ type: 'text', text: 'AC_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'stale_or_mismatched_ac',
            message: 'Acceptance criteria digest does not match current host binding',
            promoted: false,
          },
        };
      }

      // Read initial registry snapshot
      const initialRegistry = await options.repository.read();

      // 5. Invoke host callback to verify actual acceptance and verifier evidence
      const verifyResult = await options.verifyAcceptedTaskEvidence({
        projectId,
        taskId,
        planDigest,
        sourceRevision,
        treeFingerprint,
        acceptanceCriteriaDigest,
        sourceVerifierSha256s: [...sourceVerifierSha256s],
      });

      if (verifyResult.status !== 'PASS') {
        return {
          content: [{ type: 'text', text: 'OUTCOME_REJECTED' }],
          structuredContent: {
            status: 'rejected',
            reason: verifyResult.reason || 'outcome_not_accepted',
            message: 'Task verification did not yield an accepted PASS outcome',
            promoted: false,
          },
        };
      }

      const matching = verifyResult.matching;
      if (!matching) {
        return {
          content: [{ type: 'text', text: 'EVIDENCE_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'evidence_mismatch',
            message: 'Verification result is missing matching evidence payload',
            promoted: false,
          },
        };
      }

      if (
        matching.projectId !== projectId ||
        Boolean(matching.taskId && matching.taskId !== taskId) ||
        matching.planDigest !== planDigest ||
        matching.sourceRevision !== sourceRevision ||
        matching.treeFingerprint !== treeFingerprint ||
        matching.acceptanceCriteriaDigest !== acceptanceCriteriaDigest
      ) {
        return {
          content: [{ type: 'text', text: 'EVIDENCE_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'evidence_mismatch',
            message: 'Verified evidence parameters do not match requested binding',
            promoted: false,
          },
        };
      }

      const sortedReq = [...sourceVerifierSha256s].sort();
      const sortedMatched = [...matching.sourceVerifierSha256s].sort();
      if (JSON.stringify(sortedReq) !== JSON.stringify(sortedMatched)) {
        return {
          content: [{ type: 'text', text: 'VERIFIER_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'verifier_mismatch',
            message: 'Verified verifier digests do not match request verifiers',
            promoted: false,
          },
        };
      }

      if (!verifyResult.ledger || !verifyResult.expectedTip) {
        return {
          content: [{ type: 'text', text: 'LEDGER_MISSING' }],
          structuredContent: {
            status: 'rejected',
            reason: 'corrupt_or_missing_ledger',
            message: 'Host verification did not provide a valid TrajectoryLedger and expectedTip',
            promoted: false,
          },
        };
      }

      // 6. Real foundry summarizeTrajectory preserving terminal, freshness, quiescence, integrity
      let summary;
      try {
        summary = await summarizer.summarizeTrajectory({
          ledger: verifyResult.ledger,
          expectedTip: verifyResult.expectedTip,
        });
      } catch {
        return {
          content: [{ type: 'text', text: 'SUMMARIZE_FAILED' }],
          structuredContent: {
            status: 'rejected',
            reason: 'corrupt_or_missing_ledger',
            message: 'Failed to verify the bounded terminal trajectory ledger.',
            promoted: false,
          },
        };
      }

      if (
        summary.terminalOutcome !== 'completed' ||
        summary.quiescence !== 'confirmed' ||
        summary.workspaceId !== projectId ||
        (summary.sessionId !== taskId && summary.sessionId !== matching.sessionId)
      ) {
        return {
          content: [{ type: 'text', text: 'SUMMARY_MISMATCH' }],
          structuredContent: {
            status: 'rejected',
            reason: 'summary_integrity_mismatch',
            message: 'Trajectory summary metadata does not match verified task outcome',
            promoted: false,
          },
        };
      }

      // 7. Check for host drift after awaits
      const finalBinding = await options.readCurrentBinding();
      const finalRegistry = await options.repository.read();

      if (
        !finalBinding ||
        finalBinding.projectId !== initialBinding.projectId ||
        finalBinding.taskId !== initialBinding.taskId ||
        finalBinding.contextFingerprint !== initialBinding.contextFingerprint ||
        finalBinding.workspaceFingerprint !== initialBinding.workspaceFingerprint ||
        finalBinding.planDigest !== initialBinding.planDigest ||
        finalBinding.sourceRevision !== initialBinding.sourceRevision ||
        finalBinding.treeFingerprint !== initialBinding.treeFingerprint ||
        finalBinding.acceptanceCriteriaDigest !== initialBinding.acceptanceCriteriaDigest
      ) {
        return {
          content: [{ type: 'text', text: 'HOST_DRIFT_DETECTED' }],
          structuredContent: {
            status: 'rejected',
            reason: 'host_drift_detected',
            message: 'Host binding changed during verification',
            promoted: false,
          },
        };
      }

      if (
        finalRegistry.registrySha256 !== initialRegistry.registrySha256 ||
        finalRegistry.revision !== initialRegistry.revision
      ) {
        return {
          content: [{ type: 'text', text: 'HOST_DRIFT_DETECTED' }],
          structuredContent: {
            status: 'rejected',
            reason: 'host_drift_detected',
            message: 'Registry changed during verification',
            promoted: false,
          },
        };
      }

      // 8. Cluster and build candidate lesson
      const clusters = clusterAndDedupeTrajectorySummaries([summary], {
        rootCause: trigger,
        correction,
        applicability: { appliesTo: ['general'], excludes: [] },
        productScope: scope,
      });

      const cluster = clusters[0];
      const candidate = createCandidateLesson({
        cluster,
        rootCause: trigger,
        correction,
        applicability: { appliesTo: ['general'], excludes: [] },
        productScope: scope,
        sourceVerifierSha256s: sortedMatched,
        usefulCount: 1,
        harmfulCount: 0,
        baseRegistryId: finalRegistry.registryId,
        baseRegistryRevision: finalRegistry.revision,
        baseRegistrySha256: finalRegistry.registrySha256,
        baseIntelligenceVersion: finalRegistry.active.version,
        baseIntelligenceSha256: finalRegistry.active.sha256,
      });

      if (typeof options.persistCandidateProposal === 'function') {
        try {
          await options.persistCandidateProposal(candidate as unknown as Record<string, unknown>);
        } catch {
          return {
            content: [{ type: 'text', text: 'PERSISTENCE_FAILED' }],
            structuredContent: {
              status: 'rejected',
              reason: 'candidate_persistence_failed',
              message:
                'Candidate proposal could not be persisted within its verified native boundary.',
              promoted: false,
            },
          };
        }
      }

      return {
        content: [{ type: 'text', text: 'CANDIDATE_CREATED' }],
        structuredContent: {
          status: 'candidate_created',
          candidateId: candidate.candidateSha256,
          candidate,
          promoted: false, // NO auto-promotion: promotion requires offline replay and independent review-2
        },
      };
    },
  };
}
