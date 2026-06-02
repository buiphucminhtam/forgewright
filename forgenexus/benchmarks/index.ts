/**
 * Benchmark Infrastructure for ForgeNexus Anti-Hallucination Module
 * 
 * Shared utilities for performance benchmarking.
 */

import { performance, memory } from 'perf_hooks';

// ============================================================================
// Types
// ============================================================================

export interface BenchmarkResult {
  name: string;
  coldTime: number;       // ms - first run (no cache)
  warmTime: number;      // ms - cached run (with cache)
  cacheHitRate: number;   // 0-1
  memoryOverhead: number; // MB
  speedupRatio: number;   // cold/warm
  runs: number;           // number of iterations
  avg?: number;           // average warm time
  min?: number;           // min warm time
  max?: number;           // max warm time
}

export interface BenchmarkTarget {
  metric: string;
  target: string;        // e.g., "<2000ms"
  measurement: string;   // actual measurement
  passed: boolean;
}

export interface TimingResult {
  cold: number;
  warm: number[];
  avg: number;
  min: number;
  max: number;
}

// ============================================================================
// Core Benchmark Functions
// ============================================================================

/**
 * Run a benchmark with cold and warm measurements
 */
export async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  runs = 5
): Promise<TimingResult> {
  // First run (cold) - no caching benefits
  const coldStart = performance.now();
  await fn();
  const cold = performance.now() - coldStart;
  
  // Subsequent runs (warm) - cache benefits
  const warm: number[] = [];
  for (let i = 1; i < runs; i++) {
    const start = performance.now();
    await fn();
    warm.push(performance.now() - start);
  }
  
  const avg = warm.length > 0 ? warm.reduce((a, b) => a + b, 0) / warm.length : 0;
  const min = warm.length > 0 ? Math.min(...warm) : 0;
  const max = warm.length > 0 ? Math.max(...warm) : 0;
  
  return { cold, warm, avg, min, max };
}

/**
 * Run a synchronous benchmark with cold and warm measurements
 */
export function benchmarkSync(
  name: string,
  fn: () => void,
  runs = 5
): TimingResult {
  // First run (cold)
  const coldStart = performance.now();
  fn();
  const cold = performance.now() - coldStart;
  
  // Subsequent runs (warm)
  const warm: number[] = [];
  for (let i = 1; i < runs; i++) {
    const start = performance.now();
    fn();
    warm.push(performance.now() - start);
  }
  
  const avg = warm.length > 0 ? warm.reduce((a, b) => a + b, 0) / warm.length : 0;
  const min = warm.length > 0 ? Math.min(...warm) : 0;
  const max = warm.length > 0 ? Math.max(...warm) : 0;
  
  return { cold, warm, avg, min, max };
}

/**
 * Get current memory usage in MB
 */
export function getMemoryUsage(): number {
  const mem = process.memoryUsage();
  return mem.heapUsed / 1024 / 1024;
}

/**
 * Get memory delta between two measurements
 */
export function getMemoryDelta(start: number, end: number): number {
  return end - start;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format milliseconds for display
 */
export function formatMs(ms: number): string {
  if (ms < 0.001) return `${(ms * 1000000).toFixed(0)}ns`;
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toFixed(0)}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

/**
 * Format memory in MB
 */
export function formatMB(mb: number): string {
  if (mb < 1) return `${(mb * 1024).toFixed(0)}KB`;
  return `${mb.toFixed(2)}MB`;
}

// ============================================================================
// Result Utilities
// ============================================================================

/**
 * Create a benchmark result from timing data
 */
export function createBenchmarkResult(
  name: string,
  timing: TimingResult,
  memoryStart: number,
  memoryEnd: number,
  runs: number
): BenchmarkResult {
  const speedup = timing.cold > 0 ? timing.cold / timing.avg : 1;
  const cacheHitRate = timing.cold > timing.avg ? 1 - timing.avg / timing.cold : 0;
  
  return {
    name,
    coldTime: timing.cold,
    warmTime: timing.avg,
    cacheHitRate: Math.max(0, Math.min(1, cacheHitRate)),
    memoryOverhead: getMemoryDelta(memoryStart, memoryEnd),
    speedupRatio: speedup,
    runs,
    avg: timing.avg,
    min: timing.min,
    max: timing.max,
  };
}

/**
 * Check if a measurement meets a target
 */
export function checkTarget(
  measurement: number,
  target: string
): { passed: boolean; details: string } {
  // Parse target like "<2000ms", "<1s", ">500ms"
  const ltMatch = target.match(/^<(\d+(?:\.\d+)?)(ms|s|μs)?$/);
  const gtMatch = target.match(/^>(\d+(?:\.\d+)?)(ms|s|μs)?$/);
  
  if (ltMatch) {
    const value = parseFloat(ltMatch[1]);
    const unit = ltMatch[2] || 'ms';
    const threshold = unit === 's' ? value * 1000 : unit === 'μs' ? value / 1000 : value;
    const passed = measurement < threshold;
    return {
      passed,
      details: passed 
        ? `${formatMs(measurement)} < ${threshold.toFixed(0)}ms ✓`
        : `${formatMs(measurement)} >= ${threshold.toFixed(0)}ms ✗`,
    };
  }
  
  if (gtMatch) {
    const value = parseFloat(gtMatch[1]);
    const unit = gtMatch[2] || 'ms';
    const threshold = unit === 's' ? value * 1000 : unit === 'μs' ? value / 1000 : value;
    const passed = measurement > threshold;
    return {
      passed,
      details: passed 
        ? `${formatMs(measurement)} > ${threshold.toFixed(0)}ms ✓`
        : `${formatMs(measurement)} <= ${threshold.toFixed(0)}ms ✗`,
    };
  }
  
  // Exact match or unknown format
  return { passed: false, details: `Unknown target format: ${target}` };
}

/**
 * Print a benchmark result with formatting
 */
export function printBenchmarkResult(result: BenchmarkResult): void {
  const status = result.speedupRatio > 1 ? '⚡' : '🐌';
  console.log(`\n${status} ${result.name}`);
  console.log(`   Cold:     ${formatMs(result.coldTime)}`);
  console.log(`   Warm:     ${formatMs(result.warmTime)} (avg of ${result.runs - 1} runs)`);
  console.log(`   Range:    ${formatMs(result.min ?? 0)} - ${formatMs(result.max ?? 0)}`);
  console.log(`   Speedup:  ${result.speedupRatio.toFixed(2)}x`);
  console.log(`   Cache:    ${(result.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`   Memory:   +${formatMB(result.memoryOverhead)}`);
}

/**
 * Print a comparison between two results
 */
export function printComparison(
  name: string,
  coldResult: BenchmarkResult,
  warmResult: BenchmarkResult
): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 ${name} - Cold vs Warm Cache Comparison`);
  console.log('═'.repeat(60));
  console.log(`                    Cold Run      Warm Run      Speedup`);
  console.log(`────────────────────────────────────────────────────────`);
  console.log(`Time:              ${formatMs(coldResult.coldTime).padStart(10)}   ${formatMs(warmResult.warmTime).padStart(10)}   ${coldResult.speedupRatio.toFixed(2)}x`);
  console.log(`Memory Overhead:   ${formatMB(coldResult.memoryOverhead).padStart(10)}   ${formatMB(warmResult.memoryOverhead).padStart(10)}`);
  console.log('═'.repeat(60));
}
