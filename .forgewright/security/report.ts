/**
 * Forgewright Security Report Generator
 *
 * Generates formatted security scan reports in various formats.
 */

import type { ScanResult, Finding } from './scanner';
import { calculateGrade, getGradeDetails, type SeveritySummary } from './grader';

export interface ReportOptions {
  format: 'text' | 'markdown' | 'html' | 'json' | 'github';
  includeCode?: boolean;
  maxFindings?: number;
  groupBy?: 'severity' | 'file' | 'rule';
}

/**
 * Generate a text report
 */
export function generateTextReport(result: ScanResult): string {
  const grade = calculateGrade(result.summary);
  const lines: string[] = [];

  // Header
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║            FORGEWRIGHT SECURITY SCAN REPORT                   ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  // Metadata
  lines.push('📋 SCAN DETAILS');
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push(`   Timestamp:    ${result.timestamp}`);
  lines.push(`   Base Ref:      ${result.baseRef}`);
  lines.push(`   Head Ref:      ${result.headRef}`);
  lines.push(`   Files Scanned: ${result.filesScanned}`);
  lines.push(`   Lines of Code: ${result.totalLines}`);
  lines.push('');

  // Summary with grade
  lines.push('📊 SECURITY GRADE');
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push(`   ${getGradeEmoji(grade)} GRADE: ${grade}`);
  lines.push('');
  lines.push(`   Critical:  █${'█'.repeat(Math.min(result.summary.critical, 20))}${''.padEnd(Math.max(0, 20 - result.summary.critical), '░')} ${result.summary.critical}`);
  lines.push(`   High:      █${'█'.repeat(Math.min(result.summary.high, 20))}${''.padEnd(Math.max(0, 20 - result.summary.high), '░')} ${result.summary.high}`);
  lines.push(`   Medium:    █${'█'.repeat(Math.min(result.summary.medium, 20))}${''.padEnd(Math.max(0, 20 - result.summary.medium), '░')} ${result.summary.medium}`);
  lines.push(`   Low:       █${'█'.repeat(Math.min(result.summary.low, 20))}${''.padEnd(Math.max(0, 20 - result.summary.low), '░')} ${result.summary.low}`);
  lines.push(`   Info:      █${'█'.repeat(Math.min(result.summary.info, 20))}${''.padEnd(Math.max(0, 20 - result.summary.info), '░')} ${result.summary.info}`);
  lines.push('');

  // Findings
  if (result.findings.length > 0) {
    lines.push('🔍 DETAILED FINDINGS');
    lines.push('─────────────────────────────────────────────────────────────');

    // Group by severity
    const bySeverity = groupBySeverity(result.findings);

    for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
      const findings = bySeverity[severity];
      if (findings.length === 0) continue;

      lines.push('');
      lines.push(`  ${getSeverityEmoji(severity)} ${severity.toUpperCase()} SEVERITY (${findings.length})`);
      lines.push('');

      for (const finding of findings.slice(0, 10)) {
        lines.push(`    ┌─ ${finding.ruleName}`);
        lines.push(`    │  File: ${finding.file}:${finding.line}`);
        lines.push(`    │  Rule: ${finding.ruleId}`);
        if (finding.cwe) {
          lines.push(`    │  CWE:  ${finding.cwe}`);
        }
        lines.push(`    │`);
        lines.push(`    └─ ${finding.matchedText}`);
        if (finding.remediation) {
          lines.push(`      → ${finding.remediation}`);
        }
        lines.push('');
      }

      if (findings.length > 10) {
        lines.push(`    ... and ${findings.length - 10} more ${severity} findings`);
        lines.push('');
      }
    }
  } else {
    lines.push('✅ NO SECURITY ISSUES FOUND');
    lines.push('');
    lines.push('   Your code passed all security checks. Great job!');
    lines.push('');
  }

  // Footer
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`   Report generated: ${new Date().toISOString()}`);
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Generate a Markdown report
 */
