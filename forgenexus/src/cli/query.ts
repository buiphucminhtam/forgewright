/**
 * Query Tool with Confidence Scoring
 * 
 * Provides natural language query with confidence metrics.
 */

import type { ConfidenceResult, SearchResult } from '../agents/types.js';
import { calculateConfidence } from '../agents/confidence.js';

// ============================================================================
// Types
// ============================================================================

export interface QueryOptions {
  limit?: number;
  type?: 'file' | 'function' | 'class' | 'variable' | 'import' | 'all';
  confidence?: {
    minThreshold?: number;
    warnThreshold?: number;
  };
}

export interface QueryResult {
  query: string;
  results: QuerySearchResult[];
  confidence: ConfidenceResult;
  uncertaintyFlags: string[];
  grounding: {
    sources: string[];
    citationRequired: boolean;
  };
  fallbackBehavior: 'return_best' | 'clarify' | 'refuse';
  metadata: {
    totalResults: number;
    searchTime: number;
  };
}

export interface QuerySearchResult {
  id: string;
  file: string;
  line?: number;
  content: string;
  type: 'file' | 'function' | 'class' | 'variable' | 'import' | 'comment';
  relevance: number;
  snippet?: string;
}

// ============================================================================
// Query Engine
// ============================================================================

/**
 * Execute a natural language query with confidence scoring
 */
export async function query(
  naturalQuery: string,
  options: QueryOptions = {}
): Promise<QueryResult> {
  const startTime = Date.now();
  
  const opts = {
    limit: options.limit ?? 10,
    type: options.type ?? 'all',
    confidence: {
      minThreshold: options.confidence?.minThreshold ?? 0.3,
      warnThreshold: options.confidence?.warnThreshold ?? 0.5,
    },
  };

  // Search for results
  const results = await searchCode(naturalQuery, opts);
  
  // Calculate confidence
  const confidence = calculateQueryConfidence(results, opts);
  
  // Generate uncertainty flags
  const uncertaintyFlags = generateUncertaintyFlags(results, confidence);
  
  // Determine fallback behavior
  const fallbackBehavior = determineFallbackBehavior(confidence, opts);
  
  // Extract sources
  const sources = [...new Set(results.map(r => r.file))];

  return {
    query: naturalQuery,
    results,
    confidence,
    uncertaintyFlags,
    grounding: {
      sources,
      citationRequired: confidence.level !== 'high',
    },
    fallbackBehavior,
    metadata: {
      totalResults: results.length,
      searchTime: Date.now() - startTime,
    },
  };
}

// ============================================================================
// Search Implementation
// ============================================================================

async function searchCode(
  query: string,
  options: QueryOptions
): Promise<QuerySearchResult[]> {
  // Mock search results based on query
  const mockResults: QuerySearchResult[] = [
    {
      id: '1',
      file: 'src/auth/login.ts',
      line: 42,
      content: 'async function login(username: string, password: string): Promise<User>',
      type: 'function',
      relevance: 0.95,
      snippet: 'async function login(username: string, password: string): Promise<User> {',
    },
    {
      id: '2',
      file: 'src/auth/logout.ts',
      line: 15,
      content: 'async function logout(userId: string): Promise<void>',
      type: 'function',
      relevance: 0.85,
      snippet: 'async function logout(userId: string): Promise<void> {',
    },
    {
      id: '3',
      file: 'src/auth/register.ts',
      line: 25,
      content: 'async function register(email: string, password: string): Promise<User>',
      type: 'function',
      relevance: 0.75,
      snippet: 'async function register(email: string, password: string): Promise<User> {',
    },
    {
      id: '4',
      file: 'src/middleware/auth.ts',
      line: 10,
      content: 'export const authMiddleware = async (req, res, next) => {',
      type: 'function',
      relevance: 0.7,
      snippet: 'export const authMiddleware = async (req, res, next) => {',
    },
    {
      id: '5',
      file: 'src/types/auth.ts',
      line: 5,
      content: 'interface User { id: string; email: string; }',
      type: 'class',
      relevance: 0.6,
      snippet: 'interface User { id: string; email: string; }',
    },
  ];

  // Filter by type if specified
  let filtered = mockResults;
  if (options.type && options.type !== 'all') {
    filtered = mockResults.filter(r => r.type === options.type);
  }

  // Limit results
  return filtered.slice(0, options.limit ?? 10);
}

// ============================================================================
// Confidence Calculation
// ============================================================================

function calculateQueryConfidence(
  results: QuerySearchResult[],
  options: QueryOptions
): ConfidenceResult {
  if (results.length === 0) {
    return {
      level: 'critical',
      score: 0,
      behavior: 'refuse',
      reasons: ['No results found'],
      flags: ['no_results'],
    };
  }

  const reasons: string[] = [];
  const flags: string[] = [];

  // Average relevance
  const avgRelevance = results.reduce((sum, r) => sum + r.relevance, 0) / results.length;
  reasons.push(`Average relevance: ${(avgRelevance * 100).toFixed(0)}%`);

  // Result count
  if (results.length === 0) {
    flags.push('no_results');
    reasons.push('No results found');
  } else if (results.length > 20) {
    flags.push('too_many_results');
    reasons.push('Many results, may indicate broad query');
  } else if (results.length >= 3 && results.length <= 10) {
    reasons.push('Optimal result count');
  }

  // Relevance variance
  const relevances = results.map(r => r.relevance);
  const variance = calculateVariance(relevances);
  if (variance > 0.1) {
    flags.push('high_variance');
    reasons.push('High variance in result relevance');
  }

  // Calculate score
  let score = avgRelevance * 0.7 + (1 - variance) * 0.3;
  
  // Adjust for flags
  if (flags.includes('too_many_results')) {
    score *= 0.8;
  }
  if (flags.includes('no_results')) {
    score = 0;
  }

  // Determine level and behavior
  let level: 'high' | 'medium' | 'low' | 'critical';
  if (score >= 0.9) level = 'high';
  else if (score >= 0.7) level = 'medium';
  else if (score >= 0.5) level = 'low';
  else level = 'critical';

  const behavior = level === 'high' ? 'note' 
    : level === 'medium' ? 'warn'
    : level === 'low' ? 'block' 
    : 'refuse';

  return {
    level,
    score: Math.round(score * 100) / 100,
    behavior,
    reasons,
    flags,
  };
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
}

