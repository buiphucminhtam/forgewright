/**
 * Config Command - Configuration management
 */
import type { Command } from 'commander';
import pc from 'picocolors';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { getConfig, CONFIG_PATHS, SOURCE_LABELS } from '../config/store.js';
import { buildEnvelope } from '../types/index.js';
import { VERSION } from '../version.js';

export function registerConfigCommands(program: Command): void {
  const config = program.command('config').description('Configuration management');

  // config get <key>
  config
    .command('get')
    .description('Get a configuration value')
    .argument('<key>', 'Configuration key')
    .option('-j, --json', 'Output as JSON')
    .action(async (key: string, options: { json: boolean }) => {
      await handleConfigGet(key, options.json);
    });

  // config set <key> <value>
  config
    .command('set')
    .description('Set a configuration value')
    .argument('<key>', 'Configuration key')
    .argument('<value>', 'Configuration value')
    .option('-j, --json', 'Output as JSON')
    .action(async (key: string, value: string, options: { json: boolean }) => {
      await handleConfigSet(key, value, options.json);
    });

  // config list
  config
    .command('list')
    .description('List all configuration values')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: { json: boolean }) => {
      await handleConfigList(options.json);
    });

  // config init
  config
    .command('init')
    .description('Initialize configuration file')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: { json: boolean }) => {
      await handleConfigInit(options.json);
    });

  // config delete <key>
  config
    .command('delete')
    .description('Delete a configuration value')
    .argument('<key>', 'Configuration key')
    .option('-j, --json', 'Output as JSON')
    .action(async (key: string, options: { json: boolean }) => {
      await handleConfigDelete(key, options.json);
    });
}

async function handleConfigGet(key: string, useJson: boolean): Promise<void> {
  const startTime = Date.now();
  const config = getConfig();

  const entry = config.getEntry(key);

  if (!entry) {
    if (useJson || !process.stdout.isTTY) {
      const envelope = buildEnvelope('config.get', { key, found: false }, {
        ok: false,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: { code: 3, message: `Configuration key not found: ${key}` },
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc.red(`Error: Configuration key not found: ${key}`));
    }
    process.exit(3);
  }

  if (useJson || !process.stdout.isTTY) {
    const envelope = buildEnvelope('config.get', {
      key,
      value: entry.value,
      source: entry.source,
      sourceLabel: SOURCE_LABELS[entry.source],
    }, {
      ok: true,
      duration_ms: Date.now() - startTime,
      version: VERSION,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc.bold(`  ${key}`));
    console.log(`  ${pc.gray('─'.repeat(50))}`);
    console.log(`  Value: ${pc.green(JSON.stringify(entry.value, null, 2))}`);
    console.log(`  Source: ${pc.cyan(SOURCE_LABELS[entry.source])}`);
    console.log();
  }

  process.exit(0);
}

async function handleConfigSet(key: string, value: string, useJson: boolean): Promise<void> {
  const startTime = Date.now();
  const config = getConfig();

  // Parse value
  let parsedValue: unknown;
  try {
    // Try JSON parse first
    parsedValue = JSON.parse(value);
  } catch {
    // Use as string
    parsedValue = value;
  }

  // Set in config
  config.set(key, parsedValue, 'USER_CONFIG');

  // Also persist to user config file
  const configPath = CONFIG_PATHS.USER_CONFIG;
  mkdirSync(dirname(configPath), { recursive: true });

  // Load existing config
  let existingConfig: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      existingConfig = JSON.parse(content);
    } catch {
      // Ignore parse errors
    }
  }

  // Update and save
  existingConfig[key] = parsedValue;
  writeFileSync(configPath, JSON.stringify(existingConfig, null, 2) + '\n');

  if (useJson || !process.stdout.isTTY) {
    const envelope = buildEnvelope('config.set', {
      key,
      value: parsedValue,
      source: 'USER_CONFIG',
      persisted: true,
    }, {
      ok: true,
      duration_ms: Date.now() - startTime,
      version: VERSION,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc.green(`  ✓ ${key}`));
    console.log(`  ${pc.gray('─'.repeat(50))}`);
    console.log(`  Value: ${JSON.stringify(parsedValue)}`);
    console.log(`  Saved to: ${pc.cyan(configPath)}`);
    console.log();
  }

  process.exit(0);
}

async function handleConfigList(useJson: boolean): Promise<void> {
  const startTime = Date.now();
  const config = getConfig();

  const entries = config.getAll();

  if (useJson || !process.stdout.isTTY) {
    const envelope = buildEnvelope('config.list', {
      entries: entries.map((e) => ({
        key: e.key,
        value: e.value,
        source: e.source,
        sourceLabel: SOURCE_LABELS[e.source],
      })),
      total: entries.length,
    }, {
      ok: true,
      duration_ms: Date.now() - startTime,
      version: VERSION,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc.bold('  Configuration\n'));

    // Group by source
    const bySource = new Map<string, typeof entries>();
    for (const entry of entries) {
      const source = SOURCE_LABELS[entry.source];
      const list = bySource.get(source) || [];
      list.push(entry);
      bySource.set(source, list);
    }

    for (const [source, sourceEntries] of bySource) {
      console.log(pc.cyan(`  ${source}`));
      console.log(pc.gray('  ' + '─'.repeat(40)));

      for (const entry of sourceEntries) {
        const valueStr = typeof entry.value === 'string'
          ? entry.value
          : JSON.stringify(entry.value);
        console.log(`    ${pc.green(entry.key.padEnd(30))} ${pc.dim(valueStr.slice(0, 50))}`);
      }
      console.log();
    }

    console.log(pc.dim('  Use --json for machine-readable output'));
    console.log();
  }

  process.exit(0);
}

async function handleConfigInit(useJson: boolean): Promise<void> {
  const startTime = Date.now();
  const configPath = CONFIG_PATHS.USER_CONFIG;

  // Create directory
  mkdirSync(dirname(configPath), { recursive: true });

  // Create default config
  const defaultConfig = {
    version: VERSION,
    defaults: {
      debug: false,
      quiet: false,
      json: false,
      color: true,
    },
  };

  if (existsSync(configPath)) {
    if (useJson || !process.stdout.isTTY) {
      const envelope = buildEnvelope('config.init', {
        path: configPath,
        status: 'already_exists',
      }, {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION,
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.log(pc.yellow(`  Configuration already exists at ${configPath}`));
    }
  } else {
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');

    if (useJson || !process.stdout.isTTY) {
      const envelope = buildEnvelope('config.init', {
        path: configPath,
        status: 'created',
      }, {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION,
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.log();
      console.log(pc.green(`  ✓ Created ${configPath}`));
      console.log();
    }
  }

  process.exit(0);
}

async function handleConfigDelete(key: string, useJson: boolean): Promise<void> {
  const startTime = Date.now();
  const config = getConfig();

  if (!config.has(key)) {
    if (useJson || !process.stdout.isTTY) {
      const envelope = buildEnvelope('config.delete', { key, found: false }, {
        ok: false,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: { code: 3, message: `Configuration key not found: ${key}` },
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc.red(`Error: Configuration key not found: ${key}`));
    }
    process.exit(3);
  }

  config.delete(key);

  if (useJson || !process.stdout.isTTY) {
    const envelope = buildEnvelope('config.delete', { key, deleted: true }, {
      ok: true,
      duration_ms: Date.now() - startTime,
      version: VERSION,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log(pc.green(`  ✓ Deleted ${key}`));
  }

  process.exit(0);
}
