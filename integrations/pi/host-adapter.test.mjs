import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BudgetLedger } from '../../mcp/build/runtime/model-call-gateway.js';
import { negotiateHarnessAdapter } from '../../mcp/build/runtime/harness-adapter.js';
import { createPiHostAdapter } from './host-adapter.mjs';
import { digest } from './contracts.mjs';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
const task = () => ({ taskId: 'task-1', objective: 'Inspect supplied material', acceptance: ['Return grounded analysis'], context: 'source-secret' });
function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pi-host-')); roots.push(root); mkdirSync(join(root, '.forgewright'));
  const policy = 'mode: strict\nrequire_verify: true\ndeny_patterns:\n  - "forbidden"\n';
  writeFileSync(join(root, '.forgewright/execution-policy.yaml'), policy, { mode: 0o600 });
  const binding = { workspaceId: 'workspace-1', sessionId: 'session-1', taskId: 'task-1', turnId: 'turn-1', treeSha: 'TREE:' + 'a'.repeat(64), policyHash: digest(policy), capabilityHash: 'c'.repeat(64), issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 };
  const model = { id: 'fixture', provider: 'fixture', snapshotSha256: 'd'.repeat(64) };
  const observed = { calls: 0, effects: 0, requests: [] };
  const response = (text = 'analysis-result', toolCalls = []) => ({ message: { text, toolCalls }, nativeUsage: { requestId: 'request-' + observed.calls, provider: model.provider, model: model.id, snapshotSha256: model.snapshotSha256, inputTokens: 20, cachedInputTokens: 5, outputTokens: 7, costUsd: 0.01 } });
  // Explicit host account preserves the original fixture's accounting identity.
  const options = { enabled: true, workspace: root, binding, accountId: binding.workspaceId, readBinding: () => binding, systemPrompt: 'policy-secret', model,
    probe: async () => [model], budget: new BudgetLedger({ taskLimit: 10, accountLimit: 100 }), maxCostPerAttempt: 0.1,
    transport: { evidenceTier: 'fixture', retryPolicy: 'none', complete: async (request) => { observed.calls++; observed.requests.push(request); return response(); } },
    authorizeTool: async () => true, policyEvaluator: { evaluate: async () => ({ action: 'allow' }) },
    tools: [], ...overrides };
  return { adapter: createPiHostAdapter(options), options, observed, response, binding, root };
}
function readTool(observed, execute) { return { name: 'fw_get_current_phase', description: 'Read current phase', parameters: { type: 'object', properties: {}, additionalProperties: false }, execute: execute ?? (async () => { observed.effects++; return { content: [{ type: 'text', text: 'BUILD' }] }; }) }; }
async function outcome(adapter, input = task()) { const { sessionId } = await adapter.start(input); return adapter.wait(sessionId); }

