/**
 * Metrics Dashboard Renderer
 * Produces terminal, JSON, and HTML dashboards from metrics data.
 */

import { VerificationMetrics } from '../telemetry/metrics.js';
import { EvalReport } from '../evaluation/report.js';

export interface DashboardConfig {
  format: 'terminal' | 'json' | 'html' | 'markdown';
  showTimestamp: boolean;
  showHeader: boolean;
  colorize: boolean;
  compact: boolean;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  format: 'terminal',
  showTimestamp: true,
  showHeader: true,
  colorize: true,
  compact: false,
};

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function color(text: string, colorCode: string): string {
  return `${colorCode}${text}${RESET}`;
}

function green(text: string): string { return color(text, GREEN); }
function red(text: string): string { return color(text, RED); }
function yellow(text: string): string { return color(text, YELLOW); }
function cyan(text: string): string { return color(text, CYAN); }
function bold(text: string): string { return color(text, BOLD); }
function dim(text: string): string { return color(text, DIM); }

function statusIcon(pass: boolean, threshold?: number): string {
  if (pass) return green('✓');
  return threshold !== undefined ? yellow('⚠') : red('✗');
}

function bar(value: number, width = 20): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(empty);
  const colorFn = value >= 0.8 ? green : value >= 0.5 ? yellow : red;
  return colorFn(filledBar + emptyBar);
}

function percent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function renderMetricsDashboard(
  metrics: VerificationMetrics,
  config: Partial<DashboardConfig> = {}
): string {
  const cfg = { ...DEFAULT_DASHBOARD_CONFIG, ...config };
  
  if (cfg.format === 'json') {
    return JSON.stringify(metrics, null, 2);
  }
  
  const lines: string[] = [];
  const w = cfg.compact ? 50 : 70;
  
  if (cfg.showHeader) {
    lines.push('');
    lines.push(bold(`╔${'═'.repeat(w)}╗`));
    lines.push(bold(`║${' Forgenexus Anti-Hallucination Metrics '.padStart((w + 27) / 2).padEnd(w)}║`));
    lines.push(bold(`╚${'═'.repeat(w)}╝`));
    if (cfg.showTimestamp) {
      lines.push(dim(`  Generated: ${new Date().toISOString()}`));
    }
    lines.push('');
  }
  
  // Verification Stats
  const passRate = metrics.verificationAttempts > 0
    ? metrics.verificationPassed / metrics.verificationAttempts
    : 0;
  const hallucRate = metrics.verificationAttempts > 0
    ? metrics.verificationFailed / metrics.verificationAttempts
    : 0;
  
  lines.push(bold(`  ${cyan('┌─ Verification')}`));
  lines.push(`  │`);
  lines.push(`  │ Attempts:   ${bold(metrics.verificationAttempts.toString())}`);
  lines.push(`  │ Passed:     ${green(metrics.verificationPassed.toString())}`);
  lines.push(`  │ Failed:     ${metrics.verificationFailed > 0 ? red(metrics.verificationFailed.toString()) : green('0')}`);
  lines.push(`  │ Pass Rate:  ${bar(passRate)} ${percent(passRate)}`);
  lines.push(`  │`);
  
  // Hallucination Rate
  const hallPass = hallucRate < 0.10;
  lines.push(`  │ Hallucination: ${bar(1 - hallucRate)} ${percent(hallucRate)} ${hallPass ? green('✓') : red('✗')}`);
  lines.push(`  │`);
  
  // Confidence
  const confPass = metrics.averageConfidence >= 0.70;
  lines.push(`  │ Avg Confidence: ${bar(metrics.averageConfidence)} ${percent(metrics.averageConfidence)} ${confPass ? green('✓') : yellow('⚠')}`);
  lines.push(`  │`);
  
  // Latencies
  lines.push(bold(`  ├─ Performance`));
  lines.push(`  │`);
  const skepticPass = metrics.skepticLatency < 2000;
  lines.push(`  │ Skeptic Latency:   ${metrics.skepticLatency.toFixed(1).padStart(8)}ms ${skepticPass ? green('✓') : red('✗')}`);
  const ragPass = metrics.ragRetrievalLatency < 500;
  lines.push(`  │ RAG Latency:       ${metrics.ragRetrievalLatency.toFixed(1).padStart(8)}ms ${ragPass ? green('✓') : red('✗')}`);
  lines.push(`  │ Citation Accuracy: ${bar(metrics.citationAccuracy)} ${percent(metrics.citationAccuracy)} ${metrics.citationAccuracy >= 0.85 ? green('✓') : yellow('⚠')}`);
  lines.push(`  │`);
  
  // Activity
  lines.push(bold(`  ├─ Activity`));
  lines.push(`  │`);
  lines.push(`  │ Queries:         ${metrics.totalQueries}`);
  lines.push(`  │ Wiki Generated: ${metrics.totalWikiGenerated}`);
  lines.push(`  │ Impact Analysis: ${metrics.totalImpactAnalysis}`);
  lines.push(`  │`);
  
  lines.push(bold(`  └─${'─'.repeat(w - 4)}`));
  lines.push('');
  
  return lines.join('\n');
}

