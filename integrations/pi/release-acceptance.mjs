/** Local source-release acceptance. No live model, pricing claim or activation.
 * contract: pure public-boundary checks; runtime: installed Pi/canonical host;
 * e2e: complete owner-gated workflows in fresh Node processes.
 * All modes retain the same material requirements; they do not relabel a run.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BudgetLedger } from '../../mcp/build/runtime/model-call-gateway.js';
import { negotiateHarnessAdapter } from '../../mcp/build/runtime/harness-adapter.js';
import { createPiWorkerAdapter, loadPinnedPiAgent } from './adapter.mjs';
import { createPiHostAdapter } from './host-adapter.mjs';
import { assertCurrentBinding, buildTaskContext, digest } from './contracts.mjs';
import { createReceiptBook, toProviderUsageObservation } from './receipts.mjs';
import { assessPiBenchmark, createPiCanaryController } from './release-gates.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const IDS = ['admission', 'scope', 'effects', 'budget', 'receipts', 'release'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const task = () => ({ taskId: 'release-task', objective: 'Analyze supplied input only', acceptance: ['Keep the required acceptance'], context: 'private-source-marker' });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
function binding(policy = 'release-policy') {
  return { workspaceId: 'release-workspace', sessionId: 'release-session', taskId: 'release-task', turnId: 'release-turn',
    treeSha: 'TREE:' + 'a'.repeat(64), policyHash: digest(policy), capabilityHash: 'b'.repeat(64), issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 };
}
const receiptBinding = () => ({ ...binding(), attemptId: 'attempt-1', accountId: 'billing-account', provider: 'fixture', model: 'release-model', snapshotSha256: 'c'.repeat(64) });
const nativeShapedFixture = () => ({ requestId: 'fixture-request', provider: 'fixture', model: 'release-model', snapshotSha256: 'c'.repeat(64), inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, costUsd: 0.01 });
function fixture(overrides = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'fw-pi-release-'));
  mkdirSync(join(workspace, '.forgewright'));
  const policy = 'mode: strict\nrequire_verify: true\nmax_escalations: 3\nrefresh_interval_ticks: 10\ndeny_patterns:\n  - "forbidden"\n';
  writeFileSync(join(workspace, '.forgewright/execution-policy.yaml'), policy, { mode: 0o600 });
  const identity = binding(policy);
  const model = { id: 'release-model', provider: 'fixture', snapshotSha256: 'c'.repeat(64) };
  const seen = { calls: 0, effects: 0, requests: [] };
  const options = { enabled: true, workspace, binding: identity, readBinding: () => identity,
    accountId: 'billing-account', systemPrompt: 'host-policy-marker', model, probe: async () => [model],
    budget: new BudgetLedger({ taskLimit: 10, accountLimit: 10 }), maxCostPerAttempt: 0.1,
    limits: { cleanupMs: 30, timeoutMs: 10000 }, tools: [], authorizeTool: async () => true,
    // Real ProcessPolicyEvaluator is intentionally used; only model output is fake.
    transport: { evidenceTier: 'fixture', retryPolicy: 'none', complete: async (request) => {
      seen.calls++; seen.requests.push(request); return { message: { text: 'local-answer', toolCalls: [] }, nativeUsage: null };
    } }, ...overrides };
  const adapter = createPiHostAdapter(options);
  return { workspace, binding: identity, model, seen, options, adapter,
    async dispose() { await adapter.interrupt(); const r = adapter.getResult(); if (r) await adapter.wait(r.sessionId); await sleep(30); rmSync(workspace, { recursive: true, force: true }); } };
}
const outcome = async (adapter, input = task()) => { const started = await adapter.start(input); return adapter.wait(started.sessionId); };
function tool(f) { return { name: 'fw_get_current_phase', description: 'Read a local fixture phase', parameters: { type: 'object', properties: {}, additionalProperties: false }, execute: async () => { f.seen.effects++; return { content: [{ type: 'text', text: 'BUILD' }] }; } }; }
const toolMessage = (id = 'read-phase') => ({ message: { text: '', toolCalls: [{ id, name: 'fw_get_current_phase', arguments: {} }] }, nativeUsage: null });

async function contract(id) {
  if (id === 'admission') {
    const adapter = createPiHostAdapter();
    await assert.rejects(adapter.start(task()), { code: 'pi_disabled' });
    assert.equal(adapter.getResult(), null);
    assert.throws(() => negotiateHarnessAdapter(adapter, ['resume']));
    assert.throws(() => buildTaskContext({ ...task(), approved: true }, 'policy'));
  } else if (id === 'scope') {
    const input = task(); const packet = buildTaskContext(input, 'host-policy'); input.acceptance.push('late change');
    assert.deepEqual(packet.task.acceptance, ['Keep the required acceptance']);
    assert.equal(packet.tokenCount, null);
    const b = binding(); assertCurrentBinding(b, b);
    assert.throws(() => assertCurrentBinding({ ...b, turnId: 'stale-turn' }, b));
    assert.throws(() => buildTaskContext({ ...task(), acceptance: Array(1) }, 'policy'));
    assert.throws(() => buildTaskContext(task(), 'policy', [{ ref: 'artifact://../escape', sha256: 'd'.repeat(64) }]));
  } else if (id === 'effects') {
    const adapter = createPiWorkerAdapter(); await adapter.interrupt();
    await assert.rejects(adapter.start(task()), { code: 'pi_disabled' });
    assert.throws(() => buildTaskContext({ ...task(), context: 'x'.repeat(2000) }, 'policy', [], 300));
    assert.throws(() => buildTaskContext({ ...task(), tools: ['bash'] }, 'policy'));
  } else if (id === 'budget') {
    const ledger = new BudgetLedger({ taskLimit: 10, accountLimit: 1 });
    const a = ledger.reserve('task-a', 'same-account', 0.6); assert.ok(a.reservation);
    assert.equal(ledger.reserve('task-b', 'same-account', 0.6).status, 'blocked');
    ledger.release(a.reservation); ledger.release(a.reservation);
    assert.ok(ledger.reserve('task-b', 'same-account', 0.6).reservation);
  } else if (id === 'receipts') {
    const book = createReceiptBook(); book.begin(receiptBinding());
    const r = book.settle('attempt-1', { status: 'completed', evidenceTier: 'fixture', nativeUsage: nativeShapedFixture(), latencyMs: 1 });
    assert.equal(toProviderUsageObservation(r).usage.status, 'unavailable');
    assert.throws(() => toProviderUsageObservation(JSON.parse(JSON.stringify(r))), { code: 'pi_untrusted_receipt' });
    assert.throws(() => book.settle('attempt-1', { status: 'completed', evidenceTier: 'fixture', nativeUsage: null, latencyMs: 1 }));
  } else if (id === 'release') {
    const assessment = assessPiBenchmark({}, {}, {});
    assert.equal(assessment.status, 'hold'); assert.equal(assessment.activationAllowed, false);
    let created = 0;
    const gate = createPiCanaryController({ laneId: 'release-check', createAdapter: () => { created++; } });
    await assert.rejects(gate.start(task()), { code: 'pi_canary_disabled' });
    assert.equal(created, 0); await gate.kill(); assert.equal(gate.getStatus().enabled, false);
  } else throw new Error('Unknown contract case');
}

async function runtime(id) {
  if (id === 'admission') {
    const f = fixture({ enabled: false });
    try {
      await assert.rejects(f.adapter.start(task()), { code: 'pi_disabled' }); assert.equal(f.seen.calls, 0);
    } finally { await f.dispose(); }
    const p = fixture({ production: true });
    try { await assert.rejects(p.adapter.start(task()), { code: 'pi_production_activation_unavailable' }); assert.equal(p.seen.calls, 0); }
    finally { await p.dispose(); }
  } else if (id === 'scope') {
    const f = fixture();
    try {
      const input = task(); const started = await f.adapter.start(input); input.acceptance.push('mutated');
      assert.equal((await f.adapter.wait(started.sessionId)).executionState, 'finished');
      const request = f.seen.requests[0]; assert.equal(request.context.systemPrompt, 'host-policy-marker');
      const packet = JSON.parse(request.context.messages[0].content[0].text);
      assert.deepEqual(packet.task.acceptance, ['Keep the required acceptance']);
      assert.equal(request.accountId, 'billing-account');
    } finally { await f.dispose(); }
    const stale = fixture(); stale.options.readBinding = () => ({ ...stale.binding, turnId: 'replaced-turn' });
    try { assert.equal((await outcome(stale.adapter)).executionState, 'failed'); assert.equal(stale.seen.calls, 0); }
    finally { await stale.dispose(); }
  } else if (id === 'effects') {
    const f = fixture({ limits: { modelCalls: 2, cleanupMs: 30 }, authorizeTool: async () => false });
    f.options.tools.push(tool(f)); f.options.transport.complete = async () => { f.seen.calls++; return toolMessage(); };
    try { assert.notEqual((await outcome(f.adapter)).executionState, 'finished'); assert.equal(f.seen.effects, 0); assert.equal(f.seen.calls, 1); }
    finally { await f.dispose(); }
    const Agent = await loadPinnedPiAgent(); let calls = 0;
    const bounded = createPiWorkerAdapter({ enabled: true, systemPrompt: 'policy', model: {}, limits: { timeoutMs: 5 },
      loadAgent: async () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20); return Agent; },
      streamFn: () => { calls++; throw new Error('must not dispatch'); } });
    await assert.rejects(bounded.start(task()), { code: 'pi_timeout' }); assert.equal(calls, 0);
  } else if (id === 'budget') {
    const ledger = new BudgetLedger({ taskLimit: 10, accountLimit: 1 });
    const first = fixture({ budget: ledger, maxCostPerAttempt: 0.6 });
    const second = fixture({ budget: ledger, maxCostPerAttempt: 0.6 });
    second.binding.workspaceId = 'different-workspace'; second.binding.taskId = 'second-task';
    try {
      assert.equal((await outcome(first.adapter)).executionState, 'finished');
      assert.equal((await outcome(second.adapter, { ...task(), taskId: 'second-task' })).executionState, 'failed');
      assert.equal(second.seen.calls, 0);
    } finally { await first.dispose(); await second.dispose(); }
    const entered = deferred(), pending = deferred(); const budget = new BudgetLedger({ taskLimit: 1, accountLimit: 10 });
    const f = fixture({ budget, maxCostPerAttempt: 0.4 });
    f.options.readBinding = () => { if (f.adapter.getReceipts().length) { entered.resolve(); return pending.promise; } return f.binding; };
    try {
      const started = await f.adapter.start(task()); await entered.promise; await f.adapter.interrupt();
      assert.equal((await f.adapter.wait(started.sessionId)).executionState, 'interrupted');
      const next = budget.reserve('release-task', 'billing-account', 0.6);
      assert.ok(next.reservation, 'Never-dispatched budget must be released even while binding remains pending');
      budget.release(next.reservation); assert.equal(f.seen.calls, 0);
      pending.resolve(f.binding); await sleep(60); assert.equal(f.seen.calls, 0); assert.equal(f.adapter.getReceipts().length, 1);
    } finally { pending.resolve(f.binding); await sleep(60); await f.dispose(); }
  } else if (id === 'receipts') {
    const f = fixture();
    try {
      const result = await outcome(f.adapter); assert.equal(result.executionState, 'finished');
      const r = f.adapter.getReceipts()[0]; assert.equal(r.costBasis, 'unavailable'); assert.equal(r.usage, null);
      assert.equal(toProviderUsageObservation(r).usage.status, 'unavailable');
      assert.throws(() => toProviderUsageObservation({ ...r }), { code: 'pi_untrusted_receipt' });
      const telemetry = JSON.stringify(f.adapter.getTelemetry());
      for (const secret of ['private-source-marker', 'host-policy-marker', 'local-answer']) assert.equal(telemetry.includes(secret), false);
      assert.equal(result.completionState, 'unverified');
    } finally { await f.dispose(); }
  } else if (id === 'release') {
    const entered = deferred(), pending = deferred(); const f = fixture(); let created = 0;
    f.options.transport.complete = async (request) => { f.seen.calls++; f.seen.requests.push(request); entered.resolve(); await pending.promise; return { message: { text: 'late-answer', toolCalls: [] }, nativeUsage: null }; };
    const gate = createPiCanaryController({ enabled: true, laneId: 'owned-release-lane', authorize: async () => true, createAdapter: () => { created++; return f.adapter; } });
    try {
      const started = await gate.start(task()); await entered.promise;
      await assert.rejects(gate.start(task()), { code: 'pi_canary_busy' });
      await gate.kill(); const result = await gate.wait(started.sessionId);
      assert.equal(result.executionState, 'interrupted'); assert.equal(result.output, '');
      assert.equal(result.quiescence, 'not_confirmed'); assert.equal(gate.getStatus().quarantined, true);
      assert.equal(f.seen.requests[0].signal.aborted, true);
      pending.resolve(); await sleep(90); await assert.rejects(gate.start(task()), { code: 'pi_canary_disabled' });
      assert.equal(f.adapter.getResult().output, ''); assert.equal(created, 1); assert.equal(f.seen.calls, 1);
    } finally { pending.resolve(); await sleep(90); await f.dispose(); }
  } else throw new Error('Unknown runtime case');
}

/** A complete subprocess workflow additionally proves approved tool dispatch,
 * output -> receipt -> lifecycle -> owner-gate handoff across real components.
 * No fake usage is called a live receipt, and the temporary workspace is owned.
 */
