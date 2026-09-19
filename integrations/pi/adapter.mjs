/**
 * Opt-in, analysis-only Pi pilot. This is NOT registered on the canonical path.
 * The host owns model selection, credentials, policy, and completion evidence.
 */
import { randomUUID } from 'node:crypto';

export const PI_SOURCE_VERSION = '0.85.1';
export const PI_MIN_NODE = '22.19.0';
const HARD_LIMITS = Object.freeze({ inputBytes: 65536, outputBytes: 65536, modelCalls: 4, timeoutMs: 120000 });
const CAPABILITIES = Object.freeze({
  operations: Object.freeze({ start: true, resume: false, fork: false, steer: false, interrupt: true, checkpoint: false }),
  precompact: 'unsupported',
});

export class PiWorkerError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PiWorkerError';
    this.code = code;
  }
}

export function supportsPiNode(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return false;
  const [major, minor] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 19);
}

/** Lazy and optional: disabled workers never import Pi or inspect credentials. */
export async function loadPinnedPiAgent() {
  if (!supportsPiNode(process.versions.node)) throw new PiWorkerError('pi_node_unsupported');
  try {
    const metadata = await import('@earendil-works/pi-agent-core/package.json', { with: { type: 'json' } });
    if (metadata.default.version !== PI_SOURCE_VERSION) throw new PiWorkerError('pi_version_mismatch');
    const sdk = await import('@earendil-works/pi-agent-core');
    if (typeof sdk.Agent !== 'function') throw new PiWorkerError('pi_agent_export_missing');
    return sdk.Agent;
  } catch (error) {
    if (error instanceof PiWorkerError) throw error;
    throw new PiWorkerError('pi_runtime_unavailable');
  }
}

function bounded(value, fallback, maximum) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    throw new PiWorkerError('pi_invalid_limits');
  }
  return selected;
}

function validAcceptance(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 64) return false;
  // Array#some skips holes; every AC must be an explicit non-empty string.
  for (let index = 0; index < items.length; index += 1) {
    if (!Object.hasOwn(items, index) || typeof items[index] !== 'string' || !items[index].trim()) return false;
  }
  return true;
}

function validateTask(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PiWorkerError('pi_invalid_task');
  const allowed = new Set(['taskId', 'objective', 'acceptance', 'context']);
  if (Object.keys(input).some((key) => !allowed.has(key)) ||
      typeof input.taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.taskId) ||
      typeof input.objective !== 'string' || !input.objective.trim() ||
      !validAcceptance(input.acceptance) ||
      (input.context !== undefined && typeof input.context !== 'string')) {
    throw new PiWorkerError('pi_invalid_task');
  }
  return { taskId: input.taskId, objective: input.objective, acceptance: [...input.acceptance], context: input.context ?? '' };
}

/**
 * Configuration and loadAgent are TRUSTED host dependencies, never task fields.
 * loadAgent injection is for offline conformance tests, not provider certification.
 * start() waits for the bounded analysis attempt; getResult() reads its outcome.
 * No tool, shell, MCP client, scheduler, durable store, or provider is auto-loaded.
 */
