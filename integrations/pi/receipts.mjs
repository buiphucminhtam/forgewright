/** Attempt-bound observations. Only the trusted transport supplies native usage. */
import { PiHostError, fail, hash64, safeId, snapshotJson } from './contracts.mjs';

/** Only a trusted transport may attach an observed native receipt to failure. */
export class PiTransportError extends PiHostError {
  constructor(nativeUsage = null) {
    super('pi_provider_failed');
    this.nativeUsage = nativeUsage == null ? null : snapshotJson(nativeUsage);
  }
}

// Process-local provenance, not cryptographic identity or a persisted receipt
// authority. Serialized observations must be revalidated by their trusted host.
const issuedReceipts = new WeakSet();
const BINDING_FIELDS = new Set(['accountId', 'workspaceId', 'sessionId', 'taskId', 'turnId', 'treeSha', 'policyHash', 'capabilityHash', 'issuedAtMs', 'expiresAtMs', 'attemptId', 'provider', 'model', 'snapshotSha256']);

function normalizeUsage(raw, expected) {
  if (raw == null) return null;
  const fields = ['requestId', 'provider', 'model', 'snapshotSha256', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'costUsd'];
  const selected = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, field);
    if (descriptor && !Object.hasOwn(descriptor, 'value')) fail('pi_invalid_receipt');
    selected[field] = descriptor?.value ?? null;
  }
  if (!safeId(selected.requestId) || selected.provider !== expected.provider || selected.model !== expected.model || selected.snapshotSha256 !== expected.snapshotSha256) fail('pi_invalid_receipt');
  for (const field of ['inputTokens', 'cachedInputTokens', 'outputTokens']) {
    if (!Number.isSafeInteger(selected[field]) || selected[field] < 0) fail('pi_invalid_receipt');
  }
  if (selected.cachedInputTokens > selected.inputTokens ||
      (selected.costUsd !== null && (!Number.isFinite(selected.costUsd) || selected.costUsd < 0))) fail('pi_invalid_receipt');
  return Object.freeze({ requestId: selected.requestId, inputUncachedTokens: selected.inputTokens - selected.cachedInputTokens,
    inputCachedTokens: selected.cachedInputTokens, outputTokens: selected.outputTokens, costUsd: selected.costUsd });
}

export function createReceiptBook() {
  const attempts = new Map(); const requestIds = new Set();
  return Object.freeze({
    begin(input) {
      const binding = snapshotJson(input);
      if (Object.keys(binding).some((key) => !BINDING_FIELDS.has(key))) fail('pi_invalid_receipt');
      for (const field of ['workspaceId', 'sessionId', 'taskId', 'turnId', 'attemptId', 'provider', 'model']) if (!safeId(binding[field])) fail('pi_invalid_receipt');
      if (!hash64(binding.snapshotSha256) || (binding.accountId !== undefined && !safeId(binding.accountId))) fail('pi_invalid_receipt');
      if (attempts.has(binding.attemptId)) fail('pi_duplicate_attempt');
      const entry = Object.freeze({ ...binding, schema: 'forgewright-pi-attempt-observation/v1', status: 'pending', evidenceTier: 'unavailable', usage: null, costBasis: 'unavailable', latencyMs: null, completionState: 'unverified' });
      attempts.set(binding.attemptId, entry);
      return entry;
    },
    settle(attemptId, observation) {
      const prior = attempts.get(attemptId);
      if (!prior) fail('pi_unknown_attempt');
      if (prior.status !== 'pending') fail('pi_duplicate_receipt');
      if (!['completed', 'failed', 'cancelled'].includes(observation.status) ||
          !['provider-native', 'fixture', 'unavailable'].includes(observation.evidenceTier) ||
          !Number.isFinite(observation.latencyMs) || observation.latencyMs < 0) fail('pi_invalid_receipt');
      const usage = normalizeUsage(observation.nativeUsage, prior);
      const receiptKey = usage ? `${prior.provider}:${usage.requestId}` : null;
      if (receiptKey && requestIds.has(receiptKey)) fail('pi_duplicate_receipt');
      const record = Object.freeze({ ...prior, status: observation.status, evidenceTier: observation.evidenceTier, usage,
        costBasis: usage?.costUsd != null && observation.evidenceTier === 'provider-native' ? 'provider-reported' : 'unavailable',
        latencyMs: observation.latencyMs });
      attempts.set(attemptId, record);
      issuedReceipts.add(record);
      if (receiptKey) requestIds.add(receiptKey);
      return record;
    },
    snapshot() { return Object.freeze([...attempts.values()]); },
  });
}

/** Existing src/cli/src/bench/types.ts ProviderUsageObservation v1 projection. */
export function toProviderUsageObservation(receipt) {
  if (!issuedReceipts.has(receipt)) fail('pi_untrusted_receipt');
  const reported = receipt.evidenceTier === 'provider-native' && receipt.usage?.costUsd != null;
  return Object.freeze({ version: '1', provider: receipt.provider, model: receipt.model,
    resolved_snapshot_sha256: receipt.snapshotSha256,
    usage: Object.freeze(reported ? { status: 'reported', input_uncached_tokens: receipt.usage.inputUncachedTokens,
      input_cached_tokens: receipt.usage.inputCachedTokens, output_tokens: receipt.usage.outputTokens,
      cost_usd: receipt.usage.costUsd, latency_ms: receipt.latencyMs }
      : { status: 'unavailable', reason: receipt.evidenceTier !== 'provider-native' ? 'native_receipt_missing' : 'native_usage_or_price_missing' }),
  });
}
