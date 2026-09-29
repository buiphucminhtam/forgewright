import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProductFactoryBenchmarkSuite,
  createProductFactoryBenchmarkTask,
  createProductFactoryLaneReceipt,
  createProductFactoryBenchmarkReport,
  createProductFactoryPairedComparison,
  type ProductFactoryLaneReceipt,
  type ProductEvidenceProjection,
  type ProductEvidenceVerifier,
} from "../src/bench/product-factory.js";
import {
  createEmptyLearningRegistry,
  InMemoryLearningRegistryRepository,
  issueLocalTestLearningHostCapability,
  LearningFoundry,
  createCandidateLesson,
  clusterAndDedupeTrajectorySummaries,
  createForgeBenchPromotionProjection,
  createOfflineReplayReceipt,
  createIndependentReviewReceipt,
} from "../../../mcp/src/product-factory/learning-foundry.js";
import {
  TrajectoryLedger,
  canonicalJson,
} from "../../../mcp/src/runtime/trajectory-ledger.js";

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

function receiptDigest(
  summary: Record<string, unknown>,
  sequence: number,
  hash: string,
) {
  return createHash("sha256")
    .update(
      canonicalJson({ ...summary, predecessorTip: { sequence, hash } }),
      "utf8",
    )
    .digest("hex");
}