export function createPiWorkerAdapter(config = {}) {
  const enabled = config.enabled === true;
  const limits = Object.freeze({
    inputBytes: bounded(config.limits?.inputBytes, 16384, HARD_LIMITS.inputBytes),
    outputBytes: bounded(config.limits?.outputBytes, 16384, HARD_LIMITS.outputBytes),
    modelCalls: bounded(config.limits?.modelCalls, 1, HARD_LIMITS.modelCalls),
    timeoutMs: bounded(config.limits?.timeoutMs, 60000, HARD_LIMITS.timeoutMs),
  });
  const loadAgent = config.loadAgent ?? loadPinnedPiAgent;
  const systemPrompt = config.systemPrompt;
  const model = config.model;
  const streamFn = config.streamFn;
  let consumed = false;
  let running = false;
  let settled = false;
  let agent;
  let unsubscribe;
  let interruption;
  let rejectInterruption;
  let result = null;
  let output = '';
  let outputBytes = 0;
  let modelCalls = 0;
  let startedAt = 0;

  function stop(code) {
    if (!running || interruption) return;
    interruption = new PiWorkerError(code);
    // An abort request is not proof that the SDK/provider has stopped.
    try { agent?.abort(); } catch { /* Preserve not_confirmed quiescence. */ }
    rejectInterruption?.(interruption);
  }

  function snapshot(includeOutput) {
    if (!result) return null;
    return {
      ...result,
      modelCalls,
      outputBytes,
      quiescence: settled ? 'confirmed' : 'not_confirmed',
      ...(includeOutput ? { output } : {}),
    };
  }

  return Object.freeze({
    schema: 'forgewright-harness-adapter/v1',
    mode: 'native-host-loop',
    capabilities: CAPABILITIES,
    async start(input) {
      if (!enabled) throw new PiWorkerError('pi_disabled');
      if (consumed) throw new PiWorkerError('pi_adapter_consumed');
      const task = validateTask(input);
      if (typeof systemPrompt !== 'string' || !systemPrompt.trim() ||
          !model || typeof model !== 'object' || typeof streamFn !== 'function' || typeof loadAgent !== 'function') {
        throw new PiWorkerError('pi_host_configuration_required');
      }
      const prompt = JSON.stringify(task);
      const inputBytes = Buffer.byteLength(systemPrompt) + Buffer.byteLength(prompt);
      if (inputBytes > limits.inputBytes) throw new PiWorkerError('pi_input_budget_exceeded');
      consumed = true;
      running = true;
      startedAt = performance.now();
      const sessionId = randomUUID();
      result = {
        sessionId, taskId: task.taskId, execution_state: 'running', completion_state: 'unverified',
        inputBytes, durationMs: null, usage: null, usage_basis: 'unavailable',
        sdk_version_candidate: PI_SOURCE_VERSION, error_code: null,
      };
      const cancelled = new Promise((_, reject) => { rejectInterruption = reject; });
      const timer = setTimeout(() => stop('pi_timeout'), limits.timeoutMs);
      const execution = (async () => {
        const Agent = await loadAgent();
        if (interruption) throw interruption;
        agent = new Agent({
          initialState: { systemPrompt, model, messages: [], tools: [] },
          sessionId,
          toolExecution: 'sequential',
          beforeToolCall: async () => ({ block: true, reason: 'pi_pilot_tools_disabled', terminate: true }),
          streamFn: (...args) => {
            if (interruption) throw interruption;
            // Retained SDK callbacks lose admission when this attempt closes.
            if (!running || settled) throw new PiWorkerError('pi_adapter_consumed');
            if (modelCalls >= limits.modelCalls) {
              stop('pi_model_budget_exceeded');
              throw interruption;
            }
            modelCalls += 1;
            return streamFn(...args);
          },
        });
        if (interruption) { agent.abort(); throw interruption; }
        unsubscribe = agent.subscribe((event) => {
          if (!running || settled || interruption || event?.type !== 'message_end' || event.message?.role !== 'assistant') return;
          if (['error', 'aborted'].includes(event.message.stopReason)) {
            stop(event.message.stopReason === 'aborted' ? 'pi_interrupted' : 'pi_execution_failed');
            return;
          }
          for (const part of event.message.content ?? []) {
            if (part.type !== 'text' || typeof part.text !== 'string') continue;
            const bytes = Buffer.byteLength(part.text);
            if (outputBytes + bytes > limits.outputBytes) { stop('pi_output_budget_exceeded'); return; }
            output += part.text;
            outputBytes += bytes;
          }
        });
        await agent.prompt(prompt);
        if (interruption) throw interruption;
        if (agent.state?.errorMessage) throw new PiWorkerError('pi_execution_failed');
      })();
      const tracked = execution.then(
        (value) => { settled = true; return value; },
        (error) => { settled = true; throw error; },
      );
      try {
        await Promise.race([tracked, cancelled]);
        result.execution_state = 'finished';
        return { sessionId };
      } catch (error) {
        const safe = error instanceof PiWorkerError ? error : new PiWorkerError('pi_execution_failed');
        result.error_code = safe.code;
        result.execution_state = safe.code === 'pi_timeout' ? 'timed_out' : safe.code === 'pi_interrupted' ? 'interrupted' : 'failed';
        throw safe;
      } finally {
        clearTimeout(timer);
        running = false;
        rejectInterruption = undefined;
        try { unsubscribe?.(); } catch { /* Do not mask the original outcome. */ }
        result.durationMs = Math.round(performance.now() - startedAt);
      }
    },
    async interrupt() { stop('pi_interrupted'); },
    getResult() { return snapshot(true); },
    getTelemetry() { return snapshot(false); },
  });
}
