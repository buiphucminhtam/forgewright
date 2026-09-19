/** Strict host/task contracts for the optional Pi integration. No I/O or activation. */
import { createHash } from 'node:crypto';

export class PiHostError extends Error {
  constructor(code) { super(code); this.name = 'PiHostError'; this.code = code; }
}
export const digest = (text) => createHash('sha256').update(text).digest('hex');
export const safeId = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
export const hash64 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const fail = (code) => { throw new PiHostError(code); };

/** Snapshot plain, dense JSON without invoking getters, symbols or toJSON. */
export function snapshotJson(value, maxBytes = 65536) {
  let nodes = 0; let bytes = 0; const active = new Set();
  function visit(item, depth) {
    if (++nodes > 8192 || depth > 20) fail('pi_invalid_json');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('pi_invalid_json'); return item; }
    if (typeof item === 'string') { bytes += Buffer.byteLength(item); if (bytes > maxBytes) fail('pi_input_budget_exceeded'); return item; }
    if (!item || typeof item !== 'object' || active.has(item)) fail('pi_invalid_json');
    const proto = Object.getPrototypeOf(item);
    if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) fail('pi_invalid_json');
    active.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string')) fail('pi_invalid_json');
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if ('get' in descriptor || 'set' in descriptor || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('pi_invalid_json');
        bytes += Buffer.byteLength(key);
      }
      if (bytes > maxBytes) fail('pi_input_budget_exceeded');
      if (Array.isArray(item)) {
        if (item.length > 1024 || Object.keys(item).length !== item.length) fail('pi_invalid_json');
        const copy = [];
        for (let index = 0; index < item.length; index++) {
          if (!Object.hasOwn(descriptors, index)) fail('pi_invalid_json');
          copy.push(visit(descriptors[index].value, depth + 1));
        }
        return Object.freeze(copy);
      }
      if (Object.keys(descriptors).length > 256) fail('pi_invalid_json');
      const copy = {};
      for (const key of Object.keys(descriptors).sort()) copy[key] = visit(descriptors[key].value, depth + 1);
      return Object.freeze(copy);
    } finally { active.delete(item); }
  }
  const copy = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(copy)) > maxBytes) fail('pi_input_budget_exceeded');
  return copy;
}

export function buildTaskContext(input, systemPrompt, references = [], maxBytes = 16384) {
  // Validate array density before the generic JSON copy to retain the task error contract.
  const acDescriptor = input && typeof input === 'object' && Object.getOwnPropertyDescriptor(input, 'acceptance');
  if (!acDescriptor || !Object.hasOwn(acDescriptor, 'value') || !Array.isArray(acDescriptor.value)) fail('pi_invalid_task');
  const criteria = acDescriptor.value;
  if (criteria.length < 1 || criteria.length > 64) fail('pi_invalid_task');
  for (let i = 0; i < criteria.length; i++) {
    const d = Object.getOwnPropertyDescriptor(criteria, String(i));
    if (!d || typeof d.value !== 'string' || !d.value.trim()) fail('pi_invalid_task');
  }
  const task = snapshotJson(input, 65536);
  if (!task || Array.isArray(task) || Object.keys(task).some((k) => !['taskId', 'objective', 'acceptance', 'context'].includes(k)) ||
      !safeId(task.taskId) || typeof task.objective !== 'string' || !task.objective.trim() ||
      (task.context !== undefined && typeof task.context !== 'string')) fail('pi_invalid_task');
  if (typeof systemPrompt !== 'string' || !systemPrompt.trim()) fail('pi_host_configuration_required');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 65536) fail('pi_invalid_limits');
  const refs = snapshotJson(references);
  if (!Array.isArray(refs) || refs.length > 32) fail('pi_invalid_context_reference');
  for (const ref of refs) {
    if (!ref || Object.keys(ref).length !== 2 || typeof ref.ref !== 'string' ||
        !/^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/.test(ref.ref) ||
        ref.ref.split('/').some((part) => part === '.' || part === '..') || !hash64(ref.sha256)) fail('pi_invalid_context_reference');
  }
  const prompt = JSON.stringify({ task, references: refs });
  const inputBytes = Buffer.byteLength(systemPrompt) + Buffer.byteLength(prompt);
  if (inputBytes > maxBytes) fail('pi_input_budget_exceeded');
  return Object.freeze({ task, systemPrompt, references: refs, prompt, inputBytes, tokenCount: null, digest: digest(systemPrompt + '\n' + prompt) });
}

const BINDING_KEYS = ['workspaceId', 'sessionId', 'taskId', 'turnId', 'treeSha', 'policyHash', 'capabilityHash', 'issuedAtMs', 'expiresAtMs'];
export function assertCurrentBinding(current, expected, now = Date.now()) {
  if (!current || !expected || !Number.isFinite(now)) fail('pi_stale_binding');
  for (const field of BINDING_KEYS) if (current[field] !== expected[field]) fail('pi_stale_binding');
  for (const field of ['workspaceId', 'sessionId', 'taskId', 'turnId']) if (!safeId(current[field])) fail('pi_stale_binding');
  if (!/^TREE:[a-f0-9]{64}$/.test(current.treeSha) || !hash64(current.policyHash) || !hash64(current.capabilityHash) ||
      !Number.isSafeInteger(current.issuedAtMs) || !Number.isSafeInteger(current.expiresAtMs) ||
      current.issuedAtMs > now || current.expiresAtMs <= now || current.issuedAtMs >= current.expiresAtMs) fail('pi_stale_binding');
}