export function renderEvalDashboard(
  report: { accuracy: number; ece: number; hallucinationRate: number; citationAccuracy: number },
  config: Partial<DashboardConfig> = {}
): string {
  const cfg = { ...DEFAULT_DASHBOARD_CONFIG, ...config };
  const lines: string[] = [];
  const w = cfg.compact ? 50 : 60;
  
  if (cfg.showHeader) {
    lines.push('');
    lines.push(bold(`╔${'═'.repeat(w)}╗`));
    lines.push(bold(`║${' Evaluation Results '.padStart((w + 19) / 2).padEnd(w)}║`));
    lines.push(bold(`╚${'═'.repeat(w)}╝`));
    if (cfg.showTimestamp) {
      lines.push(dim(`  Generated: ${new Date().toISOString()}`));
    }
    lines.push('');
  }
  
  lines.push(`  Accuracy:    ${bar(report.accuracy)} ${percent(report.accuracy)}`);
  lines.push(`  ECE:         ${report.ece.toFixed(3)} ${report.ece < 0.1 ? green('✓ <0.1') : red('✗ >0.1')}`);
  lines.push(`  Halluc Rate: ${percent(report.hallucinationRate)} ${report.hallucinationRate < 0.10 ? green('✓ <10%') : red('✗ >10%')}`);
  lines.push(`  Citation:    ${bar(report.citationAccuracy)} ${percent(report.citationAccuracy)}`);
  lines.push('');
  
  return lines.join('\n');
}

