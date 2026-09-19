/**
 * Pi pilot decision logic on the existing ForgeBench report/receipt contract.
 * Pure comparison is not receipt authentication or permission to activate.
 */
import { createPairedComparison } from '../../src/cli/src/bench/compare.ts';
import { PiHostError, buildTaskContext, digest, fail, hash64, safeId, snapshotJson } from './contracts.mjs';

const THRESHOLDS = Object.freeze({ tasks: 12, repetitions: 3, minimumReduction: 0.10, maximumP95Regression: 0.10 });
function invariant(condition) { if (!condition) fail('pi_invalid_benchmark'); }
const finiteNonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integerNonnegative = (value) => Number.isSafeInteger(value) && value >= 0;
function quantile(values, p) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); const n = sorted.length; return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2; }

export function lockPiBenchmark(input) {
  const data = snapshotJson(input);
  invariant(Array.isArray(data.taskIds) && data.taskIds.length === THRESHOLDS.tasks && new Set(data.taskIds).size === THRESHOLDS.tasks && data.taskIds.every(safeId));
  invariant(safeId(data.provider) && safeId(data.model));
  for (const key of ['suiteSha256', 'verifierSha256', 'snapshotSha256', 'topologySha256']) invariant(hash64(data[key]));
  invariant(Object.keys(data).every((key) => ['taskIds', 'provider', 'model', 'suiteSha256', 'verifierSha256', 'snapshotSha256', 'topologySha256'].includes(key)));
  const material = { schema: 'forgewright-pi-pilot-plan/v1', ...data, thresholds: THRESHOLDS };
  return Object.freeze({ ...material, planSha256: digest(JSON.stringify(material)) });
}

function extractAttempts(plan, report) {
  invariant(report.mode === 'live' && report.provider === plan.provider && report.model === plan.model && report.defaultAttempts === 3 && report.totalTasks === 12);
  invariant(report.suiteFingerprint === plan.suiteSha256 && report.verifierFingerprint === plan.verifierSha256);
  const measurement = report.measurementRecord;
  invariant(measurement?.resolved_snapshot_sha256 === plan.snapshotSha256 && measurement.provider_topology_sha256 === plan.topologySha256);
  invariant(Array.isArray(report.tasks) && report.tasks.length === 12 && report.totalAttemptsRun === 36);
  const expectedIds = new Set(plan.taskIds); const results = new Map(); let totalCost = 0; let passAt1 = 0; let passAtK = 0;
  for (const task of report.tasks) {
    invariant(expectedIds.delete(task.taskId));
    invariant(Array.isArray(task.attempts) && task.attempts.length === 3);
    let taskPassed = false;
    for (let index = 0; index < 3; index++) {
      const attempt = task.attempts[index]; const receipt = attempt.usageReceipt;
      invariant(attempt.taskId === task.taskId && attempt.attemptIndex === index + 1 && attempt.provider === plan.provider && attempt.model === plan.model);
      invariant(typeof attempt.passed === 'boolean' && finiteNonnegative(attempt.durationMs) && hash64(attempt.stdoutSha256));
      invariant(Array.isArray(attempt.verifierResults) && attempt.verifierResults.length > 0);
      for (const verifier of attempt.verifierResults) invariant(typeof verifier.passed === 'boolean' && hash64(verifier.stdoutSha256) && hash64(verifier.stderrSha256));
      const actualPass = attempt.exitStatus === 0 && attempt.verifierResults.every((verifier) => verifier.passed && verifier.exitCode === 0);
      invariant(actualPass === attempt.passed);
      invariant(receipt?.version === '1' && receipt.provider === plan.provider && receipt.model === plan.model && receipt.task_id === task.taskId && receipt.attempt_index === index + 1);
      invariant(receipt.suite_sha256 === plan.suiteSha256 && receipt.verifier_sha256 === plan.verifierSha256 && receipt.provider_topology_sha256 === plan.topologySha256 && receipt.resolved_snapshot_sha256 === plan.snapshotSha256);
      const usage = receipt.usage;
      invariant(usage?.status === 'reported');
      for (const key of ['input_uncached_tokens', 'input_cached_tokens', 'output_tokens']) invariant(integerNonnegative(usage[key]));
      invariant(finiteNonnegative(usage.cost_usd) && finiteNonnegative(usage.latency_ms));
      const tokens = usage.input_uncached_tokens + usage.input_cached_tokens + usage.output_tokens;
      invariant(Number.isSafeInteger(tokens) && tokens > 0);
      if (attempt.falseSuccess === true || (attempt.safetyFailureCount ?? 0) !== 0) fail('pi_benchmark_safety_failure');
      totalCost += usage.cost_usd; taskPassed ||= actualPass;
      if (index === 0 && actualPass) passAt1++;
      results.set(`${task.taskId}:${index + 1}`, { accepted: actualPass, tokens, cost: usage.cost_usd, latencyMs: attempt.durationMs });
    }
    if (taskPassed) passAtK++;
    invariant(task.passed === taskPassed && task.passedAt1 === task.attempts[0].passed);
  }
  invariant(expectedIds.size === 0);
  invariant(Math.abs(report.summary.passAt1Rate - passAt1 / 12) < 1e-12 && Math.abs(report.summary.passAtKRate - passAtK / 12) < 1e-12);
  invariant(finiteNonnegative(measurement.cost_usd) && Math.abs(measurement.cost_usd - totalCost) < 1e-9);
  return results;
}

