/**
 * Tools Command - Tool registry management
 */
import type { Command } from 'commander';
import pc from 'picocolors';
import {
  getAllTools,
  getToolsByCategory,
  searchTools,
  getCategories,
  getToolCount,
  getToolCountByCategory,
} from '../core/tool-registry.js';
import { buildEnvelope } from '../types/index.js';
import { VERSION } from '../version.js';

export interface ToolsListOptions {
  category?: string;
  search?: string;
  json: boolean;
}

export function registerToolsCommands(program: Command): void {
  // tools list
  program
    .command('tools')
    .description('Tool registry management')
    .argument('[command]', 'subcommand', 'list')
    .option('-c, --category <category>', 'Filter by category')
    .option('-s, --search <query>', 'Search tools')
    .option('-j, --json', 'Output as JSON')
    .action(async (command: string, options: ToolsListOptions) => {
      await handleToolsCommand(command, options);
    });

  // tools list (alias)
  program
    .command('tools:list')
    .description('List all tools')
    .option('-c, --category <category>', 'Filter by category')
    .option('-s, --search <query>', 'Search tools')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: ToolsListOptions) => {
      await handleToolsCommand('list', options);
    });

  // tools search
  program
    .command('tools:search')
    .description('Search tools')
    .argument('<query>', 'Search query')
    .option('-j, --json', 'Output as JSON')
    .action(async (query: string, options: { json: boolean }) => {
      await handleToolsCommand('list', { ...options, search: query });
    });
}

async function handleToolsCommand(command: string, options: ToolsListOptions): Promise<void> {
  const startTime = Date.now();
  const useJson = options.json || !process.stdout.isTTY;

  try {
    let tools;
    let filtered = false;

    if (options.search) {
      tools = searchTools(options.search);
      filtered = true;
    } else if (options.category) {
      tools = getToolsByCategory(options.category);
      filtered = true;
    } else {
      tools = getAllTools();
    }

    const duration_ms = Date.now() - startTime;

    if (useJson) {
      const envelope = buildEnvelope('tools.list', {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          category: t.category,
          inputSchema: t.inputSchema,
        })),
        total: tools.length,
        filtered,
        category: options.category ?? null,
        search: options.search ?? null,
      }, {
        ok: true,
        duration_ms,
        version: VERSION,
      });

      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printHumanReadable(tools, options.category, options.search);
    }

    process.exit(0);
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    if (useJson) {
      const envelope = buildEnvelope('tools.list', null, {
        ok: false,
        duration_ms,
        version: VERSION,
        error: {
          code: 1,
          message,
        },
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc.red(`Error: ${message}`));
    }

    process.exit(1);
  }
}

function printHumanReadable(
  tools: readonly { name: string; description: string; category: string }[],
  category?: string,
  search?: string
): void {
  const headerColor = pc.bold;
  const categoryColor = pc.cyan;
  const nameColor = pc.green;

  console.log();
  console.log(headerColor('╔════════════════════════════════════════════════════════════════╗'));
  console.log(headerColor('║') + '              Forgewright Tool Registry'.padEnd(62) + headerColor('║'));
  console.log(headerColor('╠════════════════════════════════════════════════════════════════╣'));

  // Summary
  const counts = getToolCountByCategory();
  const summaryParts: string[] = [];
  for (const [cat, count] of Object.entries(counts)) {
    summaryParts.push(`${categoryColor(cat)}: ${count}`);
  }
  console.log(headerColor('║') + `  Total: ${getToolCount()} tools | ${summaryParts.join(' | ')}`.padEnd(62) + headerColor('║'));

  if (category || search) {
    const filterDesc = category ? `Category: ${categoryColor(category)}` : `Search: "${search}"`;
    console.log(headerColor('║') + `  Filter: ${filterDesc}`.padEnd(62) + headerColor('║'));
  }

  console.log(headerColor('╚════════════════════════════════════════════════════════════════╝'));
  console.log();

  if (tools.length === 0) {
    console.log(pc.yellow('  No tools found matching criteria'));
    return;
  }

  // Group by category
  const grouped = new Map<string, typeof tools>();
  for (const tool of tools) {
    const existing = grouped.get(tool.category) || [];
    existing.push(tool);
    grouped.set(tool.category, existing);
  }

  for (const [cat, catTools] of grouped) {
    console.log(pc.bold(`\n  ${categoryColor(cat.toUpperCase())}`));
    console.log(pc.dim('  ' + '─'.repeat(50)));

    for (const tool of catTools) {
      console.log(`    ${nameColor(tool.name)}`);
      console.log(`      ${pc.dim(tool.description)}`);
    }
  }

  console.log();
  console.log(pc.dim('  Use --json for machine-readable output'));
  console.log();
}
