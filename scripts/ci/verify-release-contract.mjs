#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertReleaseContract } from './release-supply-chain-policy.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag) throw new Error('usage: verify-release-contract.mjs vX.Y.Z');

function version(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8')).version;
}

assertReleaseContract(tag, {
  mcp: version('mcp/package.json'),
  cli: version('src/cli/package.json'),
});
console.log(`release contract: ${tag} matches MCP and CLI package versions`);