test('BRIDGE-01: default-off has no transport or lifecycle effects', async () => {
  const { adapter, observed } = fixture({ enabled: false });
  await assert.rejects(adapter.start(task()), (error) => error.code === 'pi_disabled');
  assert.equal(observed.calls, 0); assert.equal(adapter.getResult(), null);
});
test('BRIDGE-02: start returns a session before provider settles; wait owns completion', async () => {
  const f = fixture(); const entered = deferred(); const release = deferred();
  f.options.transport.complete = async (request) => { f.observed.calls++; f.observed.requests.push(request); entered.resolve(); await release.promise; return f.response(); };
  const { sessionId } = await f.adapter.start(task());
  try { await entered.promise; assert.equal(f.adapter.getResult().executionState, 'running'); } finally { release.resolve(); }
  const result = await f.adapter.wait(sessionId);
  assert.equal(result.executionState, 'finished'); assert.equal(result.output, 'analysis-result');
  assert.equal(result.completionState, 'unverified'); assert.equal(result.quiescence, 'confirmed');
  assert.equal(f.observed.requests[0].maxAttempts, 1);
  assert.equal(f.adapter.getReceipts()[0].status, 'completed');
});
test('BRIDGE-03: actual canonical host negotiation never advertises resume', () => {
  const { adapter } = fixture();
  assert.equal(negotiateHarnessAdapter(adapter, ['start', 'interrupt']).mode, 'native-host-loop');
  assert.throws(() => negotiateHarnessAdapter(adapter, ['resume']));
  assert.equal(adapter.resume, undefined);
});
test('BRIDGE-04: host identity and task snapshots cannot be injected or replayed', async () => {
  const f = fixture();
  await assert.rejects(f.adapter.start({ ...task(), taskId: 'other-task' }), (error) => error.code === 'pi_stale_binding');
  await assert.rejects(f.adapter.start({ ...task(), approved: true }), (error) => error.code === 'pi_invalid_task');
  await outcome(f.adapter); await assert.rejects(f.adapter.start(task()), (error) => error.code === 'pi_adapter_consumed');
});
test('BRIDGE-05: routed model/snapshot mismatch is rejected before transport', async () => {
  const f = fixture({ probe: async () => [{ id: 'other', provider: 'fixture', snapshotSha256: 'd'.repeat(64) }] });
  const result = await outcome(f.adapter);
  assert.equal(result.executionState, 'failed'); assert.equal(f.observed.calls, 0);
});
test('BRIDGE-06: unknown tool requests are rejected before any effect', async () => {
  const f = fixture();
  f.options.transport.complete = async () => { f.observed.calls++; return f.response('', [{ id: 'call-1', name: 'bash', arguments: { command: 'must-not-run' } }]); };
  const result = await outcome(f.adapter);
  assert.equal(result.executionState, 'failed'); assert.equal(f.observed.effects, 0); assert.equal(f.observed.calls, 1);
});
test('BRIDGE-07: allowlisted tool executes through canonical policy and lifecycle', async () => {
  const f = fixture({ limits: { modelCalls: 2 } }); f.options.tools.push(readTool(f.observed));
  f.options.transport.complete = async () => { f.observed.calls++; return f.observed.calls === 1 ? f.response('', [{ id: 'call-1', name: 'fw_get_current_phase', arguments: {} }]) : f.response('used-allowed-tool'); };
  const result = await outcome(f.adapter);
  assert.equal(result.executionState, 'finished'); assert.equal(f.observed.effects, 1); assert.equal(f.observed.calls, 2);
  assert.equal(result.toolCalls, 1); assert.equal(f.adapter.getReceipts().length, 2);
});
test('BRIDGE-08: host denial cannot be overridden by model-provided approval', async () => {
  const f = fixture({ authorizeTool: async () => false, limits: { modelCalls: 2 } }); f.options.tools.push(readTool(f.observed));
  f.options.transport.complete = async () => { f.observed.calls++; return f.response('', [{ id: 'call-1', name: 'fw_get_current_phase', arguments: { approved: true } }]); };
  const result = await outcome(f.adapter);
  assert.notEqual(result.executionState, 'finished'); assert.equal(f.observed.effects, 0);
});
test('BRIDGE-09: policy denial never invokes an allowed handler', async () => {
  const f = fixture({ policyEvaluator: { evaluate: async () => ({ action: 'block', reason: 'fixture denial' }) }, limits: { modelCalls: 2 } }); f.options.tools.push(readTool(f.observed));
  f.options.transport.complete = async () => { f.observed.calls++; return f.response('', [{ id: 'call-1', name: 'fw_get_current_phase', arguments: {} }]); };
  const result = await outcome(f.adapter); assert.notEqual(result.executionState, 'finished'); assert.equal(f.observed.effects, 0);
});
test('BRIDGE-10: duplicate tool-call IDs cannot repeat effects', async () => {
  const f = fixture({ limits: { modelCalls: 2 } }); f.options.tools.push(readTool(f.observed));
  const call = { id: 'same-call', name: 'fw_get_current_phase', arguments: {} };
  f.options.transport.complete = async () => { f.observed.calls++; return f.response('', [call, call]); };
  const result = await outcome(f.adapter); assert.notEqual(result.executionState, 'finished'); assert.ok(f.observed.effects <= 1);
});
test('BRIDGE-11: path traversal is denied by canonical containment', async () => {
  const f = fixture({ limits: { modelCalls: 2 } });
  f.options.tools.push({ ...readTool(f.observed), name: 'fw_load_skill_overlay', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } });
  f.options.transport.complete = async () => { f.observed.calls++; return f.response('', [{ id: 'call-1', name: 'fw_load_skill_overlay', arguments: { name: '../secrets' } }]); };
  const result = await outcome(f.adapter); assert.notEqual(result.executionState, 'finished'); assert.equal(f.observed.effects, 0);
});
test('BRIDGE-12: cancellation reaches the provider signal; late success never overwrites it', async () => {
  const f = fixture({ limits: { cleanupMs: 25 } }); const entered = deferred(); const release = deferred();
  f.options.transport.complete = async (request) => { f.observed.calls++; f.observed.requests.push(request); entered.resolve(); await release.promise; return f.response('late-output'); };
  const { sessionId } = await f.adapter.start(task()); await entered.promise;
  await f.adapter.interrupt(); const result = await f.adapter.wait(sessionId);
  assert.equal(result.executionState, 'interrupted'); assert.equal(result.quiescence, 'not_confirmed');
  assert.equal(f.observed.requests[0].signal.aborted, true); assert.equal(result.output, '');
  release.resolve(); await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(f.adapter.getResult().executionState, 'interrupted'); assert.equal(f.adapter.getResult().output, '');
});
test('BRIDGE-13: unknown usage stays unavailable and holds the canonical budget reservation', async () => {
  const budget = new BudgetLedger({ taskLimit: 1, accountLimit: 10 });
  const f = fixture({ budget, maxCostPerAttempt: 0.4 });
  f.options.transport.complete = async () => { f.observed.calls++; return { message: { text: 'answer', toolCalls: [] }, nativeUsage: null }; };
  const result = await outcome(f.adapter);
  assert.equal(result.executionState, 'finished'); assert.equal(f.adapter.getReceipts()[0].costBasis, 'unavailable');
  const next = budget.reserve('task-1', 'workspace-1', 0.6);
  assert.equal(next.status, 'blocked');
});
test('BRIDGE-14: provider exceptions and generated text cannot leak into telemetry', async () => {
  const f = fixture(); f.options.transport.complete = async () => { f.observed.calls++; throw new Error('private-api-key'); };
  const result = await outcome(f.adapter);
  assert.equal(result.executionState, 'failed');
  const text = JSON.stringify(f.adapter.getTelemetry());
  for (const secret of ['private-api-key', 'source-secret', 'policy-secret']) assert.equal(text.includes(secret), false);
});

