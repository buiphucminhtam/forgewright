import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTaskContext, assertCurrentBinding, snapshotJson, PiHostError } from './contracts.mjs';
import { createReceiptBook, toProviderUsageObservation } from './receipts.mjs';

const task = () => ({ taskId: 'task-1', objective: 'Review supplied code', acceptance: ['Report exact findings'], context: 'private-source' });
const binding = () => ({ workspaceId: 'workspace-1', sessionId: 'session-1', taskId: 'task-1', turnId: 'turn-1', treeSha: 'TREE:' + 'a'.repeat(64), policyHash: 'b'.repeat(64), capabilityHash: 'c'.repeat(64), issuedAtMs: 1000, expiresAtMs: 10000 });
const expected = () => ({ ...binding(), attemptId: 'attempt-1', provider: 'codex', model: 'advertised-model', snapshotSha256: 'd'.repeat(64) });
const usage = () => ({ requestId: 'request-1', provider: 'codex', model: 'advertised-model', snapshotSha256: 'd'.repeat(64), inputTokens: 12, cachedInputTokens: 4, outputTokens: 3, costUsd: 0.02 });
const code = (value) => (error) => error instanceof PiHostError && error.code === value;

test('CTX-01: bounded context preserves every AC and does not take authority from task data', () => {
  const input = task(); const packet = buildTaskContext(input, 'host-policy', [], 4096);
  input.acceptance.push('mutated');
  assert.deepEqual(packet.task, task());
  assert.equal(packet.systemPrompt, 'host-policy');
  assert.equal(packet.inputBytes, Buffer.byteLength('host-policy') + Buffer.byteLength(packet.prompt));
  assert.equal(packet.tokenCount, null);
  assert.match(packet.digest, /^[a-f0-9]{64}$/);
  assert.throws(() => { packet.task.acceptance.push('late'); }, TypeError);
});
test('CTX-02: missing, sparse and blank acceptance is rejected without truncation', () => {
  for (const acceptance of [[], Array(1), ['ok', ,], [' '], [null], [undefined]]) {
    assert.throws(() => buildTaskContext({ ...task(), acceptance }, 'host-policy'), code('pi_invalid_task'));
  }
});
test('CTX-03: injected model, authorization or conversation history is not accepted', () => {
  for (const key of ['model', 'tools', 'approved', 'messages', 'history', 'streamFn', 'workspace']) {
    assert.throws(() => buildTaskContext({ ...task(), [key]: 'injected' }, 'host-policy'), code('pi_invalid_task'));
  }
});
test('CTX-04: accessor and custom-toJSON inputs are rejected without executing code', () => {
  let invoked = 0;
  const input = task(); Object.defineProperty(input, 'context', { enumerable: true, get() { invoked++; return 'secret'; } });
  assert.throws(() => buildTaskContext(input, 'host-policy'), code('pi_invalid_json'));
  assert.throws(() => snapshotJson({ toJSON() { invoked++; } }), code('pi_invalid_json'));
  assert.equal(invoked, 0);
});
test('CTX-05: context references are host supplied, content-hashed and bounded', () => {
  const refs = [{ ref: 'artifact://review/input', sha256: 'f'.repeat(64) }];
  const packet = buildTaskContext(task(), 'host-policy', refs);
  assert.deepEqual(packet.references, refs);
  assert.throws(() => buildTaskContext(task(), 'host-policy', [{ ref: '../secret', sha256: 'f'.repeat(64) }]), code('pi_invalid_context_reference'));
  assert.throws(() => buildTaskContext({ ...task(), context: '猫'.repeat(1000) }, 'host-policy', [], 100), code('pi_input_budget_exceeded'));
});
test('CTX-06: every identity, tree, policy and capability field must match current host state', () => {
  const valid = binding(); assertCurrentBinding(valid, valid, 2000);
  for (const field of ['workspaceId', 'sessionId', 'taskId', 'turnId', 'treeSha', 'policyHash', 'capabilityHash']) {
    assert.throws(() => assertCurrentBinding({ ...valid, [field]: 'changed' }, valid, 2000), code('pi_stale_binding'));
  }
});
test('CTX-07: expired, future, malformed or extended bindings are rejected', () => {
  const valid = binding();
  for (const now of [999, 10000, 10001]) assert.throws(() => assertCurrentBinding(valid, valid, now), code('pi_stale_binding'));
  assert.throws(() => assertCurrentBinding({ ...valid, expiresAtMs: 20000 }, valid, 2000), code('pi_stale_binding'));
  assert.throws(() => assertCurrentBinding({ ...valid, treeSha: 'unknown' }, { ...valid, treeSha: 'unknown' }, 2000), code('pi_stale_binding'));
});
test('CTX-08: cyclic, sparse and nonfinite JSON cannot be snapshotted', () => {
  const cyclic = {}; cyclic.self = cyclic;
  for (const value of [cyclic, { n: NaN }, { n: Infinity }, { fn() {} }, { list: Array(1) }]) assert.throws(() => snapshotJson(value), code('pi_invalid_json'));
});

