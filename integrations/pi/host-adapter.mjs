/**
 * Optional Pi host bridge. Imports canonical gateways; never registers itself.
 * Host callbacks and SDK code are trusted. This is not an OS permission sandbox.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync as resolveRealPath } from 'node:fs';
import { ModelCallGateway, BudgetLedger } from '../../mcp/build/runtime/model-call-gateway.js';
import { ToolExecutionGateway } from '../../mcp/build/runtime/tool-execution-gateway.js';
import { LifecycleCoordinator } from '../../mcp/build/runtime/lifecycle-coordinator.js';
import { TrajectoryLedger } from '../../mcp/build/runtime/trajectory-ledger.js';
import { ExecutionContainment, loadRuntimeTrustContext } from '../../mcp/build/runtime/execution-containment.js';
import { ProcessPolicyEvaluator } from '../../mcp/build/middleware/guardrail.js';
import { loadPinnedPiAgent } from './adapter.mjs';
import { PiHostError, assertCurrentBinding, buildTaskContext, digest, fail, hash64, safeId, snapshotJson } from './contracts.mjs';
import { createReceiptBook, PiTransportError } from './receipts.mjs';

const CAPABILITIES = Object.freeze({ operations: Object.freeze({ start: true, interrupt: true, resume: false, fork: false, steer: false, checkpoint: false }), precompact: 'unsupported' });
const EMPTY_USAGE = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }) });
function limit(value, fallback, ceiling) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > ceiling) fail('pi_invalid_limits');
  return selected;
}
function safeError(error) { return error instanceof PiHostError ? error : new PiHostError('pi_host_execution_failed'); }
function completedStream(message) {
  return { async *[Symbol.asyncIterator]() { yield { type: 'done', reason: message.stopReason, message }; }, async result() { return message; } };
}

export function createPiHostAdapter(options = {}) {
  let consumed = false; let closed = false; let state = null; let completion;
  let coordinator; let agent; let termination; let cancelPromise;
  let resolveCancellation; const cancelled = new Promise((resolve) => { resolveCancellation = resolve; });
  let config; let packet; let startedAt = 0; let deadlineTimer; let unsubscribe;
  let modelCalls = 0; let toolCalls = 0; let outputBytes = 0; let output = '';
  let setupSettled = false; let sdkSettled = false;
  const receipts = createReceiptBook(); const seenToolIds = new Set(); const admittedToolIds = new Set();
  const undispatchedReservations = new Map();

  function checkDeadline() {
    if (termination) throw termination;
    if (closed) fail('pi_adapter_consumed');
    if (performance.now() - startedAt >= config.limits.timeoutMs) {
      requestStop('pi_timeout'); throw termination;
    }
  }
  async function checkCurrent() {
    checkDeadline();
    const current = snapshotJson(await config.readBinding());
    assertCurrentBinding(current, config.binding);
    const trust = loadRuntimeTrustContext({ FORGEWRIGHT_WORKSPACE: config.workspace,
      FORGEWRIGHT_RUNTIME_MODE: 'local', FORGEWRIGHT_CALLER_ID: config.binding.sessionId });
    if (trust.policyDigest !== config.binding.policyHash) fail('pi_stale_binding');
    checkDeadline();
  }
  function requestStop(code) {
    if (!state || closed || termination) return cancelPromise ?? Promise.resolve();
    termination = new PiHostError(code);
    // Release only reservations whose dispatch can still be synchronously
    // revoked; do not wait for a hung host binding callback to settle.
    for (const release of [...undispatchedReservations.values()]) {
      try { release(); } catch { state.budgetReconciliationRequired = true; }
    }
    // Admission closes immediately. Canonical cancellation is persisted before
    // propagating its signal. This promise does not wait for a remote provider.
    cancelPromise = (async () => {
      try { if (coordinator) await coordinator.cancel(coordinator.rootScopeId, code); }
      catch { /* Finalization retains unresolved state; never erase the original failure. */ }
      try { agent?.abort(); } catch { /* Not proof of remote shutdown. */ }
      resolveCancellation();
    })();
    return cancelPromise;
  }
  function result(includeOutput = true) {
    if (!state) return null;
    return Object.freeze({ ...state, modelCalls, toolCalls, inputBytes: packet.inputBytes, outputBytes,
      ...(includeOutput ? { output } : {}), completionState: 'unverified' });
  }

  function snapshotConfig(input) {
    const limits = Object.freeze({ inputBytes: limit(options.limits?.inputBytes, 16384, 65536), outputBytes: limit(options.limits?.outputBytes, 16384, 65536),
      modelCalls: limit(options.limits?.modelCalls, 1, 4), toolCalls: limit(options.limits?.toolCalls, 8, 16),
      timeoutMs: limit(options.limits?.timeoutMs, 60000, 120000), cleanupMs: limit(options.limits?.cleanupMs, 500, 5000),
      outputTokens: limit(options.limits?.outputTokens, 2048, 8192) });
    const nextPacket = buildTaskContext(input, options.systemPrompt, options.references ?? [], limits.inputBytes);
    const binding = snapshotJson(options.binding);
    assertCurrentBinding(binding, binding);
    if (binding.taskId !== nextPacket.task.taskId) fail('pi_stale_binding');
    const model = snapshotJson(options.model);
    if (!safeId(model?.id) || !safeId(model?.provider) || !hash64(model?.snapshotSha256) ||
        typeof options.readBinding !== 'function' || typeof options.probe !== 'function' ||
        typeof options.transport?.complete !== 'function' || options.transport.retryPolicy !== 'none' ||
        !['fixture', 'provider-native'].includes(options.transport.evidenceTier) ||
        !(options.budget instanceof BudgetLedger) || !safeId(options.accountId) || !Number.isFinite(options.maxCostPerAttempt) || options.maxCostPerAttempt <= 0 ||
        typeof options.authorizeTool !== 'function' || typeof options.workspace !== 'string') fail('pi_host_configuration_required');
    const workspace = resolveRealPath(options.workspace);
    if (process.env.FORGEWRIGHT_RUNTIME_MODE === 'production' || options.production === true) fail('pi_production_activation_unavailable');
    if (process.env.FORGEWRIGHT_WORKSPACE && resolveRealPath(process.env.FORGEWRIGHT_WORKSPACE) !== workspace) fail('pi_workspace_environment_mismatch');
    const registry = new Map();
    if (!Array.isArray(options.tools ?? []) || (options.tools ?? []).length > 16) fail('pi_invalid_tool_registry');
    for (const tool of options.tools ?? []) {
      if (!safeId(tool?.name) || registry.has(tool.name) || typeof tool.description !== 'string' ||
          !tool.description.trim() || typeof tool.execute !== 'function') fail('pi_invalid_tool_registry');
      registry.set(tool.name, Object.freeze({ name: tool.name, description: tool.description,
        parameters: snapshotJson(tool.parameters, 8192), execute: tool.execute }));
    }
    const transport = Object.freeze({ complete: options.transport.complete.bind(options.transport), evidenceTier: options.transport.evidenceTier });
    if (transport.evidenceTier === 'provider-native' && options.policyEvaluator) fail('pi_fixture_policy_in_live_host');
    return { packet: nextPacket, config: Object.freeze({ limits, binding, model, workspace, registry, transport,
      readBinding: options.readBinding, probe: options.probe, authorizeTool: options.authorizeTool,
      budget: options.budget, maxCostPerAttempt: options.maxCostPerAttempt,
      policyEvaluator: options.policyEvaluator ?? new ProcessPolicyEvaluator({ cwd: workspace,
        policyFile: join(workspace, '.forgewright/execution-policy.yaml'),
        scriptPath: fileURLToPath(new URL('../../scripts/lite/policy-check.sh', import.meta.url)) }),
      accountId: options.accountId }) };
  }

  async function executeRun() {
    await checkCurrent();
    const trust = loadRuntimeTrustContext({ FORGEWRIGHT_WORKSPACE: config.workspace, FORGEWRIGHT_RUNTIME_MODE: 'local', FORGEWRIGHT_CALLER_ID: config.binding.sessionId });
    if (trust.policyDigest !== config.binding.policyHash) fail('pi_stale_binding');
    const containment = new ExecutionContainment(trust);
    // New session-owned ledger only. No shared running coordinator is adopted.
    const ledger = new TrajectoryLedger({ root: join(config.workspace, '.forgewright/runtime/pi-host', state.sessionId), ledgerId: 'pi-trajectory' });
    coordinator = await LifecycleCoordinator.open({ ledger, rootScopeId: 'pi-root', workspaceId: config.binding.workspaceId,
      sessionId: config.binding.sessionId, origin: 'pi-host', writerEpoch: 1, objectiveDigest: packet.digest });
    setupSettled = true;
    if (termination) { await coordinator.cancel(coordinator.rootScopeId, termination.code); throw termination; }
    await checkCurrent();
    const tools = new ToolExecutionGateway({ lifecycle: coordinator, containment, policyEvaluator: config.policyEvaluator,
      authorize: async (name, args) => {
        await checkCurrent();
        const approved = await config.authorizeTool(name, args, config.binding);
        await checkCurrent();
        return approved === true;
      } });
    const gateway = new ModelCallGateway({
      // Budget is intentionally held by the canonical BudgetLedger outside the
      // buffered gateway. A timeout/missing price must not free uncertain spend.
      probe: { probe: async () => {
        await checkCurrent();
        const advertised = snapshotJson(await config.probe());
        const found = Array.isArray(advertised) && advertised.find((item) => item.id === config.model.id && item.provider === config.model.provider && item.snapshotSha256 === config.model.snapshotSha256);
        if (!found) fail('pi_model_unavailable');
        await checkCurrent();
        return [{ id: found.id, snapshot: found.snapshotSha256, tiers: ['scout', 'builder', 'expert'] }];
      } }, retry: { maxAttempts: 1, baseDelayMs: 0 }, caps: { timeoutMs: config.limits.timeoutMs, maxTurns: config.limits.modelCalls, maxOutputChars: 65536 } });

    const Agent = await loadPinnedPiAgent();
    await checkCurrent();
    const sdkModel = { id: config.model.id, provider: config.model.provider, api: 'forgewright-host', name: config.model.id, baseUrl: '',
      reasoning: false, input: ['text'], contextWindow: 65536, maxTokens: config.limits.outputTokens, cost: EMPTY_USAGE.cost };
    agent = new Agent({ initialState: { model: sdkModel, systemPrompt: packet.systemPrompt, messages: [],
      tools: [...config.registry.values()].map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters,
        execute: async (callId, arguments_, sdkSignal) => {
          try {
            await checkCurrent();
            if (!admittedToolIds.delete(callId) || sdkSignal?.aborted) fail('pi_tool_admission_closed');
            if (toolCalls >= config.limits.toolCalls) fail('pi_tool_budget_exceeded');
            const args = snapshotJson(arguments_, config.limits.inputBytes);
            // Closure binds exact canonical scope/session/turn, never model fields.
            const answer = await tools.execute({ name: tool.name, arguments: args, sessionId: config.binding.sessionId, turnNumber: 1 }, async () => {
              await checkCurrent();
              if (sdkSignal?.aborted || coordinator.signal().aborted) fail('pi_interrupted');
              toolCalls++;
              const value = await tool.execute(args, Object.freeze({ binding: config.binding, signal: coordinator.signal(), toolCallId: callId }));
              await checkCurrent();
              return snapshotJson(value, config.limits.outputBytes);
            });
            if (answer.isError) fail('pi_tool_denied');
            await checkCurrent();
            return answer;
          } catch (error) { requestStop(safeError(error).code); throw safeError(error); }
        } })) },
      sessionId: state.sessionId, toolExecution: 'sequential',
      streamFn: async (_model, context) => {
        try {
          await checkCurrent();
          if (modelCalls >= config.limits.modelCalls) fail('pi_model_budget_exceeded');
          const attemptId = `pi-attempt-${++modelCalls}`;
          // Pi tool-result messages carry optional details/usage properties even
          // when undefined. Project only model-visible message fields instead of
          // serializing SDK state, synthetic counters or internal metadata.
          const messages = context.messages.map((message) => {
            if (message.role === 'user' || message.role === 'assistant') return { role: message.role, content: message.content };
            if (message.role === 'toolResult') return { role: message.role, toolCallId: message.toolCallId,
              toolName: message.toolName, content: message.content, isError: message.isError === true };
            fail('pi_invalid_model_context');
          });
          const modelContext = snapshotJson({ systemPrompt: context.systemPrompt, messages,
            tools: [...config.registry.values()].map(({ name, description, parameters }) => ({ name, description, parameters })) }, config.limits.inputBytes);
          let acceptedMessage;
          await gateway.execute({ taskId: config.binding.taskId, accountId: config.accountId, prompt: JSON.stringify(modelContext) }, {
            complete: async (request) => {
              await checkCurrent();
              if (request.model !== config.model.id || request.snapshot !== config.model.snapshotSha256) fail('pi_route_mismatch');
              const reservation = config.budget.reserve(config.binding.taskId, config.accountId, config.maxCostPerAttempt);
              if (!reservation.reservation || ['blocked', 'authority_required'].includes(reservation.status)) fail('pi_budget_denied');
              const attemptStart = performance.now();
              let dispatched = false; let dispatchAllowed = true; let receiptStarted = false; let released = false;
              const releaseUndispatched = () => {
                if (dispatched || released) return;
                dispatchAllowed = false; released = true;
                undispatchedReservations.delete(attemptId);
                config.budget.release(reservation.reservation);
                if (receiptStarted) receipts.settle(attemptId, { nativeUsage: null, evidenceTier: 'unavailable',
                  status: termination ? 'cancelled' : 'failed', latencyMs: performance.now() - attemptStart });
              };
              try {
                receipts.begin({ ...config.binding, accountId: config.accountId, attemptId, provider: config.model.provider, model: config.model.id, snapshotSha256: config.model.snapshotSha256 });
                receiptStarted = true;
                undispatchedReservations.set(attemptId, releaseUndispatched);
                return await coordinator.runOperation({ operationId: attemptId, scopeId: coordinator.rootScopeId, operationType: 'model_call', inputDigest: digest(request.prompt) }, async (signal) => {
                  let observation = null; let settlementStatus = 'failed';
                  try {
                    await checkCurrent();
                    // No await between this admission check and invoking transport.
                    // A late lifecycle callback cannot spend released escrow.
                    if (!dispatchAllowed || signal.aborted) fail('pi_interrupted');
                    dispatched = true;
                    undispatchedReservations.delete(attemptId);
                    observation = await config.transport.complete(Object.freeze({ model: config.model, context: modelContext, binding: config.binding,
                      accountId: config.accountId, attemptId, signal, maxAttempts: 1, maxOutputTokens: config.limits.outputTokens, timeoutMs: Math.max(1, Math.floor(config.limits.timeoutMs - (performance.now() - startedAt))) }));
                    if (signal.aborted || termination) { settlementStatus = 'cancelled'; fail('pi_interrupted'); }
                    await checkCurrent();
                    const message = snapshotJson(observation?.message, config.limits.outputBytes);
                    if (!message || typeof message.text !== 'string' || !Array.isArray(message.toolCalls) ||
                        Object.keys(message).some((key) => !['text', 'toolCalls'].includes(key)) || message.toolCalls.length > config.limits.toolCalls) fail('pi_invalid_model_message');
                    const pending = new Set();
                    for (const call of message.toolCalls) {
                      if (!call || !safeId(call.id) || !config.registry.has(call.name) || !call.arguments || Array.isArray(call.arguments) ||
                          typeof call.arguments !== 'object' || Object.keys(call).some((key) => !['id', 'name', 'arguments'].includes(key))) fail('pi_unknown_or_invalid_tool');
                      if (pending.has(call.id) || seenToolIds.has(call.id)) fail('pi_duplicate_tool_call');
                      pending.add(call.id);
                    }
                    for (const id of pending) { seenToolIds.add(id); admittedToolIds.add(id); }
                    acceptedMessage = message; settlementStatus = 'completed';
                    return { output: JSON.stringify(message) };
                  } catch (error) {
                    if (error instanceof PiTransportError) observation = { nativeUsage: error.nativeUsage };
                    throw error;
                  } finally {
                    if (dispatched) {
                      const receipt = receipts.settle(attemptId, { nativeUsage: observation?.nativeUsage ?? null, evidenceTier: config.transport.evidenceTier,
                        status: signal.aborted || termination ? 'cancelled' : settlementStatus, latencyMs: performance.now() - attemptStart });
                      // Dispatch may have incurred cost even when its caller timed out.
                      // Only a trusted native receipt can settle uncertain spend.
                      if (receipt.costBasis === 'provider-reported') config.budget.settle(reservation.reservation, receipt.usage.costUsd);
                    }
                  }
                });
              } finally {
                dispatchAllowed = false;
                releaseUndispatched();
              }
            },
          });
          await checkCurrent();
          if (!acceptedMessage) fail('pi_invalid_model_message');
          const content = [...(acceptedMessage.text ? [{ type: 'text', text: acceptedMessage.text }] : []),
            ...acceptedMessage.toolCalls.map((call) => ({ type: 'toolCall', ...call }))];
          return completedStream({ role: 'assistant', model: config.model.id, provider: config.model.provider, api: sdkModel.api,
            content, stopReason: acceptedMessage.toolCalls.length ? 'toolUse' : 'stop', timestamp: Date.now(), usage: EMPTY_USAGE });
        } catch (error) { requestStop(safeError(error).code); throw safeError(error); }
      },
    });
    unsubscribe = agent.subscribe((event) => {
      if (closed || termination || event.type !== 'message_end' || event.message?.role !== 'assistant') return;
      if (performance.now() - startedAt >= config.limits.timeoutMs) { requestStop('pi_timeout'); return; }
      if (['error', 'aborted'].includes(event.message.stopReason)) { requestStop('pi_host_execution_failed'); return; }
      for (const part of event.message.content ?? []) {
        if (part.type !== 'text') continue;
        const bytes = Buffer.byteLength(part.text);
        if (outputBytes + bytes > config.limits.outputBytes) { requestStop('pi_output_budget_exceeded'); return; }
        output += part.text; outputBytes += bytes;
      }
    });
    await coordinator.runOperation({ operationId: 'pi-sdk-loop', scopeId: coordinator.rootScopeId, operationType: 'pi_sdk_loop', inputDigest: packet.digest }, async () => {
      try { await agent.prompt(packet.prompt); await checkCurrent(); if (agent.state.errorMessage) fail('pi_host_execution_failed'); }
      finally { sdkSettled = true; }
      return { outputDigest: digest(output) };
    });
  }

  async function runToSettlement() {
    deadlineTimer = setTimeout(() => requestStop('pi_timeout'), config.limits.timeoutMs);
    const execution = executeRun().then(() => ({ ok: true }), (error) => ({ ok: false, error: safeError(error) }));
    let outcome;
    try {
      const completed = await Promise.race([execution, cancelled.then(() => ({ ok: false, error: termination }))]);
      if (!completed.ok) throw completed.error;
      checkDeadline(); outcome = 'completed'; state.executionState = 'finished';
    } catch (error) {
      const safe = termination ?? safeError(error);
      await requestStop(safe.code);
      outcome = safe.code === 'pi_interrupted' || safe.code === 'pi_timeout' ? 'cancelled' : 'failed';
      state.executionState = safe.code === 'pi_timeout' ? 'timed_out' : safe.code === 'pi_interrupted' ? 'interrupted' : 'failed';
      state.errorCode = safe.code; output = ''; outputBytes = 0;
    } finally {
      clearTimeout(deadlineTimer); closed = true;
      try { unsubscribe?.(); } catch { /* Never replace execution failure. */ }
      try {
        if (coordinator) {
          // The shared coordinator uses unref'ed cleanup timers because its
          // normal host is long-lived. This bounded adapter owns a referenced
          // outer fence so a pending approval cannot let Node exit mid-finalize.
          let cleanupTimer;
          let finalization;
          try {
            finalization = await Promise.race([
              coordinator.finalize({ timeoutMs: config.limits.cleanupMs, outcome: outcome ?? 'failed', reasonCode: 'pi_host_settlement' }),
              new Promise((resolve) => { cleanupTimer = setTimeout(() => resolve(null), config.limits.cleanupMs + 1000); }),
            ]);
          } finally { clearTimeout(cleanupTimer); }
          state.quiescence = finalization?.quiescence ?? 'not_confirmed';
          state.cleanupState = finalization?.status ?? 'timed_out';
          state.unresolvedOperations = finalization?.unresolvedOperationCount ?? 1;
        } else { state.quiescence = setupSettled && sdkSettled ? 'confirmed' : 'not_confirmed'; state.cleanupState = 'not_started'; }
      } catch { state.quiescence = 'not_confirmed'; state.cleanupState = 'failed'; }
      state.durationMs = Math.round(performance.now() - startedAt);
    }
    return result();
  }

  return Object.freeze({ schema: 'forgewright-harness-adapter/v1', mode: 'native-host-loop', capabilities: CAPABILITIES,
    async start(input) {
      if (options.enabled !== true) fail('pi_disabled');
      if (consumed) fail('pi_adapter_consumed');
      const snapshot = snapshotConfig(input); config = snapshot.config; packet = snapshot.packet;
      consumed = true; startedAt = performance.now();
      state = { sessionId: randomUUID(), taskId: packet.task.taskId, executionState: 'running', completionState: 'unverified', quiescence: 'not_confirmed',
        cleanupState: 'pending', unresolvedOperations: 0, durationMs: null, errorCode: null };
      completion = runToSettlement();
      return Object.freeze({ sessionId: state.sessionId });
    },
    async wait(sessionId) { if (!state || sessionId !== state.sessionId) fail('pi_unknown_session'); return completion; },
    async interrupt() { await requestStop('pi_interrupted'); },
    getResult() { return result(); },
    getTelemetry() { return result(false); },
    getReceipts() { return receipts.snapshot(); },
  });
}
