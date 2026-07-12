#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSupplyChainPolicy } from './release-supply-chain-policy.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
function yamlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'archive' ? [] : yamlFiles(path);
    return /\.ya?ml$/.test(entry.name) && statSync(path).isFile() ? [path] : [];
  });
}
const files = yamlFiles(join(root, '.github'));
assertSupplyChainPolicy(files, root);
console.log(`supply-chain policy: PASS (${files.length} active YAML files)`);