async function workflow(id) {
  await runtime(id);
  const f = fixture({ limits: { modelCalls: 2, cleanupMs: 30 }, authorizeTool: async () => true });
  f.options.tools.push(tool(f));
  f.options.transport.complete = async (request) => {
    f.seen.calls++; f.seen.requests.push(request);
    return f.seen.calls === 1 ? toolMessage() : { message: { text: 'verified-local-workflow', toolCalls: [] }, nativeUsage: null };
  };
  let approvals = 0;
  const gate = createPiCanaryController({ enabled: true, laneId: 'subprocess-workflow', authorize: async () => { approvals++; return true; }, createAdapter: () => f.adapter });
  try {
    const started = await gate.start(task()); const result = await gate.wait(started.sessionId);
    assert.equal(result.executionState, 'finished'); assert.equal(result.quiescence, 'confirmed');
    assert.equal(result.output, 'verified-local-workflow'); assert.equal(result.completionState, 'unverified');
    assert.equal(f.seen.effects, 1); assert.equal(f.seen.calls, 2); assert.equal(approvals, 1);
    assert.equal(f.adapter.getReceipts().length, 2);
    assert.ok(f.adapter.getReceipts().every((r) => toProviderUsageObservation(r).usage.status === 'unavailable'));
    await gate.kill(); await assert.rejects(gate.start(task()));
    return { scenario: id, assertions: 'passed', effects: f.seen.effects, modelCalls: f.seen.calls, cleanup: result.quiescence, nativeEvidence: false, activation: false };
  } finally { await f.dispose(); }
}

