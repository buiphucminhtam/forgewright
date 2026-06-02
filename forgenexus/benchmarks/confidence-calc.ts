/**
 * Confidence Calculation Benchmark for ForgeNexus Anti-Hallucination
 * 
 * Measures the time for confidence score calculations.
 * Target: <100ms per calculation
 */

import { performance } from 'perf_hooks';
import {
  calculateConfidence,
  calculateVariance,
  calculateMean,
  calculateStdDev,
  createConfidenceResult,
  meetsThreshold,
} from '../src/agents/confidence.js';
import type { ConfidenceParams, SearchResult, Evidence, ConfidenceResult } from '../src/agents/types.js';
import { formatMs, BenchmarkResult, benchmark, benchmarkSync } from './index.js';

// ============================================================================
// Test Data Generators
// ============================================================================

const createSearchResults = (count: number): SearchResult[] => {
  return Array.from({ length: count }, (_, i) => ({
    file: `src/file${i}.ts`,
    line: i * 10 + 1,
    text: `// Code snippet ${i}`,
    relevance: 0.5 + Math.random() * 0.5,
    score: 0.5 + Math.random() * 0.5,
    type: 'code' as const,
  }));
};

const createEvidence = (count: number): Evidence[] => {
  return Array.from({ length: count }, (_, i) => ({
    type: (['code', 'comment', 'documentation'] as const)[i % 3],
    source: `src/module${i}.ts`,
    content: `// Evidence ${i}`,
    line: i * 20 + 1,
    relevance: 0.6 + Math.random() * 0.4,
    metadata: {},
  }));
};

// ============================================================================
// Confidence Calculation Benchmark
// ============================================================================

export async function runConfidenceCalc(): Promise<BenchmarkResult> {
  console.log('\n📐 Running Confidence Calculation Benchmark...');
  console.log('   Target: <100ms per calculation\n');
  
  const TARGET_MS = 100;
  const ITERATIONS = 1000;
  
  // Test different confidence calculation types
  const testCases: Array<{
    name: string;
    params: ConfidenceParams;
  }> = [
    {
      name: 'query-confidence (10 results)',
      params: { type: 'query', results: createSearchResults(10) },
    },
    {
      name: 'query-confidence (50 results)',
      params: { type: 'query', results: createSearchResults(50) },
    },
    {
      name: 'wiki-confidence (5 evidence)',
      params: { type: 'wiki', evidence: createEvidence(5) },
    },
    {
      name: 'wiki-confidence (20 evidence)',
      params: { type: 'wiki', evidence: createEvidence(20) },
    },
    {
      name: 'impact-confidence (10 evidence)',
      params: { type: 'impact', evidence: createEvidence(10) },
    },
    {
      name: 'binding-confidence',
      params: { type: 'binding', bindings: { isConsistent: true, issues: [] } },
    },
  ];
  
  const results: Array<{
    name: string;
    times: number[];
    avg: number;
    min: number;
    max: number;
    meetsTarget: boolean;
  }> = [];
  
  for (const { name, params } of testCases) {
    const times: number[] = [];
    
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      calculateConfidence(params);
      times.push(performance.now() - start);
    }
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const meetsTarget = avg < TARGET_MS;
    
    results.push({ name, times, avg, min, max, meetsTarget });
    
    const icon = meetsTarget ? '✅' : '❌';
    console.log(`   ${icon} ${name}: avg=${formatMs(avg)}, range=[${formatMs(min)}, ${formatMs(max)}]`);
  }
  
  // Utility function benchmarks
  console.log('\n   📊 Utility Functions:');
  
  const values = Array.from({ length: 100 }, () => Math.random());
  
  const varianceTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    calculateVariance(values);
    varianceTimes.push(performance.now() - start);
  }
  const varianceAvg = varianceTimes.reduce((a, b) => a + b, 0) / varianceTimes.length;
  console.log(`   ✅ calculateVariance: avg=${formatMs(varianceAvg)}`);
  
  const meanTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    calculateMean(values);
    meanTimes.push(performance.now() - start);
  }
  const meanAvg = meanTimes.reduce((a, b) => a + b, 0) / meanTimes.length;
  console.log(`   ✅ calculateMean: avg=${formatMs(meanAvg)}`);
  
  const stddevTimes: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    calculateStdDev(values);
    stddevTimes.push(performance.now() - start);
  }
  const stddevAvg = stddevTimes.reduce((a, b) => a + b, 0) / stddevTimes.length;
  console.log(`   ✅ calculateStdDev: avg=${formatMs(stddevAvg)}`);
  
  // Overall statistics
  const overallAvg = results.map(r => r.avg).reduce((a, b) => a + b, 0) / results.length;
  const allMet = results.every(r => r.meetsTarget);
  
  console.log(`\n   ${allMet ? '✅' : '❌'} Overall average: ${formatMs(overallAvg)} (target: <${TARGET_MS}ms)`);
  
  // Return worst-case result
  const worstCase = results.reduce((worst, r) => r.avg > worst.avg ? r : worst, results[0]);
  
  return {
    name: 'confidence-calc',
    coldTime: worstCase.max,
    warmTime: overallAvg,
    cacheHitRate: 0,
    memoryOverhead: 0,
    speedupRatio: worstCase.max / overallAvg,
    runs: ITERATIONS,
    avg: overallAvg,
    min: Math.min(...results.map(r => r.min)),
    max: worstCase.max,
  };
}

