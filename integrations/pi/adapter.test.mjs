import assert from 'node:assert/strict';
import test from 'node:test';
import { createPiWorkerAdapter, PiWorkerError, supportsPiNode, loadPinnedPiAgent } from './adapter.mjs';

const task = () => ({ taskId: 'pi-test', objective: 'Inspect supplied code only', acceptance: ['Return findings'], context: 'private-source-marker' });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(behavior, extra = {}) {
  const observed = { loads: 0, aborts: 0, unsubscribes: 0, streams: 0 };
  class FakeAgent {
    state = {};
    constructor(options) { this.options = options; observed.options = options; }
    subscribe(listener) { this.listener = listener; return () => { observed.unsubscribes += 1; this.listener = undefined; }; }
    emit(message) { this.listener?.({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: message }] } }); }
    async prompt(prompt) {
      observed.prompt = prompt;
      await this.options.streamFn();
      if (behavior) await behavior.call(this, observed);
      else this.emit('analysis-output-marker');
    }
    abort() { observed.aborts += 1; }
  }
  const adapter = createPiWorkerAdapter({
    enabled: true, systemPrompt: 'host-policy-marker', model: { id: 'fixture', provider: 'fixture' },
    streamFn: async () => { observed.streams += 1; },
    loadAgent: async () => { observed.loads += 1; return FakeAgent; },
    ...extra,
  });
  return { adapter, observed };
}
const code = (expected) => (error) => error instanceof PiWorkerError && error.code === expected;

test('PI-01: default-off and non-boolean opt-in never load the runtime', async () => {
  for (const enabled of [undefined, false, 'true', 1]) {
    const { adapter, observed } = fixture(undefined, { enabled });
    await assert.rejects(adapter.start(task()), code('pi_disabled'));
    assert.equal(observed.loads, 0);
    assert.equal(adapter.getResult(), null);
  }
});

test('PI-02: only start/interrupt are advertised; resume/fork/checkpoint remain absent', () => {
  const { adapter } = fixture();
  assert.equal(adapter.schema, 'forgewright-harness-adapter/v1');
  assert.equal(adapter.mode, 'native-host-loop');
  assert.deepEqual(adapter.capabilities.operations, { start: true, resume: false, fork: false, steer: false, interrupt: true, checkpoint: false });
  for (const operation of ['resume', 'fork', 'steer', 'checkpoint']) assert.equal(adapter[operation], undefined);
  assert.equal(adapter.capabilities.precompact, 'unsupported');
  assert.throws(() => { adapter.capabilities.operations.resume = true; }, TypeError);
});

test('PI-03: fresh scoped prompt, empty tool loadout, and fail-closed tool hook', async () => {
  const { adapter, observed } = fixture();
  const started = await adapter.start(task());
  assert.ok(started.sessionId);
  assert.deepEqual(observed.options.initialState.tools, []);
  assert.deepEqual(observed.options.initialState.messages, []);
  assert.equal(observed.options.toolExecution, 'sequential');
  assert.equal((await observed.options.beforeToolCall({ toolCall: { name: 'bash' } })).block, true);
  assert.deepEqual(JSON.parse(observed.prompt), task());
  assert.equal(observed.unsubscribes, 1);
});

test('PI-04: model/provider/stream must be supplied by the host', async () => {
  for (const override of [{ model: null }, { streamFn: null }, { systemPrompt: '' }]) {
    const { adapter, observed } = fixture(undefined, override);
    await assert.rejects(adapter.start(task()), code('pi_host_configuration_required'));
    assert.equal(observed.loads, 0);
  }
});

test('PI-05: task cannot inject tools, credentials, model, or control fields', async () => {
  for (const field of ['tools', 'model', 'enabled', 'apiKey', 'loadAgent']) {
    const { adapter, observed } = fixture();
    await assert.rejects(adapter.start({ ...task(), [field]: 'injected' }), code('pi_invalid_task'));
    assert.equal(observed.loads, 0);
  }
});

test('PI-06: malformed tasks are rejected before loading the runtime', async () => {
  for (const input of [null, [], {}, { ...task(), acceptance: [] }, { ...task(), objective: ' ' }, { ...task(), taskId: '../escape' }, { ...task(), context: {} }]) {
    const { adapter, observed } = fixture();
    await assert.rejects(adapter.start(input), code('pi_invalid_task'));
    assert.equal(observed.loads, 0);
  }
});

