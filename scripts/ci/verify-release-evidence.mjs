#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertAuditPolicy,
  assertCoveragePolicy,
  assertRequiredPaths,
  forbiddenMcpPaths,
} from './release-evidence-policy.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'forgewright-release-evidence-'));

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function pack(workspace) {
  const output = run('npm', [
    'pack',
    '--workspace',
    workspace,
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    temp,
  ]);
  const report = JSON.parse(output)[0];
  if (!report?.filename || !Array.isArray(report.files)) {
    throw new Error(`npm pack returned an invalid report for ${workspace}`);
  }
  return report;
}

try {
  const audit = JSON.parse(run('npm', ['audit', '--omit=dev', '--audit-level=high', '--json']));
  const vulnerabilities = audit.metadata?.vulnerabilities ?? {};
  assertAuditPolicy(vulnerabilities);

  const coverage = JSON.parse(readFileSync(join(root, 'mcp/coverage/coverage-final.json'), 'utf8'));
  const percentage = (covered, total) => (total === 0 ? 100 : Math.floor((covered * 10000) / total) / 100);
  const counts = {
    statements: Object.values(coverage).flatMap((file) => Object.values(file.s)),
    functions: Object.values(coverage).flatMap((file) => Object.values(file.f)),
    branches: Object.values(coverage).flatMap((file) => Object.values(file.b).flat()),
  };
  counts.lines = Object.values(coverage).flatMap((file) => {
    const byLine = new Map();
    for (const [id, count] of Object.entries(file.s)) {
      const line = file.statementMap[id].start.line;
      byLine.set(line, Math.max(byLine.get(line) ?? 0, count));
    }
    return [...byLine.values()];
  });
  const totals = Object.fromEntries(
    Object.entries(counts).map(([metric, values]) => [
      metric,
      { pct: percentage(values.filter((count) => count > 0).length, values.length) },
    ]),
  );
  const thresholds = { lines: 70, statements: 70, functions: 70, branches: 60 };
  assertCoveragePolicy(totals, thresholds);

  const mcp = pack('mcp');
  const cli = pack('src/cli');
  const forbiddenMcp = forbiddenMcpPaths(mcp.files);
  if (forbiddenMcp.length > 0) {
    throw new Error(`MCP tarball contains forbidden files: ${forbiddenMcp.join(', ')}`);
  }

  assertRequiredPaths(mcp, ['build/index.js']);
  assertRequiredPaths(cli, ['dist/index.js', 'dist/index.d.ts']);

  for (const report of [mcp, cli]) {
    const destination = join(temp, report.name.replaceAll('/', '-').replaceAll('@', ''));
    mkdirSync(destination);
    run('tar', ['-xzf', join(temp, report.filename), '-C', destination]);
    const entrypoint = report === mcp ? 'build/index.js' : 'dist/index.js';
    run('node', ['--check', join(destination, 'package', entrypoint)]);
  }
  const smokeProject = join(temp, 'cli-smoke');
  mkdirSync(smokeProject);
  run('npm', ['init', '--yes'], { cwd: smokeProject });
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, cli.filename)], { cwd: smokeProject });
  run('node', [join(smokeProject, 'node_modules', '.bin', 'forge'), '--help'], { cwd: smokeProject });

  console.log(`security: production vulnerabilities high=0 critical=0`);
  console.log(`coverage: lines=${totals.lines.pct}% statements=${totals.statements.pct}% functions=${totals.functions.pct}% branches=${totals.branches.pct}%`);
  console.log(`package: ${mcp.name}@${mcp.version} entries=${mcp.entryCount}, ${cli.name}@${cli.version} entries=${cli.entryCount}`);
  console.log('release evidence: PASS');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
