import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BudgetLedger } from '../../mcp/build/runtime/model-call-gateway.js';
import { createPiHostAdapter } from './host-adapter.mjs';
import { createPiCanaryController } from './release-gates.mjs';
import { digest } from './contracts.mjs';

// Real Pi + canonical gateways/lifecycle + canary controller. The model
// transport remains deterministic: this is local integration, not a live canary.
function prepare(transport) {
  const workspace = mkdtempSync(join(tmpdir(), 'pi-canary-integration-'));
  mkdirSync(join(workspace, '.forgewright'));
  const policy = 'mode: strict\nrequire_verify: true\ndeny_patterns:\n  - "forbidden"\n';
  writeFileSync(join(workspace, '.forgewright/execution-policy.yaml'), policy, { mode: 0o600 });
  const binding = { workspaceId: 'canary-workspace', sessionId: 'canary-session', taskId: 'canary-task', turnId: 'canary-turn',
    treeSha: 'TREE:' + 'a'.repeat(64), policyHash: digest(policy), capabilityHash: 'b'.repeat(64), issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000 };
  const model = { id: 'test-model', provider: 'fixture', snapshotSha256: 'c'.repeat(64) };
  let instance; let created = 0;
  const gate = createPiCanaryController({ enabled: true, laneId: 'isolated-local-canary', authorize: async () => true,
    createAdapter: () => {
      created++;
      instance = createPiHostAdapter({ enabled: true, workspace, binding, accountId: binding.workspaceId, readBinding: () => binding, systemPrompt: 'Supplied analysis only; no tools.', model,
        probe: async () => [model], budget: new BudgetLedger({ taskLimit: 1, accountLimit: 10 }), maxCostPerAttempt: 0.1,
        limits: { cleanupMs: 40 }, tools: [], authorizeTool: async () => false,
        transport: { retryPolicy: 'none', evidenceTier: 'fixture', complete: transport },
        policyEvaluator: { evaluate: async () => ({ action: 'allow' }) } });
      return instance;
    } });
  return { gate, workspace, instance: () => instance, created: () => created };
}
const task = { taskId: 'canary-task', objective: 'Inspect bounded supplied text', acceptance: ['Return an analysis, not verified completion'] };

test('CANARY-E2E-01: actual Pi completion stays unverified through the owner gate', async () => {
  let calls = 0;
  const f = prepare(async () => { calls++; return { message: { text: 'bounded-analysis', toolCalls: [] }, nativeUsage: null }; });
  try {
    const started = await f.gate.start(task); const result = await f.gate.wait(started.sessionId);
    assert.equal(result.executionState, 'finished'); assert.equal(result.completionState, 'unverified');
    assert.equal(result.quiescence, 'confirmed'); assert.equal(result.output, 'bounded-analysis'); assert.equal(calls, 1);
    assert.equal(f.instance().getReceipts()[0].costBasis, 'unavailable');
    await f.gate.kill(); await assert.rejects(f.gate.start(task)); assert.equal(f.created(), 1);
  } finally { rmSync(f.workspace, { recursive: true, force: true }); }
});

test('CANARY-E2E-02: real noncooperative provider is quarantined; late output cannot resume or reroute', async () => {
  let enter, release, signal;
  const entered = new Promise((resolve) => { enter = resolve; }); const pending = new Promise((resolve) => { release = resolve; });
  const f = prepare(async (request) => { signal = request.signal; enter(); await pending; return { message: { text: 'late-output', toolCalls: [] }, nativeUsage: null }; });
  try {
    const started = await f.gate.start(task); await entered; await f.gate.kill();
    const result = await f.gate.wait(started.sessionId);
    assert.equal(signal.aborted, true); assert.equal(result.executionState, 'interrupted'); assert.equal(result.output, '');
    assert.equal(result.quiescence, 'not_confirmed'); assert.equal(f.gate.getStatus().quarantined, true);
    release(); await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(f.instance().getResult().executionState, 'interrupted'); assert.equal(f.instance().getResult().output, '');
    await assert.rejects(f.gate.start(task)); assert.equal(f.created(), 1);
  } finally { release(); await new Promise((resolve) => setTimeout(resolve, 100)); rmSync(f.workspace, { recursive: true, force: true }); }
});
