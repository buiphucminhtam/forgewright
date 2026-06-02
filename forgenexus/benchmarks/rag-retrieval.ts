/**
 * RAG Retrieval Benchmark for ForgeNexus
 * 
 * Measures RAG search and retrieval performance.
 * Target: <500ms per search
 */

import { performance } from 'perf_hooks';
import { Retriever, MockDocumentStore } from '../src/rag/retriever.js';
import type { DocumentStore, RetrieveOptions } from '../src/rag/retriever.js';
import { formatMs, BenchmarkResult } from './index.js';

// ============================================================================
// Mock Document Store with Variable Latency
// ============================================================================

interface MockSearchOptions {
  latencyMs?: number;
}

function createMockDocumentStore(
  docCount: number,
  options: MockSearchOptions = {}
): DocumentStore {
  const documents = Array.from({ length: docCount }, (_, i) => ({
    id: `doc-${i}`,
    file: `src/module${Math.floor(i / 10)}.ts`,
    lineStart: (i % 10) * 10 + 1,
    lineEnd: (i % 10) * 10 + 20,
    text: `
    // Module ${i} code
    export class Module${i} {
      private data: any;
      
      public process(input: Input): Output {
        return this.transform(input);
      }
      
      private transform(input: Input): Output {
        // Complex transformation logic
        return { result: input.value * 2 };
      }
    }
  `.trim(),
  }));
  
  return {
    async search(query: string, opts?: { limit?: number }): Promise<Array<{
      id: string;
      file: string;
      lineStart?: number;
      lineEnd?: number;
      text: string;
    }>> {
      const limit = opts?.limit ?? 20;
      
      // Simulate search latency
      if (options.latencyMs) {
        await new Promise(resolve => setTimeout(resolve, options.latencyMs));
      }
      
      // Simple relevance mock - return docs in order
      const start = Math.floor(Math.random() * Math.max(1, documents.length - limit));
      return documents.slice(start, start + limit);
    },
  };
}

// ============================================================================
// Test Queries (varying complexity)
// ============================================================================

const testQueries = [
  {
    query: 'class Module',
    complexity: 'low',
    expectedResults: 5,
  },
  {
    query: 'export function that returns output',
    complexity: 'medium',
    expectedResults: 10,
  },
  {
    query: 'private method that transforms input data and returns result',
    complexity: 'medium-high',
    expectedResults: 15,
  },
  {
    query: 'class with public process method that takes input and returns output after transformation',
    complexity: 'high',
    expectedResults: 20,
  },
];

// ============================================================================
// RAG Retrieval Benchmark
// ============================================================================

