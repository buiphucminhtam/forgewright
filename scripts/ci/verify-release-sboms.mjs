#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSbom } from './release-supply-chain-policy.mjs';

const directory = process.argv[2];
if (!directory) throw new Error('usage: verify-release-sboms.mjs <artifact-directory>');
const expected = new Map([
  ['mcp.sbom.cdx.json', 'mcp'],
  ['cli.sbom.cdx.json', 'cli'],
]);

for (const [file, workspaceName] of expected) {
  const sbom = JSON.parse(readFileSync(join(directory, file), 'utf8'));
  assertSbom(sbom, [workspaceName]);
  if (sbom.metadata?.component?.name !== 'forgewright') throw new Error(`${file} has an unexpected root component ${sbom.metadata?.component?.name ?? 'none'}`);
}
console.log(`release SBOMs: PASS (${[...expected.keys()].join(', ')})`);
