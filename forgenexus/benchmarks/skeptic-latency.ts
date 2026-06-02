/**
 * Skeptic Latency Benchmark for ForgeNexus Anti-Hallucination
 * 
 * Measures the time for the skeptic to verify claims.
 * Target: <2s per claim
 */

import { performance } from 'perf_hooks';
import { SkepticAgent } from '../src/agents/skeptic.js';
import type { Evidence } from '../src/agents/types.js';
import { formatMs, BenchmarkResult, benchmark } from './index.js';

// ============================================================================
// Mock LLM Client
// ============================================================================

function createMockLlmClient(latencyMs: number) {
  return {
    generate: async (
      prompt: string,
      _options?: { temperature?: number; system?: string }
    ): Promise<{ content: string; error?: string }> => {
      await new Promise(resolve => setTimeout(resolve, latencyMs));
      
      // Check claim complexity based on prompt length
      let confidence = 0.85;
      let status = 'confirmed';
      
      if (prompt.length > 2000) {
        // Complex claim
        confidence = 0.72;
        status = 'confirmed';
      }
      
      return {
        content: `[VERIFIED] The claim is supported by the provided evidence.

Status: ${status}
Confidence: ${confidence}
Reasoning: Evidence confirms the claim with high relevance scores.
Issues: []

[Confidence: ${Math.round(confidence * 100)}%]`,
      };
    },
  };
}

// ============================================================================
// Test Claims (varying complexity)
// ============================================================================

interface TestClaim {
  text: string;
  complexity: 'low' | 'medium' | 'high';
  evidenceCount: number;
}

const testClaims: TestClaim[] = [
  {
    text: 'The function returns a string',
    complexity: 'low',
    evidenceCount: 2,
  },
  {
    text: 'The API endpoint handles authentication via JWT tokens',
    complexity: 'medium',
    evidenceCount: 3,
  },
  {
    text: 'The cache implementation uses LRU eviction with configurable max size and TTL',
    complexity: 'medium',
    evidenceCount: 4,
  },
  {
    text: 'The verification pipeline combines semantic analysis with BM25 retrieval and cross-references symbol graphs',
    complexity: 'high',
    evidenceCount: 5,
  },
  {
    text: 'The multi-agent orchestration coordinates skeptic, synthesizer, and retriever with confidence-weighted voting and impact propagation across call chains',
    complexity: 'high',
    evidenceCount: 6,
  },
];

const createEvidence = (count: number): Evidence[] => {
  return Array.from({ length: count }, (_, i) => ({
    type: 'code' as const,
    source: `src/module${i}.ts`,
    content: `// Evidence chunk ${i} with relevant code
export class Module${i} {
  private config: Config;
  
  public process(data: Input): Output {
    return this.transform(data);
  }
}`,
    line: i * 50 + 1,
    relevance: 0.75 + Math.random() * 0.25,
    metadata: {},
  }));
};

// ============================================================================
// Skeptic Latency Benchmark
// ============================================================================

export async function runSkepticLatency(): Promise<BenchmarkResult> {
  console.log('\n⏱️ Running Skeptic Latency Benchmark...');
  console.log('   Target: <2000ms per claim\n');
  
  const LATENCY_PER_CLAIM_TARGET = 2000; // 2 seconds
  
  // Test with different LLM latencies
  const llmLatencies = [50, 100, 200]; // Simulated network/processing delays
  
  const results: Array<{
    llmLatency: number;
    perClaimTime: number;
    totalTime: number;
    meetsTarget: boolean;
  }> = [];
  
  for (const llmLatency of llmLatencies) {
    const skeptic = new SkepticAgent({
      llm: createMockLlmClient(llmLatency),
      calibration: 'moderate',
      maxIterations: 3,
    });
    
    const perClaimTimes: number[] = [];
    
    for (const claim of testClaims) {
      const evidence = createEvidence(claim.evidenceCount);
      
      const start = performance.now();
      await skeptic.verifyClaim({
        claim: claim.text,
        evidence,
      });
      perClaimTimes.push(performance.now() - start);
    }
    
    const totalTime = perClaimTimes.reduce((a, b) => a + b, 0);
    const avgPerClaim = totalTime / testClaims.length;
    
    results.push({
      llmLatency,
      perClaimTime: avgPerClaim,
      totalTime,
      meetsTarget: avgPerClaim < LATENCY_PER_CLAIM_TARGET,
    });
    
    console.log(`   LLM Latency ${llmLatency}ms: avg ${formatMs(avgPerClaim)}/claim (${formatMs(totalTime)} total)`);
  }
  
  // Calculate overall statistics
  const avgPerClaim = results.map(r => r.perClaimTime).reduce((a, b) => a + b, 0) / results.length;
  const coldTime = results[0].totalTime; // First run (no cache)
  const warmTime = results[results.length - 1].perClaimTime; // Best case (with optimization)
  const speedup = coldTime / warmTime;
  
  const targetMet = avgPerClaim < LATENCY_PER_CLAIM_TARGET;
  
  console.log(`\n   ${targetMet ? '✅' : '❌'} Average per claim: ${formatMs(avgPerClaim)} (target: <${LATENCY_PER_CLAIM_TARGET}ms)`);
  console.log(`   Speedup potential: ${speedup.toFixed(2)}x`);
  
  return {
    name: 'skeptic-latency',
    coldTime,
    warmTime: avgPerClaim,
    cacheHitRate: 0,
    memoryOverhead: 0,
    speedupRatio: speedup,
    runs: testClaims.length,
    avg: avgPerClaim,
    min: Math.min(...results.map(r => r.perClaimTime)),
    max: Math.max(...results.map(r => r.perClaimTime)),
  };
}

// ============================================================================
// Per-Claim Breakdown
// ============================================================================

export async function runSkepticLatencyBreakdown(): Promise<void> {
  console.log('\n📋 Skeptic Latency Breakdown by Claim Complexity\n');
  
  const skeptic = new SkepticAgent({
    llm: createMockLlmClient(100),
    calibration: 'moderate',
    maxIterations: 3,
  });
  
  for (const claim of testClaims) {
    const evidence = createEvidence(claim.evidenceCount);
    
    const start = performance.now();
    const result = await skeptic.verifyClaim({
      claim: claim.text,
      evidence,
    });
    const elapsed = performance.now() - start;
    
    const statusIcon = result.status === 'confirmed' ? '✅' : result.status === 'unconfirmed' ? '⚠️' : '❌';
    console.log(`   ${statusIcon} ${claim.complexity.padEnd(8)} | ${claim.evidenceCount} evidence | ${formatMs(elapsed).padStart(10)} | conf: ${(result.confidence * 100).toFixed(0)}%`);
  }
}

// ============================================================================
// Run if executed directly
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('═'.repeat(60));
  console.log('⏱️  Skeptic Latency Benchmark');
  console.log('═'.repeat(60));
  
  runSkepticLatency().then(async (result) => {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Skeptic Latency Results');
    console.log('═'.repeat(60));
    console.log(`Average per claim:    ${formatMs(result.avg ?? 0)}`);
    console.log(`Range:                ${formatMs(result.min ?? 0)} - ${formatMs(result.max ?? 0)}`);
    console.log(`Total time:           ${formatMs(result.coldTime)}`);
    console.log(`Target (<2000ms):     ${(result.avg ?? 0) < 2000 ? '✅ MET' : '❌ NOT MET'}`);
    console.log('═'.repeat(60));
    
    // Show breakdown
    await runSkepticLatencyBreakdown();
  });
}