/** Validate structure and calculate thresholds; never authenticate caller data. */
export function assessPiBenchmark(plan, baselineInput, candidateInput) {
  const hold = (reasons, metrics = null) => Object.freeze({ status: 'hold', reasons: Object.freeze(reasons), metrics, activationAllowed: false, productionEvidence: 'missing', assessmentBasis: 'caller_supplied_reports' });
  try {
    const reconstructed = lockPiBenchmark({ taskIds: plan.taskIds, provider: plan.provider, model: plan.model, suiteSha256: plan.suiteSha256,
      verifierSha256: plan.verifierSha256, snapshotSha256: plan.snapshotSha256, topologySha256: plan.topologySha256 });
    invariant(plan.planSha256 === reconstructed.planSha256 && JSON.stringify(plan.thresholds) === JSON.stringify(THRESHOLDS));
    const baseline = snapshotJson(baselineInput, 512 * 1024), candidate = snapshotJson(candidateInput, 512 * 1024);
    const pair = createPairedComparison(baseline, candidate);
    const before = extractAttempts(plan, baseline), after = extractAttempts(plan, candidate);
    invariant(pair.usage_comparable);
    const reasons = [];
    const reductions = []; let baselineCost = 0, candidateCost = 0, baselineAccepted = 0, candidateAccepted = 0;
    for (const [key, a] of before) {
      const b = after.get(key); invariant(b);
      if (a.accepted && !b.accepted) reasons.push('accepted_outcome_regression');
      reductions.push(1 - b.tokens / a.tokens); baselineCost += a.cost; candidateCost += b.cost;
      baselineAccepted += Number(a.accepted); candidateAccepted += Number(b.accepted);
    }
    const baselineP95 = quantile([...before.values()].map((x) => x.latencyMs), 0.95);
    const candidateP95 = quantile([...after.values()].map((x) => x.latencyMs), 0.95);
    const medianTokenReduction = median(reductions);
    const baselineCostPerAccepted = baselineAccepted ? baselineCost / baselineAccepted : null;
    const candidateCostPerAccepted = candidateAccepted ? candidateCost / candidateAccepted : null;
    const acceptedCostReduction = baselineCostPerAccepted > 0 && candidateCostPerAccepted !== null ? 1 - candidateCostPerAccepted / baselineCostPerAccepted : null;
    if (!candidateAccepted || !baselineAccepted) reasons.push('accepted_outcomes_missing');
    if (!(medianTokenReduction + 1e-12 >= THRESHOLDS.minimumReduction || (acceptedCostReduction !== null && acceptedCostReduction + 1e-12 >= THRESHOLDS.minimumReduction))) reasons.push('material_benefit_not_demonstrated');
    if (candidateP95 > baselineP95 * (1 + THRESHOLDS.maximumP95Regression) + 1e-9) reasons.push('p95_latency_regression');
    const metrics = Object.freeze({ medianTokenReduction, acceptedCostReduction, baselineCostPerAccepted, candidateCostPerAccepted, baselineP95, candidateP95, baselineAccepted, candidateAccepted });
    if (reasons.length) return hold([...new Set(reasons)], metrics);
    return Object.freeze({ status: 'candidate_for_review', reasons: Object.freeze([]), metrics, attemptsPerArm: before.size, pair,
      activationAllowed: false, productionEvidence: 'missing', assessmentBasis: 'caller_supplied_reports',
      pendingChecks: Object.freeze(['native_receipt_authentication', 'randomized_order_and_cache_strata', 'peak_rss_and_cleanup', 'independent_exact_tree_review', 'explicit_owner_canary_authorization']) });
  } catch { return hold(['invalid_or_incomparable_reports']); }
}

