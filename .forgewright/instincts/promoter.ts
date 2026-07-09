/**
 * Instinct Promoter — Auto-suggests patterns when confidence threshold is met
 * 
 * When confidence >= 0.7, suggests patterns proactively to the user.
 * Example: "I notice you often use `grep` to find TODO comments — 
 *          shall I add a task-extractor skill?"
 */

import { getInstinctStore, type InstinctPattern, type InstinctStoreManager } from './instinct-store.js';
import { rescorePattern, type ScoringResult } from './scorer.js';
import { getInstinctsConfig, type InstinctsConfig } from './instincts-config.js';

// ─── Suggestion Types ──────────────────────────────────────────────

export interface InstinctSuggestion {
  id: string;
  pattern: InstinctPattern;
  confidence: number;
  message: string;
  action: SuggestionAction;
  createdAt: string;
  sessionId?: string;
}

export interface SuggestionAction {
  type: 'create_skill' | 'add_hook' | 'optimize_workflow' | 'learn_pattern';
  label: string;
  command?: string;
  description: string;
}

export interface PromotionResult {
  suggestions: InstinctSuggestion[];
  promoted: number;
  skipped: number;
}

// ─── Suggestion Templates ─────────────────────────────────────────

const SUGGESTION_TEMPLATES = {
  create_skill: {
    message: (pattern: InstinctPattern) => 
      `I notice you often use the sequence: ${pattern.toolSequence.join(' → ')}. ` +
      `This pattern appears ${pattern.occurrences} times across ${pattern.projectIds.length} project(s). ` +
      `Would you like me to create a skill for this workflow?`,
    action: {
      type: 'create_skill' as const,
      label: 'Create Skill',
      description: 'Wrap this pattern into a reusable skill',
    },
  },
  optimize_workflow: {
    message: (pattern: InstinctPattern) =>
      `You seem to follow a common pattern: ${pattern.toolSequence.join(' → ')}. ` +
      `This could be optimized with a custom workflow.`,
    action: {
      type: 'optimize_workflow' as const,
      label: 'Optimize',
      description: 'Suggest workflow improvements',
    },
  },
  add_hook: {
    message: (pattern: InstinctPattern) =>
      `I'm learning your ${pattern.toolSequence.join(' → ')} pattern. ` +
      `Should I add an automatic hook for this?`,
    action: {
      type: 'add_hook' as const,
      label: 'Add Hook',
      description: 'Automate this pattern with a hook',
    },
  },
  learn_pattern: {
    message: (pattern: InstinctPattern) =>
      `Interesting: I've detected a ${pattern.toolSequence.length}-step pattern ` +
      `(${pattern.toolSequence.join(' → ')}) that you use consistently.`,
    action: {
      type: 'learn_pattern' as const,
      label: 'Remember',
      description: 'Remember this pattern for future sessions',
    },
  },
};

// ─── Intent Detection ─────────────────────────────────────────────

interface DetectedIntent {
  type: SuggestionAction['type'];
  confidence: number;
  reasoning: string;
}

/**
 * Detect what type of suggestion would be most helpful
 */
function detectIntent(pattern: InstinctPattern): DetectedIntent {
  const tools = pattern.toolSequence.map(t => t.toLowerCase());
  
  // Sequence-based detection
  const hasRead = tools.includes('read');
  const hasGrep = tools.includes('grep');
  const hasWrite = tools.includes('write') || tools.includes('str_replace');
  const hasShell = tools.includes('shell') || tools.includes('bash');
  
  // Length-based
  const isLongSequence = pattern.toolSequence.length >= 5;
  const isCrossProject = pattern.crossProject;
  
  // Intent scoring
  const intents: DetectedIntent[] = [];
  
  // Search/explore pattern
  if (hasRead && hasGrep && !hasWrite) {
    intents.push({
      type: 'optimize_workflow',
      confidence: 0.8,
      reasoning: 'Search/explore pattern detected',
    });
  }
  
  // Edit pattern
  if (hasRead && hasWrite) {
    intents.push({
      type: 'create_skill',
      confidence: 0.85,
      reasoning: 'Read-modify pattern with high repetition potential',
    });
  }
  
  // Complex cross-project pattern
  if (isLongSequence && isCrossProject) {
    intents.push({
      type: 'create_skill',
      confidence: 0.95,
      reasoning: 'Complex cross-project pattern - ideal for skill creation',
    });
  }
  
  // Shell-heavy pattern
  if (hasShell) {
    intents.push({
      type: 'add_hook',
      confidence: 0.7,
      reasoning: 'Shell command pattern - could benefit from hook automation',
    });
  }
  
  // Default
  if (intents.length === 0) {
    intents.push({
      type: 'learn_pattern',
      confidence: 0.5,
      reasoning: 'General pattern - basic learning',
    });
  }
  
  // Return highest confidence intent
  return intents.sort((a, b) => b.confidence - a.confidence)[0];
}

