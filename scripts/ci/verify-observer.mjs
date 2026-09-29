import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

// 1. Reproducible source/bundle consistency check
console.log('1. Checking observer source/bundle consistency...');
const tmpDir = mkdtempSync(join(tmpdir(), 'observer-bundle-check-'));
try {
  execFileSync('npx', ['tsup', '.forgewright/instincts/observer.ts', '--format', 'esm', '--out-dir', tmpDir], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const builtBundle = readFileSync(join(tmpDir, 'observer.mjs'), 'utf8');
  const shippedBundle = readFileSync(join(root, '.forgewright/instincts/observer.mjs'), 'utf8');
  if (builtBundle !== shippedBundle) {
    throw new Error('shipped .forgewright/instincts/observer.mjs is out of date with .forgewright/instincts/observer.ts; run npm run build:observer');
  }
  console.log('PASS: Source and bundle are consistent.');
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

// 2. TypeScript typecheck
console.log('2. Typechecking observer source...');
execFileSync('npx', ['tsc', '--project', 'tsconfig.json', '--noEmit'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});
console.log('PASS: TypeScript typecheck passed.');

// 3. Maintained tracked verifier tests
console.log('3. Running maintained tracked observer verifiers...');
execFileSync('python3', ['-m', 'pytest', '-q', 'tests/unit_tests/test_instinct_observer.py'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});
console.log('PASS: Tracked observer verifiers passed.');
