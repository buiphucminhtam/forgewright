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
 * Process a tool call through the instinct system
 * Returns any suggestions if patterns meet confidence threshold
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
  
  const result = await observeToolCall(
    {
      toolName,
      arguments: args,
      sessionId,
      timestamp: new Date().toISOString(),
      success,
    },
    projectRoot
  );
  
  // Check for promotion
  if (result.shouldPersist) {
    const promotion = promotePatterns(undefined, sessionId);
    if (promotion.suggestions.length > 0) {
      return promotion.suggestions[0];
    }
  }
  
  return null;
}
