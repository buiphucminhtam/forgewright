export type ModelTier = 'scout' | 'builder' | 'expert';

export interface ModelCapability {
  id: string;
  snapshot: string;
  tiers: ModelTier[];
}

export interface CapabilityProbe {
  probe(): Promise<ModelCapability[]>;
}

export interface ModelProvider {
  complete(request: {
    model: string;
    snapshot: string;
    prompt: string;
    timeoutMs: number;
  }): Promise<{
    output: string;
    usage?: { inputTokens: number; outputTokens: number; cachedTokens?: number; cost?: number };
  }>;
}

export interface ModelCallRequest {
  taskId: string;
  accountId: string;
  prompt: string;
  riskSignals?: string[];
  estimatedCost?: number;
}

export interface ModelTelemetryEvent {
  task_id: string;
  account_id: string;
  tier: ModelTier;
  model: string;
  snapshot: string;
  reason: string;
  retry_count: number;
  latency_ms: number;
  usage_unavailable: boolean;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  estimated_cost?: number;
}

export interface BudgetPolicy {
  allowOverage?: boolean;
}

export type BudgetStatus = 'ok' | 'warning' | 'authority_required' | 'blocked' | 'allowed_override';

export class BudgetLedger {
  private readonly taskSpend = new Map<string, number>();
  private readonly accountSpend = new Map<string, number>();

  constructor(private readonly limits: { taskLimit: number; accountLimit: number }) {}

  record(taskId: string, accountId: string, cost: number): void {
    this.taskSpend.set(taskId, (this.taskSpend.get(taskId) ?? 0) + cost);
    this.accountSpend.set(accountId, (this.accountSpend.get(accountId) ?? 0) + cost);
  }

  preflight(
    taskId: string,
    accountId: string,
    estimatedCost: number,
    policy: BudgetPolicy = {},
  ): { status: BudgetStatus; projectedTask: number; projectedAccount: number } {
    const projectedTask = (this.taskSpend.get(taskId) ?? 0) + estimatedCost;
    const projectedAccount = (this.accountSpend.get(accountId) ?? 0) + estimatedCost;
    const ratio = Math.max(
      projectedTask / this.limits.taskLimit,
      projectedAccount / this.limits.accountLimit,
    );
    if (ratio >= 1)
      return {
        status: policy.allowOverage ? 'allowed_override' : 'blocked',
        projectedTask,
        projectedAccount,
      };
    if (ratio >= 0.95) return { status: 'authority_required', projectedTask, projectedAccount };
    if (ratio >= 0.8) return { status: 'warning', projectedTask, projectedAccount };
    return { status: 'ok', projectedTask, projectedAccount };
  }
}

interface CircuitState {
  failures: number;
  openedAt?: number;
}

export class ModelCallGateway {
  private capabilities?: Promise<ModelCapability[]>;
  private readonly turns = new Map<string, number>();
  private readonly circuit: CircuitState = { failures: 0 };
  private readonly retry: { maxAttempts: number; baseDelayMs: number };
  private readonly caps: { timeoutMs: number; maxOutputChars: number; maxTurns: number };
  private readonly circuitPolicy: { failureThreshold: number; resetAfterMs: number };

  constructor(
    private readonly options: {
      probe: CapabilityProbe;
      telemetry?: (event: ModelTelemetryEvent) => void;
      budget?: BudgetLedger;
      retry?: { maxAttempts?: number; baseDelayMs?: number };
      circuit?: { failureThreshold?: number; resetAfterMs?: number };
      caps?: { timeoutMs?: number; maxOutputChars?: number; maxTurns?: number };
      authorizeOverage?: (request: ModelCallRequest) => boolean;
    },
  ) {
    this.retry = {
      maxAttempts: options.retry?.maxAttempts ?? 3,
      baseDelayMs: options.retry?.baseDelayMs ?? 100,
    };
    this.circuitPolicy = {
      failureThreshold: options.circuit?.failureThreshold ?? 3,
      resetAfterMs: options.circuit?.resetAfterMs ?? 30_000,
    };
    this.caps = {
      timeoutMs: options.caps?.timeoutMs ?? 30_000,
      maxOutputChars: options.caps?.maxOutputChars ?? 32_768,
      maxTurns: options.caps?.maxTurns ?? 12,
    };
  }

