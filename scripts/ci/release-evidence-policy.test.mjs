import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAuditPolicy,
  assertCoveragePolicy,
  assertRequiredPaths,
  forbiddenMcpPaths,
} from './release-evidence-policy.mjs';

test('audit policy permits low/moderate findings but rejects high/critical findings', () => {
  assert.doesNotThrow(() => assertAuditPolicy({ low: 2, moderate: 3, high: 0, critical: 0 }));
  assert.throws(() => assertAuditPolicy({ high: 1, critical: 0 }), /high=1/);
  assert.throws(() => assertAuditPolicy({ high: 0, critical: 1 }), /critical=1/);
});

test('coverage policy accepts exact thresholds and fails closed for missing or low metrics', () => {
  const thresholds = { lines: 70, branches: 60 };
  assert.doesNotThrow(() => assertCoveragePolicy({ lines: { pct: 70 }, branches: { pct: 60 } }, thresholds));
  assert.throws(() => assertCoveragePolicy({ lines: { pct: 69.99 }, branches: { pct: 60 } }, thresholds), /lines=69.99/);
  assert.throws(() => assertCoveragePolicy({ lines: { pct: 70 } }, thresholds), /branches=0/);
});

test('package policy rejects private MCP content and missing entrypoints', () => {
  assert.deepEqual(
    forbiddenMcpPaths([
      { path: 'build/index.js' },
      { path: '.forgewright/events.jsonl' },
      { path: 'src/index.ts' },
      { path: 'build/index.test.js' },
    ]),
    ['.forgewright/events.jsonl', 'src/index.ts', 'build/index.test.js'],
  );
  assert.throws(() => assertRequiredPaths({ name: 'pkg', files: [] }, ['build/index.js']), /missing build\/index.js/);
});
