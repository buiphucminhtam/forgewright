/**
 * Warm Cache Benchmark for ForgeNexus
 * 
 * Measures analysis performance with warm cache.
 * Compares against cold run to calculate speedup.
 */

import { performance } from 'perf_hooks';
import { benchmark, formatMs, formatMB, BenchmarkResult, printComparison } from './index.js';
import { runColdRun } from './cold-run.js';

// Import components
import { SkepticAgent } from '../src/agents/skeptic.js';
import type { Evidence } from '../src/agents/types.js';

// ============================================================================
// Cache Simulation
// ============================================================================

interface CacheEntry {
  key: string;
  value: unknown;
  timestamp: number;
  hits: number;
}

class VerificationCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000;
  
  set(key: string, value: unknown): void {
    if (this.cache.size >= this.maxSize) {
      // LRU eviction - remove oldest
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.cache.delete(oldest[0]);
    }
    
    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }
  
  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.hits++;
      entry.timestamp = Date.now();
      return entry.value;
    }
    return undefined;
  }
  
  has(key: string): boolean {
    return this.cache.has(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  getStats() {
    const totalHits = Array.from(this.cache.values()).reduce((sum, e) => sum + e.hits, 0);
    return {
      size: this.cache.size,
      totalHits,
      hitRate: totalHits / (this.cache.size || 1),
    };
  }
}

// Global cache instance
const verificationCache = new VerificationCache();

// ============================================================================
// Mock LLM with Cache
// ============================================================================

function createCachedLlmClient(baseLatencyMs = 50) {
  return {
    generate: async (
      prompt: string,
      _options?: { temperature?: number; system?: string }
    ): Promise<{ content: string; error?: string }> => {
      // Create cache key from prompt hash
      const cacheKey = `skeptic:${prompt.slice(0, 100)}`;
      
      // Check cache first
      const cached = verificationCache.get(cacheKey);
      if (cached) {
        // Cache hit - minimal latency
        await new Promise(resolve => setTimeout(resolve, 1));
        return { content: cached as string };
      }
      
      // Cache miss - full latency
      await new Promise(resolve => setTimeout(resolve, baseLatencyMs));
      
      const content = `[VERIFIED] The claim is supported by the provided evidence.
      
Status: confirmed
Confidence: 0.85
Reasoning: Evidence confirms the claim with high relevance scores.
Issues: []

[Confidence: 85%]`;
      
      // Store in cache
      verificationCache.set(cacheKey, content);
      
      return { content };
    },
  };
}

// ============================================================================
// Test Data
// ============================================================================

const createMockEvidence = (count: number): Evidence[] => {
  return Array.from({ length: count }, (_, i) => ({
    type: 'code' as const,
    source: `src/file${i}.ts`,
    content: `// Mock code evidence ${i}
export function example${i}(param: string): void {
  console.log(param);
}`,
    line: i * 10 + 1,
    relevance: 0.7 + Math.random() * 0.3,
    metadata: {},
  }));
};

const mockClaims = [
  'The function returns a string value',
  'The API endpoint handles POST requests',
  'The cache has a maximum size limit',
  'The verification uses semantic analysis',
  'The retriever combines BM25 and vector search',
];

// ============================================================================
// Warm Cache Benchmark
// ============================================================================

export async function runWarmCache(): Promise<BenchmarkResult> {
  console.log('\n🔥 Running Warm Cache Benchmark...');
  console.log('   (With cache, repeated analysis)\n');
  
  // First, populate the cache (cold run)
  const skepticCold = new SkepticAgent({
    llm: createCachedLlmClient(50),
    calibration: 'moderate',
    maxIterations: 3,
  });
  
  const evidence = createMockEvidence(5);
  
  // Cold run - populates cache
  const coldStart = performance.now();
  for (const claim of mockClaims) {
    await skepticCold.verifyClaim({ claim, evidence });
  }
  const coldTime = performance.now() - coldStart;
  
  console.log(`   Cache populated with ${mockClaims.length} verification results`);
  console.log(`   Cache stats:`, verificationCache.getStats());
  
  // Now run warm (cached) iterations
  const warmRuns = 5;
  const warmTimes: number[] = [];
  
  for (let i = 0; i < warmRuns; i++) {
    const skepticWarm = new SkepticAgent({
      llm: createCachedLlmClient(50),
      calibration: 'moderate',
      maxIterations: 3,
    });
    
    const runStart = performance.now();
    for (const claim of mockClaims) {
      await skepticWarm.verifyClaim({ claim, evidence });
    }
    warmTimes.push(performance.now() - runStart);
  }
  
  const avgWarm = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;
  const minWarm = Math.min(...warmTimes);
  const maxWarm = Math.max(...warmTimes);
  
  const speedup = coldTime / avgWarm;
  const cacheHitRate = verificationCache.getStats().hitRate;
  
  const result: BenchmarkResult = {
    name: 'warm-cache',
    coldTime,
    warmTime: avgWarm,
    cacheHitRate,
    memoryOverhead: 0, // Not measured separately
    speedupRatio: speedup,
    runs: warmRuns + 1, // +1 for cold populate run
    avg: avgWarm,
    min: minWarm,
    max: maxWarm,
  };
  
  // Print comparison with cold run
  const coldResult = await runColdRun();
  printComparison('Verification Analysis', coldResult, result);
  
  return result;
}

// ============================================================================
// Run if executed directly
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runWarmCache().then(result => {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Warm Cache Benchmark Results');
    console.log('═'.repeat(60));
    console.log(`Cold Time:       ${formatMs(result.coldTime)}`);
    console.log(`Warm Time:       ${formatMs(result.warmTime)}`);
    console.log(`Speedup:         ${result.speedupRatio.toFixed(2)}x`);
    console.log(`Cache Hit Rate:  ${(result.cacheHitRate * 100).toFixed(1)}%`);
    console.log('═'.repeat(60));
  });
}
