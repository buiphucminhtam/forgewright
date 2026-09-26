import { afterEach, describe, expect, it, vi } from 'vitest';

async function workerBudget(): Promise<{ minForks: number; maxForks: number }> {
  vi.resetModules();
  const config = (await import('../vitest.config.js')).default;
  return config.test!.poolOptions!.forks! as { minForks: number; maxForks: number };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('native verification worker budget', () => {
  it('retains the existing two-worker ceiling by default', async () => {
    vi.stubEnv('FORGEWRIGHT_TEST_WORKERS', '2');
    delete process.env.FORGEWRIGHT_TEST_WORKERS;
    expect(await workerBudget()).toMatchObject({ minForks: 1, maxForks: 2 });
  });

  it('serializes test files when the operator selects one worker', async () => {
    vi.stubEnv('FORGEWRIGHT_TEST_WORKERS', '1');
    expect(await workerBudget()).toMatchObject({ minForks: 1, maxForks: 1 });
  });

  it('allows the existing bounded two-worker configuration explicitly', async () => {
    vi.stubEnv('FORGEWRIGHT_TEST_WORKERS', '2');
    expect(await workerBudget()).toMatchObject({ minForks: 1, maxForks: 2 });
  });

  it.each(['0', '3', '999', 'auto', ''])('rejects unsafe worker budget %j', async (value) => {
    vi.stubEnv('FORGEWRIGHT_TEST_WORKERS', value);
    await expect(workerBudget()).rejects.toThrow('FORGEWRIGHT_TEST_WORKERS must be 1 or 2');
  });
});
