/**
 * Doctor Command - Diagnostics and health checks
 */
import type { Command } from 'commander';
import pc from 'picocolors';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { buildEnvelope } from '../types/index.js';
import { VERSION } from '../version.js';

export interface HealthCheck {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  details?: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run diagnostics and health checks')
    .option('-v, --verbose', 'Verbose output')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: { verbose: boolean; json: boolean }) => {
      await handleDoctor(options);
    });
}

async function handleDoctor(options: { verbose: boolean; json: boolean }): Promise<void> {
  const startTime = Date.now();
  const useJson = options.json || !process.stdout.isTTY;
  const verbose = options.verbose;

  const checks: HealthCheck[] = [];

  // Run all health checks
  checks.push(checkNodeVersion());
  checks.push(checkForgewright());
  checks.push(checkConfig());
  checks.push(checkMemory());
  checks.push(checkForgeNexus());

  const healthy = checks.filter((c) => c.status === 'ok').length;
  const warnings = checks.filter((c) => c.status === 'warning').length;
  const errors = checks.filter((c) => c.status === 'error').length;

  const allOk = errors === 0;

  if (useJson) {
    const envelope = buildEnvelope('doctor.check', {
      checks,
      summary: {
        healthy,
        warnings,
        errors,
        allOk,
      },
    }, {
      ok: allOk,
      duration_ms: Date.now() - startTime,
      version: VERSION,
      error: allOk ? undefined : { code: errors > 0 ? 1 : 2, message: `${errors} errors, ${warnings} warnings` },
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printHumanReadable(checks, healthy, warnings, errors, verbose);
  }

  process.exit(allOk ? 0 : errors > 0 ? 1 : 0);
}

function checkNodeVersion(): HealthCheck {
  const version = process.version;
  const match = version.match(/^v(\d+)\./);

  if (!match) {
    return {
      name: 'Node.js Version',
      status: 'error',
      message: `Unknown version: ${version}`,
    };
  }

  const major = parseInt(match[1], 10);

  if (major < 18) {
    return {
      name: 'Node.js Version',
      status: 'error',
      message: `Node.js ${major} is too old. Minimum: 18`,
      details: `Current: ${version}`,
    };
  }

  if (major < 20) {
    return {
      name: 'Node.js Version',
      status: 'warning',
      message: `Node.js ${major} is older than recommended`,
      details: `Current: ${version}, Recommended: 20+`,
    };
  }

  return {
    name: 'Node.js Version',
    status: 'ok',
    message: version,
  };
}

function checkForgewright(): HealthCheck {
  // Check if we're in a forgewright project
  const cwd = process.cwd();
  const forgewrightRoot = findForgewrightRoot(cwd);

  if (!forgewrightRoot) {
    return {
      name: 'Forgewright Project',
      status: 'warning',
      message: 'Not in a Forgewright project',
      details: 'Some features may not be available',
    };
  }

  return {
    name: 'Forgewright Project',
    status: 'ok',
    message: `Found at ${forgewrightRoot}`,
  };
}

function checkConfig(): HealthCheck {
  const userConfig = resolve(homedir(), '.config', 'forgewright', 'config.json');
  const legacyConfig = resolve(homedir(), '.forgewright', 'config.json');

  if (existsSync(userConfig)) {
    return {
      name: 'User Configuration',
      status: 'ok',
      message: 'Configuration file found',
      details: userConfig,
    };
  }

  if (existsSync(legacyConfig)) {
    return {
      name: 'User Configuration',
      status: 'warning',
      message: 'Using legacy config location',
      details: `${legacyConfig} - consider migrating to ${userConfig}`,
    };
  }

  return {
    name: 'User Configuration',
    status: 'warning',
    message: 'No configuration file found',
    details: 'Run: forge config init',
  };
}

function checkMemory(): HealthCheck {
  const memoryPath = resolve(process.cwd(), '.forgewright', 'memory.jsonl');

  if (!existsSync(memoryPath)) {
    return {
      name: 'Memory Store',
      status: 'warning',
      message: 'No memory store found',
      details: 'Run: forge config init',
    };
  }

  return {
    name: 'Memory Store',
    status: 'ok',
    message: 'Memory store found',
    details: memoryPath,
  };
}

function checkForgeNexus(): HealthCheck {
  try {
    // Try to find forgenexus
    const result = execSync('npx forgenexus --version 2>/dev/null || echo "not_found"', {
      encoding: 'utf-8',
      timeout: 5000,
    });

    if (result.trim() === 'not_found') {
      return {
        name: 'ForgeNexus',
        status: 'warning',
        message: 'ForgeNexus not installed',
        details: 'Run: npm install -g forgenexus',
      };
    }

    return {
      name: 'ForgeNexus',
      status: 'ok',
      message: result.trim(),
    };
  } catch {
    return {
      name: 'ForgeNexus',
      status: 'warning',
      message: 'Could not verify ForgeNexus',
      details: 'Run: npx forgenexus --version',
    };
  }
}

function findForgewrightRoot(cwd: string): string | null {
  let current = cwd;

  while (current !== '/') {
    const configPath = join(current, '.forgewright');
    if (existsSync(configPath)) {
      return current;
    }

    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function printHumanReadable(
  checks: HealthCheck[],
  healthy: number,
  warnings: number,
  errors: number,
  verbose: boolean
): void {
  console.log();
  console.log(pc.bold('╔════════════════════════════════════════════════════════════════╗'));
  console.log(pc.bold('║') + '              Forgewright Doctor'.padEnd(62) + pc.bold('║'));
  console.log(pc.bold('╠════════════════════════════════════════════════════════════════╣'));

  const allOk = errors === 0;
  const statusIcon = allOk ? pc.green('✓') : pc.red('✗');
  const statusText = allOk ? pc.green('All checks passed') : pc.red(`${errors} errors, ${warnings} warnings`);

  console.log(pc.bold('║') + `  ${statusIcon} ${statusText}`.padEnd(62) + pc.bold('║'));
  console.log(pc.bold('╚════════════════════════════════════════════════════════════════╝'));
  console.log();

  for (const check of checks) {
    const icon = check.status === 'ok'
      ? pc.green('✓')
      : check.status === 'warning'
        ? pc.yellow('⚠')
        : pc.red('✗');

    const statusColor = check.status === 'ok'
      ? pc.green
      : check.status === 'warning'
        ? pc.yellow
        : pc.red;

    console.log(`  ${icon} ${pc.bold(check.name)}`);
    console.log(`    ${statusColor(check.message)}`);

    if (verbose && check.details) {
      console.log(`    ${pc.dim(check.details)}`);
    }
  }

  console.log();

  if (warnings > 0 || errors > 0) {
    console.log(pc.dim('  Run with --verbose for more details'));
    console.log(pc.dim('  Run with --json for machine-readable output'));
  }
}
