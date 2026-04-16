/**
 * Skills Command - Skill management
 */
import type { Command } from 'commander';
import pc from 'picocolors';
import { getAllTools, getCategories, getToolCountByCategory, searchTools } from '../core/tool-registry.js';
import { buildEnvelope } from '../types/index.js';
import { VERSION } from '../version.js';

export interface SkillsListOptions {
  category?: string;
  search?: string;
  json: boolean;
}

export function registerSkillsCommands(program: Command): void {
  // skills
  const skills = program.command('skills').description('Skill management');

  skills
    .command('list')
    .description('List all skills')
    .option('-c, --category <category>', 'Filter by category')
    .option('-s, --search <query>', 'Search skills')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: SkillsListOptions) => {
      await handleSkillsList(options);
    });

  // skills search
  skills
    .command('search')
    .description('Search skills')
    .argument('<query>', 'Search query')
    .option('-j, --json', 'Output as JSON')
    .action(async (query: string, options: { json: boolean }) => {
      await handleSkillsList({ ...options, search: query });
    });

  // skills categories
  skills
    .command('categories')
    .description('List skill categories')
    .option('-j, --json', 'Output as JSON')
    .action(async (options: { json: boolean }) => {
      await handleCategories(options.json);
    });
}

async function handleSkillsList(options: SkillsListOptions): Promise<void> {
  const startTime = Date.now();
  const useJson = options.json || !process.stdout.isTTY;

  try {
    let skills;
    if (options.search) {
      skills = searchTools(options.search);
    } else if (options.category) {
      skills = getAllTools().filter((t) => t.category === options.category);
    } else {
      skills = getAllTools();
    }

    const duration_ms = Date.now() - startTime;

    if (useJson) {
      const envelope = buildEnvelope('skills.list', {
        skills: skills.map((s) => ({
          name: s.name,
          description: s.description,
          category: s.category,
        })),
        total: skills.length,
      }, {
        ok: true,
        duration_ms,
        version: VERSION,
      });

      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printSkillsHumanReadable(skills, options.category, options.search);
    }

    process.exit(0);
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    if (useJson) {
      const envelope = buildEnvelope('skills.list', null, {
        ok: false,
        duration_ms,
        version: VERSION,
        error: { code: 1, message },
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc.red(`Error: ${message}`));
    }

    process.exit(1);
  }
}

async function handleCategories(json: boolean): Promise<void> {
  const categories = getCategories();
  const counts = getToolCountByCategory();

  if (json || !process.stdout.isTTY) {
    const envelope = buildEnvelope('skills.categories', {
      categories: categories.map((c) => ({
        name: c,
        count: counts[c] || 0,
      })),
      total: categories.length,
    }, {
      ok: true,
      duration_ms: 0,
      version: VERSION,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc.bold('  Skill Categories\n'));

    for (const cat of categories) {
      console.log(`    ${pc.cyan(cat.padEnd(20))} ${counts[cat] || 0} skills`);
    }
    console.log();
  }

  process.exit(0);
}

function printSkillsHumanReadable(
  skills: readonly { name: string; description: string; category: string }[],
  category?: string,
  search?: string
): void {
  console.log();
  console.log(pc.bold(`  Forgewright Skills`));
  console.log(pc.dim('  ' + '─'.repeat(50)));

  if (category || search) {
    const filter = category ? `Category: ${category}` : `Search: "${search}"`;
    console.log(`  Filter: ${pc.yellow(filter)}`);
  }

  console.log(`  Total: ${skills.length} skills\n`);

  for (const skill of skills) {
    console.log(`    ${pc.green(skill.name)}`);
    console.log(`      ${pc.dim(skill.description)}`);
    console.log(`      ${pc.gray(`[${skill.category}]`)}`);
    console.log();
  }

  console.log(pc.dim('  Use --json for machine-readable output'));
}
