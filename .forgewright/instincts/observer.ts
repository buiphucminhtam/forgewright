/**
 * Instinct Observer — Hook that fires on every tool_use event
 *
 * Captures:
 * - Tool name + arguments (hashed, not raw)
 * - Project context (language, framework, file types)
 * - Session ID, timestamp
 * - Success/failure outcome
 *
 * Performance: Designed to add < 50ms overhead to any tool call.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, statSync, realpathSync, renameSync } from 'fs';
import { resolve, dirname, relative, isAbsolute } from 'path';
import { execSync } from 'child_process';
import { getInstinctStore, resetStoreManager, type ProjectContext, type InstinctPattern } from './instinct-store.js';
import { scorePattern, calculateInitialConfidence, analyzeToolSequence, type ToolSequenceAnalysis } from './scorer.js';
import { getInstinctsConfig, type InstinctsConfig } from './instincts-config.js';

// ─── Constants ─────────────────────────────────────────────────────

export const CONTEXT_CACHE_TTL_MS = 60_000; // 1 minute cache for project context
const MAX_CONTEXT_CACHE_ENTRIES = 50;
const MAX_SESSIONS = 50;
const MAX_SESSION_HISTORY = 50;
const MAX_ID_CHARS = 256;
const MAX_ARG_BYTES = 64 * 1024; // 64 KiB UTF-8 bytes
const MAX_EVENT_BYTES = 128 * 1024; // 128 KiB UTF-8 bytes
const MAX_HEALTH_FILE_BYTES = 256 * 1024;

// ─── Types ─────────────────────────────────────────────────────────

export interface ToolCallEvent {
  toolName: string;
  arguments: Record<string, unknown>;
  sessionId: string;
  timestamp: string;
  success: boolean;
  duration?: number;         // ms
  affectedFiles?: string[];   // Files touched
}

export interface SessionState {
  sessionId: string;
  projectId: string;
  startTime: string;
  toolSequence: string[];     // Current tool sequence in this session
  toolHistory: ToolCallEvent[];
  projectContext: ProjectContext;
  lastActivity: string;
  toolCount: number;
}

export interface ObserverStats {
  eventsObserved: number;
  patternsDetected: number;
  lastEvent: string | null;
  sessionActive: boolean;
}

export interface HookHealth {
  hookId: string;
  version: string;
  state: 'registered' | 'unregistered' | 'running' | 'degraded' | 'unsupported';
  lastRun: string | null;
  counters: {
    observed: number;
    processed: number;
    failed: number;
    skipped: number;
  };
  lastSkipReason: string | null;
  lastError: string | null;
}

// ─── Health Management ─────────────────────────────────────────────

const DEFAULT_HEALTH: HookHealth = {
  hookId: 'forgewright-instinct-hook',
  version: '1.1.0',
  state: 'registered',
  lastRun: null,
  counters: {
    observed: 0,
    processed: 0,
    failed: 0,
    skipped: 0,
  },
  lastSkipReason: null,
  lastError: null,
};

const MAX_PROJECT_HEALTH_ENTRIES = 50;
const projectHealthMap = new Map<string, HookHealth>();

const ALLOWED_HEALTH_ERRORS = new Set([
  'health_write_failed',
  'store_write_failed',
  'store_save_failed',
  'observation_failed',
  'parse_failed',
  'timeout',
  'unknown_error',
  'unsupported',
  'missing_executable',
  'observer.mjs not found',
]);

const ALLOWED_SKIP_REASONS = new Set([
  'feature_disabled',
  'symlink_escape_denied',
  'malformed_event',
  'oversized_event',
  'self_observation',
  'failed_outcome',
  'unknown_outcome',
  'rate_limited',
  'missing_executable',
  'unsupported_platform',
]);

function setProjectHealth(projectId: string, health: HookHealth): void {
  if (projectHealthMap.size >= MAX_PROJECT_HEALTH_ENTRIES && !projectHealthMap.has(projectId)) {
    const oldestKey = projectHealthMap.keys().next().value;
    if (oldestKey !== undefined) {
      projectHealthMap.delete(oldestKey);
    }
  }
  projectHealthMap.set(projectId, cloneHealth(health));
}

function cloneHealth(h: HookHealth): HookHealth {
  return {
    hookId: h.hookId,
    version: h.version,
    state: h.state,
    lastRun: h.lastRun,
    counters: { ...h.counters },
    lastSkipReason: h.lastSkipReason,
    lastError: h.lastError,
  };
}

export function getCanonicalRoot(projectRoot: string): string {
  try {
    if (existsSync(projectRoot)) {
      return realpathSync.native ? realpathSync.native(projectRoot) : realpathSync(projectRoot);
    }
  } catch {
    // Fall back to lexical resolution
  }
  return resolve(projectRoot);
}

export function isMetadataSymlinkSafe(projectRoot: string): boolean {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const fgDir = resolve(projectRoot, '.forgewright');
  try {
    let stat1;
    try {
      stat1 = lstatSync(fgDir);
    } catch {
      stat1 = null;
    }
    if (stat1) {
      if (stat1.isSymbolicLink()) return false;
      const real1 = realpathSync(fgDir);
      if (!real1.startsWith(canonicalRoot + '/') && real1 !== canonicalRoot) return false;

      const instinctsDir = resolve(fgDir, 'instincts');
      let stat2;
      try {
        stat2 = lstatSync(instinctsDir);
      } catch {
        stat2 = null;
      }
      if (stat2) {
        if (stat2.isSymbolicLink()) return false;
        const real2 = realpathSync(instinctsDir);
        if (!real2.startsWith(canonicalRoot + '/')) return false;

        const healthFile = resolve(instinctsDir, 'health.json');
        let stat3;
        try {
          stat3 = lstatSync(healthFile);
        } catch {
          stat3 = null;
        }
        if (stat3 && stat3.isSymbolicLink()) return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}


export function isStorePathWithinProject(storePath: string, projectRoot: string): boolean {
  try {
    const canonicalProject = realpathSync(projectRoot);
    const resolvedTarget = resolve(projectRoot, storePath);

    let curr = resolvedTarget;
    while (curr && curr !== "/" && curr !== ".") {
      let stat;
      try {
        stat = lstatSync(curr);
      } catch {
        stat = null;
      }
      if (stat && stat.isSymbolicLink()) {
        const targetReal = realpathSync(curr);
        const rel = relative(canonicalProject, targetReal);
        if (rel.startsWith("..") || isAbsolute(rel)) {
          return false;
        }
      }
      const parent = dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }

    let existing = resolvedTarget;
    while (!existsSync(existing)) {
      const p = dirname(existing);
      if (p === existing) break;
      existing = p;
    }
    const realExisting = realpathSync(existing);
    const rel = relative(canonicalProject, realExisting);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getHookHealth(projectRoot: string = process.cwd()): HookHealth {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);

  if (isMetadataSymlinkSafe(canonicalRoot)) {
    const hp = resolve(canonicalRoot, '.forgewright', 'instincts', 'health.json');
    if (existsSync(hp)) {
      try {
        const fileStat = statSync(hp);
        if (fileStat.size <= MAX_HEALTH_FILE_BYTES) {
          const raw = readFileSync(hp, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed.counters) {
            const safeCounter = (val: unknown): number =>
              typeof val === 'number' && Number.isSafeInteger(val) && val >= 0 ? val : 0;
            const validStates = new Set(['unregistered', 'registered', 'running', 'unsupported', 'degraded']);
            const state = typeof parsed.state === 'string' && validStates.has(parsed.state) ? parsed.state : 'unregistered';
            const lastError = typeof parsed.lastError === 'string' && ALLOWED_HEALTH_ERRORS.has(parsed.lastError) ? parsed.lastError : null;
            const lastSkipReason = typeof parsed.lastSkipReason === 'string' && ALLOWED_SKIP_REASONS.has(parsed.lastSkipReason) ? parsed.lastSkipReason : null;
            const loaded: HookHealth = {
              hookId: typeof parsed.hookId === 'string' && parsed.hookId.length <= 64 ? parsed.hookId : DEFAULT_HEALTH.hookId,
              version: typeof parsed.version === 'string' && parsed.version.length <= 32 ? parsed.version : DEFAULT_HEALTH.version,
              state,
              lastRun: typeof parsed.lastRun === 'string' && parsed.lastRun.length <= 64 ? parsed.lastRun : null,
              counters: {
                observed: safeCounter(parsed.counters.observed),
                processed: safeCounter(parsed.counters.processed),
                failed: safeCounter(parsed.counters.failed),
                skipped: safeCounter(parsed.counters.skipped),
              },
              lastSkipReason,
              lastError,
            };
            setProjectHealth(projectId, loaded);
            return cloneHealth(loaded);
          }
        }
      } catch {
        // Fallback to in-memory
      }
    }
  }

  const inMemory = projectHealthMap.get(projectId);
  if (inMemory) {
    return cloneHealth(inMemory);
  }

  const fresh: HookHealth = {
    ...DEFAULT_HEALTH,
    state: 'unregistered',
    counters: { observed: 0, processed: 0, failed: 0, skipped: 0 },
  };
  return cloneHealth(fresh);
}

export function saveHookHealth(projectRoot: string = process.cwd(), healthToSave?: HookHealth): void {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);

  if (!isMetadataSymlinkSafe(canonicalRoot)) {
    return;
  }

  const health = healthToSave || projectHealthMap.get(projectId);
  if (!health) return;

  setProjectHealth(projectId, health);

  const instinctsDir = resolve(canonicalRoot, '.forgewright', 'instincts');
  const hp = resolve(instinctsDir, 'health.json');
  try {
    if (!existsSync(instinctsDir)) {
      mkdirSync(instinctsDir, { recursive: true });
    }
    if (!isMetadataSymlinkSafe(canonicalRoot)) return;

    const tmpHp = `${hp}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmpHp, JSON.stringify(health, null, 2), 'utf-8');
    renameSync(tmpHp, hp);
  } catch {
    health.state = 'degraded';
    health.lastError = 'health_write_failed';
    setProjectHealth(projectId, health);
  }
}

export function resetHookHealth(): void {
  projectHealthMap.clear();
}

// ─── Context Detection ─────────────────────────────────────────────

const contextCache = new Map<string, { context: ProjectContext; cachedAt: number }>();

/**
 * Detect project context from git and file structure
 * Keyed by canonical project ID with bounded TTL
 */
