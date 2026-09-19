import assert from 'node:assert/strict';
import test, { after, mock } from 'node:test';
import metadata from '@earendil-works/pi-agent-core/package.json' with { type: 'json' };
import { createPiWorkerAdapter, loadPinnedPiAgent, PI_SOURCE_VERSION, PiWorkerError } from './adapter.mjs';

// Only the transport is deterministic. Every prompt below uses the installed
// Pi Agent/agent loop, not FakeAgent. No provider, credential or shell is used.
mock.method(globalThis, 'fetch', () => { throw new Error('live_fetch_forbidden_in_sdk_conformance'); });
after(() => mock.restoreAll());
const Agent = await loadPinnedPiAgent();
const model = Object.freeze({
  id: 'deterministic-test-model', name: 'Deterministic test transport',
  provider: 'forgewright-test', api: 'test-transport', baseUrl: '',
  reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 256,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});
const task = () => ({ taskId: 'sdk-conformance', objective: 'Analyze only supplied context', acceptance: ['Return findings'], context: 'private-source-marker' });
const code = (expected) => (error) => error instanceof PiWorkerError && error.code === expected;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
function message(text = 'analysis-output-marker', stopReason = 'stop') {
  return {
    role: 'assistant', api: model.api, provider: model.provider, model: model.id,
    content: [{ type: 'text', text }], stopReason, timestamp: 1,
    // These are deliberately fake transport values. The adapter MUST NOT
    // promote them into native provider usage or accepted-product evidence.
    usage: { input: 7, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 10,
      cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2 } },
  };
}
function stream(final, gate) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'start', partial: { ...final, content: [] } };
      if (gate) await gate;
      yield ['error', 'aborted'].includes(final.stopReason)
        ? { type: 'error', reason: final.stopReason, error: final }
        : { type: 'done', reason: final.stopReason, message: final };
    },
    async result() { if (gate) await gate; return final; },
  };
}
function fixture({ respond, ...extra } = {}) {
  const observed = { calls: 0 };
  const adapter = createPiWorkerAdapter({
    enabled: true, systemPrompt: 'host-policy-marker', model,
    streamFn: (selected, context, options) => {
      observed.calls += 1;
      observed.model = selected;
      observed.context = context;
      observed.options = options;
      return respond ? respond(observed) : stream(message());
    },
    ...extra,
  });
  return { adapter, observed };
}
function observedAgent(observed) {
  // Observe constructor/subscription boundaries without replacing prompt,
  // abort, event delivery, state management or the real SDK loop.
  return class ObservedAgent extends Agent {
    constructor(options) { super(options); observed.sdkOptions = options; }
    subscribe(listener) { observed.listener = listener; return super.subscribe(listener); }
  };
}

test('SDK-01: lazy loader resolves the exact installed pinned Agent', () => {
  assert.equal(metadata.version, PI_SOURCE_VERSION);
  assert.equal(metadata.license, 'MIT');
  assert.equal(typeof Agent, 'function');
});

test('SDK-02: real SDK receives only host policy, snapshotted task and zero tools', async () => {
  const { adapter, observed } = fixture();
  const { sessionId } = await adapter.start(task());
  assert.ok(sessionId);
  assert.equal(observed.calls, 1);
  assert.equal(observed.model, model);
  assert.equal(observed.context.systemPrompt, 'host-policy-marker');
  assert.deepEqual(observed.context.tools, []);
  assert.equal(observed.context.messages.length, 1);
  assert.equal(observed.context.messages[0].role, 'user');
  assert.deepEqual(JSON.parse(observed.context.messages[0].content[0].text), task());
  assert.equal(observed.options.sessionId, sessionId);
  assert.equal(observed.options.apiKey, undefined);
  assert.ok(observed.options.signal instanceof AbortSignal);
  assert.equal(adapter.getResult().output, 'analysis-output-marker');
  assert.equal(adapter.getResult().quiescence, 'confirmed');
});

test('SDK-03: deterministic SDK usage is not promoted into native receipts or completion', async () => {
  const { adapter } = fixture();
  await adapter.start(task());
  assert.equal(adapter.getResult().execution_state, 'finished');
  assert.equal(adapter.getResult().completion_state, 'unverified');
  assert.equal(adapter.getResult().usage, null);
  assert.equal(adapter.getResult().usage_basis, 'unavailable');
});

