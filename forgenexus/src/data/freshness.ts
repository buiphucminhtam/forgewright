/**
 * Freshness Module for ForgeWright Anti-Hallucination System
 * 
 * Tracks and manages the freshness of graph data to prevent
 * hallucinations from stale data.
 */

export type Staleness = 'fresh' | 'stale' | 'critical';

export interface GraphMetadata {
  lastIndexed: Date;
  commitHash: string;
  indexVersion: string;
  repoPath: string;
  fileCount?: number;
  nodeCount?: number;
}

export interface FreshnessConfig {
  freshThresholdHours: number;
  staleThresholdHours: number;
  criticalThresholdHours: number;
}

export interface FreshnessResult {
  staleness: Staleness;
  lastIndexed: Date;
  hoursSinceIndex: number;
  freshnessScore: number;
  warnings: string[];
  recommendations: string[];
}

export interface FreshnessStatus {
  isFresh: boolean;
  shouldRefresh: boolean;
  canUse: boolean;
}

// Default configuration
export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  freshThresholdHours: 24,
  staleThresholdHours: 72,
  criticalThresholdHours: 168, // 1 week
};

/**
 * Check the staleness of graph data
 */
export function checkStaleness(
  metadata: GraphMetadata,
  config?: Partial<FreshnessConfig>
): FreshnessResult {
  const fullConfig: FreshnessConfig = {
    ...DEFAULT_FRESHNESS_CONFIG,
    ...config,
  };

  const now = new Date();
  const hoursSinceIndex = (now.getTime() - metadata.lastIndexed.getTime()) / (1000 * 60 * 60);

  // Determine staleness level
  let staleness: Staleness;
  if (hoursSinceIndex < fullConfig.freshThresholdHours) {
    staleness = 'fresh';
  } else if (hoursSinceIndex < fullConfig.staleThresholdHours) {
    staleness = 'stale';
  } else if (hoursSinceIndex < fullConfig.criticalThresholdHours) {
    staleness = 'stale';
  } else {
    staleness = 'critical';
  }

  // Calculate freshness score (0-1)
  const freshnessScore = calculateFreshnessScore(
    hoursSinceIndex,
    fullConfig
  );

  // Generate warnings
  const warnings: string[] = [];
  if (staleness === 'stale') {
    warnings.push(`Graph data is ${staleness} (${hoursSinceIndex.toFixed(1)} hours old)`);
  } else if (staleness === 'critical') {
    warnings.push(`⚠️  CRITICAL: Graph data is very stale (${hoursSinceIndex.toFixed(1)} hours old)`);
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (staleness !== 'fresh') {
    recommendations.push(`Run 'forgenexus analyze --force' to refresh the index`);
  }
  if (staleness === 'critical') {
    recommendations.push('Impact analysis results may be unreliable');
    recommendations.push('Consider running a fresh analysis before critical decisions');
  }

  return {
    staleness,
    lastIndexed: metadata.lastIndexed,
    hoursSinceIndex,
    freshnessScore,
    warnings,
    recommendations,
  };
}

/**
 * Calculate freshness score (0-1, where 1 is freshest)
 */
function calculateFreshnessScore(
  hoursSinceIndex: number,
  config: FreshnessConfig
): number {
  if (hoursSinceIndex <= 0) return 1;

  // Exponential decay from 1 to 0
  const decayRate = Math.log(2) / config.freshThresholdHours;
  const score = Math.exp(-decayRate * hoursSinceIndex);

  return Math.max(0, Math.min(1, score));
}

/**
 * Determine if data should be refreshed
 */
export function shouldRefresh(
  metadata: GraphMetadata,
  config?: Partial<FreshnessConfig>
): boolean {
  const result = checkStaleness(metadata, config);
  return result.staleness !== 'fresh';
}

/**
 * Get freshness status for conditional use
 */
export function getFreshnessStatus(
  metadata: GraphMetadata,
  config?: Partial<FreshnessConfig>
): FreshnessStatus {
  const result = checkStaleness(metadata, config);

  return {
    isFresh: result.staleness === 'fresh',
    shouldRefresh: result.staleness !== 'fresh',
    canUse: result.staleness !== 'critical',
  };
}

/**
 * Check staleness and throw if critical
 */
export function requireFreshData(
  metadata: GraphMetadata,
  config?: Partial<FreshnessConfig>
): void {
  const status = getFreshnessStatus(metadata, config);

  if (!status.canUse) {
    throw new StaleDataError(
      `Graph data is critically stale. Last indexed: ${metadata.lastIndexed.toISOString()}`,
      metadata
    );
  }
}

/**
 * Warn about staleness (for CLI)
 */
export function warnIfStale(
  metadata: GraphMetadata,
  config?: Partial<FreshnessConfig>
): void {
  const result = checkStaleness(metadata, config);

  if (result.staleness === 'critical') {
    console.error(`
╔════════════════════════════════════════════════════════════════╗
║  ⚠️  INDEX STALENESS WARNING - CRITICAL                       ║
╠════════════════════════════════════════════════════════════════╣
║  Last indexed: ${result.lastIndexed.toISOString().padEnd(43)}║
║  Hours since:  ${result.hoursSinceIndex.toFixed(1).padEnd(43)}║
║  Freshness:    ${(result.freshnessScore * 100).toFixed(1)}%                                              ║
╠════════════════════════════════════════════════════════════════╣
║  Impact analysis results may be unreliable!                    ║
║  Run: forgenexus analyze --force                             ║
╚════════════════════════════════════════════════════════════════╝
`);
  } else if (result.staleness === 'stale') {
    console.warn(`
⚠️  INDEX STALENESS WARNING
    Last indexed: ${result.lastIndexed.toISOString()}
    Hours since: ${result.hoursSinceIndex.toFixed(1)}
    Freshness: ${(result.freshnessScore * 100).toFixed(1)}%
    
    Consider running: forgenexus analyze --force
`);
  }
}

/**
 * Get staleness color for terminal output
 */
export function getStalenessColor(staleness: Staleness): string {
  switch (staleness) {
    case 'fresh':
      return '\x1b[32m'; // Green
    case 'stale':
      return '\x1b[33m'; // Yellow
    case 'critical':
      return '\x1b[31m'; // Red
  }
}

/**
 * Format staleness for display
 */
export function formatStaleness(result: FreshnessResult): string {
  const color = getStalenessColor(result.staleness);
  const reset = '\x1b[0m';

  return `${color}${result.staleness.toUpperCase()}${reset} (${result.hoursSinceIndex.toFixed(1)}h ago)`;
}

/**
 * Compare two metadata for freshness
 */
export function isFresher(a: GraphMetadata, b: GraphMetadata): boolean {
  return a.lastIndexed > b.lastIndexed;
}

/**
 * Merge freshness results
 */
export function mergeFreshnessResults(
  results: FreshnessResult[]
): FreshnessResult {
  if (results.length === 0) {
    return {
      staleness: 'critical',
      lastIndexed: new Date(0),
      hoursSinceIndex: Infinity,
      freshnessScore: 0,
      warnings: ['No data available'],
      recommendations: ['Run fresh analysis'],
    };
  }

  // Take the worst staleness
  const stalenessOrder: Staleness[] = ['fresh', 'stale', 'critical'];
  const worstStaleness = results.reduce<Staleness>((worst, r) => {
    const worstIndex = stalenessOrder.indexOf(worst);
    const currentIndex = stalenessOrder.indexOf(r.staleness);
    return currentIndex > worstIndex ? r.staleness : worst;
  }, 'fresh');

  // Take the oldest indexed
  const oldest = results.reduce((oldest, r) =>
    r.lastIndexed < oldest.lastIndexed ? r : oldest
  );

  // Combine warnings
  const warnings = results.flatMap(r => r.warnings);

  // Combine recommendations
  const recommendations = [...new Set(results.flatMap(r => r.recommendations))];

  return {
    staleness: worstStaleness,
    lastIndexed: oldest.lastIndexed,
    hoursSinceIndex: oldest.hoursSinceIndex,
    freshnessScore: Math.min(...results.map(r => r.freshnessScore)),
    warnings,
    recommendations,
  };
}

/**
 * Error class for stale data
 */
export class StaleDataError extends Error {
  constructor(
    message: string,
    public metadata: GraphMetadata
  ) {
    super(message);
    this.name = 'StaleDataError';
  }
}

/**
 * Create metadata from index info
 */
export function createMetadata(params: {
  repoPath: string;
  commitHash?: string;
  indexVersion?: string;
  lastIndexed?: Date;
}): GraphMetadata {
  return {
    repoPath: params.repoPath,
    commitHash: params.commitHash ?? 'unknown',
    indexVersion: params.indexVersion ?? '1.0.0',
    lastIndexed: params.lastIndexed ?? new Date(),
    fileCount: 0,
    nodeCount: 0,
  };
}

/**
 * Validate metadata has required fields
 */
export function isValidMetadata(metadata: unknown): metadata is GraphMetadata {
  if (!metadata || typeof metadata !== 'object') return false;

  const m = metadata as Record<string, unknown>;

  return (
    typeof m.repoPath === 'string' &&
    typeof m.lastIndexed === 'string' &&
    typeof m.commitHash === 'string' &&
    typeof m.indexVersion === 'string'
  );
}