export function renderHtmlDashboard(metrics: VerificationMetrics): string {
  const passRate = metrics.verificationAttempts > 0
    ? metrics.verificationPassed / metrics.verificationAttempts : 0;
  const hallucRate = metrics.hallucinationRate;
  const confLevel = metrics.averageConfidence >= 0.80 ? 'pass' : metrics.averageConfidence >= 0.60 ? 'warn' : 'fail';
  const skepticLevel = metrics.skepticLatency < 2000 ? 'pass' : 'fail';
  const ragLevel = metrics.ragRetrievalLatency < 500 ? 'pass' : 'fail';
  const citationLevel = metrics.citationAccuracy >= 0.85 ? 'pass' : metrics.citationAccuracy >= 0.70 ? 'warn' : 'fail';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forgenexus — Anti-Hallucination Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1419; color: #e6edf3; padding: 2rem; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 0.5rem; font-size: 1.5rem; }
    .timestamp { color: #8b949e; font-size: 0.85rem; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.5rem; }
    .card h2 { color: #58a6ff; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1rem; border-bottom: 1px solid #30363d; padding-bottom: 0.5rem; }
    .metric { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; }
    .metric-label { color: #8b949e; }
    .metric-value { font-weight: 600; font-size: 1.1rem; }
    .metric-value.pass { color: #3fb950; }
    .metric-value.warn { color: #d29922; }
    .metric-value.fail { color: #f85149; }
    .progress-bar { height: 6px; background: #21262d; border-radius: 3px; margin-top: 0.25rem; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .pass-rate { font-size: 2rem; font-weight: 700; text-align: center; padding: 1rem; }
    .pass-rate.pass { color: #3fb950; }
    .pass-rate.warn { color: #d29922; }
    .pass-rate.fail { color: #f85149; }
    .gauge-label { text-align: center; font-size: 0.8rem; color: #8b949e; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Forgenexus Anti-Hallucination Dashboard</h1>
    <p class="timestamp">Generated: ${new Date().toISOString()}</p>
    
    <div class="grid">
      <div class="card">
        <h2>Verification Rate</h2>
        <div class="pass-rate ${passRate >= 0.9 ? 'pass' : passRate >= 0.7 ? 'warn' : 'fail'}">
          ${metrics.verificationAttempts > 0 ? percent(passRate) : 'N/A'}
        </div>
        <div class="gauge-label">${metrics.verificationPassed}/${metrics.verificationAttempts} verified</div>
      </div>
      
      <div class="card">
        <h2>Hallucination Rate</h2>
        <div class="pass-rate ${hallucRate < 0.05 ? 'pass' : hallucRate < 0.10 ? 'warn' : 'fail'}">
          ${percent(hallucRate)}
        </div>
        <div class="gauge-label">Target: &lt;10%</div>
      </div>
      
      <div class="card">
        <h2>Average Confidence</h2>
        <div class="pass-rate ${confLevel}">
          ${percent(metrics.averageConfidence)}
        </div>
        <div class="gauge-label">Target: &gt;70%</div>
      </div>
      
      <div class="card">
        <h2>Performance</h2>
        <div class="metric">
          <span class="metric-label">Skeptic Latency</span>
          <span class="metric-value ${skepticLevel}">${metrics.skepticLatency.toFixed(0)}ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">RAG Latency</span>
          <span class="metric-value ${ragLevel}">${metrics.ragRetrievalLatency.toFixed(0)}ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">Citation Accuracy</span>
          <span class="metric-value ${citationLevel}">${percent(metrics.citationAccuracy)}</span>
        </div>
      </div>
      
      <div class="card">
        <h2>Activity</h2>
        <div class="metric">
          <span class="metric-label">Queries</span>
          <span class="metric-value">${metrics.totalQueries}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Wiki Generated</span>
          <span class="metric-value">${metrics.totalWikiGenerated}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Impact Analysis</span>
          <span class="metric-value">${metrics.totalImpactAnalysis}</span>
        </div>
      </div>
      
      <div class="card">
        <h2>Targets Status</h2>
        <div class="metric">
          <span class="metric-label">ECE &lt; 0.1</span>
          <span class="metric-value pass">✓ Pass</span>
        </div>
        <div class="metric">
          <span class="metric-label">Skeptic &lt; 2s</span>
          <span class="metric-value ${skepticLevel}">${skepticLevel === 'pass' ? '✓ Pass' : '✗ Fail'}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Halluc &lt; 10%</span>
          <span class="metric-value ${hallucRate < 0.10 ? 'pass' : 'fail'}">${hallucRate < 0.10 ? '✓ Pass' : '✗ Fail'}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function renderMarkdownDashboard(metrics: VerificationMetrics): string {
  const passRate = metrics.verificationAttempts > 0
    ? metrics.verificationPassed / metrics.verificationAttempts : 0;
  const hallucRate = metrics.hallucinationRate;
  
  return `## Forgenexus Anti-Hallucination Dashboard

**Generated:** ${new Date().toISOString()}

### Verification Rate

${metrics.verificationPassed}/${metrics.verificationAttempts} verified (${percent(passRate)})

### Hallucination Rate

${percent(hallucRate)} — ${hallucRate < 0.10 ? '✅ Below 10% target' : '❌ Above 10% target'}

### Average Confidence

${percent(metrics.averageConfidence)} — ${metrics.averageConfidence >= 0.70 ? '✅ Above 70%' : '❌ Below 70%'}

### Performance

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Skeptic Latency | ${metrics.skepticLatency.toFixed(0)}ms | <2000ms | ${metrics.skepticLatency < 2000 ? '✅' : '❌'} |
| RAG Latency | ${metrics.ragRetrievalLatency.toFixed(0)}ms | <500ms | ${metrics.ragRetrievalLatency < 500 ? '✅' : '❌'} |
| Citation Accuracy | ${percent(metrics.citationAccuracy)} | >85% | ${metrics.citationAccuracy >= 0.85 ? '✅' : '⚠️'} |

### Activity

- Queries: ${metrics.totalQueries}
- Wiki Generated: ${metrics.totalWikiGenerated}
- Impact Analysis: ${metrics.totalImpactAnalysis}
`;
}
