import { defineConfig } from 'vitest/config';

const workerBudget = process.env.FORGEWRIGHT_TEST_WORKERS ?? '2';
if (workerBudget !== '1' && workerBudget !== '2') {
  throw new Error('FORGEWRIGHT_TEST_WORKERS must be 1 or 2');
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    // Shared native hosts also run the owner's other work. CPU-count defaults
    // can saturate memory and durable ledger I/O with dozens of Node workers.
    // Bound file-level concurrency without relaxing assertions or timeouts.
    isolate: true,
    poolOptions: { forks: { minForks: 1, maxForks: Number(workerBudget) } },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
    testTimeout: 10000,
  },
});