  async execute(
    request: ModelCallRequest,
    provider: ModelProvider,
  ): Promise<{
    output: string;
    route: { tier: ModelTier; model: string; snapshot: string; reason: string };
    usageUnavailable: boolean;
  }> {
    const turn = (this.turns.get(request.taskId) ?? 0) + 1;
    if (turn > this.caps.maxTurns) throw new Error('Model turn cap exceeded');
    if (this.options.budget && request.estimatedCost === undefined) {
      throw new Error('Budgeted model calls require an estimated cost');
    }
    const preflight = this.options.budget?.preflight(
      request.taskId,
      request.accountId,
      request.estimatedCost ?? 0,
      { allowOverage: this.options.authorizeOverage?.(request) ?? false },
    );
    if (preflight?.status === 'blocked') throw new Error('Budget exhausted; call blocked');
    if (preflight?.status === 'authority_required')
      throw new Error('Budget authority required before call');
    this.turns.set(request.taskId, turn);
    this.assertCircuitClosed();
    const route = await this.selectRoute(request.riskSignals ?? []);
    const started = Date.now();
    let lastError: unknown;
    for (let attempt = 0; attempt < this.retry.maxAttempts; attempt++) {
      try {
        const response = await this.withTimeout(
          provider.complete({
            model: route.model,
            snapshot: route.snapshot,
            prompt: request.prompt,
            timeoutMs: this.caps.timeoutMs,
          }),
        );
        this.circuit.failures = 0;
        this.circuit.openedAt = undefined;
        this.options.budget?.record(
          request.taskId,
          request.accountId,
          response.usage?.cost ?? request.estimatedCost ?? 0,
        );
        this.options.telemetry?.({
          task_id: request.taskId,
          account_id: request.accountId,
          tier: route.tier,
          model: route.model,
          snapshot: route.snapshot,
          reason: route.reason,
          retry_count: attempt,
          latency_ms: Date.now() - started,
          usage_unavailable: response.usage === undefined,
          input_tokens: response.usage?.inputTokens,
          output_tokens: response.usage?.outputTokens,
          cached_tokens: response.usage?.cachedTokens,
          estimated_cost: response.usage?.cost ?? request.estimatedCost,
        });
        return {
          output: response.output.slice(0, this.caps.maxOutputChars),
          route,
          usageUnavailable: response.usage === undefined,
        };
      } catch (error) {
        lastError = error;
        if (attempt + 1 < this.retry.maxAttempts && this.retry.baseDelayMs > 0)
          await new Promise((resolve) =>
            setTimeout(resolve, this.retry.baseDelayMs * (attempt + 1)),
          );
      }
    }
    this.circuit.failures++;
    if (this.circuit.failures >= this.circuitPolicy.failureThreshold)
      this.circuit.openedAt = Date.now();
    throw lastError instanceof Error ? lastError : new Error('Model call failed');
  }

  private async selectRoute(
    riskSignals: string[],
  ): Promise<{ tier: ModelTier; model: string; snapshot: string; reason: string }> {
    const tier: ModelTier = riskSignals.some((signal) =>
      /security|public-api|schema|concurrency/i.test(signal),
    )
      ? 'expert'
      : riskSignals.length > 0
        ? 'builder'
        : 'scout';
    const capabilities = await (this.capabilities ??= this.options.probe.probe());
    const capability = capabilities.find((candidate) => candidate.tiers.includes(tier));
    if (!capability) throw new Error(`No capable model available for ${tier}`);
    return {
      tier,
      model: capability.id,
      snapshot: capability.snapshot,
      reason: riskSignals.length ? `risk:${riskSignals.join(',')}` : 'default-low-risk',
    };
  }

  private assertCircuitClosed(): void {
    if (this.circuit.openedAt === undefined) return;
    if (Date.now() - this.circuit.openedAt >= this.circuitPolicy.resetAfterMs) {
      this.circuit.failures = 0;
      this.circuit.openedAt = undefined;
      return;
    }
    throw new Error('Model circuit is open');
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Model call timed out')), this.caps.timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