/**
 * Process-local, owner-selected canary admission. The host authorize callback
 * MUST verify live evidence/review/owner approval; no report or task flag can
 * replace it. Production scheduler/OS-wide concurrency remain outside this gate.
 */
export function createPiCanaryController(config = {}) {
  let enabled = config.enabled === true; let active = false; let quarantined = false; let adapter = null; let sessionId = null;
  let waitPromise = null; let admissions = 0; let epoch = 0; let revoke;
  const revoked = new Promise((resolve) => { revoke = resolve; });
  const maxTasks = config.maxTasks ?? 1;
  if (!safeId(config.laneId) || !Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 10) fail('pi_invalid_canary_config');
  const laneId = config.laneId, authorize = config.authorize, createAdapter = config.createAdapter;
  const status = () => Object.freeze({ laneId, enabled, active, quarantined, admissions, sessionId });
  return Object.freeze({
    async start(input) {
      if (!enabled) fail('pi_canary_disabled');
      if (quarantined) fail('pi_canary_quarantined');
      if (active) fail('pi_canary_busy');
      if (admissions >= maxTasks) fail('pi_canary_budget_exceeded');
      if (typeof authorize !== 'function' || typeof createAdapter !== 'function') fail('pi_canary_host_required');
      const packet = buildTaskContext(input, 'Canary admission: host approval required');
      const startedEpoch = epoch; active = true;
      try {
        const approved = await Promise.race([authorize(Object.freeze({ laneId, task: packet.task, contextDigest: packet.digest })), revoked.then(() => false)]);
        if (!enabled || epoch !== startedEpoch) fail('pi_canary_disabled');
        if (approved !== true) fail('pi_canary_not_authorized');
        adapter = createAdapter();
        if (!adapter || typeof adapter.start !== 'function' || typeof adapter.wait !== 'function' || typeof adapter.interrupt !== 'function') fail('pi_canary_invalid_adapter');
        const started = await adapter.start(packet.task);
        if (!safeId(started?.sessionId)) fail('pi_canary_invalid_adapter');
        sessionId = started.sessionId; admissions++;
        if (!enabled || epoch !== startedEpoch) await adapter.interrupt();
        waitPromise = adapter.wait(sessionId).then((outcome) => {
          if (outcome?.quiescence !== 'confirmed') quarantined = true;
          active = false;
          return Object.freeze({ ...outcome, completionState: 'unverified' });
        }, () => { quarantined = true; active = false; return Object.freeze({ executionState: 'failed', quiescence: 'not_confirmed', completionState: 'unverified' }); });
        return Object.freeze({ sessionId });
      } catch (error) {
        active = false;
        if (adapter) quarantined = true;
        throw error instanceof PiHostError ? error : new PiHostError('pi_canary_start_failed');
      }
    },
    async wait(id) { if (!waitPromise || id !== sessionId) fail('pi_unknown_session'); return waitPromise; },
    async kill() { enabled = false; epoch++; revoke(); if (active && adapter) await adapter.interrupt(); return status(); },
    getStatus() { return status(); },
  });
}
