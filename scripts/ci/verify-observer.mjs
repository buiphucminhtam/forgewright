import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const tsup = join(dirname(require.resolve('tsup')), 'cli-default.js');
const tsc = require.resolve('typescript/bin/tsc');

// 1. Reproducible source/bundle consistency check
console.log('1. Checking observer source/bundle consistency...');
const tmpDir = mkdtempSync(join(tmpdir(), 'observer-bundle-check-'));
try {
  execFileSync(process.execPath, [tsup, '.forgewright/instincts/observer.ts', '--format', 'esm', '--out-dir', tmpDir], {
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
execFileSync(process.execPath, [tsc, '--project', 'tsconfig.json', '--noEmit'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});
console.log('PASS: TypeScript typecheck passed.');

// 3. Maintained tracked verifier tests
console.log('3. Running maintained tracked observer verifiers...');
const venvPython = join(
  root,
  '.forgewright/local-ci-venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const pythonBin =
  process.env.FORGEWRIGHT_PYTHON ||
  (existsSync(venvPython) ? venvPython : process.platform === 'win32' ? 'python' : 'python3');
execFileSync(pythonBin, ['-m', 'pytest', '-q', 'tests/unit_tests/test_instinct_observer.py'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
});
console.log('PASS: Tracked observer verifiers passed.');
