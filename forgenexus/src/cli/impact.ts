/**
 * Impact Analysis Command with Freshness Check
 * 
 * Analyzes the impact of changes with freshness verification.
 */

import type { ConfidenceResult } from '../agents/types.js';
import { checkStaleness, warnIfStale } from '../data/freshness.js';
import { calculateConfidence } from '../agents/confidence.js';

// ============================================================================
// Types
// ============================================================================

export interface ImpactOptions {
  symbol?: string;
  file?: string;
  showGraph?: boolean;
  verify?: boolean;
  freshness?: 'warn' | 'error' | 'ignore';
}

export interface ImpactResult {
  symbol: string;
  type: 'function' | 'class' | 'variable' | 'type' | 'unknown';
  affectedFiles: AffectedFile[];
  callChain: string[];
  dependencies: string[];
  confidence: ConfidenceResult;
  freshness: {
    status: 'fresh' | 'stale' | 'critical';
    lastIndexed: Date;
    hoursSinceIndex: number;
  };
  verification?: {
    verified: boolean;
    confidence: number;
    issues: string[];
  };
  warnings: string[];
}

export interface AffectedFile {
  file: string;
  type: 'imports' | 'calls' | 'extends' | 'implements';
  context: string;
  verified: boolean;
}

// ============================================================================
// Impact Analysis
// ============================================================================

/**
 * Analyze impact of a symbol
 */
export async function analyzeImpact(
  symbol: string,
  options: ImpactOptions = {}
): Promise<ImpactResult> {
  const warnings: string[] = [];
  
  // Check freshness
  const freshness = checkStaleness({
    repoPath: '.',
    lastIndexed: new Date(Date.now() - 1000 * 60 * 60), // Mock
    commitHash: 'mock',
    indexVersion: '1.0.0',
  });

  // Emit warnings based on freshness setting
  if (options.freshness !== 'ignore') {
    if (freshness.staleness === 'critical' && options.freshness === 'error') {
      warnings.push(`CRITICAL: Graph data is critically stale (${freshness.hoursSinceIndex.toFixed(1)}h old)`);
    } else if (freshness.staleness !== 'fresh') {
      warnIfStale({
        repoPath: '.',
        lastIndexed: freshness.lastIndexed,
        commitHash: 'mock',
        indexVersion: '1.0.0',
      });
      warnings.push(`Graph data is ${freshness.staleness} (${freshness.hoursSinceIndex.toFixed(1)}h old)`);
    }
  }

  // Mock impact analysis
  const impact = mockAnalyzeImpact(symbol);

  // Calculate confidence
  const confidence = calculateConfidence({
    type: 'impact',
    evidence: impact.affectedFiles.map(f => ({
      type: 'code' as const,
      content: f.context,
      source: f.file,
      relevance: 0.8,
    })),
  });

  // Verify if enabled
  let verification;
  if (options.verify) {
    verification = await verifyImpact(symbol, impact);
    
    if (!verification.verified) {
      warnings.push(...verification.issues);
    }
  }

  return {
    symbol,
    type: impact.type,
    affectedFiles: impact.affectedFiles,
    callChain: impact.callChain,
    dependencies: impact.dependencies,
    confidence,
    freshness: {
      status: freshness.staleness,
      lastIndexed: freshness.lastIndexed,
      hoursSinceIndex: freshness.hoursSinceIndex,
    },
    verification,
    warnings,
  };
}

// ============================================================================
// Mock Analysis
// ============================================================================

function mockAnalyzeImpact(symbol: string): {
  type: 'function' | 'class' | 'variable' | 'type' | 'unknown';
  affectedFiles: AffectedFile[];
  callChain: string[];
  dependencies: string[];
} {
  // Mock response based on symbol
  return {
    type: 'function',
    affectedFiles: [
      {
        file: `src/handlers/${symbol}Handler.ts`,
        type: 'calls',
        context: `handler calls ${symbol}`,
        verified: true,
      },
      {
        file: 'src/middleware/auth.ts',
        type: 'imports',
        context: 'middleware imports handler',
        verified: true,
      },
      {
        file: `tests/unit/${symbol}.test.ts`,
        type: 'imports',
        context: 'test imports module',
        verified: true,
      },
    ],
    callChain: [
      symbol,
      'handler',
      'middleware',
      'router',
    ],
    dependencies: [
      'auth',
      'database',
      'config',
    ],
  };
}

// ============================================================================
// Verification
// ============================================================================

async function verifyImpact(
  symbol: string,
  impact: { affectedFiles: AffectedFile[] }
): Promise<{
  verified: boolean;
  confidence: number;
  issues: string[];
}> {
  const issues: string[] = [];
  
  // Simple verification
  if (impact.affectedFiles.length === 0) {
    issues.push('No affected files found');
  }

  // Check each file
  for (const file of impact.affectedFiles) {
    if (!file.verified) {
      issues.push(`File not verified: ${file.file}`);
    }
  }

  const verified = issues.length === 0;
  const confidence = verified ? 0.85 : 0.5;

  return { verified, confidence, issues };
}

// ============================================================================
// CLI Interface
// ============================================================================

export async function impactCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  
  if (options.help) {
    console.log(`
📊 ForgeWright Impact Analysis

Usage:
  forgenexus impact <symbol> [options]

Options:
  --file, -f         Show only this file
  --graph, -g        Show dependency graph
  --verify, -v        Enable verification
  --freshness <mode>  Freshness check: warn (default), error, ignore
  --help, -h          Show this help
    `);
    return;
  }

  const symbol = args.find(a => !a.startsWith('-'));
  
  if (!symbol) {
    console.error('Error: Symbol required');
    console.error('Usage: forgenexus impact <symbol>');
    process.exit(1);
  }

  const result = await analyzeImpact(symbol, {
    verify: options.verify,
    freshness: options.freshness,
    showGraph: options.showGraph,
  });

  // Output
  console.log('\n📊 Impact Analysis\n');
  console.log('='.repeat(50));
  console.log(`Symbol: ${result.symbol}`);
  console.log(`Type: ${result.type}`);
  console.log(`Affected Files: ${result.affectedFiles.length}`);
  console.log('');
  
  console.log(`Freshness: ${result.freshness.status} (${result.freshness.hoursSinceIndex.toFixed(1)}h ago)`);
  console.log(`Confidence: ${result.confidence.level} (${result.confidence.score})`);
  console.log('');

  if (result.affectedFiles.length > 0) {
    console.log('Affected Files:');
    for (const file of result.affectedFiles) {
      const verified = file.verified ? 'YES' : 'NO';
      console.log(`  [${verified}] ${file.file} (${file.type})`);
    }
  }

  if (result.callChain.length > 0) {
    console.log('\nCall Chain:');
    console.log(`  ${result.callChain.join(' -> ')}`);
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  ${w}`));
  }

  if (result.verification && !result.verification.verified) {
    console.log('\nVerification Failed:');
    result.verification.issues.forEach(i => console.log(`  ${i}`));
  }

  console.log('');
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): ImpactOptions & { help: boolean } {
  const options: ImpactOptions & { help: boolean } = {
    help: false,
    freshness: 'warn',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--file' || arg === '-f') {
      options.file = args[++i];
    } else if (arg === '--graph' || arg === '-g') {
      options.showGraph = true;
    } else if (arg === '--verify' || arg === '-v') {
      options.verify = true;
    } else if (arg === '--freshness') {
      const mode = args[++i] as 'warn' | 'error' | 'ignore';
      if (['warn', 'error', 'ignore'].includes(mode)) {
        options.freshness = mode;
      }
    }
  }

  return options;
}

