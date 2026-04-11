import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    reporter: 'basic',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['integration/**', 'scripts/**', 'node_modules/**', 'dist/**'],
  },
});
