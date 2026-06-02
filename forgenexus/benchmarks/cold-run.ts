/**
 * Cold Run Benchmark for ForgeNexus
 * 
 * Measures full analysis on cold cache (no prior data).
 * This simulates the first-time analysis of a repository.
 */

import { performance, memory } from 'perf_hooks';
import { benchmark, getMemoryUsage, formatMs, formatMB, BenchmarkResult } from './index.js';

// Import components to benchmark
import { SkepticAgent } from '../src/agents/skeptic.js';
import type { Evidence, VerificationResult } from '../src/agents/types.js';

// ============================================================================
// Mock LLM Client (for consistent benchmarking)
// ============================================================================

function createMockLlmClient(latencyMs = 50) {
  return {
    generate: async (
      prompt: string,
      _options?: { temperature?: number; system?: string }
    ): Promise<{ content: string; error?: string }> => {
      // Simulate LLM latency
      await new Promise(resolve => setTimeout(resolve, latencyMs));
      
      // Return mock verification response
      return {
        content: `[VERIFIED] The claim is supported by the provided evidence.
        
Status: confirmed
Confidence: 0.85
Reasoning: Evidence confirms the claim with high relevance scores.
Issues: []

[Confidence: 85%]`,
      };
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
// Cold Run Benchmark
// ============================================================================

export async function runColdRun(): Promise<BenchmarkResult> {
  console.log('\n🧊 Running Cold Run Benchmark...');
  console.log('   (No cache, fresh analysis)\n');
  
  const memoryStart = getMemoryUsage();
  const startTime = performance.now();
  
  // Create skeptic agent
  const skeptic = new SkepticAgent({
    llm: createMockLlmClient(50),
    calibration: 'moderate',
    maxIterations: 3,
  });
  
  // Run full verification cycle (simulating first-time analysis)
  const evidence = createMockEvidence(5);
  const verificationResults: VerificationResult[] = [];
  
  for (const claim of mockClaims) {
    const result = await skeptic.verifyClaim({ claim, evidence });
    verificationResults.push(result);
  }
  
  const coldTime = performance.now() - startTime;
  const memoryEnd = getMemoryUsage();
  
  const speedupRatio = 1; // Cold run is baseline
  const cacheHitRate = 0;  // No cache on cold run
  
  return {
    name: 'cold-run',
    coldTime,
    warmTime: coldTime,
    cacheHitRate,
    memoryOverhead: memoryEnd - memoryStart,
    speedupRatio,
    runs: 1,
    avg: coldTime,
    min: coldTime,
    max: coldTime,
  };
}

// ============================================================================
// Run if executed directly
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runColdRun().then(result => {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Cold Run Benchmark Results');
    console.log('═'.repeat(60));
    console.log(`Total Time:      ${formatMs(result.coldTime)}`);
    console.log(`Memory Overhead: +${formatMB(result.memoryOverhead)}`);
    console.log(`Claims Verified: ${mockClaims.length}`);
    console.log(`Avg per Claim:   ${formatMs(result.coldTime / mockClaims.length)}`);
    console.log('═'.repeat(60));
  });
}