test('PI-07: input budget includes host policy and UTF-8 task bytes without truncation', async () => {
  const { adapter, observed } = fixture(undefined, { limits: { inputBytes: 100 } });
  await assert.rejects(adapter.start({ ...task(), context: '猫'.repeat(100) }), code('pi_input_budget_exceeded'));
  assert.equal(observed.loads, 0);
});

test('PI-08: invalid and oversized limits are not silently coerced', () => {
  for (const limits of [{ modelCalls: 0 }, { modelCalls: 5 }, { timeoutMs: NaN }, { timeoutMs: Infinity }, { timeoutMs: 120001 }, { inputBytes: '1' }, { outputBytes: 65537 }]) {
    assert.throws(() => createPiWorkerAdapter({ limits }), code('pi_invalid_limits'));
  }
});

test('PI-09: analysis completion never means verified product completion or zero usage', async () => {
  const { adapter } = fixture();
  await adapter.start(task());
  const result = adapter.getResult();
  assert.equal(result.execution_state, 'finished');
  assert.equal(result.completion_state, 'unverified');
  assert.equal(result.quiescence, 'confirmed');
  assert.equal(result.usage, null);
  assert.equal(result.usage_basis, 'unavailable');
  assert.equal(result.output, 'analysis-output-marker');
  assert.equal(result.modelCalls, 1);
});

test('PI-10: telemetry does not contain prompt, policy, source, or generated text', async () => {
  const { adapter } = fixture();
  await adapter.start(task());
  const telemetry = JSON.stringify(adapter.getTelemetry());
  for (const secret of ['private-source-marker', 'analysis-output-marker', 'host-policy-marker']) assert.equal(telemetry.includes(secret), false);
  const result = adapter.getResult();
  result.completion_state = 'verified';
  assert.equal(adapter.getResult().completion_state, 'unverified');
});

test('PI-11: one adapter cannot overlap or replay a task', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { adapter } = fixture(async () => pending);
  const first = adapter.start(task());
  await assert.rejects(adapter.start(task()), code('pi_adapter_consumed'));
  release();
  await first;
  await assert.rejects(adapter.start(task()), code('pi_adapter_consumed'));
});

test('PI-12: output limit counts UTF-8 and rejects instead of silently truncating', async () => {
  const { adapter, observed } = fixture(function () { this.emit('猫猫'); }, { limits: { outputBytes: 5 } });
  await assert.rejects(adapter.start(task()), code('pi_output_budget_exceeded'));
  assert.equal(observed.aborts, 1);
  assert.equal(adapter.getResult().execution_state, 'failed');
  assert.equal(adapter.getResult().output, '');
});

test('PI-13: extra model calls stop without a provider retry or fallback', async () => {
  const { adapter, observed } = fixture(async function () { await this.options.streamFn(); });
  await assert.rejects(adapter.start(task()), code('pi_model_budget_exceeded'));
  assert.equal(observed.streams, 1);
  assert.equal(adapter.getResult().modelCalls, 1);
});

test('PI-14: timeout requests abort but does not claim non-cooperative quiescence', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { adapter, observed } = fixture(async function () { await pending; this.emit('late-success'); }, { limits: { timeoutMs: 20 } });
  await assert.rejects(adapter.start(task()), code('pi_timeout'));
  assert.equal(observed.aborts, 1);
  assert.equal(adapter.getResult().quiescence, 'not_confirmed');
  assert.equal(adapter.getResult().execution_state, 'timed_out');
  release();
  await tick();
  assert.equal(adapter.getResult().quiescence, 'confirmed');
  assert.equal(adapter.getResult().execution_state, 'timed_out');
  assert.equal(adapter.getResult().output, '');
});

test('PI-15: explicit interrupt is idempotent and never restarts a worker', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const { adapter, observed } = fixture(async () => pending);
  const started = adapter.start(task());
  const rejected = assert.rejects(started, code('pi_interrupted'));
  await tick();
  await adapter.interrupt();
  await adapter.interrupt();
  await rejected;
  assert.equal(observed.aborts, 1);
  assert.equal(adapter.getResult().execution_state, 'interrupted');
  release();
  await tick();
});

