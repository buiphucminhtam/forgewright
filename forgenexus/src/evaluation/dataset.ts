/**
 * Evaluation Dataset for ForgeWright Anti-Hallucination System
 * 
 * Contains test cases for evaluating the verification system.
 */

import type { Chunk } from '../agents/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface EvaluationCase {
  id: string;
  type: 'wiki' | 'impact' | 'query';
  difficulty: 'easy' | 'medium' | 'hard';
  input: string;
  expected: ExpectedOutput;
  groundTruth: GroundTruth;
  tags: string[];
  notes?: string;
}

export interface ExpectedOutput {
  claims: ExpectedClaim[];
  files: string[];
  confidence: number;
  citationCount?: number;
  verificationRequired?: boolean;
}

export interface ExpectedClaim {
  text: string;
  verified: boolean;
  sources: string[];
  confidence?: number;
}

export interface GroundTruth {
  verified: boolean;
  sources: Source[];
  correctClaims?: string[];
  incorrectClaims?: string[];
  notes?: string;
}

export interface Source {
  file: string;
  lines?: string;
  type: 'code' | 'documentation' | 'test' | 'configuration';
}

// ============================================================================
// Evaluation Dataset
// ============================================================================

export const EVALUATION_DATASET: EvaluationCase[] = [
  // =========================================================================
  // WIKI CASES (10)
  // =========================================================================
  {
    id: 'wiki-001',
    type: 'wiki',
    difficulty: 'easy',
    input: 'Generate documentation for an authentication module that uses JWT tokens',
    expected: {
      claims: [
        { text: 'uses JWT tokens', verified: true, sources: ['auth/jwt.ts', 'auth/middleware.ts'] },
        { text: 'has login function', verified: true, sources: ['auth/login.ts'] },
        { text: 'has logout function', verified: true, sources: ['auth/logout.ts'] },
      ],
      files: ['auth/'],
      confidence: 0.9,
      citationCount: 3,
      verificationRequired: true,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'auth/jwt.ts', type: 'code' },
        { file: 'auth/login.ts', type: 'code' },
        { file: 'auth/logout.ts', type: 'code' },
      ],
      correctClaims: ['uses JWT tokens', 'has login function', 'has logout function'],
    },
    tags: ['auth', 'jwt', 'documentation'],
    notes: 'Basic auth module documentation',
  },
  {
    id: 'wiki-002',
    type: 'wiki',
    difficulty: 'easy',
    input: 'Document the API endpoints in this REST API project',
    expected: {
      claims: [
        { text: 'has GET /users endpoint', verified: true, sources: ['api/users.ts'] },
        { text: 'has POST /users endpoint', verified: true, sources: ['api/users.ts'] },
      ],
      files: ['api/'],
      confidence: 0.85,
      citationCount: 2,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'api/users.ts', type: 'code' },
      ],
    },
    tags: ['api', 'rest', 'endpoints'],
  },
  {
    id: 'wiki-003',
    type: 'wiki',
    difficulty: 'medium',
    input: 'Explain the database schema and relationships',
    expected: {
      claims: [
        { text: 'has User table', verified: true, sources: ['db/schema.ts'] },
        { text: 'has Order table', verified: true, sources: ['db/schema.ts'] },
        { text: 'User has many Orders', verified: true, sources: ['db/schema.ts'] },
      ],
      files: ['db/'],
      confidence: 0.8,
      citationCount: 3,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'db/schema.ts', type: 'code' },
      ],
    },
    tags: ['database', 'schema', 'relationships'],
  },
  {
    id: 'wiki-004',
    type: 'wiki',
    difficulty: 'easy',
    input: 'Document the build process and commands',
    expected: {
      claims: [
        { text: 'has build command', verified: true, sources: ['package.json'] },
        { text: 'has test command', verified: true, sources: ['package.json'] },
      ],
      files: ['package.json'],
      confidence: 0.95,
      citationCount: 2,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'package.json', type: 'configuration' },
      ],
    },
    tags: ['build', 'npm', 'scripts'],
  },
  {
    id: 'wiki-005',
    type: 'wiki',
    difficulty: 'medium',
    input: 'Explain error handling patterns in this codebase',
    expected: {
      claims: [
        { text: 'uses try-catch blocks', verified: true, sources: [] },
        { text: 'has custom error classes', verified: true, sources: [] },
        { text: 'logs errors', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.7,
      citationCount: 3,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['error-handling', 'patterns'],
  },
  {
    id: 'wiki-006',
    type: 'wiki',
    difficulty: 'medium',
    input: 'Document the configuration management approach',
    expected: {
      claims: [
        { text: 'uses environment variables', verified: true, sources: ['config/index.ts'] },
        { text: 'has development config', verified: true, sources: ['config/dev.ts'] },
        { text: 'has production config', verified: true, sources: ['config/prod.ts'] },
      ],
      files: ['config/'],
      confidence: 0.85,
      citationCount: 3,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'config/index.ts', type: 'code' },
        { file: 'config/dev.ts', type: 'code' },
        { file: 'config/prod.ts', type: 'code' },
      ],
    },
    tags: ['configuration', 'environment'],
  },
  {
    id: 'wiki-007',
    type: 'wiki',
    difficulty: 'hard',
    input: 'Document the middleware chain and execution order',
    expected: {
      claims: [
        { text: 'has auth middleware', verified: true, sources: ['middleware/auth.ts'] },
        { text: 'has logging middleware', verified: true, sources: ['middleware/log.ts'] },
        { text: 'middleware executes in order', verified: true, sources: ['middleware/index.ts'] },
      ],
      files: ['middleware/'],
      confidence: 0.75,
      citationCount: 3,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'middleware/auth.ts', type: 'code' },
        { file: 'middleware/log.ts', type: 'code' },
        { file: 'middleware/index.ts', type: 'code' },
      ],
    },
    tags: ['middleware', 'execution-order'],
  },
  {
    id: 'wiki-008',
    type: 'wiki',
    difficulty: 'easy',
    input: 'Summarize the test setup and frameworks used',
    expected: {
      claims: [
        { text: 'uses Jest', verified: true, sources: ['package.json'] },
        { text: 'has unit tests', verified: true, sources: ['tests/unit/'] },
      ],
      files: ['package.json', 'tests/'],
      confidence: 0.9,
      citationCount: 2,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'package.json', type: 'configuration' },
        { file: 'tests/unit/', type: 'test' },
      ],
    },
    tags: ['testing', 'jest'],
  },
  {
    id: 'wiki-009',
    type: 'wiki',
    difficulty: 'hard',
    input: 'Explain the routing system architecture',
    expected: {
      claims: [
        { text: 'uses file-based routing', verified: false, sources: [] },
        { text: 'has route guards', verified: true, sources: [] },
        { text: 'supports dynamic routes', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.6,
      citationCount: 3,
    },
    groundTruth: {
      verified: false,
      sources: [],
      incorrectClaims: ['uses file-based routing'],
    },
    tags: ['routing', 'architecture'],
    notes: 'Tests hallucination detection - one claim is incorrect',
  },
  {
    id: 'wiki-010',
    type: 'wiki',
    difficulty: 'hard',
    input: 'Document the caching strategy and invalidation logic',
    expected: {
      claims: [
        { text: 'has Redis cache', verified: true, sources: ['cache/redis.ts'] },
        { text: 'has TTL expiration', verified: true, sources: ['cache/redis.ts'] },
        { text: 'has manual invalidation', verified: false, sources: [] },
      ],
      files: ['cache/'],
      confidence: 0.65,
      citationCount: 3,
    },
    groundTruth: {
      verified: false,
      sources: [
        { file: 'cache/redis.ts', type: 'code' },
      ],
      incorrectClaims: ['has manual invalidation'],
    },
    tags: ['caching', 'redis'],
    notes: 'Tests hallucination detection',
  },

  // =========================================================================
  // IMPACT CASES (10)
  // =========================================================================
  {
    id: 'impact-001',
    type: 'impact',
    difficulty: 'easy',
    input: 'What files would be affected if I change the login() function in auth.ts?',
    expected: {
      claims: [
        { text: 'affects middleware', verified: true, sources: ['middleware/auth.ts'] },
        { text: 'affects tests', verified: true, sources: ['tests/auth.test.ts'] },
      ],
      files: ['middleware/auth.ts', 'tests/auth.test.ts'],
      confidence: 0.85,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'middleware/auth.ts', type: 'code' },
        { file: 'tests/auth.test.ts', type: 'test' },
      ],
    },
    tags: ['function', 'change-impact'],
  },
  {
    id: 'impact-002',
    type: 'impact',
    difficulty: 'medium',
    input: 'Analyze the impact of renaming the User model class',
    expected: {
      claims: [
        { text: 'affects database queries', verified: true, sources: [] },
        { text: 'affects API responses', verified: true, sources: [] },
        { text: 'affects tests', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.75,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['rename', 'model', 'breaking-change'],
  },
  {
    id: 'impact-003',
    type: 'impact',
    difficulty: 'hard',
    input: 'What is the blast radius of changing the database connection string format?',
    expected: {
      claims: [
        { text: 'affects all database operations', verified: true, sources: [] },
        { text: 'requires migration', verified: true, sources: [] },
        { text: 'affects configuration', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.7,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['database', 'configuration', 'blast-radius'],
  },
  {
    id: 'impact-004',
    type: 'impact',
    difficulty: 'easy',
    input: 'Show me all callers of the validateToken() function',
    expected: {
      claims: [
        { text: 'called by middleware', verified: true, sources: ['middleware/auth.ts'] },
        { text: 'called by API routes', verified: true, sources: ['api/auth.ts'] },
      ],
      files: ['middleware/auth.ts', 'api/auth.ts'],
      confidence: 0.9,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'middleware/auth.ts', type: 'code' },
        { file: 'api/auth.ts', type: 'code' },
      ],
    },
    tags: ['callers', 'function-analysis'],
  },
  {
    id: 'impact-005',
    type: 'impact',
    difficulty: 'medium',
    input: 'What happens if I remove the password hashing in the registration flow?',
    expected: {
      claims: [
        { text: 'security vulnerability', verified: true, sources: [] },
        { text: 'affects user model', verified: true, sources: [] },
        { text: 'requires test updates', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.8,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['security', 'breaking-change'],
  },
  {
    id: 'impact-006',
    type: 'impact',
    difficulty: 'medium',
    input: 'Impact analysis for adding a new required field to the User model',
    expected: {
      claims: [
        { text: 'affects create operations', verified: true, sources: [] },
        { text: 'affects update operations', verified: true, sources: [] },
        { text: 'affects API endpoints', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.75,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['model', 'schema-change'],
  },
  {
    id: 'impact-007',
    type: 'impact',
    difficulty: 'hard',
    input: 'What circular dependencies exist in this codebase?',
    expected: {
      claims: [
        { text: 'has circular dependency A→B→A', verified: false, sources: [] },
      ],
      files: [],
      confidence: 0.5,
    },
    groundTruth: {
      verified: false,
      sources: [],
      correctClaims: [],
      incorrectClaims: ['has circular dependency A→B→A'],
    },
    tags: ['dependencies', 'circular'],
    notes: 'Tests that false positives are detected',
  },
  {
    id: 'impact-008',
    type: 'impact',
    difficulty: 'easy',
    input: 'List all files that import from the utils/helpers module',
    expected: {
      claims: [
        { text: 'imports from auth', verified: true, sources: ['auth/login.ts'] },
        { text: 'imports from api', verified: true, sources: ['api/users.ts'] },
      ],
      files: ['auth/login.ts', 'api/users.ts'],
      confidence: 0.9,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'auth/login.ts', type: 'code' },
        { file: 'api/users.ts', type: 'code' },
      ],
    },
    tags: ['imports', 'dependency-analysis'],
  },
  {
    id: 'impact-009',
    type: 'impact',
    difficulty: 'medium',
    input: 'Impact of changing the API response format from JSON to XML',
    expected: {
      claims: [
        { text: 'affects all API endpoints', verified: true, sources: [] },
        { text: 'requires client updates', verified: true, sources: [] },
        { text: 'breaking change', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.8,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['api', 'breaking-change'],
  },
  {
    id: 'impact-010',
    type: 'impact',
    difficulty: 'hard',
    input: 'What is the full dependency chain for the main entry point?',
    expected: {
      claims: [
        { text: 'has nested dependencies', verified: true, sources: [] },
        { text: 'has shared dependencies', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.7,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['dependency-chain', 'entry-point'],
  },

  // =========================================================================
  // QUERY CASES (10)
  // =========================================================================
  {
    id: 'query-001',
    type: 'query',
    difficulty: 'easy',
    input: 'Find all authentication functions in this codebase',
    expected: {
      claims: [
        { text: 'has login function', verified: true, sources: ['auth/login.ts'] },
        { text: 'has logout function', verified: true, sources: ['auth/logout.ts'] },
        { text: 'has register function', verified: true, sources: ['auth/register.ts'] },
      ],
      files: ['auth/login.ts', 'auth/logout.ts', 'auth/register.ts'],
      confidence: 0.9,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'auth/login.ts', type: 'code' },
        { file: 'auth/logout.ts', type: 'code' },
        { file: 'auth/register.ts', type: 'code' },
      ],
    },
    tags: ['search', 'auth', 'functions'],
  },
  {
    id: 'query-002',
    type: 'query',
    difficulty: 'easy',
    input: 'Where is the validateToken function defined and used?',
    expected: {
      claims: [
        { text: 'defined in auth/jwt.ts', verified: true, sources: ['auth/jwt.ts'] },
        { text: 'used in middleware', verified: true, sources: ['middleware/auth.ts'] },
      ],
      files: ['auth/jwt.ts', 'middleware/auth.ts'],
      confidence: 0.9,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'auth/jwt.ts', type: 'code' },
        { file: 'middleware/auth.ts', type: 'code' },
      ],
    },
    tags: ['search', 'function', 'usage'],
  },
  {
    id: 'query-003',
    type: 'query',
    difficulty: 'medium',
    input: 'Explain what this complex function does: processUserData(input, options)',
    expected: {
      claims: [
        { text: 'validates input', verified: true, sources: [] },
        { text: 'transforms data', verified: true, sources: [] },
        { text: 'returns processed result', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.75,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['explanation', 'function-analysis'],
  },
  {
    id: 'query-004',
    type: 'query',
    difficulty: 'easy',
    input: 'Find all test files related to user authentication',
    expected: {
      claims: [
        { text: 'has auth tests', verified: true, sources: ['tests/auth.test.ts'] },
      ],
      files: ['tests/auth.test.ts'],
      confidence: 0.9,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'tests/auth.test.ts', type: 'test' },
      ],
    },
    tags: ['search', 'tests', 'auth'],
  },
  {
    id: 'query-005',
    type: 'query',
    difficulty: 'medium',
    input: 'Find code patterns that match "error handling with try-catch"',
    expected: {
      claims: [
        { text: 'has try-catch blocks', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.7,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['search', 'pattern', 'error-handling'],
  },
  {
    id: 'query-006',
    type: 'query',
    difficulty: 'medium',
    input: 'Identify potential performance bottlenecks in this codebase',
    expected: {
      claims: [
        { text: 'has database queries in loops', verified: false, sources: [] },
        { text: 'has missing indexes', verified: false, sources: [] },
      ],
      files: [],
      confidence: 0.5,
    },
    groundTruth: {
      verified: false,
      sources: [],
      incorrectClaims: ['has database queries in loops', 'has missing indexes'],
    },
    tags: ['search', 'performance', 'analysis'],
    notes: 'Tests hallucination detection - may hallucinate bottlenecks',
  },
  {
    id: 'query-007',
    type: 'query',
    difficulty: 'hard',
    input: 'Find all security concerns in this authentication module',
    expected: {
      claims: [
        { text: 'uses secure password hashing', verified: true, sources: [] },
        { text: 'has rate limiting', verified: true, sources: [] },
      ],
      files: [],
      confidence: 0.7,
    },
    groundTruth: {
      verified: true,
      sources: [],
    },
    tags: ['search', 'security', 'analysis'],
  },
  {
    id: 'query-008',
    type: 'query',
    difficulty: 'medium',
    input: 'Find unused functions or dead code in this project',
    expected: {
      claims: [
        { text: 'has unused exports', verified: false, sources: [] },
      ],
      files: [],
      confidence: 0.6,
    },
    groundTruth: {
      verified: false,
      sources: [],
      incorrectClaims: ['has unused exports'],
    },
    tags: ['search', 'dead-code', 'analysis'],
    notes: 'Tests that false positives are not generated',
  },
  {
    id: 'query-009',
    type: 'query',
    difficulty: 'hard',
    input: 'Find duplicated logic across different modules',
    expected: {
      claims: [
        { text: 'has duplicated validation', verified: false, sources: [] },
      ],
      files: [],
      confidence: 0.5,
    },
    groundTruth: {
      verified: false,
      sources: [],
      incorrectClaims: ['has duplicated validation'],
    },
    tags: ['search', 'duplication', 'analysis'],
    notes: 'Tests that false positives are not generated',
  },
  {
    id: 'query-010',
    type: 'query',
    difficulty: 'medium',
    input: 'Find all API endpoints that return user data',
    expected: {
      claims: [
        { text: 'has GET /users endpoint', verified: true, sources: ['api/users.ts'] },
        { text: 'has GET /users/:id endpoint', verified: true, sources: ['api/users.ts'] },
      ],
      files: ['api/users.ts'],
      confidence: 0.85,
    },
    groundTruth: {
      verified: true,
      sources: [
        { file: 'api/users.ts', type: 'code' },
      ],
    },
    tags: ['search', 'api', 'endpoints'],
  },
];

// ============================================================================
// Dataset Statistics
// ============================================================================

export const DATASET_STATS = {
  total: EVALUATION_DATASET.length,
  byType: {
    wiki: EVALUATION_DATASET.filter(c => c.type === 'wiki').length,
    impact: EVALUATION_DATASET.filter(c => c.type === 'impact').length,
    query: EVALUATION_DATASET.filter(c => c.type === 'query').length,
  },
  byDifficulty: {
    easy: EVALUATION_DATASET.filter(c => c.difficulty === 'easy').length,
    medium: EVALUATION_DATASET.filter(c => c.difficulty === 'medium').length,
    hard: EVALUATION_DATASET.filter(c => c.difficulty === 'hard').length,
  },
  hallucinationCases: EVALUATION_DATASET.filter(
    c => c.groundTruth.verified === false || 
         (c.groundTruth.incorrectClaims && c.groundTruth.incorrectClaims.length > 0)
  ).length,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get cases by type
 */
export function getCasesByType(type: 'wiki' | 'impact' | 'query'): EvaluationCase[] {
  return EVALUATION_DATASET.filter(c => c.type === type);
}

/**
 * Get cases by difficulty
 */
export function getCasesByDifficulty(difficulty: 'easy' | 'medium' | 'hard'): EvaluationCase[] {
  return EVALUATION_DATASET.filter(c => c.difficulty === difficulty);
}

/**
 * Get hallucination test cases
 */
export function getHallucinationCases(): EvaluationCase[] {
  return EVALUATION_DATASET.filter(
    c => c.groundTruth.verified === false ||
         (c.groundTruth.incorrectClaims && c.groundTruth.incorrectClaims.length > 0)
  );
}

/**
 * Get cases by tag
 */
export function getCasesByTag(tag: string): EvaluationCase[] {
  return EVALUATION_DATASET.filter(c => c.tags.includes(tag));
}

/**
 * Get random cases for testing
 */
export function getRandomCases(count: number, seed?: number): EvaluationCase[] {
  const shuffled = [...EVALUATION_DATASET];
  
  if (seed) {
    // Simple seeded random
    let s = seed;
    for (let i = shuffled.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  } else {
    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }
  
  return shuffled.slice(0, count);
}

/**
 * Format case for display
 */
export function formatCase(c: EvaluationCase): string {
  return `[${c.id}] ${c.type.toUpperCase()} (${c.difficulty})\n` +
    `Input: ${c.input}\n` +
    `Expected claims: ${c.expected.claims.length}\n` +
    `Confidence: ${c.expected.confidence}\n` +
    `Tags: ${c.tags.join(', ')}`;
}
