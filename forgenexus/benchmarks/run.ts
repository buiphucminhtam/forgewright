/**
 * Benchmark Runner for ForgeNexus Anti-Hallucination Module
 * 
 * Executes all performance benchmarks and generates a report.
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { runColdRun } from './cold-run.js';
import { runWarmCache } from './warm-cache.js';
import { runSkepticLatency } from './skeptic-latency.js';
import { runConfidenceCalc } from './confidence-calc.js';
import { runRagRetrieval } from './rag-retrieval.js';
import { formatMs, formatMB, BenchmarkResult, checkTarget } from './index.js';

// ============================================================================
// Types
// ============================================================================

export interface BenchmarkReport {
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpus: number;
    memory: number;
  };
  results: BenchmarkResult[];
  targets: TargetCheck[];
  summary: {
    allTargetsMet: boolean;
    passCount: number;
    failCount: number;
    totalTime: number;
  };
}

interface TargetCheck {
  name: string;
  target: string;
  actual: number;
  passed: boolean;
  details: string;
}

// ============================================================================
// Performance Targets (from Phase 4 Plan)
// ============================================================================

const PERFORMANCE_TARGETS = [
  { name: 'skeptic-latency', target: '<2000ms', metric: 'avg' },
  { name: 'confidence-calc', target: '<100ms', metric: 'avg' },
  { name: 'rag-retrieval', target: '<500ms', metric: 'avg' },
];

// ============================================================================
// Benchmark Runner
// ============================================================================

async function runAllBenchmarks(): Promise<BenchmarkReport> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         FORGENEXUS PERFORMANCE BENCHMARK SUITE                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n🚀 Starting benchmarks at ${new Date().toISOString()}\n`);
  
  const results: BenchmarkResult[] = [];
  const targets: TargetCheck[] = [];
  const failures: string[] = [];
  
  const env = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    memory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
  };
  
  console.log('📋 Environment:');
  console.log(`   Node: ${env.nodeVersion} | ${env.platform}/${env.arch} | ${env.cpus} CPUs | ${env.memory}GB RAM\n`);
  
  // Run each benchmark
  const benchmarks = [
    { name: 'skeptic-latency', fn: runSkepticLatency },
    { name: 'confidence-calc', fn: runConfidenceCalc },
    { name: 'rag-retrieval', fn: runRagRetrieval },
    { name: 'cold-run', fn: runColdRun },
    { name: 'warm-cache', fn: runWarmCache },
  ];
  
  for (const { name, fn } of benchmarks) {
    console.log('─'.repeat(62));
    try {
      const result = await fn();
      results.push(result);
      
      // Check against targets
      const target = PERFORMANCE_TARGETS.find(t => t.name === name);
      if (target) {
        const measurement = result[target.metric as keyof BenchmarkResult] as number;
        const check = checkTarget(measurement, target.target);
        
        targets.push({
          name: target.name,
          target: target.target,
          actual: measurement,
          passed: check.passed,
          details: check.details,
        });
        
        if (!check.passed) {
          failures.push(`${name}: ${check.details}`);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error running ${name}: ${error}`);
      failures.push(`${name}: ${error}`);
    }
  }
  
  // Calculate summary
  const totalTime = results.reduce((sum, r) => sum + r.coldTime, 0);
  const passCount = targets.filter(t => t.passed).length;
  const failCount = targets.filter(t => !t.passed).length;
  
  return {
    timestamp: new Date().toISOString(),
    environment: env,
    results,
    targets,
    summary: {
      allTargetsMet: failures.length === 0,
      passCount,
      failCount,
      totalTime,
    },
  };
}

// ============================================================================
// Report Generator
// ============================================================================

function printReport(report: BenchmarkReport): void {
  console.log('\n' + '═'.repeat(62));
  console.log('                    BENCHMARK RESULTS SUMMARY');
  console.log('═'.repeat(62));
  
  // Results table
  console.log('\n📊 Individual Benchmarks:');
  console.log('─'.repeat(62));
  console.log(' Benchmark            │ Cold Time   │ Warm Time   │ Speedup │ Cache');
  console.log('─'.repeat(62));
  
  for (const r of report.results) {
    const name = r.name.padEnd(19);
    const cold = formatMs(r.coldTime).padStart(10);
    const warm = formatMs(r.warmTime).padStart(10);
    const speedup = r.speedupRatio.toFixed(2).padStart(7) + 'x';
    const cache = (r.cacheHitRate * 100).toFixed(0).padStart(4) + '%';
    console.log(` ${name} │ ${cold} │ ${warm} │ ${speedup} │ ${cache}`);
  }
  console.log('─'.repeat(62));
  
  // Target checks
  console.log('\n🎯 Performance Targets:');
  console.log('─'.repeat(62));
  
  for (const t of report.targets) {
    const icon = t.passed ? '✅' : '❌';
    const name = t.name.padEnd(20);
    console.log(` ${icon} ${name} │ Target: ${t.target.padStart(8)} │ Actual: ${formatMs(t.actual).padStart(10)}`);
  }
  console.log('─'.repeat(62));
  
  // Summary
  console.log('\n📈 Summary:');
  console.log('─'.repeat(62));
  console.log(` ✅ Passed: ${report.summary.passCount}`);
  console.log(` ❌ Failed: ${report.summary.failCount}`);
  console.log(` ⏱️  Total benchmark time: ${formatMs(report.summary.totalTime)}`);
  
  if (report.summary.allTargetsMet) {
    console.log('\n 🎉 ALL PERFORMANCE TARGETS MET!');
  } else {
    console.log('\n ⚠️  SOME TARGETS NOT MET:');
    for (const f of report.summary.failCount > 0 ? 
      report.targets.filter(t => !t.passed).map(t => `   - ${t.name}: ${t.details}`) : 
      ['   (see failures above)']) {
      console.log(f);
    }
  }
  
  console.log('\n' + '═'.repeat(62));
  console.log(` Benchmark completed at ${report.timestamp}`);
  console.log('═'.repeat(62));
}

function saveReport(report: BenchmarkReport): void {
  // Ensure results directory exists
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  
  // Save JSON report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(resultsDir, `benchmark-${timestamp}.json`);
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);
}

// ============================================================================
// CI Mode
// ============================================================================

function isCI(): boolean {
  return process.argv.includes('--ci') || process.env.CI === 'true';
}

function exitWithCode(report: BenchmarkReport): never {
  if (isCI()) {
    // In CI, exit with failure if any targets not met
    process.exit(report.summary.allTargetsMet ? 0 : 1);
  }
  process.exit(0);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  try {
    const report = await runAllBenchmarks();
    printReport(report);
    
    if (!isCI()) {
      saveReport(report);
    }
    
    exitWithCode(report);
  } catch (error) {
    console.error('\n❌ Benchmark suite failed:', error);
    process.exit(1);
  }
}

main();
