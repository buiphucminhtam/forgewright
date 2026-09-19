import assert from 'node:assert/strict';
import test from 'node:test';
import { createPiWorkerAdapter } from './adapter.mjs';
// Test the real built contract. Run `npm run build` at repo root first.
import { negotiateHarnessAdapter, HarnessCompatibilityError } from '../../mcp/build/runtime/harness-adapter.js';

const expected = { start: true, resume: false, fork: false, steer: false, interrupt: true, checkpoint: false };

test('HOST-01: canonical HarnessAdapter negotiates only implemented Pi capabilities', () => {
  const adapter = createPiWorkerAdapter();
  const result = negotiateHarnessAdapter(adapter, ['start', 'interrupt']);
  assert.equal(result.schema, 'forgewright-harness-adapter/v1');
  assert.equal(result.mode, 'native-host-loop');
  assert.equal(result.precompact, 'unsupported');
  assert.deepEqual(result.operations, expected);
  assert.match(result.capabilityHash, /^[a-f0-9]{64}$/);
  assert.equal(negotiateHarnessAdapter(createPiWorkerAdapter(), []).capabilityHash, result.capabilityHash);
});

test('HOST-02: unsupported lifecycle requirements fail closed in the canonical negotiator', () => {
  for (const operation of ['resume', 'fork', 'steer', 'checkpoint']) {
    assert.throws(() => negotiateHarnessAdapter(createPiWorkerAdapter(), [operation]),
      (error) => error instanceof HarnessCompatibilityError && error.code === `unsupported_operation:${operation}`);
  }
});

test('HOST-03: claiming an absent Pi implementation is rejected, not negotiated', () => {
  const adapter = createPiWorkerAdapter();
  const forged = { ...adapter, capabilities: { ...adapter.capabilities, operations: { ...expected, resume: true } } };
  assert.throws(() => negotiateHarnessAdapter(forged, ['start']),
    (error) => error instanceof HarnessCompatibilityError && error.code === 'missing_operation_implementation:resume');
});

test('HOST-04: successful negotiation never enables a default-off Pi worker', async () => {
  const adapter = createPiWorkerAdapter();
  negotiateHarnessAdapter(adapter, ['start']);
  await assert.rejects(adapter.start({ taskId: 'host-test', objective: 'Analyze', acceptance: ['Findings'] }),
    (error) => error.code === 'pi_disabled');
  assert.equal(adapter.getResult(), null);
});