// ─── Suggestion Generation ────────────────────────────────────────

/**
 * Generate a suggestion message for a pattern
 */
export function generateSuggestion(
  pattern: InstinctPattern,
  sessionId?: string
): InstinctSuggestion {
  const intent = detectIntent(pattern);
  const template = SUGGESTION_TEMPLATES[intent.type];
  
  return {
    id: `suggestion-${pattern.id}-${Date.now()}`,
    pattern,
    confidence: pattern.confidence,
    message: template.message(pattern),
    action: template.action,
    createdAt: new Date().toISOString(),
    sessionId,
  };
}

// ─── Promotion Logic ──────────────────────────────────────────────

let _suggestionHistory: Map<string, string> = new Map(); // sessionId -> last suggestion time

/**
 * Check if we should suggest now (debouncing)
 */
function shouldSuggest(sessionId: string, config: InstinctsConfig): boolean {
  const now = Date.now();
  const lastSuggest = _suggestionHistory.get(sessionId);
  
  // First suggestion for this session
  if (!lastSuggest) return true;
  
  // Check debounce
  if (now - parseInt(lastSuggest) < config.suggestionDebounceMs) {
    return false;
  }
  
  // Check max suggestions
  const countKey = `count-${sessionId}`;
  const count = parseInt(_suggestionHistory.get(countKey) || '0');
  if (count >= config.maxSuggestionsPerSession) {
    return false;
  }
  
  return true;
}

/**
 * Mark that we suggested (for debouncing)
 */
function markSuggested(sessionId: string): void {
  const now = Date.now().toString();
  _suggestionHistory.set(sessionId, now);
  
  const countKey = `count-${sessionId}`;
  const count = parseInt(_suggestionHistory.get(countKey) || '0');
  _suggestionHistory.set(countKey, (count + 1).toString());
}

/**
 * Promote patterns that meet the threshold
 */
export function promotePatterns(
  store?: InstinctStoreManager,
  sessionId?: string,
  config?: Partial<InstinctsConfig>
): PromotionResult {
  const fullConfig = getInstinctsConfig(config);
  
  if (!fullConfig.enabled || !fullConfig.autoSuggest) {
    return { suggestions: [], promoted: 0, skipped: 0 };
  }
  
  const patternStore = store || getInstinctStore(fullConfig);
  const sid = sessionId || 'global';
  
  // Check debouncing
  if (!shouldSuggest(sid, fullConfig)) {
    return { suggestions: [], promoted: 0, skipped: 0 };
  }
  
  // Get patterns ready for promotion
  const promotable = patternStore.getPromotablePatterns(fullConfig.promotionThreshold);
  
  if (promotable.length === 0) {
    return { suggestions: [], promoted: 0, skipped: 0 };
  }
  
  // Generate suggestions (limit to max per session)
  const maxSuggestions = Math.min(
    fullConfig.maxSuggestionsPerSession,
    promotable.length
  );
  
  const suggestions: InstinctSuggestion[] = [];
  
  for (let i = 0; i < maxSuggestions; i++) {
    const pattern = promotable[i];
    
    // Re-score to ensure still meets threshold
    const scoring = rescorePattern(pattern);
    
    if (scoring.confidence >= fullConfig.promotionThreshold) {
      const suggestion = generateSuggestion(pattern, sid);
      suggestions.push(suggestion);
      
      // Mark as suggested in store
      patternStore.markSuggested(pattern.id);
    }
  }
  
  // Update suggestion history
  if (suggestions.length > 0) {
    markSuggested(sid);
  }
  
  return {
    suggestions,
    promoted: suggestions.length,
    skipped: promotable.length - suggestions.length,
  };
}

/**
 * Get pending suggestions for a session
 */
export function getPendingSuggestions(
  sessionId?: string
): InstinctSuggestion[] {
  const store = getInstinctStore();
  const patterns = store.getPromotablePatterns();
  
  return patterns.map(p => generateSuggestion(p, sessionId));
}

// ─── CLI Interface ────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = promotePatterns();
  console.log('Promotion result:');
  console.log(JSON.stringify(result, null, 2));
  
  if (result.suggestions.length > 0) {
    console.log('\nTop suggestion:');
    console.log(result.suggestions[0].message);
  }
}