test('SDK-04: default-off cannot invoke the real transport', async () => {
  for (const enabled of [undefined, false, 'true', 1]) {
    const { adapter, observed } = fixture({ enabled });
    await assert.rejects(adapter.start(task()), code('pi_disabled'));
    assert.equal(observed.calls, 0);
  }
});

test('SDK-05: malformed and sparse AC cannot reach the transport', async () => {
  for (const acceptance of [[], Array(1), ['valid', ,], [undefined], [null], [' ']]) {
    const { adapter, observed } = fixture();
    await assert.rejects(adapter.start({ ...task(), acceptance }), code('pi_invalid_task'));
    assert.equal(observed.calls, 0);
  }
});

test('SDK-06: task control-field injection cannot reach the transport', async () => {
  for (const field of ['enabled', 'tools', 'model', 'streamFn', 'apiKey', 'loadAgent']) {
    const { adapter, observed } = fixture();
    await assert.rejects(adapter.start({ ...task(), [field]: 'injected' }), code('pi_invalid_task'));
    assert.equal(observed.calls, 0);
  }
});

test('SDK-07: missing trusted configuration is rejected before transport', async () => {
  for (const config of [{ model: null }, { streamFn: null }, { systemPrompt: '' }]) {
    const { adapter, observed } = fixture(config);
    await assert.rejects(adapter.start(task()), code('pi_host_configuration_required'));
    assert.equal(observed.calls, 0);
  }
});

test('SDK-08: oversized UTF-8 input is rejected without truncating acceptance', async () => {
  const { adapter, observed } = fixture({ limits: { inputBytes: 100 } });
  await assert.rejects(adapter.start({ ...task(), context: '猫'.repeat(100) }), code('pi_input_budget_exceeded'));
  assert.equal(observed.calls, 0);
});

test('SDK-09: oversized real assistant output is rejected and aborted', async () => {
  const { adapter, observed } = fixture({ limits: { outputBytes: 5 }, respond: () => stream(message('猫猫')) });
  await assert.rejects(adapter.start(task()), code('pi_output_budget_exceeded'));
  assert.equal(observed.options.signal.aborted, true);
  assert.equal(adapter.getResult().output, '');
  assert.equal(adapter.getResult().completion_state, 'unverified');
});

test('SDK-10: telemetry excludes policy, source, generated text and synthetic usage', async () => {
  const { adapter } = fixture();
  await adapter.start(task());
  const telemetry = JSON.stringify(adapter.getTelemetry());
  for (const marker of ['host-policy-marker', 'private-source-marker', 'analysis-output-marker']) assert.equal(telemetry.includes(marker), false);
  assert.equal(adapter.getTelemetry().usage, null);
  const result = adapter.getResult();
  result.completion_state = 'verified';
  assert.equal(adapter.getResult().completion_state, 'unverified');
});

test('SDK-11: a real in-flight attempt cannot overlap or replay', async () => {
  const entered = deferred(); const release = deferred();
  const { adapter, observed } = fixture({ respond: () => { entered.resolve(); return stream(message(), release.promise); } });
  const first = adapter.start(task());
  try {
    await entered.promise;
    await assert.rejects(adapter.start(task()), code('pi_adapter_consumed'));
  } finally { release.resolve(); }
  await first;
  await assert.rejects(adapter.start(task()), code('pi_adapter_consumed'));
  assert.equal(observed.calls, 1);
});

test('SDK-12: cooperative interruption aborts the actual SDK signal without retry', async () => {
  const entered = deferred(); const release = deferred();
  const { adapter, observed } = fixture({ respond: (seen) => {
    seen.options.signal.addEventListener('abort', () => release.resolve(), { once: true });
    entered.resolve(); return stream(message('', 'aborted'), release.promise);
  } });
  const rejected = assert.rejects(adapter.start(task()), code('pi_interrupted'));
  await entered.promise;
  await adapter.interrupt(); await adapter.interrupt();
  await rejected; await tick();
  assert.equal(observed.options.signal.aborted, true);
  assert.equal(observed.calls, 1);
  assert.equal(adapter.getResult().execution_state, 'interrupted');
  assert.equal(adapter.getResult().quiescence, 'confirmed');
});

test('SDK-13: non-cooperative interruption remains unconfirmed until SDK settlement', async () => {
  const entered = deferred(); const release = deferred();
  const { adapter } = fixture({ respond: () => { entered.resolve(); return stream(message('late-success'), release.promise); } });
  const rejected = assert.rejects(adapter.start(task()), code('pi_interrupted'));
  try {
    await entered.promise; await adapter.interrupt(); await rejected;
    assert.equal(adapter.getResult().quiescence, 'not_confirmed');
    assert.equal(adapter.getResult().output, '');
  } finally { release.resolve(); }
  await tick();
  assert.equal(adapter.getResult().quiescence, 'confirmed');
  assert.equal(adapter.getResult().execution_state, 'interrupted');
  assert.equal(adapter.getResult().output, '');
});