// ============================================================================
// ECE Calculation Benchmark
// ============================================================================

export async function runECEBenchmark(): Promise<void> {
  console.log('\n📈 ECE (Expected Calibration Error) Calculation Benchmark...');
  
  const TARGET_MS = 50;
  const ITERATIONS = 100;
  
  // Generate calibration data
  const generateCalibrationData = (n: number) => {
    const confidences: number[] = [];
    const accuracies: boolean[] = [];
    
    for (let i = 0; i < n; i++) {
      confidences.push(0.5 + Math.random() * 0.5);
      accuracies.push(Math.random() > 0.5);
    }
    
    return { confidences, accuracies };
  };
  
  const calculateECE = (confidences: number[], accuracies: boolean[], bins = 10) => {
    const binSize = 1 / bins;
    let totalError = 0;
    let totalCount = 0;
    
    for (let b = 0; b < bins; b++) {
      const binConfidences: number[] = [];
      const binAccuracies: boolean[] = [];
      
      for (let i = 0; i < confidences.length; i++) {
        const conf = confidences[i];
        if (conf >= b * binSize && conf < (b + 1) * binSize) {
          binConfidences.push(conf);
          binAccuracies.push(accuracies[i]);
        }
      }
      
      if (binConfidences.length > 0) {
        const avgConfidence = binConfidances.reduce((a, b) => a + b, 0) / binConfidances.length;
        const accuracy = binAccuracies.filter(a => a).length / binAccuracies.length;
        const binError = Math.abs(avgConfidence - accuracy) * binAccuracies.length;
        totalError += binError;
        totalCount += binAccuracies.length;
      }
    }
    
    return totalCount > 0 ? totalError / totalCount : 0;
  };
  
  const eceTimes: number[] = [];
  
  for (let i = 0; i < ITERATIONS; i++) {
    const data = generateCalibrationData(100);
    const start = performance.now();
    calculateECE(data.confidences, data.accuracies);
    eceTimes.push(performance.now() - start);
  }
  
  const avg = eceTimes.reduce((a, b) => a + b, 0) / eceTimes.length;
  const meetsTarget = avg < TARGET_MS;
  
  console.log(`   ${meetsTarget ? '✅' : '❌'} ECE calculation: avg=${formatMs(avg)} (target: <${TARGET_MS}ms)`);
}

// ============================================================================
// Run if executed directly
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('═'.repeat(60));
  console.log('📐 Confidence Calculation Benchmark');
  console.log('═'.repeat(60));
  
  runConfidenceCalc().then(async (result) => {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Confidence Calculation Results');
    console.log('═'.repeat(60));
    console.log(`Average per calc:    ${formatMs(result.avg ?? 0)}`);
    console.log(`Range:                ${formatMs(result.min ?? 0)} - ${formatMs(result.max ?? 0)}`);
    console.log(`Target (<100ms):      ${(result.avg ?? 0) < 100 ? '✅ MET' : '❌ NOT MET'}`);
    console.log('═'.repeat(60));
    
    await runECEBenchmark();
  });
}