test('REC-01: one expected attempt binds native observations without carrying source text', () => {
  const book = createReceiptBook(); book.begin(expected());
  const r = book.settle('attempt-1', { nativeUsage: usage(), evidenceTier: 'provider-native', status: 'completed', latencyMs: 12 });
  assert.equal(r.usage.inputUncachedTokens, 8); assert.equal(r.usage.inputCachedTokens, 4);
  assert.equal(r.usage.outputTokens, 3); assert.equal(r.usage.costUsd, 0.02);
  assert.equal(r.costBasis, 'provider-reported'); assert.equal(r.evidenceTier, 'provider-native');
  assert.equal(r.completionState, 'unverified'); assert.equal(book.snapshot().length, 1);
});
test('REC-02: missing usage and missing price are unavailable, never zero dollars', () => {
  for (const nativeUsage of [null, { ...usage(), costUsd: null }]) {
    const book = createReceiptBook(); book.begin(expected());
    const r = book.settle('attempt-1', { nativeUsage, evidenceTier: 'provider-native', status: 'completed', latencyMs: 5 });
    assert.equal(r.usage?.costUsd ?? null, null);
    assert.equal(r.costBasis, 'unavailable');
    const projected = toProviderUsageObservation(r);
    assert.equal(projected.usage.status, 'unavailable');
    assert.equal('cost_usd' in projected.usage, false);
  }
});
test('REC-03: original ForgeBench usage-observation shape preserves exact snapshot and counts', () => {
  const book = createReceiptBook(); book.begin(expected());
  const r = book.settle('attempt-1', { nativeUsage: usage(), evidenceTier: 'provider-native', status: 'completed', latencyMs: 12 });
  assert.deepEqual(toProviderUsageObservation(r), { version: '1', provider: 'codex', model: 'advertised-model', resolved_snapshot_sha256: 'd'.repeat(64), usage: { status: 'reported', input_uncached_tokens: 8, input_cached_tokens: 4, output_tokens: 3, cost_usd: 0.02, latency_ms: 12 } });
});
test('REC-04: fixture usage is not promoted to a native ForgeBench receipt', () => {
  const book = createReceiptBook(); book.begin(expected());
  const r = book.settle('attempt-1', { nativeUsage: usage(), evidenceTier: 'fixture', status: 'completed', latencyMs: 2 });
  assert.equal(toProviderUsageObservation(r).usage.status, 'unavailable');
});
test('REC-05: duplicate attempts and settlements fail closed', () => {
  const book = createReceiptBook(); book.begin(expected());
  assert.throws(() => book.begin(expected()), code('pi_duplicate_attempt'));
  book.settle('attempt-1', { nativeUsage: usage(), evidenceTier: 'provider-native', status: 'completed', latencyMs: 1 });
  assert.throws(() => book.settle('attempt-1', { nativeUsage: usage(), evidenceTier: 'provider-native', status: 'completed', latencyMs: 1 }), code('pi_duplicate_receipt'));
  assert.throws(() => book.settle('unknown', { nativeUsage: usage(), evidenceTier: 'provider-native', status: 'completed', latencyMs: 1 }), code('pi_unknown_attempt'));
});
test('REC-06: provider, model, snapshot and malformed native counters cannot be misbound', () => {
  for (const change of [{ provider: 'other' }, { model: 'other' }, { snapshotSha256: 'e'.repeat(64) }, { inputTokens: -1 }, { inputTokens: NaN }, { cachedInputTokens: 13 }, { outputTokens: 1.5 }, { costUsd: Infinity }, { costUsd: -1 }, { requestId: '' }]) {
    const book = createReceiptBook(); book.begin(expected());
    assert.throws(() => book.settle('attempt-1', { nativeUsage: { ...usage(), ...change }, evidenceTier: 'provider-native', status: 'completed', latencyMs: 1 }), code('pi_invalid_receipt'));
  }
});
test('REC-07: failed/cancelled attempts retain observed usage and billed cost', () => {
  for (const status of ['failed', 'cancelled']) {
    const book = createReceiptBook(); book.begin(expected());
    const r = book.settle('attempt-1', { nativeUsage: usage(), evidenceTier: 'provider-native', status, latencyMs: 9 });
    assert.equal(r.status, status); assert.equal(r.usage.costUsd, 0.02);
  }
});
test('REC-08: pending attempts remain explicit and callers cannot mutate stored receipts', () => {
  const book = createReceiptBook(); book.begin(expected());
  assert.equal(book.snapshot()[0].status, 'pending');
  assert.equal(book.snapshot()[0].usage, null);
  const r = book.settle('attempt-1', { nativeUsage: { ...usage(), prompt: 'secret-prompt', source: 'secret-source' }, evidenceTier: 'provider-native', status: 'completed', latencyMs: 2 });
  const serialized = JSON.stringify(book.snapshot());
  assert.equal(serialized.includes('secret-'), false);
  assert.throws(() => { r.usage.costUsd = 0; }, TypeError);
  assert.equal(book.snapshot()[0].usage.costUsd, 0.02);
});
test('REC-09: caller-forged or serialized receipts cannot become native observations', () => {
  const book = createReceiptBook(); book.begin(expected());
  const r = book.settle('attempt-1', { nativeUsage: usage(), evidenceTier: 'provider-native', status: 'completed', latencyMs: 1 });
  assert.throws(() => toProviderUsageObservation(JSON.parse(JSON.stringify(r))), code('pi_untrusted_receipt'));
});
test('REC-10: attempt correlation cannot silently carry arbitrary secret fields', () => {
  const book = createReceiptBook();
  assert.throws(() => book.begin({ ...expected(), apiKey: 'secret' }), code('pi_invalid_receipt'));
  assert.equal(book.snapshot().length, 0);
});