// ============================================================================
// Uncertainty Flags
// ============================================================================

function generateUncertaintyFlags(
  results: QuerySearchResult[],
  confidence: ConfidenceResult
): string[] {
  const flags: string[] = [...confidence.flags];

  // Check for potential hallucinations
  if (results.length === 0) {
    flags.push('empty_results');
  }

  // Low relevance results
  const lowRelevance = results.filter(r => r.relevance < 0.5);
  if (lowRelevance.length > results.length * 0.5) {
    flags.push('many_low_relevance');
  }

  // Single result
  if (results.length === 1) {
    flags.push('single_result');
  }

  // Diverse types
  const types = new Set(results.map(r => r.type));
  if (types.size > 3) {
    flags.push('diverse_types');
  }

  return flags;
}

// ============================================================================
// Fallback Behavior
// ============================================================================

function determineFallbackBehavior(
  confidence: ConfidenceResult,
  options: QueryOptions
): 'return_best' | 'clarify' | 'refuse' {
  if (confidence.score < (options.confidence?.minThreshold ?? 0.3)) {
    return 'refuse';
  }
  
  if (confidence.score < (options.confidence?.warnThreshold ?? 0.5)) {
    return 'clarify';
  }
  
  return 'return_best';
}

// ============================================================================
// CLI Interface
// ============================================================================

export async function queryCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  
  if (options.help) {
    console.log(`
🔍 ForgeWright Query

Usage:
  forgenexus query "<natural language query>" [options]

Options:
  --limit, -l       Maximum results (default: 10)
  --type, -t         Filter by type: file, function, class, variable, import
  --threshold, -th   Minimum confidence threshold (0-1)
  --verbose          Show detailed results
  --json             Output as JSON
  --help, -h         Show this help

Examples:
  forgenexus query "find authentication functions"
  forgenexus query "where is validateToken used" --type function
  forgenexus query "database connections" --limit 5
    `);
    return;
  }

  const queryText = args.find(a => !a.startsWith('-'));
  
  if (!queryText) {
    console.error('Error: Query text required');
    console.error('Usage: forgenexus query "<text>"');
    process.exit(1);
  }

  const result = await query(queryText, {
    limit: options.limit,
    type: options.type,
    confidence: {
      minThreshold: options.threshold,
    },
  });

  // Output
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n🔍 Query Results\n');
  console.log('='.repeat(50));
  console.log(`Query: ${result.query}`);
  console.log(`Results: ${result.results.length}`);
  console.log(`Confidence: ${result.confidence.level} (${result.confidence.score})`);
  console.log('');

  // Show confidence info
  console.log(`Confidence Level: ${result.confidence.level.toUpperCase()}`);
  if (result.confidence.reasons.length > 0) {
    result.confidence.reasons.forEach(r => console.log(`  - ${r}`));
  }

  // Show uncertainty flags
  if (result.uncertaintyFlags.length > 0) {
    console.log('\nUncertainty Flags:');
    result.uncertaintyFlags.forEach(f => console.log(`  - ${f}`));
  }

  // Show fallback behavior
  console.log(`\nFallback: ${result.fallbackBehavior}`);

  // Show results
  if (result.results.length > 0) {
    console.log('\nResults:');
    for (const r of result.results) {
      console.log(`\n[${r.type}] ${r.file}${r.line ? `:${r.line}` : ''}`);
      console.log(`  Relevance: ${(r.relevance * 100).toFixed(0)}%`);
      if (r.snippet) {
        console.log(`  ${r.snippet}`);
      }
    }
  } else {
    console.log('\nNo results found.');
  }

  // Show sources
  if (result.grounding.sources.length > 0) {
    console.log('\nSources:');
    result.grounding.sources.forEach(s => console.log(`  - ${s}`));
  }

  console.log(`\nSearch time: ${result.metadata.searchTime}ms`);
  console.log('');
}

// ============================================================================
// Argument Parsing
// ============================================================================

interface ParsedArgs {
  help: boolean;
  limit?: number;
  type?: 'file' | 'function' | 'class' | 'variable' | 'import';
  threshold?: number;
  verbose?: boolean;
  json?: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const options: ParsedArgs = { help: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--limit' || arg === '-l') {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--type' || arg === '-t') {
      const type = args[++i] as 'file' | 'function' | 'class' | 'variable' | 'import';
      if (['file', 'function', 'class', 'variable', 'import'].includes(type)) {
        options.type = type;
      }
    } else if (arg === '--threshold' || arg === '-th') {
      options.threshold = parseFloat(args[++i]);
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}