export async function runRagRetrieval(): Promise<BenchmarkResult> {
  console.log('\n🔍 Running RAG Retrieval Benchmark...');
  console.log('   Target: <500ms per search\n');
  
  const TARGET_MS = 500;
  
  // Test different corpus sizes
  const corpusSizes = [100, 500, 1000, 5000];
  const results: Array<{
    corpusSize: number;
    times: number[];
    avg: number;
    min: number;
    max: number;
    meetsTarget: boolean;
  }> = [];
  
  for (const corpusSize of corpusSizes) {
    const store = createMockDocumentStore(corpusSize);
    const retriever = new Retriever(store, {
      hybrid: true,
      rerank: true,
      defaultLimit: 20,
    });
    
    const times: number[] = [];
    
    // Run multiple iterations per query
    for (const testQuery of testQueries) {
      for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await retriever.retrieve(testQuery.query, { limit: testQuery.expectedResults });
        times.push(performance.now() - start);
      }
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const meetsTarget = avg < TARGET_MS;
    
    results.push({ corpusSize, times, avg, min, max, meetsTarget });
    
    const icon = meetsTarget ? '✅' : '❌';
    console.log(`   ${icon} Corpus ${corpusSize.toString().padStart(5)} docs: avg=${formatMs(avg)}, range=[${formatMs(min)}, ${formatMs(max)}]`);
  }
  
  // Test with cache simulation
  console.log('\n   💾 With Cache Simulation:');
  
  const cachedStore = createMockDocumentStore(1000, { latencyMs: 5 });
  const cachedRetriever = new Retriever(cachedStore, {
    hybrid: true,
    rerank: true,
    defaultLimit: 20,
  });
  
  const cachedTimes: number[] = [];
  
  // First run - cold
  const coldStart = performance.now();
  await cachedRetriever.retrieve('class Module', { limit: 20 });
  cachedTimes.push(performance.now() - coldStart);
  
  // Subsequent runs - warm (cache hit)
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await cachedRetriever.retrieve('class Module', { limit: 20 });
    cachedTimes.push(performance.now() - start);
  }
  
  const coldTime = cachedTimes[0];
  const warmTimes = cachedTimes.slice(1);
  const avgWarm = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;
  const cacheSpeedup = coldTime / avgWarm;
  
  console.log(`   ✅ Cold: ${formatMs(coldTime)}, Warm avg: ${formatMs(avgWarm)}, Speedup: ${cacheSpeedup.toFixed(2)}x`);
  
  // Overall statistics
  const overallAvg = results.map(r => r.avg).reduce((a, b) => a + b, 0) / results.length;
  const largestAvg = Math.max(...results.map(r => r.avg));
  const allMet = results.every(r => r.meetsTarget);
  
  console.log(`\n   ${allMet ? '✅' : '❌'} Overall average: ${formatMs(overallAvg)} (target: <${TARGET_MS}ms)`);
  console.log(`   ⚠️  Largest corpus avg: ${formatMs(largestAvg)}`);
  
  return {
    name: 'rag-retrieval',
    coldTime: coldTime,
    warmTime: avgWarm,
    cacheHitRate: 1 - (avgWarm / coldTime),
    memoryOverhead: 0,
    speedupRatio: cacheSpeedup,
    runs: cachedTimes.length,
    avg: overallAvg,
    min: Math.min(...results.map(r => r.min)),
    max: largestAvg,
  };
}

// ============================================================================
// Search Type Comparison
// ============================================================================

export async function runSearchTypeComparison(): Promise<void> {
  console.log('\n📊 Search Type Comparison:');
  
  const corpusSize = 1000;
  const queries = ['class', 'function', 'export'];
  
  const searchTypes: Array<{ name: string; options: RetrieveOptions }> = [
    { name: 'BM25 only', options: { hybrid: false, rerank: false } },
    { name: 'Hybrid (BM25 + Vector)', options: { hybrid: true, rerank: false } },
    { name: 'Hybrid + Rerank', options: { hybrid: true, rerank: true } },
  ];
  
  for (const { name, options } of searchTypes) {
    const store = createMockDocumentStore(corpusSize);
    const retriever = new Retriever(store, options);
    
    const times: number[] = [];
    
    for (const query of queries) {
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        await retriever.retrieve(query, { limit: 20 });
        times.push(performance.now() - start);
      }
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`   ${name}: avg=${formatMs(avg)}`);
  }
}

// ============================================================================
// Run if executed directly
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('═'.repeat(60));
  console.log('🔍 RAG Retrieval Benchmark');
  console.log('═'.repeat(60));
  
  runRagRetrieval().then(async (result) => {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 RAG Retrieval Results');
    console.log('═'.repeat(60));
    console.log(`Average per search: ${formatMs(result.avg ?? 0)}`);
    console.log(`Range:              ${formatMs(result.min ?? 0)} - ${formatMs(result.max ?? 0)}`);
    console.log(`Target (<500ms):    ${(result.avg ?? 0) < 500 ? '✅ MET' : '❌ NOT MET'}`);
    console.log(`Cache speedup:      ${result.speedupRatio.toFixed(2)}x`);
    console.log('═'.repeat(60));
    
    await runSearchTypeComparison();
  });
}
