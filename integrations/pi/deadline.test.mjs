import assert from 'node:assert/strict';
import test from 'node:test';
import { createPiWorkerAdapter, loadPinnedPiAgent } from './adapter.mjs';

const sleepSync = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 35);
const task = { taskId: 'deadline-check', objective: 'Analyze only', acceptance: ['Respect complete attempt deadline'] };
const model = { id: 'fixture', provider: 'fixture', api: 'fixture', name: 'fixture', contextWindow: 1024, maxTokens: 100, input: ['text'], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
const Agent = await loadPinnedPiAgent();
function finalMessage() { return { role: 'assistant', api: 'fixture', provider: 'fixture', model: 'fixture', content: [{ type: 'text', text: 'late success' }], stopReason: 'stop', timestamp: 1, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }; }
function stream() { const message = finalMessage(); return { async *[Symbol.asyncIterator]() { yield { type: 'done', reason: 'stop', message }; }, async result() { return message; } }; }
function fixture(override = {}) { return createPiWorkerAdapter({ enabled: true, model, systemPrompt: 'Host-owned policy', limits: { timeoutMs: 10 }, streamFn: () => stream(), ...override }); }
const timedOut = (error) => error.code === 'pi_timeout';

test('DEADLINE-01: synchronous SDK loading past deadline cannot admit a provider call', async () => {
  let calls = 0;
  const adapter = fixture({ loadAgent: async () => { sleepSync(); return Agent; }, streamFn: () => { calls++; return stream(); } });
  await assert.rejects(adapter.start(task), timedOut);
  assert.equal(calls, 0); assert.equal(adapter.getResult().execution_state, 'timed_out');
});
test('DEADLINE-02: synchronous transport work past deadline cannot finish before the timer callback', async () => {
  let calls = 0;
  const adapter = fixture({ streamFn: () => { calls++; sleepSync(); return stream(); } });
  await assert.rejects(adapter.start(task), timedOut);
  assert.equal(calls, 1); assert.equal(adapter.getResult().execution_state, 'timed_out');
  assert.equal(adapter.getResult().output, '');
});
test('DEADLINE-03: synchronous SDK settlement without events still enforces elapsed deadline', async () => {
  class SlowAgent {
    state = {}; subscribe() { return () => {}; } abort() {}
    async prompt() { sleepSync(); }
  }
  const adapter = fixture({ loadAgent: async () => SlowAgent });
  await assert.rejects(adapter.start(task), timedOut);
  assert.equal(adapter.getResult().execution_state, 'timed_out');
});
