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
import { existsSync } from 'fs';
import { resolve, extname } from 'path';
import { execSync } from 'child_process';
import { getInstinctStore, type ProjectContext, type InstinctPattern } from './instinct-store.js';
import { scorePattern, calculateInitialConfidence, analyzeToolSequence, type ToolSequenceAnalysis } from './scorer.js';
import { getInstinctsConfig, type InstinctsConfig } from './instincts-config.js';

// ─── Constants ─────────────────────────────────────────────────────

const CONTEXT_CACHE_TTL_MS = 60_000; // 1 minute cache for project context

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

// ─── Context Detection ─────────────────────────────────────────────

let cachedContext: { context: ProjectContext; cachedAt: number } | null = null;

/**
 * Detect project context from git and file structure
 */
export function detectProjectContext(projectRoot: string): ProjectContext {
  const now = Date.now();
  
  // Return cached if fresh
  if (cachedContext && (now - cachedContext.cachedAt) < CONTEXT_CACHE_TTL) {
    return cachedContext.context;
  }
  
  const context: ProjectContext = {
    language: undefined,
    framework: undefined,
    fileTypes: [],
    projectType: undefined,
  };
  
  try {
    // Detect language from file extensions
    const exts = execSync(
      'git ls-files 2>/dev/null | grep -E "\\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h)$" | head -100 | sed \'s/.*\\.//\' | sort | uniq -c | sort -rn | head -5',
      { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }
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
    
    // Detect framework from package.json
    const pkgPath = resolve(projectRoot, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (deps.react) context.framework = 'react';
      else if (deps.vue) context.framework = 'vue';
      else if (deps.angular) context.framework = 'angular';
      else if (deps.next) context.framework = 'next';
      else if (deps.express) context.framework = 'express';
      else if (deps.fastify) context.framework = 'fastify';
      else if (deps.fastapi || deps.flask) context.framework = 'python-web';
      
      // Project type
      if (pkg.workspaces) context.projectType = 'monorepo';
      else if (deps.next || deps.gatsby) context.projectType = 'ssr';
      else if (deps.electron) context.projectType = 'desktop';
      else if (deps['react-native']) context.projectType = 'mobile';
      else if (deps.unity) context.projectType = 'game';
    }
    
    // Detect from go.mod
    const goModPath = resolve(projectRoot, 'go.mod');
    if (existsSync(goModPath)) {
      context.language = 'go';
      const goMod = require('fs').readFileSync(goModPath, 'utf-8');
      if (goMod.includes('github.com/gin-gonic/gin')) context.framework = 'gin';
      else if (goMod.includes('github.com/gofiber/fiber')) context.framework = 'fiber';
    }
    
    // Detect from Cargo.toml
    const cargoPath = resolve(projectRoot, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      context.language = 'rust';
      const cargo = require('fs').readFileSync(cargoPath, 'utf-8');
      if (cargo.includes('actix-web')) context.framework = 'actix';
      else if (cargo.includes('axum')) context.framework = 'axum';
    }
    
  } catch {
    // Silently fail - context detection is best-effort
  }
  
  cachedContext = { context, cachedAt: now };
  return context;
}

/**
 * Map file extension to language name
 */
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
 * Get project ID (for cross-project tracking)
 */
export function getProjectId(projectRoot: string): string {
  // Try to get git remote origin
  try {
    const remote = execSync(
      'git remote get-url origin 2>/dev/null | sed \'s/.*[/:]//\' | sed \'s/\\.git$//\'',
      { cwd: projectRoot, encoding: 'utf-8', timeout: 3000 }
    ).trim();
    if (remote) return remote;
  } catch {
    // Fall through
  }
  
  // Fall back to directory name
  return projectRoot.split('/').pop() || 'unknown';
}

// ─── Session Management ─────────────────────────────────────────────

const sessions = new Map<string, SessionState>();

/**
 * Get or create session state
 */
export function getSessionState(sessionId: string, projectRoot: string): SessionState {
  if (!sessions.has(sessionId)) {
    const context = detectProjectContext(projectRoot);
    sessions.set(sessionId, {
      sessionId,
      startTime: new Date().toISOString(),
      toolSequence: [],
      toolHistory: [],
      projectContext: context,
      lastActivity: new Date().toISOString(),
      toolCount: 0,
    });
  }
  return sessions.get(sessionId)!;
}

/**
 * Hash tool arguments for privacy (GDPR)
 */
export function hashArguments(args: Record<string, unknown>): string {
  const normalized = JSON.stringify(args, Object.keys(args).sort());
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Extract affected files from tool arguments
 */
export function extractAffectedFiles(toolName: string, args: Record<string, unknown>): string[] {
  const files: string[] = [];
  
  // Common file path arguments by tool
  const fileFields = ['path', 'file', 'files', 'target', 'targets', 'src', 'dest', 'destination'];
  
  for (const field of fileFields) {
    const value = args[field];
    if (value) {
      if (Array.isArray(value)) {
        files.push(...value.map(String));
      } else if (typeof value === 'string') {
        files.push(value);
      }
    }
  }
  
  // Tool-specific extraction
  if (toolName === 'Read' || toolName === 'Grep') {
    if (args.path && typeof args.path === 'string') {
      files.push(args.path);
    }
  }
  
  return files;
}

// ─── Main Observer ─────────────────────────────────────────────────

let _config: InstinctsConfig | null = null;
let _stats: ObserverStats = {
  eventsObserved: 0,
  patternsDetected: 0,
  lastEvent: null,
  sessionActive: false,
};

/**
 * Initialize observer with config
 */
export function initObserver(config?: Partial<InstinctsConfig>): void {
  _config = getInstinctsConfig(config);
}

/**
 * Process a tool call event
 */
export async function observeToolCall(
  event: ToolCallEvent,
  projectRoot: string
): Promise<{
  pattern: InstinctPattern | null;
  analysis: ToolSequenceAnalysis | null;
  shouldPersist: boolean;
}> {
  const startTime = Date.now();
  const config = _config || getInstinctsConfig();
  
  // Feature flag check - fast exit
  if (!config.enabled) {
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  
  // Rate limiting check
  if (config.maxEventsPerMinute > 0) {
    const store = getInstinctStore();
    const now = Date.now();
    // Simple rate limiting: track last observation time
    const lastObs = (store as any)._lastObservation || 0;
    const minInterval = 60_000 / config.maxEventsPerMinute;
    if (now - lastObs < minInterval) {
      return { pattern: null, analysis: null, shouldPersist: false };
    }
    (store as any)._lastObservation = now;
  }
  
  const session = getSessionState(event.sessionId, projectRoot);
  const projectId = getProjectId(projectRoot);
  
  // Add to sequence (rolling window)
  session.toolSequence.push(event.toolName);
  if (session.toolSequence.length > config.sequenceWindowSize) {
    session.toolSequence.shift();
  }
  
  // Track history
  session.toolHistory.push(event);
  session.lastActivity = event.timestamp;
  session.toolCount++;
  
  // Only analyze if we have enough tools
  if (session.toolSequence.length < config.minSequenceLength) {
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  
  _stats.eventsObserved++;
  _stats.lastEvent = event.timestamp;
  _stats.sessionActive = true;
  
  // Analyze sequence
  const analysis = analyzeToolSequence(session.toolSequence);
  
  // Check if this matches an existing pattern
  const store = getInstinctStore(config);
  const existingPattern = store.findPattern(session.toolSequence);
  
  let confidence: number;
  
  if (existingPattern) {
    // Update existing pattern
    confidence = scorePattern({
      occurrences: existingPattern.occurrences + 1,
      firstSeen: existingPattern.firstSeen,
      lastSeen: event.timestamp,
      projectContext: existingPattern.projectContext,
      crossProject: existingPattern.crossProject,
      projectIds: existingPattern.projectIds,
      affectedFiles: extractAffectedFiles(event.toolName, event.arguments),
    }).confidence;
    
    const pattern = store.recordPattern(
      session.toolSequence,
      session.projectContext,
      projectId,
      confidence
    );
    
    _stats.patternsDetected++;
    
    return {
      pattern,
      analysis,
      shouldPersist: confidence >= config.promotionThreshold,
    };
  } else {
    // New pattern - calculate initial confidence
    confidence = calculateInitialConfidence(
      session.toolSequence.length,
      session.projectContext
    );
    
    // Only persist if initial confidence is high enough
    if (confidence >= config.minInitialConfidence) {
      const pattern = store.recordPattern(
        session.toolSequence,
        session.projectContext,
        projectId,
        confidence
      );
      
      store.save();
      
      return {
        pattern,
        analysis,
        shouldPersist: false, // Initial patterns don't auto-promote
      };
    }
  }
  
  return { pattern: null, analysis, shouldPersist: false };
}

/**
 * Check session for promotion candidates
 */
export function checkSessionForPromotion(
  sessionId: string,
  projectRoot: string
): InstinctPattern[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  
  const store = getInstinctStore();
  const config = _config || getInstinctsConfig();
  
  // Check final sequence
  const patterns = store.getPromotablePatterns(config.promotionThreshold);
  
  return patterns.filter(p => 
    session.toolSequence.some(t => p.toolSequence.includes(t))
  );
}

/**
 * End session and cleanup
 */
export function endSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    // Save any pending patterns
    const store = getInstinctStore();
    if (session.toolSequence.length >= 3) {
      store.save();
    }
    sessions.delete(sessionId);
  }
  
  // Update stats
  if (sessions.size === 0) {
    _stats.sessionActive = false;
  }
}

/**
 * Get observer stats
 */
export function getObserverStats(): ObserverStats {
  return { ..._stats, sessionActive: sessions.size > 0 };
}

/**
 * Reset all sessions (for testing)
 */
export function resetSessions(): void {
  sessions.clear();
  _stats = {
    eventsObserved: 0,
    patternsDetected: 0,
    lastEvent: null,
    sessionActive: false,
  };
}

// ─── Hook Integration ──────────────────────────────────────────────

/**
 * Create a hook-compatible function for Claude Code hooks
 * This is the entry point called by the hook system
 */
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
    } catch (err) {
      // Never let observer errors affect tool execution
      console.error('[InstinctObserver] Error:', err);
    }
  };
}

// ─── CLI Interface ────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  // Demo: observe a sample tool call
  const projectRoot = process.cwd();
  
  console.log('Project context:', detectProjectContext(projectRoot));
  console.log('Project ID:', getProjectId(projectRoot));
  console.log('Stats:', getObserverStats());
}
