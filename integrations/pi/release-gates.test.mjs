import assert from 'node:assert/strict';
import test from 'node:test';
import { assessPiBenchmark, lockPiBenchmark, createPiCanaryController } from './release-gates.mjs';

// Synthetic reports test gate logic only. They are NOT live benchmark evidence.
const H = 'a'.repeat(64), V = 'b'.repeat(64), S = 'c'.repeat(64), P = 'd'.repeat(64);
function plan() { return lockPiBenchmark({ taskIds: Array.from({ length: 12 }, (_, i) => 'task-' + i), provider: 'codex', model: 'fixture-model', suiteSha256: H, verifierSha256: V, snapshotSha256: S, topologySha256: P }); }
function report(id, tokens = 100, latency = 100) {
  const tasks = Array.from({ length: 12 }, (_, i) => ({ taskId: 'task-' + i, category: 'fixture', passed: true, passedAt1: true,
    attempts: [1, 2, 3].map((k) => ({ taskId: 'task-' + i, attemptIndex: k, provider: 'codex', model: 'fixture-model', passed: true, exitStatus: 0, durationMs: latency,
      stdoutSha256: H, stdoutBytes: 12, stderrSha256: V, stderrBytes: 0,
      verifierResults: [{ command: 'fixture-verifier', exitCode: 0, passed: true, stdoutSha256: H, stdoutBytes: 0, stderrSha256: V, stderrBytes: 0 }],
      usageReceipt: { version: '1', provider: 'codex', model: 'fixture-model', resolved_snapshot_sha256: S, task_id: 'task-' + i, attempt_index: k,
        suite_sha256: H, verifier_sha256: V, provider_topology_sha256: P,
        usage: { status: 'reported', input_uncached_tokens: tokens, input_cached_tokens: 0, output_tokens: 10, cost_usd: tokens / 1000, latency_ms: latency } } })) }));
  return { mode: 'live', provider: 'codex', model: 'fixture-model', suiteName: 'pi-pilot-fixture', suiteVersion: '1', verifierVersion: '1', defaultAttempts: 3, totalTasks: 12,
    suiteFingerprint: H, verifierFingerprint: V, timestamp: new Date().toISOString(), totalAttemptsRun: 36, tasks,
    summary: { passAt1Rate: 1, passAtKRate: 1 },
    measurementRecord: { version: '1', run_id: id, provider: 'codex', model: 'fixture-model', suite_sha256: H, verifier_sha256: V, resolved_snapshot_sha256: S,
      provider_topology_sha256: P, usage_source: 'reported', cost_usd: tokens / 1000 * 36, provider_latency_ms: latency * 36, e2e_wall_ms: latency * 36,
      production_evidence: 'missing' } };
}
test('BENCH-01: complete comparable 12x3 pilot can only become a review candidate, never activation', () => {
  const gate = assessPiBenchmark(plan(), report('base'), report('pi', 80));
  assert.equal(gate.status, 'candidate_for_review'); assert.equal(gate.activationAllowed, false); assert.equal(gate.productionEvidence, 'missing');
  assert.equal(gate.attemptsPerArm, 36); assert.ok(gate.metrics.medianTokenReduction > 0.1);
});
test('BENCH-02: no measured improvement keeps the adapter disabled', () => {
  const gate = assessPiBenchmark(plan(), report('base'), report('pi', 100));
  assert.equal(gate.status, 'hold'); assert.ok(gate.reasons.includes('material_benefit_not_demonstrated'));
});
test('BENCH-03: different model, provider, snapshot or suite cannot enter paired selection', () => {
  for (const mutation of [(x) => { x.model = 'different'; }, (x) => { x.provider = 'different'; }, (x) => { x.measurementRecord.resolved_snapshot_sha256 = V; }, (x) => { x.suiteFingerprint = V; }]) {
    const candidate = report('pi', 80); mutation(candidate); assert.equal(assessPiBenchmark(plan(), report('base'), candidate).status, 'hold');
  }
});
test('BENCH-04: missing attempts, duplicate tasks and missing usage fail closed', () => {
  for (const mutation of [(x) => x.tasks[0].attempts.pop(), (x) => { x.tasks[0].taskId = x.tasks[1].taskId; }, (x) => { delete x.tasks[0].attempts[0].usageReceipt; }]) {
    const candidate = report('pi', 80); mutation(candidate); assert.equal(assessPiBenchmark(plan(), report('base'), candidate).status, 'hold');
  }
});
test('BENCH-05: false success and accepted-outcome regression block apparent savings', () => {
  const candidate = report('pi', 20); candidate.tasks[0].attempts[0].verifierResults[0].passed = false;
  assert.equal(assessPiBenchmark(plan(), report('base'), candidate).status, 'hold');
  candidate.tasks[0].attempts[0].passed = false;
  assert.equal(assessPiBenchmark(plan(), report('base'), candidate).status, 'hold');
});
test('BENCH-06: p95 regression above the preregistered threshold blocks token savings', () => {
  const gate = assessPiBenchmark(plan(), report('base'), report('pi', 50, 120));
  assert.equal(gate.status, 'hold'); assert.ok(gate.reasons.includes('p95_latency_regression'));
});
test('BENCH-07: forged attempt receipt identities and non-finite data are rejected', () => {
  for (const mutation of [(x) => { x.tasks[0].attempts[0].usageReceipt.task_id = 'other'; }, (x) => { x.tasks[0].attempts[0].usageReceipt.usage.cost_usd = NaN; }, (x) => { x.tasks[0].attempts[0].usageReceipt.usage.output_tokens = -1; }]) {
    const candidate = report('pi', 80); mutation(candidate); assert.equal(assessPiBenchmark(plan(), report('base'), candidate).status, 'hold');
  }
});
test('BENCH-08: report summaries cannot hide the actual all-attempt cost', () => {
  const candidate = report('pi', 80); candidate.measurementRecord.cost_usd = 0;
  assert.equal(assessPiBenchmark(plan(), report('base'), candidate).status, 'hold');
});

