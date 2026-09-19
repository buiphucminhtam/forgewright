import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetLedger } from '../../mcp/build/runtime/model-call-gateway.js';
import { createPiHostAdapter } from './host-adapter.mjs';
import { digest } from './contracts.mjs';

// These tests enforce the existing account-cap and uncertain-settlement
// requirements highlighted by independent review; transport stays deterministic.
const roots = [];
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { resolve, promise }; }
function prepare(budget, suffix = 'one', extra = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'pi-budget-')); roots.push(workspace);
  mkdirSync(join(workspace, '.forgewright'));
  const policy = 'mode: strict\nrequire_verify: true\ndeny_patterns:\n  - "forbidden"\n';
  writeFileSync(join(workspace, '.forgewright/execution-policy.yaml'), policy, { mode: 0o600 });
  const binding = { workspaceId: `workspace-${suffix}`, sessionId: `session-${suffix}`, taskId: `task-${suffix}`, turnId: `turn-${suffix}`,
    treeSha: 'TREE:' + 'a'.repeat(64), policyHash: digest(policy), capabilityHash: 'b'.repeat(64), issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 };
  const model = { id: 'test-model', provider: 'fixture', snapshotSha256: 'c'.repeat(64) };
  const seen = { calls: 0 }; let adapter;
  const config = { enabled: true, workspace, binding, accountId: 'billing-account', readBinding: () => binding,
    systemPrompt: 'Only supplied context.', model, probe: async () => [model], budget, maxCostPerAttempt: 0.4,
    tools: [], authorizeTool: async () => false,
    transport: { retryPolicy: 'none', evidenceTier: 'fixture', complete: async () => { seen.calls++; return { message: { text: 'analysis', toolCalls: [] }, nativeUsage: null }; } }, ...extra };
  adapter = createPiHostAdapter(config);
  const task = { taskId: binding.taskId, objective: 'Read-only budget check', acceptance: ['Keep account and dispatch accounting correct'] };
  const run = async () => { const { sessionId } = await adapter.start(task); return adapter.wait(sessionId); };
  return { adapter, config, binding, seen, task, run };
}

test('BUDGET-01: one billing-account cap covers different workspaces', async () => {
  const budget = new BudgetLedger({ taskLimit: 10, accountLimit: 1 });
  const a = prepare(budget, 'one', { maxCostPerAttempt: 0.6 });
  const b = prepare(budget, 'two', { maxCostPerAttempt: 0.6 });
  assert.equal((await a.run()).executionState, 'finished');
  assert.equal((await b.run()).executionState, 'failed');
  assert.equal(a.seen.calls + b.seen.calls, 1);
  assert.equal(a.adapter.getReceipts()[0].accountId, 'billing-account');
});

test('BUDGET-02: spending recorded under the actual account is never ignored', async () => {
  const budget = new BudgetLedger({ taskLimit: 10, accountLimit: 1 });
  budget.record('earlier-task', 'billing-account', 0.5);
  const f = prepare(budget, 'one', { maxCostPerAttempt: 0.6 });
  assert.equal((await f.run()).executionState, 'failed');
  assert.equal(f.seen.calls, 0);
});

test('BUDGET-03: a trusted explicit billing-account identity is required', async () => {
  for (const accountId of [undefined, null, '', '../account']) {
    const f = prepare(new BudgetLedger({ taskLimit: 1, accountLimit: 10 }), 'one', { accountId });
    await assert.rejects(f.run(), (error) => error.code === 'pi_host_configuration_required');
    assert.equal(f.seen.calls, 0);
  }
});

test('BUDGET-04: proven pre-dispatch binding rejection releases reservation', async () => {
  const budget = new BudgetLedger({ taskLimit: 1, accountLimit: 10 });
  const f = prepare(budget);
  f.config.readBinding = () => f.adapter.getReceipts().length ? { ...f.binding, turnId: 'stale-turn' } : f.binding;
  assert.equal((await f.run()).executionState, 'failed');
  assert.equal(f.seen.calls, 0);
  assert.notEqual(budget.reserve(f.binding.taskId, 'billing-account', 0.6).status, 'blocked');
  assert.equal(f.adapter.getReceipts()[0].status, 'failed');
  assert.equal(f.adapter.getReceipts()[0].costBasis, 'unavailable');
});

