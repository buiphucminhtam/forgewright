import { describe, expect, it, vi } from 'vitest';
import { PolicyReadyToolGateway } from './policy-ready-tool-gateway.js';
import type { RuntimeTrustContext } from './execution-containment.js';

const trust: RuntimeTrustContext = {
  mode: 'local',
  workspace: '/workspace',
  callerId: null,
  profile: 'application',
  profileDigest: 'a'.repeat(64),
  policyDigest: 'b'.repeat(64),
};
const request = { name: 'fw_get_current_phase', arguments: {}, sessionId: 'test', turnNumber: 1 };
const result = { content: [{ type: 'text' as const, text: 'ready' }] };

describe('PolicyReadyToolGateway', () => {
  it('does not create a gateway or invoke a tool while policy is missing or invalid', async () => {
    const read = vi.fn<[], RuntimeTrustContext | null>().mockReturnValue(null);
    const create = vi.fn();
    const execute = vi.fn();
    const gateway = new PolicyReadyToolGateway(read, create, null);
    expect(await gateway.execute(request, execute)).toMatchObject({
      isError: true,
      content: [{ text: 'EXECUTION_POLICY_NOT_READY' }],
    });
    read.mockImplementation(() => {
      throw new Error('EXECUTION_POLICY_INVALID');
    });
    expect(await gateway.execute(request, execute)).toMatchObject({
      isError: true,
      content: [{ text: 'EXECUTION_POLICY_INVALID' }],
    });
    expect(create).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('binds once before concurrent awaits and never rebinds after policy replacement', async () => {
    const read = vi.fn(() => trust);
    const execute = vi.fn(async () => result);
    const create = vi.fn(() => ({ execute }));
    const gateway = new PolicyReadyToolGateway(read, create, null);
    expect(
      await Promise.all([gateway.execute(request, execute), gateway.execute(request, execute)]),
    ).toEqual([result, result]);
    read.mockImplementation(() => {
      throw new Error('replacement');
    });
    await gateway.execute(request, execute);
    expect(create).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('preserves the eager guarded gateway for an already valid policy', async () => {
    const read = vi.fn();
    const execute = vi.fn(async () => result);
    const create = vi.fn(() => ({ execute }));
    const gateway = new PolicyReadyToolGateway(read, create, trust);
    expect(create).toHaveBeenCalledWith(trust);
    expect(await gateway.execute(request, execute)).toEqual(result);
    expect(read).not.toHaveBeenCalled();
  });
});
