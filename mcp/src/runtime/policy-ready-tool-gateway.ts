import type { ToolResult } from '../middleware/types.js';
import type { RuntimeTrustContext } from './execution-containment.js';
import type { ToolExecutionGateway, ToolExecutionRequest } from './tool-execution-gateway.js';

type Gateway = Pick<ToolExecutionGateway, 'execute'>;

/** Keep discovery available while an external trusted bootstrap seeds policy. */
export class PolicyReadyToolGateway implements Gateway {
  private gateway: Gateway | null = null;

  constructor(
    private readonly readTrust: () => RuntimeTrustContext | null,
    private readonly createGateway: (trust: RuntimeTrustContext) => Gateway,
    initialTrust: RuntimeTrustContext | null,
  ) {
    if (initialTrust !== null) this.gateway = createGateway(initialTrust);
  }

  async execute(
    request: ToolExecutionRequest,
    execute: () => Promise<ToolResult>,
  ): Promise<ToolResult> {
    if (this.gateway === null) {
      let trust: RuntimeTrustContext | null;
      try {
        trust = this.readTrust();
      } catch {
        return this.unavailable('EXECUTION_POLICY_INVALID');
      }
      if (trust === null) return this.unavailable('EXECUTION_POLICY_NOT_READY');
      // This assignment is synchronous, before any await, so concurrent calls
      // bind exactly one gateway and its original policy identity.
      this.gateway = this.createGateway(trust);
    }
    return this.gateway.execute(request, execute);
  }

  private unavailable(code: string): ToolResult {
    return { isError: true, content: [{ type: 'text', text: code }] };
  }
}
