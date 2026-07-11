import { describe, expect, it } from 'vitest';
import {
  BudgetLedger,
  ModelCallGateway,
  type CapabilityProbe,
  type ModelProvider,
} from './model-call-gateway.js';

const probe: CapabilityProbe = {
  async probe() {
    return [
      { id: 'gpt-5.6-luna', snapshot: 'luna-snapshot', tiers: ['scout'] },
      { id: 'gpt-5.6-terra', snapshot: 'terra-snapshot', tiers: ['builder', 'expert'] },
    ];
  },
};

function provider(run: ModelProvider['complete']): ModelProvider {
  return { complete: run };
}

describe('ModelCallGateway', () => {
  it('routes by risk and records usage_unavailable without recording prompts', async () => {
    const events: unknown[] = [];
    const gateway = new ModelCallGateway({ probe, telemetry: (event) => events.push(event) });
    const result = await gateway.execute(
      {
        taskId: 'task-1',
        accountId: 'account-1',
        riskSignals: ['public-api'],
        prompt: 'never log me',
      },
      provider(async () => ({ output: 'ok' })),
    );
    expect(result.route.tier).toBe('expert');
    expect(result.usageUnavailable).toBe(true);
    expect(JSON.stringify(events)).not.toContain('never log me');
    expect(events[0]).toMatchObject({ usage_unavailable: true, model: 'gpt-5.6-terra' });
  });

  it('fails closed when no expert capability is available for high-risk work', async () => {
    const gateway = new ModelCallGateway({
      probe: {
        async probe() {
          return [{ id: 'builder', snapshot: 'v1', tiers: ['builder'] }];
        },
      },
    });
    await expect(
      gateway.execute(
        { taskId: 'task', accountId: 'account', riskSignals: ['security'], prompt: 'x' },
        provider(async () => ({ output: 'x' })),
      ),
    ).rejects.toThrow('No capable model');
  });

  it('retries bounded transient failures then opens a circuit', async () => {
    let calls = 0;
    const gateway = new ModelCallGateway({
      probe,
      retry: { maxAttempts: 2, baseDelayMs: 0 },
      circuit: { failureThreshold: 2, resetAfterMs: 60_000 },
    });
    const failing = provider(async () => {
      calls++;
      throw new Error('temporary provider failure');
    });
    await expect(
      gateway.execute({ taskId: 'a', accountId: 'a', prompt: 'x' }, failing),
    ).rejects.toThrow('temporary');
    await expect(
      gateway.execute({ taskId: 'b', accountId: 'a', prompt: 'x' }, failing),
    ).rejects.toThrow('temporary');
    await expect(
      gateway.execute({ taskId: 'c', accountId: 'a', prompt: 'x' }, failing),
    ).rejects.toThrow('circuit');
    expect(calls).toBe(4);
  });

  it('enforces timeout, output and turn caps', async () => {
    const gateway = new ModelCallGateway({
      probe,
      caps: { timeoutMs: 5, maxOutputChars: 3, maxTurns: 1 },
    });
    const slow = provider(
      async () => new Promise((resolve) => setTimeout(() => resolve({ output: 'slow' }), 20)),
    );
    await expect(
      gateway.execute({ taskId: 'a', accountId: 'a', prompt: 'x' }, slow),
    ).rejects.toThrow('timed out');
    const capped = await gateway.execute(
      { taskId: 'b', accountId: 'a', prompt: 'x' },
      provider(async () => ({ output: 'hello' })),
    );
    expect(capped.output).toBe('hel');
    await expect(
      gateway.execute(
        { taskId: 'b', accountId: 'a', prompt: 'x' },
        provider(async () => ({ output: 'x' })),
      ),
    ).rejects.toThrow('turn cap');
  });

  it('checks budgets before calls at warning, authority, fail-closed, and explicit override thresholds', async () => {
    const ledger = new BudgetLedger({ taskLimit: 100, accountLimit: 100 });
    ledger.record('task', 'account', 79);
    expect(ledger.preflight('task', 'account', 1).status).toBe('warning');
    ledger.record('task', 'account', 15);
    expect(ledger.preflight('task', 'account', 1).status).toBe('authority_required');
    ledger.record('task', 'account', 5);
    expect(ledger.preflight('task', 'account', 1).status).toBe('blocked');
    expect(ledger.preflight('task', 'account', 1, { allowOverage: true }).status).toBe(
      'allowed_override',
    );
    const gateway = new ModelCallGateway({ probe, budget: ledger });
    await expect(
      gateway.execute(
        { taskId: 'new-task', accountId: 'account', prompt: 'x' },
        provider(async () => ({ output: 'x' })),
      ),
    ).rejects.toThrow('estimated cost');
  });
});