test('SDK-14: deadline includes a pending real stream and preserves timed-out state', async () => {
  const release = deferred();
  const { adapter, observed } = fixture({ limits: { timeoutMs: 250 }, respond: () => stream(message('late-success'), release.promise) });
  try {
    await assert.rejects(adapter.start(task()), code('pi_timeout'));
    assert.equal(observed.options.signal.aborted, true);
    assert.equal(adapter.getResult().quiescence, 'not_confirmed');
  } finally { release.resolve(); }
  await tick();
  assert.equal(adapter.getResult().quiescence, 'confirmed');
  assert.equal(adapter.getResult().execution_state, 'timed_out');
  assert.equal(adapter.getResult().output, '');
});

test('SDK-15: SDK error completion is rejected without leaking provider text', async () => {
  const final = message('', 'error'); final.errorMessage = 'private-credential-marker';
  const { adapter } = fixture({ respond: () => stream(final) });
  await assert.rejects(adapter.start(task()), code('pi_execution_failed'));
  assert.equal(JSON.stringify(adapter.getResult()).includes('private-credential-marker'), false);
});

test('SDK-16: an actual transport exception cannot become completed analysis', async () => {
  const { adapter } = fixture({ respond: () => { throw new Error('private-credential-marker'); } });
  await assert.rejects(adapter.start(task()), code('pi_execution_failed'));
  assert.equal(adapter.getResult().execution_state, 'failed');
  assert.equal(JSON.stringify(adapter.getResult()).includes('private-credential-marker'), false);
});

test('SDK-17: unknown tool requests cannot escape the empty loadout or model-call cap', async () => {
  const final = message(); final.stopReason = 'toolUse';
  final.content = [{ type: 'toolCall', id: 'injected-tool', name: 'bash', arguments: { command: 'must-not-execute' } }];
  const { adapter, observed } = fixture({ respond: () => stream(final) });
  await assert.rejects(adapter.start(task()), code('pi_model_budget_exceeded'));
  assert.equal(observed.calls, 1);
  assert.deepEqual(observed.context.tools, []);
  assert.equal(adapter.getResult().completion_state, 'unverified');
});

test('SDK-18: task and AC are captured before deferred real SDK loading', async () => {
  const loaded = deferred();
  const input = task();
  const { adapter, observed } = fixture({ loadAgent: () => loaded.promise });
  const started = adapter.start(input);
  input.objective = 'mutated'; input.acceptance.push('mutated');
  loaded.resolve(Agent); await started;
  assert.deepEqual(JSON.parse(observed.context.messages[0].content[0].text), task());
});

test('SDK-19: cancellation during loading prevents any actual SDK transport call', async () => {
  const loaded = deferred();
  const { adapter, observed } = fixture({ loadAgent: () => loaded.promise });
  const rejected = assert.rejects(adapter.start(task()), code('pi_interrupted'));
  await adapter.interrupt(); await rejected;
  loaded.resolve(Agent); await tick();
  assert.equal(observed.calls, 0);
  assert.equal(adapter.getResult().quiescence, 'confirmed');
});

test('SDK-20: retained SDK callbacks lose admission after successful and failed settlement', async () => {
  for (const fail of [false, true]) {
    const seen = {};
    const { adapter, observed } = fixture({
      limits: { modelCalls: 4 }, loadAgent: async () => observedAgent(seen),
      respond: () => { if (fail) throw new Error('transport-failure'); return stream(message()); },
    });
    if (fail) await assert.rejects(adapter.start(task()), code('pi_execution_failed'));
    else await adapter.start(task());
    await tick();
    const before = adapter.getResult(); const telemetry = adapter.getTelemetry();
    assert.throws(() => seen.sdkOptions.streamFn(model, {}, {}), (error) => error instanceof PiWorkerError && ['pi_adapter_consumed', 'pi_execution_failed'].includes(error.code));
    seen.listener({ type: 'message_end', message: message('late-output') });
    assert.equal(observed.calls, 1);
    assert.deepEqual(adapter.getResult(), before);
    assert.deepEqual(adapter.getTelemetry(), telemetry);
  }
});