describe("E5: Measured evaluation and runtime budgets", () => {
  it("defines frozen benchmark scenarios for game, web, and app integration tasks", () => {
    // 1. Game save/resume idempotent reward scenario
    const gameTask = createProductFactoryBenchmarkTask({
      taskId: "game-save-resume-idempotent-reward",
      lane: "game",
      attemptCount: 3,
      hiddenRequirementSha256s: [digest("reward-claimed-once-only")],
      hiddenPreferenceSha256s: [digest("idempotent-persistence")],
      intent: { id: "game-intent-1", sha256: digest("game-intent-1") },
      outcomes: [
        { id: "outcome-game-save", sha256: digest("outcome-game-save") },
      ],
      scenarios: [
        {
          id: "scenario-idempotent-reward",
          sha256: digest("scenario-idempotent-reward"),
        },
      ],
      expectedEnvironmentKind: "unity",
      verifierRefs: ["evals/ecc/scenarios.mjs::verifyGame"],
      evidenceAuthority: "production",
    });
    expect(gameTask.lane).toBe("game");
    expect(gameTask.attemptCount).toBe(3);

    // 2. Web responsive / API task
    const webTask = createProductFactoryBenchmarkTask({
      taskId: "web-responsive-api-handler",
      lane: "web",
      attemptCount: 3,
      hiddenRequirementSha256s: [digest("responsive-mobile-desktop-parity")],
      hiddenPreferenceSha256s: [digest("rate-limited-api")],
      intent: { id: "web-intent-1", sha256: digest("web-intent-1") },
      outcomes: [
        {
          id: "outcome-web-responsive",
          sha256: digest("outcome-web-responsive"),
        },
      ],
      scenarios: [
        { id: "scenario-web-api", sha256: digest("scenario-web-api") },
      ],
      expectedEnvironmentKind: "web",
      verifierRefs: ["evals/ecc/scenarios.mjs::verifyWeb"],
      evidenceAuthority: "production",
    });
    expect(webTask.lane).toBe("web");

    // 3. App / integration task
    const appTask = createProductFactoryBenchmarkTask({
      taskId: "app-integration-auth-sync",
      lane: "android",
      attemptCount: 3,
      hiddenRequirementSha256s: [digest("token-refresh-on-401")],
      hiddenPreferenceSha256s: [digest("offline-cache-sync")],
      intent: { id: "app-intent-1", sha256: digest("app-intent-1") },
      outcomes: [
        { id: "outcome-app-sync", sha256: digest("outcome-app-sync") },
      ],
      scenarios: [
        { id: "scenario-app-auth", sha256: digest("scenario-app-auth") },
      ],
      expectedEnvironmentKind: "android",
      verifierRefs: ["evals/ecc/scenarios.mjs::verifyApp"],
      evidenceAuthority: "production",
    });
    expect(appTask.lane).toBe("android");

    // Build complete frozen suite
    const suite = createProductFactoryBenchmarkSuite({
      suiteId: "forgebench-ecc-frozen-v1",
      suiteVersion: "1.0.0",
      thresholdsStatus: "unfrozen",
      tasks: [
        gameTask,
        webTask,
        appTask,
        createProductFactoryBenchmarkTask({
          taskId: "intent-spec-consistency",
          lane: "intent",
          attemptCount: 3,
          hiddenRequirementSha256s: [digest("spec-non-contradiction")],
          hiddenPreferenceSha256s: [digest("intent-scope")],
          intent: { id: "intent-1", sha256: digest("intent-1") },
          outcomes: [
            { id: "outcome-intent", sha256: digest("outcome-intent") },
          ],
          scenarios: [
            { id: "scenario-intent", sha256: digest("scenario-intent") },
          ],
          expectedEnvironmentKind: "none",
          verifierRefs: [
            "tests/unit_tests/test_ecc_local_scenarios.py::test_contract_names_match_maintained_scenarios",
          ],
          evidenceAuthority: "production",
        }),
      ],
    });
    expect(suite.tasks.length).toBe(4);
    expect(suite.suiteSha256).toBeDefined();
  });

  it("paired comparison rejects model, settings, base mismatch and missing usage is null not zero", async () => {
    const task = createProductFactoryBenchmarkTask({
      taskId: "game-task",
      lane: "game",
      attemptCount: 3,
      hiddenRequirementSha256s: [digest("req-1")],
      hiddenPreferenceSha256s: [digest("pref-1")],
      intent: { id: "i-1", sha256: digest("i-1") },
      outcomes: [{ id: "o-1", sha256: digest("o-1") }],
      scenarios: [{ id: "s-1", sha256: digest("s-1") }],
      expectedEnvironmentKind: "unity",
      verifierRefs: ["tests/game.test.ts"],
      evidenceAuthority: "production",
    });
    const suite = createProductFactoryBenchmarkSuite({
      suiteId: "suite-test",
      suiteVersion: "1.0.0",
      thresholdsStatus: "unfrozen",
      tasks: [
        task,
        createProductFactoryBenchmarkTask({
          taskId: "web-task",
          lane: "web",
          attemptCount: 3,
          hiddenRequirementSha256s: [digest("req-2")],
          hiddenPreferenceSha256s: [digest("pref-2")],
          intent: { id: "i-2", sha256: digest("i-2") },
          outcomes: [{ id: "o-2", sha256: digest("o-2") }],
          scenarios: [{ id: "s-2", sha256: digest("s-2") }],
          expectedEnvironmentKind: "web",
          verifierRefs: ["tests/web.test.ts"],
          evidenceAuthority: "production",
        }),
        createProductFactoryBenchmarkTask({
          taskId: "android-task",
          lane: "android",
          attemptCount: 3,
          hiddenRequirementSha256s: [digest("req-3")],
          hiddenPreferenceSha256s: [digest("pref-3")],
          intent: { id: "i-3", sha256: digest("i-3") },
          outcomes: [{ id: "o-3", sha256: digest("o-3") }],
          scenarios: [{ id: "s-3", sha256: digest("s-3") }],
          expectedEnvironmentKind: "android",
          verifierRefs: ["tests/android.test.ts"],
          evidenceAuthority: "production",
        }),
        createProductFactoryBenchmarkTask({
          taskId: "intent-task",
          lane: "intent",
          attemptCount: 3,
          hiddenRequirementSha256s: [digest("req-4")],
          hiddenPreferenceSha256s: [digest("pref-4")],
          intent: { id: "i-4", sha256: digest("i-4") },
          outcomes: [{ id: "o-4", sha256: digest("o-4") }],
          scenarios: [{ id: "s-4", sha256: digest("s-4") }],
          expectedEnvironmentKind: "none",
          verifierRefs: ["tests/intent.test.ts"],
          evidenceAuthority: "production",
        }),
      ],
    });

    const trustedTruth = new Map<string, ProductEvidenceProjection>();
    const truthKey = (v: ProductFactoryLaneReceipt) =>
      v.receiptSha256 + ":" + v.taskSha256;

    const makeReceipt = (
      runId: string,
      attempt: number,
      t: typeof task,
      options: {
        settingsFingerprint?: string;
        usage?:
          | {
              status: "reported";
              inputUncachedTokens: number;
              inputCachedTokens: number;
              outputTokens: number;
              costUsd: number;
            }
          | { status: "unavailable"; reasonCode: "provider-usage-unavailable" };
      } = {},
    ) => {
      const envKind =
        t.lane === "game"
          ? "unity"
          : t.lane === "web"
            ? "web"
            : t.lane === "android"
              ? "android"
              : "none";
      const resultSha256 = digest(
        runId + "-" + t.taskId + "-" + attempt + "-res",
      );
      const judgmentSha256 = digest(
        runId + "-" + t.taskId + "-" + attempt + "-judg",
      );
      const environmentFingerprint = digest("env");
      const capabilityFingerprint = digest("cap");

      const rec = createProductFactoryLaneReceipt({
        experimentId: "exp-1",
        runId,
        taskId: t.taskId,
        taskSha256: t.taskSha256,
        attemptIndex: attempt + 1,
        lane: t.lane,
        suiteSha256: suite.suiteSha256,
        verifierFingerprint: t.verifierFingerprint,
        providerTopologyFingerprint: digest("topo-1"),
        settingsFingerprint:
          options.settingsFingerprint ?? digest("settings-1"),
        evidenceAuthority: "production",
        productOutcome: {
          resultSha256,
          resultStatus: "PASS",
          judgmentSha256,
          judgmentStatus: "PASS",
          claimedSuccess: true,
        },
        environment: {
          kind: envKind,
          environmentFingerprint,
          capabilityFingerprint,
          capabilityStatus: "PASS",
          status: "PASS",
        },
        protectedSafetyStatus: "PASS",
        productionEvidence: "verified",
        wallTimeMs: 1000,
        clarificationCount: 0,
        userInterventionCount: 0,
        retryCount: 0,
        limitationCodes: ["deterministic-fixture"],
        usage: options.usage ?? {
          status: "unavailable",
          reasonCode: "provider-usage-unavailable",
        },
      });

      trustedTruth.set(truthKey(rec), {
        resultSha256,
        resultStatus: "PASS",
        judgmentSha256,
        judgmentStatus: "PASS",
        evidenceAuthority: "production",
        environmentFingerprint,
        capabilityFingerprint,
        environmentStatus: "PASS",
        environmentCapabilityStatus: "PASS",
        protectedSafetyStatus: "PASS",
        productionVerified: true,
      });

      return rec;
    };

    const verifier: ProductEvidenceVerifier = async (val) => {
      const expected = trustedTruth.get(truthKey(val));
      return expected ? structuredClone(expected) : false;
    };

    // Baseline with unavailable usage
    const baselineReceipts = suite.tasks.flatMap((t) =>
      [0, 1, 2].map((att) => makeReceipt("run-base", att, t)),
    );
    const baselineReport = await createProductFactoryBenchmarkReport(
      {
        suite,
        experimentId: "exp-1",
        role: "baseline",
        baselineReportSha256: null,
        runId: "run-base",
        startedAt: "2026-09-28T00:00:00.000Z",
        endedAt: "2026-09-28T00:05:00.000Z",
        providerTopologyFingerprint: digest("topo-1"),
        settingsFingerprint: digest("settings-1"),
        evidenceAuthority: "production",
        receipts: baselineReceipts,
      },
      verifier,
    );

    // Incomplete usage MUST derive null cost and token metrics, NEVER zero!
    expect(baselineReport.metrics.global.costUsd).toBeNull();
    expect(baselineReport.metrics.global.totalTokens).toBeNull();
    expect(baselineReport.metrics.global.inputUncachedTokens).toBeNull();
    expect(baselineReport.metrics.global.outputTokens).toBeNull();

    // Candidate with mismatched settings
    const candidateReceiptsDrift = suite.tasks.flatMap((t) =>
      [0, 1, 2].map((att) =>
        makeReceipt("run-cand", att, t, {
          settingsFingerprint: digest("settings-drifted"),
        }),
      ),
    );
    const candidateReportDrift = await createProductFactoryBenchmarkReport(
      {
        suite,
        experimentId: "exp-1",
        role: "candidate",
        baselineReportSha256: baselineReport.reportSha256,
        runId: "run-cand",
        startedAt: "2026-09-28T00:06:00.000Z",
        endedAt: "2026-09-28T00:10:00.000Z",
        providerTopologyFingerprint: digest("topo-1"),
        settingsFingerprint: digest("settings-drifted"),
        evidenceAuthority: "production",
        receipts: candidateReceiptsDrift,
      },
      verifier,
    );

    // Paired comparison MUST reject settings mismatch!
    await expect(
      createProductFactoryPairedComparison(
        {
          suite,
          baseline: baselineReport,
          candidate: candidateReportDrift,
        },
        { productEvidence: verifier },
      ),
    ).rejects.toThrow();
  });

  it("foundry candidate promotion and rollback restores exact registry delta", async () => {
    const registryId = "reg-e5-rollback";
    const initialRegistry = createEmptyLearningRegistry(registryId);
    const repository = new InMemoryLearningRegistryRepository(initialRegistry);
    const hostCapability = await issueLocalTestLearningHostCapability({
      registryId,
      issuerId: "trusted-host",
      verifierId: "forge-bench-verifier",
    });

    const foundry = new LearningFoundry({
      mode: "maintenance",
      implementerId: "implementer-1",
      freshnessHorizonMs: 10_000,
      now: () => 100,
      repository,
      hostCapability,
      comparisonVerifier: async (p) => structuredClone(p),
      reviewVerifier: async (r) => structuredClone(r),
    });

    const regBefore = await repository.read();
    expect(regBefore.revision).toBe(0);
    expect(regBefore.active.lessonSha256s.length).toBe(0);

    // Create a real terminal ledger
    const root = mkdtempSync(join(tmpdir(), "e5-ledger-"));
    let summary;
    try {
      const ledger = new TrajectoryLedger({ root, ledgerId: "traj-e5" });
      const opened = await ledger.append({
        eventId: "opened",
        kind: "trajectory.opened",
        occurredAtMs: 1,
        causalEventIds: [],
        payload: {
          objectiveDigest: digest("objective"),
          workspaceId: "workspace-e5",
          sessionId: "session-e5",
          origin: "test-only",
          writerEpoch: 1,
          rootScopeId: "root-scope",
        },
      });
      const started = await ledger.append({
        eventId: "finalization-started",
        kind: "finalization.started",
        occurredAtMs: 2,
        causalEventIds: ["opened"],
        payload: { reasonCode: "complete", deadlineAtMs: 100 },
      });
      const receiptSummary = {
        status: "complete" as const,
        disposedCount: 0,
        failedDisposerCount: 0,
        timedOutDisposerCount: 0,
        unresolvedOperationCount: 0,
        unresolvedScopeCount: 0,
        unresolvedDisposerCount: 0,
        deadlineAtMs: 100,
        quiescence: "confirmed" as const,
      };
      await ledger.append({
        eventId: "finalization-receipt",
        kind: "finalization.receipt",
        occurredAtMs: 3,
        causalEventIds: [started.event.eventId],
        payload: {
          ...receiptSummary,
          predecessorSequence: started.tip.sequence,
          predecessorHash: started.tip.hash!,
          receiptDigest: receiptDigest(
            receiptSummary,
            started.tip.sequence,
            started.tip.hash!,
          ),
        },
      });
      await ledger.append({
        eventId: "terminal",
        kind: "trajectory.terminal",
        occurredAtMs: 4,
        causalEventIds: ["finalization-receipt"],
        payload: {
          outcome: "completed",
          summaryDigest: digest("objective"),
          cleanupOutcome: "completed",
          quiescence: "confirmed",
          receiptEventId: "finalization-receipt",
        },
      });
      const tip = await ledger.tip();
      summary = await foundry.summarizeTrajectory({ ledger, expectedTip: tip });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    const [cluster] = clusterAndDedupeTrajectorySummaries([summary], {
      rootCause: "missing idempotency key in game reward",
      correction: "bind idempotent reward token to account",
      applicability: { appliesTo: ["game"], excludes: [] },
      productScope: "game",
    });

    // Create candidate
    const candidate = createCandidateLesson({
      cluster,
      rootCause: "missing idempotency key in game reward",
      correction: "bind idempotent reward token to account",
      applicability: { appliesTo: ["game"], excludes: [] },
      productScope: "game",
      sourceVerifierSha256s: [digest("v-game-1")],
      usefulCount: 1,
      harmfulCount: 0,
      baseRegistryId: regBefore.registryId,
      baseRegistryRevision: regBefore.revision,
      baseRegistrySha256: regBefore.registrySha256,
      baseIntelligenceVersion: regBefore.active.version,
      baseIntelligenceSha256: regBefore.active.sha256,
    });

    const projection = createForgeBenchPromotionProjection({
      comparisonSha256: digest("comparison-1"),
      suiteSha256: digest("suite-1"),
      baselineReportSha256: digest("baseline-1"),
      candidateReportSha256: digest("candidate-1"),
      evidenceAuthority: "test-only",
      thresholdsVerified: true,
      promotionEligible: true,
      protectedSafetyPreserved: true,
      protectedFalseSuccessPreserved: true,
      outcomeDelta: 0.125,
      nonRegressionSummarySha256: digest("non-regression-1"),
      verifierId: "forge-bench-verifier",
      verifierDigest: digest("forge-bench-verifier"),
    });

    const replayReceipt = createOfflineReplayReceipt({ candidate, projection });
    const review = createIndependentReviewReceipt({
      reviewLevel: "review-2",
      reviewerId: "independent-reviewer-web",
      implementerId: "implementer-1",
      candidateSha256: candidate.candidateSha256,
      comparisonSha256: projection.comparisonSha256,
      protectedSafetyPreserved: projection.protectedSafetyPreserved,
      protectedFalseSuccessPreserved: projection.protectedFalseSuccessPreserved,
      status: "independent-approved",
    });

    // Promotion
    const promoted = await foundry.promote({
      candidate,
      replayReceipt,
      projection,
      review,
      reversible: {
        applySha256: digest("apply"),
        rollbackSha256: digest("rollback"),
      },
    });

    expect(promoted.status).toBe("promoted");
    expect(promoted.registry.revision).toBe(1);

    const regAfterPromotion = await repository.read();
    expect(regAfterPromotion.revision).toBe(1);
    expect(regAfterPromotion.active.lessonSha256s.length).toBe(1);

    // Rollback
    const rolledBack = await foundry.rollback({
      promotionPackage: promoted.deltaPackage,
    });

    expect(rolledBack.status).toBe("rolled-back");
    const regAfterRollback = await repository.read();
    expect(regAfterRollback.active.lessonSha256s.length).toBe(0);
    expect(regAfterRollback.active.sha256).toBe(regBefore.active.sha256);
  });
});