test('BUDGET-05: transport invocation without a native receipt still holds escrow', async () => {
  const budget = new BudgetLedger({ taskLimit: 1, accountLimit: 10 });
  const f = prepare(budget);
  f.config.transport.complete = async () => { f.seen.calls++; throw new Error('unknown-provider-settlement'); };
  assert.equal((await f.run()).executionState, 'failed');
  assert.equal(f.seen.calls, 1);
  assert.equal(budget.reserve(f.binding.taskId, 'billing-account', 0.6).status, 'blocked');
});

test('BUDGET-06: cancelled pre-dispatch checks release escrow and never dispatch late', async () => {
  const budget = new BudgetLedger({ taskLimit: 1, accountLimit: 10 });
  const entered = deferred(), release = deferred();
  const f = prepare(budget, 'one', { limits: { cleanupMs: 25 } });
  f.config.readBinding = () => {
    if (f.adapter.getReceipts().length) { entered.resolve(); return release.promise; }
    return f.binding;
  };
  const { sessionId } = await f.adapter.start(f.task);
  try {
    await entered.promise; await f.adapter.interrupt();
    const result = await f.adapter.wait(sessionId);
    assert.equal(result.executionState, 'interrupted'); assert.equal(f.seen.calls, 0);
  } finally { release.resolve(f.binding); }
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(f.seen.calls, 0);
  assert.notEqual(budget.reserve(f.binding.taskId, 'billing-account', 0.6).status, 'blocked');
});

test('BUDGET-07: cancellation releases never-dispatched escrow before a hung check settles', async () => {
  const budget = new BudgetLedger({ taskLimit: 1, accountLimit: 10 });
  const entered = deferred(), release = deferred();
  const f = prepare(budget, 'one', { limits: { cleanupMs: 25 } });
  f.config.readBinding = () => {
    if (f.adapter.getReceipts().length) { entered.resolve(); return release.promise; }
    return f.binding;
  };
  const { sessionId } = await f.adapter.start(f.task);
  try {
    await entered.promise; await f.adapter.interrupt();
    const result = await f.adapter.wait(sessionId);
    assert.equal(result.executionState, 'interrupted'); assert.equal(f.seen.calls, 0);
    // Keep readBinding unresolved: proven zero dispatch must not hold funds.
    const probe = budget.reserve(f.binding.taskId, 'billing-account', 0.6);
    assert.notEqual(probe.status, 'blocked');
    budget.release(probe.reservation);
    assert.equal(f.adapter.getReceipts()[0].status, 'cancelled');
  } finally { release.resolve(f.binding); }
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(f.seen.calls, 0);
  assert.equal(f.adapter.getReceipts().length, 1);
  const probe = budget.reserve(f.binding.taskId, 'billing-account', 0.6);
  assert.notEqual(probe.status, 'blocked'); budget.release(probe.reservation);
});

test('BUDGET-08: cancellation after transport invocation does not release uncertain funds', async () => {
  const budget = new BudgetLedger({ taskLimit: 1, accountLimit: 10 });
  const entered = deferred(), release = deferred();
  const f = prepare(budget, 'one', { limits: { cleanupMs: 25 } });
  f.config.transport.complete = async () => {
    f.seen.calls++; entered.resolve(); await release.promise;
    return { message: { text: 'late-output', toolCalls: [] }, nativeUsage: null };
  };
  const { sessionId } = await f.adapter.start(f.task);
  try {
    await entered.promise; await f.adapter.interrupt(); await f.adapter.wait(sessionId);
    assert.equal(f.seen.calls, 1);
    assert.equal(budget.reserve(f.binding.taskId, 'billing-account', 0.6).status, 'blocked');
  } finally { release.resolve(); }
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(f.adapter.getResult().output, '');
  assert.equal(budget.reserve(f.binding.taskId, 'billing-account', 0.6).status, 'blocked');
});
