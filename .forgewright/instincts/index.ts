/**
 * Instinct System — Main Entry Point
 *
 * Exports all instinct modules for easy import.
 *
 * Usage:
 *   import { observeToolCall, promotePatterns, getInstinctsConfig } from './instincts/index.js';
 */

export {
  // Store
  getInstinctStore,
  type InstinctPattern,
  type InstinctStore,
  type ProjectContext,
  type StoreConfig,
} from './instinct-store.js';

export {
  // Scorer
  scorePattern,
  rescorePattern,
  calculateInitialConfidence,
  analyzeToolSequence,
  type ScoringInput,
  type ScoringResult,
  type ToolSequenceAnalysis,
} from './scorer.js';

export {
  // Observer
  observeToolCall,
  detectProjectContext,
  getProjectId,
  getSessionState,
  endSession,
  getObserverStats,
  resetSessions,
  createInstinctHook,
  type ToolCallEvent,
  type SessionState,
  type ObserverStats,
} from './observer.js';

export {
  // Promoter
  promotePatterns,
  generateSuggestion,
  getPendingSuggestions,
  type InstinctSuggestion,
  type SuggestionAction,
  type PromotionResult,
} from './promoter.js';

export {
  // Config
  getInstinctsConfig,
  resetConfig,
  isInstinctsEnabled,
  type InstinctsConfig,
  ENV_VARS,
} from './instincts-config.js';

// ─── Quick Setup Helper ────────────────────────────────────────────

import { initObserver, observeToolCall } from './observer.js';
import { promotePatterns } from './promoter.js';
import { getInstinctsConfig } from './instincts-config.js';

/**
 * Initialize the instinct system with a tool call
 * Call this once at startup to set up the observer
 */
export function initInstincts(): void {
  const config = getInstinctsConfig();
  if (config.enabled) {
    initObserver(config);
    console.log('[Instincts] System initialized');
  }
}

/**
 * Process a tool call through the instinct system.
 *
 * @deprecated Frequency-only automatic promotion has been removed in favor of
 * outcome-bound Learning Foundry review gates. Observations alone must never
 * count as accepted product outcomes. This method remains as a compatibility
 * shim and returns null.
 */
export async function processToolCall(
  toolName: string,
  args: Record<string, unknown>,
  success: boolean,
  projectRoot: string,
  sessionId: string = 'default'
) {
  const config = getInstinctsConfig();

  if (!config.enabled) {
    return null;
  }

  await observeToolCall(
    {
      toolName,
      arguments: args,
      sessionId,
      timestamp: new Date().toISOString(),
      success,
    },
    projectRoot
  );

  // Frequency-only auto-promotion is deprecated. Exclusive promotion authority
  // resides with the Learning Foundry following accepted task/AC verification.
  return null;
}