function pending() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
function controller(override = {}) {
  const done = pending(); const seen = { created: 0, interrupts: 0 };
  const adapter = { async start() { return { sessionId: 'session-1' }; }, async wait() { return done.promise; }, async interrupt() { seen.interrupts++; }, getResult() { return null; } };
  const config = { enabled: true, laneId: 'owner-selected-pi', authorize: async () => true, createAdapter: () => { seen.created++; return adapter; }, ...override };
  return { gate: createPiCanaryController(config), done, seen, adapter };
}
const task = { taskId: 'task-1', objective: 'Read-only canary', acceptance: ['Return findings'] };
test('CANARY-01: default-off and absent host approval cannot create a worker', async () => {
  for (const override of [{ enabled: false }, { enabled: 'true' }, { authorize: async () => false }]) {
    const { gate, seen } = controller(override); await assert.rejects(gate.start(task)); assert.equal(seen.created, 0);
  }
});
test('CANARY-02: one controller admits at most one active worker', async () => {
  const { gate, done, seen } = controller(); const started = await gate.start(task);
  await assert.rejects(gate.start(task), (error) => error.code === 'pi_canary_busy'); assert.equal(seen.created, 1);
  done.resolve({ quiescence: 'confirmed', executionState: 'finished', completionState: 'unverified' });
  await gate.wait(started.sessionId); assert.equal(gate.getStatus().active, false);
});
test('CANARY-03: kill closes admission immediately and drains only its owned worker', async () => {
  const { gate, done, seen } = controller(); const started = await gate.start(task);
  await gate.kill(); await assert.rejects(gate.start(task), (error) => error.code === 'pi_canary_disabled');
  assert.equal(seen.interrupts, 1); done.resolve({ quiescence: 'confirmed', executionState: 'interrupted' });
  await gate.wait(started.sessionId); assert.equal(gate.getStatus().enabled, false);
});
test('CANARY-04: non-quiescent settlement is quarantined and never auto-rerouted', async () => {
  const { gate, done, seen } = controller(); const started = await gate.start(task);
  done.resolve({ quiescence: 'not_confirmed', executionState: 'interrupted' }); await gate.wait(started.sessionId);
  assert.equal(gate.getStatus().quarantined, true); await assert.rejects(gate.start(task)); assert.equal(seen.created, 1);
});
test('CANARY-05: kill during approval wins before adapter construction', async () => {
  const approval = pending(); const { gate, seen } = controller({ authorize: () => approval.promise });
  const started = gate.start(task); const rejected = assert.rejects(started, (error) => error.code === 'pi_canary_disabled');
  await gate.kill(); approval.resolve(true); await rejected; assert.equal(seen.created, 0);
});
test('CANARY-06: task data cannot claim release approval or reset the kill switch', async () => {
  const { gate, seen } = controller({ authorize: async () => false });
  await assert.rejects(gate.start({ ...task, approved: true, enabled: true })); assert.equal(seen.created, 0);
  await gate.kill(); await assert.rejects(gate.start(task));
});