const mode = process.argv[2];
if (!['contract', 'runtime', 'e2e', 'child'].includes(mode)) { console.error('Usage: node integrations/pi/release-acceptance.mjs contract|runtime|e2e'); process.exit(2); }
if (mode === 'child') {
  const id = process.argv[3]; if (!IDS.includes(id)) throw new Error('Unknown subprocess scenario');
  const answer = await workflow(id); console.log('FW_PI_WORKFLOW=' + JSON.stringify(answer));
} else {
  for (const id of IDS) test(`local-pi-${id}: ${mode} acceptance`, async () => {
    if (mode === 'contract') return contract(id);
    if (mode === 'runtime') return runtime(id);
    const execution = spawnSync(process.execPath, [SELF, 'child', id], { cwd: ROOT, shell: false, encoding: 'utf8', timeout: 30000,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? tmpdir(), TMPDIR: tmpdir(), LANG: 'C.UTF-8' }, maxBuffer: 1024 * 1024 });
    assert.equal(execution.error, undefined, execution.error?.message);
    assert.equal(execution.status, 0, execution.stderr + execution.stdout);
    const line = execution.stdout.split('\n').find((value) => value.startsWith('FW_PI_WORKFLOW=')); assert.ok(line);
    const result = JSON.parse(line.slice('FW_PI_WORKFLOW='.length));
    assert.deepEqual(result, { scenario: id, assertions: 'passed', effects: 1, modelCalls: 2, cleanup: 'confirmed', nativeEvidence: false, activation: false });
  });
}
