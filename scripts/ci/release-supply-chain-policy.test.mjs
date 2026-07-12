import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertReleaseContract, assertSbom, previousReleaseTag, supplyChainPolicyErrors } from './release-supply-chain-policy.mjs';

test('release contract requires a semver tag shared by MCP and CLI', () => {
  assert.doesNotThrow(() => assertReleaseContract('v1.2.3', { mcp: '1.2.3', cli: '1.2.3' }));
  assert.throws(() => assertReleaseContract('v1.2', { mcp: '1.2.0', cli: '1.2.0' }), /vX.Y.Z/);
  assert.throws(() => assertReleaseContract('v1.2.3', { mcp: '1.2.3', cli: '1.2.4' }), /cli version/);
});

test('rollback selection is deterministic and excludes the current tag', () => {
  assert.equal(previousReleaseTag(['v1.2.0', 'v1.10.0', 'v2.0.0'], 'v2.0.0'), 'v1.10.0');
  assert.equal(previousReleaseTag(['v0.9.0', 'v8.8.0'], 'v1.0.0'), 'v0.9.0');
  assert.throws(() => previousReleaseTag(['v2.0.0'], 'v2.0.0'), /no prior/);
});

test('SBOM validator fails closed for malformed or incomplete CycloneDX payloads', () => {
  assert.doesNotThrow(() => assertSbom({ bomFormat: 'CycloneDX', components: [{ name: 'forgewright-mcp-global' }] }, ['forgewright-mcp-global']));
  assert.throws(() => assertSbom({ bomFormat: 'SPDX', components: [] }, []), /CycloneDX/);
  assert.throws(() => assertSbom({ bomFormat: 'CycloneDX', components: [] }, ['@forgewright/cli']), /missing component/);
});

test('static policy rejects mutable actions, curl pipes, and unpinned tools', () => {
  const root = mkdtempSync(join(tmpdir(), 'supply-policy-'));
  const file = join(root, 'workflow.yml');
  try {
    writeFileSync(file, 'steps:\n  - uses: actions/checkout@v4\n  - run: curl https://x | bash\n  - run: npx gitnexus\n  - run: pip install pytest\n');
    const errors = supplyChainPolicyErrors([file], root);
    assert.equal(errors.length, 4);
    assert.match(errors.join('\n'), /not pinned/);
    assert.match(errors.join('\n'), /curl piped/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