test('BRIDGE-15: stale host binding cannot reach the provider', async () => {
  const f = fixture(); f.options.readBinding = () => ({ ...f.binding, treeSha: 'TREE:' + 'e'.repeat(64) });
  const result = await outcome(f.adapter); assert.equal(result.executionState, 'failed'); assert.equal(f.observed.calls, 0);
});
test('BRIDGE-16: changing the binding while authorization awaits prevents the effect', async () => {
  const f = fixture({ limits: { modelCalls: 2 } }); f.options.tools.push(readTool(f.observed));
  f.options.authorizeTool = async () => { f.binding.turnId = 'different-turn'; return true; };
  f.options.transport.complete = async () => { f.observed.calls++; return f.response('', [{ id: 'call-1', name: 'fw_get_current_phase', arguments: {} }]); };
  const result = await outcome(f.adapter); assert.equal(result.executionState, 'failed'); assert.equal(f.observed.effects, 0);
});
test('BRIDGE-17: policy replacement with a symlink cannot admit a tool', async () => {
  const f = fixture({ limits: { modelCalls: 2 } }); f.options.tools.push(readTool(f.observed));
  f.options.transport.complete = async () => {
    f.observed.calls++; const p = join(f.root, '.forgewright/execution-policy.yaml');
    renameSync(p, p + '.original'); symlinkSync(p + '.original', p);
    return f.response('', [{ id: 'call-1', name: 'fw_get_current_phase', arguments: {} }]);
  };
  const result = await outcome(f.adapter); assert.equal(result.executionState, 'failed'); assert.equal(f.observed.effects, 0);
});
test('BRIDGE-18: cancellation during authorization never calls the handler', async () => {
  const entered = deferred(); const release = deferred();
  const f = fixture({ limits: { modelCalls: 2, cleanupMs: 25 }, authorizeTool: async () => { entered.resolve(); await release.promise; return true; } });
  f.options.tools.push(readTool(f.observed));
  f.options.transport.complete = async () => { f.observed.calls++; return f.response('', [{ id: 'call-1', name: 'fw_get_current_phase', arguments: {} }]); };
  const { sessionId } = await f.adapter.start(task()); await entered.promise; await f.adapter.interrupt();
  const result = await f.adapter.wait(sessionId); assert.equal(result.executionState, 'interrupted');
  release.resolve(); await new Promise((resolve) => setTimeout(resolve, 80)); assert.equal(f.observed.effects, 0);
});
test('BRIDGE-19: provider retryable errors are not automatically retried', async () => {
  const f = fixture(); f.options.transport.complete = async () => { f.observed.calls++; throw Object.assign(new Error('unavailable'), { status: 503, retryable: true }); };
  const result = await outcome(f.adapter); assert.equal(result.executionState, 'failed'); assert.equal(f.observed.calls, 1);
});
test('BRIDGE-20: full model context including tool schemas respects the input limit', async () => {
  const f = fixture({ limits: { inputBytes: 600 } });
  f.options.tools.push({ ...readTool(f.observed), description: 'x'.repeat(1000) });
  const result = await outcome(f.adapter); assert.equal(result.executionState, 'failed'); assert.equal(f.observed.calls, 0);
});
test('BRIDGE-21: live transport cannot use a fixture policy evaluator', async () => {
  const f = fixture(); f.options.transport.evidenceTier = 'provider-native';
  await assert.rejects(f.adapter.start(task()), (error) => error.code === 'pi_fixture_policy_in_live_host');
  assert.equal(f.observed.calls, 0);
});
test('BRIDGE-22: kill before asynchronous binding returns prevents dispatch', async () => {
  const release = deferred(); const f = fixture({ readBinding: () => release.promise, limits: { cleanupMs: 25 } });
  const { sessionId } = await f.adapter.start(task()); await f.adapter.interrupt();
  const result = await f.adapter.wait(sessionId); assert.equal(result.executionState, 'interrupted');
  release.resolve(f.binding); await new Promise((resolve) => setTimeout(resolve, 30)); assert.equal(f.observed.calls, 0);
});
test('BRIDGE-23: changed policy rejects even an analysis-only provider response', async () => {
  const f = fixture(); f.options.transport.complete = async () => {
    f.observed.calls++; writeFileSync(join(f.root, '.forgewright/execution-policy.yaml'), 'mode: strict\nrequire_verify: true\ndeny_patterns:\n  - "everything"\n', { mode: 0o600 });
    return f.response();
  };
  const result = await outcome(f.adapter); assert.equal(result.executionState, 'failed'); assert.equal(f.observed.calls, 1);
});
test('BRIDGE-24: trusted failure receipts retain billed usage and settle escrow once', async () => {
  const { PiTransportError } = await import('./receipts.mjs');
  const budget = new BudgetLedger({ taskLimit: 1, accountLimit: 10 });
  const f = fixture({ budget, maxCostPerAttempt: 0.4 }); delete f.options.policyEvaluator;
  f.options.transport.evidenceTier = 'provider-native';
  f.options.transport.complete = async () => { f.observed.calls++; throw new PiTransportError({ ...f.response().nativeUsage, costUsd: 0.3 }); };
  const result = await outcome(f.adapter); assert.equal(result.executionState, 'failed');
  assert.equal(f.adapter.getReceipts()[0].status, 'failed'); assert.equal(f.adapter.getReceipts()[0].usage.costUsd, 0.3);
  assert.equal(budget.reserve('task-1', 'workspace-1', 0.6).status, 'warning');
});