export function detectProjectContext(projectRoot: string): ProjectContext {
  const now = Date.now();
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);

  // Return cached if fresh
  const cached = contextCache.get(projectId);
  if (cached && (now - cached.cachedAt) < CONTEXT_CACHE_TTL_MS) {
    return cached.context;
  }

  const context: ProjectContext = {
    language: undefined,
    framework: undefined,
    fileTypes: [],
    projectType: undefined,
  };

  try {
    const exts = execSync(
      'git ls-files 2>/dev/null | grep -E "\\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h)$" | head -100 | sed \'s/.*\\.//\' | sort | uniq -c | sort -rn | head -5',
      { cwd: canonicalRoot, encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (exts) {
      const lines = exts.split('\n').filter(Boolean);
      const extCounts: Record<string, number> = {};

      for (const line of lines) {
        const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
        if (match) {
          extCounts[match[2]] = parseInt(match[1]);
        }
      }

      const topExt = Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0];
      if (topExt) {
        const ext = topExt[0];
        context.language = extToLanguage(ext);
      }

      context.fileTypes = Object.keys(extCounts);
    }

    const pkgPath = resolve(canonicalRoot, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.react) context.framework = 'react';
      else if (deps.vue) context.framework = 'vue';
      else if (deps.angular) context.framework = 'angular';
      else if (deps.next) context.framework = 'next';
      else if (deps.express) context.framework = 'express';
      else if (deps.fastify) context.framework = 'fastify';
      else if (deps.fastapi || deps.flask) context.framework = 'python-web';

      if (pkg.workspaces) context.projectType = 'monorepo';
      else if (deps.next || deps.gatsby) context.projectType = 'ssr';
      else if (deps.electron) context.projectType = 'desktop';
      else if (deps['react-native']) context.projectType = 'mobile';
      else if (deps.unity) context.projectType = 'game';
    }

    const goModPath = resolve(canonicalRoot, 'go.mod');
    if (existsSync(goModPath)) {
      context.language = 'go';
      const goMod = readFileSync(goModPath, 'utf-8');
      if (goMod.includes('github.com/gin-gonic/gin')) context.framework = 'gin';
      else if (goMod.includes('github.com/gofiber/fiber')) context.framework = 'fiber';
    }

    const cargoPath = resolve(canonicalRoot, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      context.language = 'rust';
      const cargo = readFileSync(cargoPath, 'utf-8');
      if (cargo.includes('actix-web')) context.framework = 'actix';
      else if (cargo.includes('axum')) context.framework = 'axum';
    }

  } catch {
    // Best-effort
  }

  if (contextCache.size >= MAX_CONTEXT_CACHE_ENTRIES) {
    const firstKey = contextCache.keys().next().value;
    if (firstKey) contextCache.delete(firstKey);
  }
  contextCache.set(projectId, { context, cachedAt: now });
  return context;
}

function extToLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    cs: 'csharp',
  };
  return map[ext] || ext;
}

/**
 * Get canonical project ID (for cross-project tracking without collisions or credential leakage)
 */
export function getProjectId(projectRoot: string): string {
  const canonicalPath = getCanonicalRoot(projectRoot);
  const pathHash = createHash('sha256').update(canonicalPath).digest('hex').substring(0, 8);

  let remoteTag: string | null = null;
  if (existsSync(resolve(canonicalPath, '.git'))) {
    try {
      const rawRemote = execSync(
        'git remote get-url origin 2>/dev/null',
        { cwd: canonicalPath, encoding: 'utf-8', timeout: 3000 }
      ).trim();
      if (rawRemote) {
        const sanitized = rawRemote.replace(/https?:\/\/[^@]+@/, '').replace(/\.git$/, '');
        const parts = sanitized.split(/[/:]/).filter(Boolean);
        if (parts.length >= 2) {
          remoteTag = `${parts[parts.length - 2]}_${parts[parts.length - 1]}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        } else if (parts.length === 1 && parts[0]) {
          remoteTag = parts[0].replace(/[^a-zA-Z0-9_-]/g, '_');
        }
      }
    } catch {
      // Ignore
    }
  }

  const baseName = (canonicalPath.split('/').filter(Boolean).pop() || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
  if (remoteTag) {
    return `${remoteTag}--${pathHash}`;
  }
  return `${baseName}--${pathHash}`;
}

// ─── Session Management ─────────────────────────────────────────────

const sessions = new Map<string, SessionState>();

export function getSessionState(sessionId: string, projectRoot: string): SessionState {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  const sessionKey = `${projectId}::${sessionId}`;

  if (!sessions.has(sessionKey)) {
    if (sessions.size >= MAX_SESSIONS) {
      const oldestKey = sessions.keys().next().value;
      if (oldestKey) sessions.delete(oldestKey);
    }

    const context = detectProjectContext(canonicalRoot);
    sessions.set(sessionKey, {
      sessionId,
      projectId,
      startTime: new Date().toISOString(),
      toolSequence: [],
      toolHistory: [],
      projectContext: context,
      lastActivity: new Date().toISOString(),
      toolCount: 0,
    });
  }
  return sessions.get(sessionKey)!;
}

export function hashArguments(args: Record<string, unknown>): string {
  const normalized = JSON.stringify(args, Object.keys(args).sort());
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

const ALLOWED_FILE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'json', 'md', 'yaml', 'yml', 'sh',
  'css', 'html', 'rs', 'go', 'toml', 'sql'
]);
const MAX_AFFECTED_FILES = 10;

export function extractAffectedFiles(toolName: string, args: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  const fileFields = ['path', 'file', 'files', 'target', 'targets', 'src', 'dest', 'destination'];

  for (const field of fileFields) {
    const value = args[field];
    if (value) {
      if (Array.isArray(value)) {
        candidates.push(...value.map(String));
      } else if (typeof value === 'string') {
        candidates.push(value);
      }
    }
  }

  if (toolName === 'Read' || toolName === 'Grep' || toolName === 'read_file') {
    if (args.path && typeof args.path === 'string') {
      candidates.push(args.path);
    }
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (result.length >= MAX_AFFECTED_FILES) break;
    if (typeof candidate !== 'string' || candidate.length > 256) continue;
    const parts = candidate.split('.');
    if (parts.length < 2) continue;
    const ext = parts.pop()?.toLowerCase();
    if (!ext || !ALLOWED_FILE_EXTENSIONS.has(ext)) continue;

    const pathHash = createHash('sha256').update(candidate).digest('hex').slice(0, 12);
    const token = 'f-' + pathHash + '.' + ext;
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }

  return result;
}

// ─── Main Observer ─────────────────────────────────────────────────

let _config: InstinctsConfig | null = null;
let _stats: ObserverStats = {
  eventsObserved: 0,
  patternsDetected: 0,
  lastEvent: null,
  sessionActive: false,
};

export function initObserver(config?: Partial<InstinctsConfig>): void {
  _config = getInstinctsConfig(config);
}

export async function observeToolCall(
  event: ToolCallEvent,
  projectRoot: string
): Promise<{
  pattern: InstinctPattern | null;
  analysis: ToolSequenceAnalysis | null;
  shouldPersist: boolean;
}> {
  // Use trusted projectRoot argument; NEVER follow event.projectRoot!
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  const health = getHookHealth(canonicalRoot);

  const config = _config || getInstinctsConfig();

  // Default is OFF: must be explicitly enabled
  if (!config.enabled) {
    health.counters.skipped++;
    health.lastSkipReason = 'feature_disabled';
    setProjectHealth(projectId, health);
    // Default OFF is a NO-WRITE path on disk: do NOT save to disk!
    return { pattern: null, analysis: null, shouldPersist: false };
  }

  health.counters.observed++;
  health.lastRun = new Date().toISOString();
  if (health.state === 'unregistered') health.state = 'registered';
  health.state = 'running';

  // Symlink escape check
  if (!isMetadataSymlinkSafe(canonicalRoot)) {
    health.counters.skipped++;
    health.lastSkipReason = 'symlink_escape_denied';
    setProjectHealth(projectId, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }



  // Event validation and strict metadata bounds
  if (!event || typeof event !== 'object' || !event.toolName || typeof event.toolName !== 'string' || !event.sessionId || typeof event.sessionId !== 'string' || !event.arguments || typeof event.arguments !== 'object' || Array.isArray(event.arguments) || (event.timestamp !== undefined && (typeof event.timestamp !== 'string' || event.timestamp.length > 64 || !Number.isFinite(Date.parse(event.timestamp)))) || (event.duration !== undefined && (typeof event.duration !== 'number' || !Number.isFinite(event.duration) || event.duration < 0))) {
    health.counters.skipped++;
    health.lastSkipReason = 'malformed_event';
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }

  if (event.sessionId.length > MAX_ID_CHARS || Buffer.byteLength(event.sessionId, 'utf8') > MAX_ID_CHARS) {
    health.counters.skipped++;
    health.lastSkipReason = 'oversized_event';
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }

  if (event.toolName.length > MAX_ID_CHARS || Buffer.byteLength(event.toolName, 'utf8') > MAX_ID_CHARS) {
    health.counters.skipped++;
    health.lastSkipReason = 'oversized_event';
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }

  let argsByteLength = 0;
  let eventByteLength = 0;
  try {
    const argsJson = JSON.stringify(event.arguments || {});
    argsByteLength = Buffer.byteLength(argsJson, 'utf8');
    eventByteLength = Buffer.byteLength(JSON.stringify(event), 'utf8');
  } catch {
    health.counters.skipped++;
    health.lastSkipReason = 'malformed_event';
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }

  if (argsByteLength > MAX_ARG_BYTES || eventByteLength > MAX_EVENT_BYTES) {
    health.counters.skipped++;
    health.lastSkipReason = 'oversized_event';
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }

  const toolLower = event.toolName.toLowerCase();
  const isSelf = /^(?:observe|instinct|promoter|scorer|learning[-_]foundry)/i.test(toolLower) ||
    Boolean(event.arguments && (event.arguments as any)._internal_hook);
  if (isSelf) {
    health.counters.skipped++;
    health.lastSkipReason = 'self_observation';
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }

  if (event.success !== true) {
    health.counters.skipped++;
    health.lastSkipReason = 'failed_outcome';
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }

  if (config.maxEventsPerMinute > 0) {
    const storePathToUse = (_config && _config.storePath) ? _config.storePath : resolve(canonicalRoot, '.forgewright', 'instincts', 'store.json');
    if (!isStorePathWithinProject(storePathToUse, canonicalRoot)) {
      health.counters.skipped++;
      health.lastSkipReason = 'symlink_escape_denied';
      saveHookHealth(canonicalRoot, health);
      return { pattern: null, analysis: null, shouldPersist: false };
    }
    const store = getInstinctStore({ ...config, storePath: storePathToUse });
    const now = Date.now();
    const lastObs = (store as any)._lastObservation || 0;
    const minInterval = 60_000 / config.maxEventsPerMinute;
    if (now - lastObs < minInterval) {
      health.counters.skipped++;
      health.lastSkipReason = 'rate_limited';
      saveHookHealth(canonicalRoot, health);
      return { pattern: null, analysis: null, shouldPersist: false };
    }
    (store as any)._lastObservation = now;
  }

  try {
    const session = getSessionState(event.sessionId, canonicalRoot);

    session.toolSequence.push(event.toolName);
    if (session.toolSequence.length > config.sequenceWindowSize) {
      session.toolSequence.shift();
    }

    const sanitizedEvent: ToolCallEvent = {
      toolName: event.toolName,
      arguments: { _hash: hashArguments(event.arguments || {}) },
      sessionId: event.sessionId,
      timestamp: event.timestamp || new Date().toISOString(),
      success: true,
      duration: event.duration,
      affectedFiles: extractAffectedFiles(event.toolName, event.arguments || {}),
    };

    session.toolHistory.push(sanitizedEvent);
    if (session.toolHistory.length > MAX_SESSION_HISTORY) {
      session.toolHistory.shift();
    }
    session.lastActivity = sanitizedEvent.timestamp;
    session.toolCount++;

    health.counters.processed++;
    health.lastSkipReason = null;
    _stats.eventsObserved++;
    _stats.lastEvent = sanitizedEvent.timestamp;
    _stats.sessionActive = true;

    if (session.toolSequence.length < config.minSequenceLength) {
      saveHookHealth(canonicalRoot, health);
      return { pattern: null, analysis: null, shouldPersist: false };
    }

    const analysis = analyzeToolSequence(session.toolSequence);
    const storePathToUse = (_config && _config.storePath) ? _config.storePath : resolve(canonicalRoot, '.forgewright', 'instincts', 'store.json');
    if (!isStorePathWithinProject(storePathToUse, canonicalRoot)) {
      health.counters.skipped++;
      health.lastSkipReason = 'symlink_escape_denied';
      saveHookHealth(canonicalRoot, health);
      return { pattern: null, analysis: null, shouldPersist: false };
    }
    const store = getInstinctStore({ ...config, storePath: storePathToUse });
    const existingPattern = store.findPattern(
      session.toolSequence,
      config.crossProjectTracking ? undefined : projectId
    );

    let confidence: number;
    if (existingPattern) {
      confidence = scorePattern({
        occurrences: existingPattern.occurrences + 1,
        firstSeen: existingPattern.firstSeen,
        lastSeen: sanitizedEvent.timestamp,
        projectContext: existingPattern.projectContext,
        crossProject: existingPattern.crossProject,
        projectIds: existingPattern.projectIds,
        affectedFiles: sanitizedEvent.affectedFiles,
      }).confidence;

      const pattern = store.recordPattern(
        session.toolSequence,
        session.projectContext,
        projectId,
        confidence
      );

      _stats.patternsDetected++;
      if (!store.save()) {
        health.counters.failed++;
        health.lastError = 'store_write_failed';
        health.state = 'degraded';
      }
      saveHookHealth(canonicalRoot, health);
      return {
        pattern,
        analysis,
        shouldPersist: false, // Observations alone must never count as accepted product outcomes
      };
    } else {
      confidence = calculateInitialConfidence(
        session.toolSequence.length,
        session.projectContext
      );

      if (confidence >= config.minInitialConfidence) {
        const pattern = store.recordPattern(
          session.toolSequence,
          session.projectContext,
          projectId,
          confidence
        );

        if (!store.save()) {
          health.counters.failed++;
          health.lastError = 'store_write_failed';
          health.state = 'degraded';
        }

        saveHookHealth(canonicalRoot, health);
        return {
          pattern,
          analysis,
          shouldPersist: false,
        };
      }
    }

    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis, shouldPersist: false };
  } catch {
    health.counters.failed++;
    health.lastError = 'observation_failed';
    health.state = 'degraded';
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
}

export function checkSessionForPromotion(
  sessionId: string,
  projectRoot: string
): InstinctPattern[] {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  const sessionKey = `${projectId}::${sessionId}`;
  const session = sessions.get(sessionKey);
  if (!session) return [];

  const store = getInstinctStore();
  const config = _config || getInstinctsConfig();

  const patterns = store.getPromotablePatterns(config.promotionThreshold);
  return patterns.filter(p =>
    session.toolSequence.some(t => p.toolSequence.includes(t))
  );
}

export function endSession(sessionId: string, projectRoot?: string): void {
  if (projectRoot) {
    const canonicalRoot = getCanonicalRoot(projectRoot);
    const projectId = getProjectId(canonicalRoot);
    const sessionKey = `${projectId}::${sessionId}`;
    const session = sessions.get(sessionKey);
    if (session) {
      const store = getInstinctStore();
      if (session.toolSequence.length >= 3) {
        try { store.save(); } catch {}
      }
      sessions.delete(sessionKey);
    }
  } else {
    for (const [key, session] of sessions.entries()) {
      if (session.sessionId === sessionId) {
        const store = getInstinctStore();
        if (session.toolSequence.length >= 3) {
          try { store.save(); } catch {}
        }
        sessions.delete(key);
      }
    }
  }

  if (sessions.size === 0) {
    _stats.sessionActive = false;
  }
}

export function getObserverStats(): ObserverStats {
  return { ..._stats, sessionActive: sessions.size > 0 };
}

export function resetSessions(): void {
  sessions.clear();
  contextCache.clear();
  projectHealthMap.clear();
  resetStoreManager();
  _stats = {
    eventsObserved: 0,
    patternsDetected: 0,
    lastEvent: null,
    sessionActive: false,
  };
}

export function createInstinctHook() {
  return async function instinctHook(
    toolName: string,
    args: Record<string, unknown>,
    result: { success: boolean; error?: string },
    context: {
      sessionId?: string;
      projectRoot?: string;
      timestamp?: string;
    }
  ) {
    const projectRoot = context.projectRoot || process.cwd();
    const sessionId = context.sessionId || 'default';
    const timestamp = context.timestamp || new Date().toISOString();

    const event: ToolCallEvent = {
      toolName,
      arguments: args,
      sessionId,
      timestamp,
      success: result.success,
    };

    try {
      await observeToolCall(event, projectRoot);
    } catch {
      // Never let observer errors affect tool execution
    }
  };
}

// ─── CLI Interface ────────────────────────────────────────────────

function rejectCliInput(root: string, reason: 'malformed_event' | 'oversized_event'): void {
  if (getInstinctsConfig().enabled) {
    const health = getHookHealth(root);
    health.counters.observed++;
    health.counters.skipped++;
    health.lastRun = new Date().toISOString();
    health.lastSkipReason = reason;
    health.state = 'degraded';
    saveHookHealth(root, health);
  }
  console.log(JSON.stringify({ ok: false, status: 'skipped', reason }));
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith('observer.ts') ||
  process.argv[1].endsWith('observer.js') ||
  process.argv[1].endsWith('observer.mjs')
);

if (isMain) {
  const action = process.argv[2] || 'status';
  const projectRoot = process.argv[4] || process.argv[3] || process.cwd();

  if (action === 'observe-args') {
    const toolName = process.argv[3] || '';
    const rawArgs = process.argv[4] || '{}';
    const successStr = process.argv[5];
    const sessionId = process.argv[6] || 'default';
    const root = process.argv[7] || process.cwd();

    if (Buffer.byteLength(rawArgs, 'utf8') > MAX_ARG_BYTES) {
      rejectCliInput(root, 'oversized_event');
      process.exit(0);
    }
    let parsedArgs: Record<string, unknown>;
    try {
      const decoded: unknown = JSON.parse(rawArgs);
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        throw new Error('malformed_event');
      }
      parsedArgs = decoded as Record<string, unknown>;
    } catch {
      rejectCliInput(root, 'malformed_event');
      process.exit(0);
    }

    const event: ToolCallEvent = {
      toolName,
      arguments: parsedArgs,
      sessionId,
      timestamp: new Date().toISOString(),
      success: successStr === 'true',
    };

    observeToolCall(event, root).then((res) => {
      console.log(JSON.stringify({ ok: true, result: res }));
    }).catch(() => {
      process.exit(0);
    });
  } else if (action === 'observe') {
    const eventJson = process.argv[3];
    if (!eventJson) {
      console.error('Error: missing event JSON');
      process.exit(1);
    }
    if (Buffer.byteLength(eventJson, 'utf8') > MAX_EVENT_BYTES) {
      rejectCliInput(process.argv[4] || process.cwd(), 'oversized_event');
      process.exit(0);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(eventJson);
    } catch (e: any) {
      console.error('Error: malformed event JSON');
      process.exit(1);
    }
    const root = process.argv[4] || process.cwd();
    observeToolCall(parsed, root).then((res) => {
      console.log(JSON.stringify({ ok: true, result: res }));
    }).catch(() => {
      process.exit(0);
    });
  } else if (action === 'health') {
    const health = getHookHealth(projectRoot);
    console.log(JSON.stringify(health, null, 2));
  } else if (action === 'status') {
    const health = getHookHealth(projectRoot);
    let totalPatterns = 0;
    const storePath = resolve(projectRoot, '.forgewright', 'instincts', 'store.json');
    if (existsSync(storePath)) {
      try {
        const raw = readFileSync(storePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.patterns)) {
          totalPatterns = parsed.patterns.length;
        }
      } catch {
        totalPatterns = 0;
      }
    }
    console.log('═══ Instinct System Status ═══');
    console.log(`Hook State:   ${health.state}`);
    console.log(`Observed:     ${health.counters.observed}`);
    console.log(`Processed:    ${health.counters.processed}`);
    console.log(`Skipped:      ${health.counters.skipped}`);
    console.log(`Failed:       ${health.counters.failed}`);
    if (health.lastSkipReason) console.log(`Last Skip:    ${health.lastSkipReason}`);
    if (health.lastError) console.log(`Last Error:   ${health.lastError}`);
    console.log(`Total Patterns: ${totalPatterns}`);
  } else if (action === 'clear') {
    const store = getInstinctStore({ storePath: resolve(projectRoot, '.forgewright', 'instincts', 'store.json') });
    store.clear();
    resetSessions();
    console.log('Store and sessions cleared');
  } else {
    console.log('Usage: observer.mjs {observe-args|observe|health|status|clear}');
  }
}