test('PI-16: interruption while loading prevents construction/model execution', async () => {
  let release;
  const deferred = new Promise((resolve) => { release = resolve; });
  const { adapter, observed } = fixture(undefined, { loadAgent: () => deferred });
  const started = adapter.start(task());
  const rejected = assert.rejects(started, code('pi_interrupted'));
  await adapter.interrupt();
  await rejected;
  release(class { constructor() { throw new Error('must not instantiate'); } });
  await tick();
  assert.equal(observed.streams, 0);
  assert.equal(adapter.getResult().quiescence, 'confirmed');
});

test('PI-17: runtime/provider errors expose only stable codes', async () => {
  const { adapter } = fixture(() => { throw new Error('private-credential-marker'); });
  await assert.rejects(adapter.start(task()), code('pi_execution_failed'));
  assert.equal(JSON.stringify(adapter.getResult()).includes('private-credential-marker'), false);
});

test('PI-18: SDK error messages cannot masquerade as completed analysis', async () => {
  const { adapter } = fixture(function () {
    this.listener({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', content: [] } });
  });
  await assert.rejects(adapter.start(task()), code('pi_execution_failed'));
  assert.equal(adapter.getResult().completion_state, 'unverified');
});

test('PI-19: task is snapshotted before asynchronous loading', async () => {
  const input = task();
  const { adapter, observed } = fixture();
  const started = adapter.start(input);
  input.objective = 'changed';
  input.acceptance.push('changed');
  await started;
  assert.deepEqual(JSON.parse(observed.prompt), task());
});

test('PI-20: candidate SDK requires Node >=22.19 and rejects unsupported host before import', async () => {
  for (const value of ['20.20.0', '22.16.0', '22.18.9', 'garbage', '22.19', '22.19.0-rc.1']) assert.equal(supportsPiNode(value), false);
  for (const value of ['22.19.0', '22.20.0', '24.0.0']) assert.equal(supportsPiNode(value), true);
  if (!supportsPiNode(process.versions.node)) await assert.rejects(loadPinnedPiAgent(), code('pi_node_unsupported'));
});

// Regression contracts for the existing strict-AC and one-shot requirements.
// FakeAgent deliberately retains callbacks; this is not real-SDK evidence.
test('PI-21: sparse or missing acceptance entries are rejected before SDK loading', async () => {
  for (const acceptance of [Array(1), ['Return findings', ,], [undefined], [null]]) {
    const { adapter, observed } = fixture();
    await assert.rejects(adapter.start({ ...task(), acceptance }), code('pi_invalid_task'));
    assert.equal(observed.loads, 0);
    assert.equal(observed.streams, 0);
    assert.equal(adapter.getResult(), null);
  }
});

test('PI-22: retained stream callbacks cannot dispatch after successful settlement', async () => {
  for (const modelCalls of [4, 1]) {
    const { adapter, observed } = fixture(undefined, { limits: { modelCalls } });
    await adapter.start(task());
    const before = adapter.getResult();
    assert.throws(() => observed.options.streamFn(), code('pi_adapter_consumed'));
    assert.equal(observed.streams, 1);
    assert.deepEqual(adapter.getResult(), before);
  }
});

test('PI-23: retained stream callbacks cannot dispatch after failed settlement', async () => {
  const { adapter, observed } = fixture(() => { throw new Error('fixture failure'); }, { limits: { modelCalls: 4 } });
  await assert.rejects(adapter.start(task()), code('pi_execution_failed'));
  const before = adapter.getResult();
  assert.throws(() => observed.options.streamFn(), code('pi_adapter_consumed'));
  assert.equal(observed.streams, 1);
  assert.deepEqual(adapter.getResult(), before);
});

test('PI-24: retained message callbacks cannot mutate settled results or telemetry', async () => {
  for (const fail of [false, true]) {
    let retained;
    const { adapter } = fixture(function () {
      retained = this.listener;
      if (fail) throw new Error('fixture failure');
      this.emit('accepted-analysis');
    });
    if (fail) await assert.rejects(adapter.start(task()), code('pi_execution_failed'));
    else await adapter.start(task());
    const before = adapter.getResult();
    const telemetry = adapter.getTelemetry();
    retained({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'late-output-must-be-ignored' }] } });
    assert.deepEqual(adapter.getResult(), before);
    assert.deepEqual(adapter.getTelemetry(), telemetry);
  }
});
