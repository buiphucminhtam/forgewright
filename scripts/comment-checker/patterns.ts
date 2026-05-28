/**
 * Comment Checker — Slop Pattern Definitions
 *
 * Rules for detecting AI-generated comment slop:
 * - Reject: obvious statements, self-documenting comments
 * - Flag: stale/deprecated comments
 * - Accept: business context, non-obvious rationale
 */

export interface CommentRule {
  id: string;
  type: 'reject' | 'flag' | 'accept';
  pattern: RegExp;
  message: string;
  examples: {
    reject: string[];
    accept: string[];
  };
}

export const commentRules: CommentRule[] = [
  {
    id: 'obvious-action',
    type: 'reject',
    pattern: /\/\/\s*(add|remove|delete|create|get|set|update|increment|decrement|check|validate|parse|convert|transform|calculate|compute|fetch|load|save|write|read|open|close|init|initialize|start|stop|begin|end|return|throw|catch|try)\s+\w+/i,
    message: 'Comment describes an obvious action that is self-evident from the code.',
    examples: {
      reject: [
        '// Increment counter',
        '// Create user object',
        '// Delete the file',
        '// Check if valid',
        '// Initialize the app',
        '// Return the result',
      ],
      accept: [
        '// Retry with exponential backoff on transient network errors',
        '// Parse ISO 8601 date with timezone support',
        '// Fetch user profile from upstream with 5s timeout',
      ],
    },
  },
  {
    id: 'self-documenting',
    type: 'reject',
    pattern: /\/\/\s*(this|variable|function|method|class|object|array|file)\s+(is|was|does|does not|represents)/i,
    message: 'Comment restates what the code element name already conveys.',
    examples: {
      reject: [
        '// This function validates the input',
        '// Variable stores the result',
        '// Object contains user data',
        '// Array holds all items',
      ],
      accept: [
        '// This function implements the Smith-Waterman alignment algorithm',
        '// Variable caches the result to avoid redundant computation',
      ],
    },
  },
  {
    id: 'todo-without-meta',
    type: 'reject',
    pattern: /\/\/\s*TODO:?\s*[^\(]/i,
    message: 'TODO comment missing assignee and deadline. Format: TODO(username): YYYY-MM-DD — description',
    examples: {
      reject: [
        '// TODO: Fix this later',
        '// TODO: refactor',
        '// TODO: make it work',
      ],
      accept: [
        '// TODO(john): 2026-06-15 — refactor auth middleware',
        '// TODO(team): remove after Q3 deprecation',
        '// TODO(maria): 2026-07-01 — add unit tests for edge case',
      ],
    },
  },
  {
    id: 'stale-comment',
    type: 'flag',
    pattern: /\/\/\s*(deprecated|outdated|legacy|old version|will be removed)/i,
    message: 'Comment indicates the code may be outdated or needs review.',
    examples: {
      reject: [],
      accept: [],
    },
  },
  {
    id: 'business-context',
    type: 'accept',
    pattern: /\/\/\s*(because|since|reason|intent|business|rationale|regulatory|compliance|security|privacy|gdpr|hipaa|pci|note:|note that)/i,
    message: 'Business context or rationale — valuable comment.',
    examples: {
      reject: [],
      accept: [
        '// Retry 3x because upstream API is rate-limited',
        '// GDPR requires explicit consent before data processing',
        '// Business rule: discount expires at midnight UTC',
        '// Security: escape user input before SQL query',
      ],
    },
  },
  {
    id: 'magic-number',
    type: 'flag',
    pattern: /\/\/\s*(\d+)\s*(ms|seconds?|minutes?|hours?|days?)/i,
    message: 'Magic number with unit. Consider extracting to a named constant.',
    examples: {
      reject: [],
      accept: [],
    },
  },
];

/**
 * Get severity level for a rule type
 */
export function getSeverity(type: CommentRule['type']): 'error' | 'warning' | 'info' {
  switch (type) {
    case 'reject': return 'error';
    case 'flag': return 'warning';
    case 'accept': return 'info';
  }
}

/**
 * Check a single comment against all rules
 */
export function checkComment(comment: string): { rule: CommentRule; severity: 'error' | 'warning' | 'info' } | null {
  for (const rule of commentRules) {
    if (rule.pattern.test(comment)) {
      return { rule, severity: getSeverity(rule.type) };
    }
  }
  return null;
}