export function generateMarkdownReport(result: ScanResult): string {
  const grade = calculateGrade(result.summary);
  const details = getGradeDetails(result.summary);
  const lines: string[] = [];

  // Header
  lines.push('# 🔒 Forgewright Security Scan Report');
  lines.push('');
  lines.push('## Scan Details');
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| Timestamp | ${result.timestamp} |`);
  lines.push(`| Base Ref | \`${result.baseRef}\` |`);
  lines.push(`| Head Ref | \`${result.headRef}\` |`);
  lines.push(`| Files Scanned | ${result.filesScanned} |`);
  lines.push(`| Lines of Code | ${result.totalLines} |`);
  lines.push('');

  // Grade
  lines.push('## Security Grade');
  lines.push('');
  lines.push(`### ${getGradeEmoji(grade)} **GRADE: ${grade}**`);
  lines.push('');
  lines.push(details.description);
  lines.push('');
  lines.push('### Breakdown');
  lines.push('');
  for (const item of details.breakdown) {
    lines.push(`- [${item.met ? 'x' : ' '}] ${item.criteria}`);
  }
  lines.push('');

  // Summary table
  lines.push('### Finding Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  lines.push(`| 🔴 Critical | ${result.summary.critical} |`);
  lines.push(`| 🟠 High | ${result.summary.high} |`);
  lines.push(`| 🟡 Medium | ${result.summary.medium} |`);
  lines.push(`| 🔵 Low | ${result.summary.low} |`);
  lines.push(`| ⚪ Info | ${result.summary.info} |`);
  lines.push('');

  // Findings
  if (result.findings.length > 0) {
    lines.push('## Findings');
    lines.push('');

    const bySeverity = groupBySeverity(result.findings);

    for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
      const findings = bySeverity[severity];
      if (findings.length === 0) continue;

      lines.push(`### ${getSeverityEmoji(severity)} ${severity.toUpperCase()} (${findings.length})`);
      lines.push('');

      for (const finding of findings.slice(0, 20)) {
        lines.push(`#### ${finding.ruleName}`);
        lines.push('');
        lines.push(`**File:** \`${finding.file}:${finding.line}\``);
        lines.push('');
        lines.push(`**Rule ID:** \`${finding.ruleId}\``);
        if (finding.cwe) {
          lines.push(`**CWE:** ${finding.cwe}`);
        }
        lines.push('');
        lines.push('**Description:**');
        lines.push(finding.description);
        lines.push('');
        lines.push('```');
        lines.push(finding.matchedText);
        lines.push('```');
        if (finding.remediation) {
          lines.push('');
          lines.push(`> **Fix:** ${finding.remediation}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generate an HTML report
 */
export function generateHtmlReport(result: ScanResult): string {
  const grade = calculateGrade(result.summary);
  const details = getGradeDetails(result.summary);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Scan Report - Grade ${grade}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #24292f; background: #f6f8fa; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1a1f36 0%, #2d3748 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 24px; }
    .header h1 { font-size: 28px; margin-bottom: 8px; }
    .grade-badge { display: inline-block; font-size: 64px; font-weight: bold; padding: 20px 40px; border-radius: 12px; margin: 16px 0; }
    .grade-A { background: #238636; color: white; }
    .grade-B { background: #1a7f37; color: white; }
    .grade-C { background: #9e6a03; color: white; }
    .grade-D { background: #bd561d; color: white; }
    .grade-F { background: #da3633; color: white; }
    .card { background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h2 { margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #eaecef; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eaecef; }
    th { background: #f6f8fa; font-weight: 600; }
    .severity-critical { color: #cf222e; font-weight: bold; }
    .severity-high { color: #bf3989; font-weight: bold; }
    .severity-medium { color: #9e6a03; font-weight: bold; }
    .severity-low { color: #57606a; }
    .severity-info { color: #8b949e; }
    .code-block { background: #f6f8fa; padding: 16px; border-radius: 6px; font-family: 'Monaco', 'Menlo', monospace; font-size: 13px; overflow-x: auto; }
    .finding { margin-bottom: 24px; padding: 16px; background: #f6f8fa; border-radius: 8px; border-left: 4px solid; }
    .finding.critical { border-left-color: #cf222e; }
    .finding.high { border-left-color: #bf3989; }
    .finding.medium { border-left-color: #9e6a03; }
    .finding.low { border-left-color: #57606a; }
    .finding.info { border-left-color: #8b949e; }
    .meta { display: flex; gap: 16px; font-size: 14px; color: #57606a; margin: 8px 0; }
    .meta span { display: flex; align-items: center; gap: 4px; }
    .remediation { background: #dafbe1; border: 1px solid #238636; padding: 12px; border-radius: 6px; margin-top: 12px; }
    .remediation strong { color: #238636; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔒 Forgewright Security Scan</h1>
      <p>Automated security analysis report</p>
      <div class="grade-badge grade-${grade}">${grade}</div>
      <p>${details.description}</p>
    </div>

    <div class="card">
      <h2>📋 Scan Details</h2>
      <table>
        <tr><th>Property</th><th>Value</th></tr>
        <tr><td>Timestamp</td><td>${result.timestamp}</td></tr>
        <tr><td>Base Ref</td><td><code>${result.baseRef}</code></td></tr>
        <tr><td>Head Ref</td><td><code>${result.headRef}</code></td></tr>
        <tr><td>Files Scanned</td><td>${result.filesScanned}</td></tr>
        <tr><td>Lines of Code</td><td>${result.totalLines}</td></tr>
      </table>
    </div>

    <div class="card">
      <h2>📊 Finding Summary</h2>
      <table>
        <tr><th>Severity</th><th>Count</th></tr>
        <tr><td class="severity-critical">🔴 Critical</td><td>${result.summary.critical}</td></tr>
        <tr><td class="severity-high">🟠 High</td><td>${result.summary.high}</td></tr>
        <tr><td class="severity-medium">🟡 Medium</td><td>${result.summary.medium}</td></tr>
        <tr><td class="severity-low">🔵 Low</td><td>${result.summary.low}</td></tr>
        <tr><td class="severity-info">⚪ Info</td><td>${result.summary.info}</td></tr>
      </table>
    </div>

    ${result.findings.length > 0 ? `
    <div class="card">
      <h2>🔍 Detailed Findings</h2>
      ${result.findings.map(f => `
        <div class="finding ${f.severity}">
          <h3>${f.ruleName}</h3>
          <div class="meta">
            <span>📁 ${f.file}:${f.line}</span>
            <span>🏷️ ${f.ruleId}</span>
            ${f.cwe ? `<span>CWE: ${f.cwe}</span>` : ''}
          </div>
          <p>${f.description}</p>
          <div class="code-block">${escapeHtml(f.matchedText)}</div>
          ${f.remediation ? `
          <div class="remediation">
            <strong>✅ Fix:</strong> ${f.remediation}
          </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    ` : `
    <div class="card" style="text-align: center; padding: 48px;">
      <h2 style="color: #238636;">✅ No Security Issues Found</h2>
      <p>Your code passed all security checks. Great job!</p>
    </div>
    `}
  </div>
</body>
</html>`;

  return html;
}

/**
 * Generate GitHub Actions output
 */
export function generateGitHubOutput(result: ScanResult): {
  conclusion: string;
  output: {
    title: string;
    summary: string;
    text: string;
  };
} {
  const grade = calculateGrade(result.summary);
  const details = getGradeDetails(result.summary);

  const criticalHigh = result.findings.filter(
    f => f.severity === 'critical' || f.severity === 'high'
  );

  const summary = [
    `## 🔒 Security Scan: **${grade}**`,
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Files | ${result.filesScanned} |`,
    `| Lines | ${result.totalLines} |`,
    `| Critical | ${result.summary.critical} |`,
    `| High | ${result.summary.high} |`,
    `| Medium | ${result.summary.medium} |`,
    `| Low | ${result.summary.low} |`,
    '',
    details.description
  ].join('\n');

  let text = '';

  if (criticalHigh.length > 0) {
    text += '### 🚨 Critical & High Severity Issues\n\n';
    for (const finding of criticalHigh.slice(0, 20)) {
      text += `**${finding.ruleName}**\n`;
      text += `- File: \`${finding.file}:${finding.line}\`\n`;
      text += `- Rule: \`${finding.ruleId}\`\n`;
      if (finding.cwe) text += `- CWE: ${finding.cwe}\n`;
      if (finding.remediation) text += `- Fix: ${finding.remediation}\n`;
      text += '\n';
    }
    if (criticalHigh.length > 20) {
      text += `_... and ${criticalHigh.length - 20} more critical/high issues_\n\n`;
    }
  }

  if (result.summary.medium > 0) {
    text += `### ⚠️ Medium Severity Issues\n`;
    text += `Found ${result.summary.medium} medium severity issues. Review the full report for details.\n\n`;
  }

  const shouldFail = grade === 'F' || result.summary.critical > 2;

  return {
    conclusion: shouldFail ? 'failure' : 'success',
    output: {
      title: `Security Scan: ${grade}`,
      summary,
      text
    }
  };
}

/**
 * Group findings by severity
 */
function groupBySeverity(findings: Finding[]): Record<string, Finding[]> {
  const groups: Record<string, Finding[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: []
  };

  for (const finding of findings) {
    if (groups[finding.severity]) {
      groups[finding.severity].push(finding);
    }
  }

  return groups;
}

/**
 * Get emoji for grade
 */
function getGradeEmoji(grade: string): string {
  const emojis: Record<string, string> = {
    'A': '🟢',
    'B': '🔵',
    'C': '🟡',
    'D': '🟠',
    'F': '🔴'
  };
  return emojis[grade] || '⚪';
}

/**
 * Get emoji for severity
 */
function getSeverityEmoji(severity: string): string {
  const emojis: Record<string, string> = {
    critical: '💀',
    high: '🚨',
    medium: '⚠️',
    low: 'ℹ️',
    info: '📝'
  };
  return emojis[severity] || '•';
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate report based on options
 */
export function generateReport(
  result: ScanResult,
  options: ReportOptions
): string {
  switch (options.format) {
    case 'text':
      return generateTextReport(result);
    case 'markdown':
      return generateMarkdownReport(result);
    case 'html':
      return generateHtmlReport(result);
    case 'json':
      return JSON.stringify(result, null, 2);
    default:
      return generateTextReport(result);
  }
}
