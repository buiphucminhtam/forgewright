#!/usr/bin/env node
/**
 * Prompt File Loader — Load external prompt files from skills
 *
 * Usage:
 *   node load-prompt-file.ts <skill-path> <prompt-name>
 *   node load-prompt-file.ts business-analyst system-prompt.md
 *
 * Environment:
 *   FORGEWRIGHT_DIR - Override Forgewright directory (defaults to computed path)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Detect Forgewright directory
function detectForgewrightDir(): string {
  // Check FORGEWRIGHT_DIR env var first
  if (process.env.FORGEWRIGHT_DIR) {
    return process.env.FORGEWRIGHT_DIR;
  }

  // Fall back to computing from script location
  // scripts/load-prompt-file.ts -> scripts/.. -> forgewright root
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, '..');
}

interface LoadResult {
  success: boolean;
  content?: string;
  path?: string;
  error?: string;
}

/**
 * Load a prompt file from a skill directory
 *
 * @param skillName - Skill name (e.g., "business-analyst", "product-manager")
 * @param promptName - Prompt file name (e.g., "system-prompt.md")
 * @returns Load result with content or error
 */
export function loadPromptFile(skillName: string, promptName: string): LoadResult {
  const forgewrightDir = detectForgewrightDir();
  const promptPath = resolve(forgewrightDir, 'skills', skillName, 'prompts', promptName);

  if (!existsSync(promptPath)) {
    return {
      success: false,
      path: promptPath,
      error: `Prompt file not found: ${promptPath}`,
    };
  }

  try {
    const content = readFileSync(promptPath, 'utf8');
    return {
      success: true,
      content,
      path: promptPath,
    };
  } catch (err) {
    return {
      success: false,
      path: promptPath,
      error: `Error reading prompt file: ${err}`,
    };
  }
}

/**
 * Resolve a file:// reference from a SKILL.md file
 *
 * @param skillMdPath - Path to the SKILL.md file
 * @param fileRef - The file:// reference (e.g., "prompts/system-prompt.md")
 * @returns Load result with content or error
 */
export function resolvePromptReference(skillMdPath: string, fileRef: string): LoadResult {
  // Remove file:// prefix
  const relativePath = fileRef.replace(/^file:\/\//, '');

  // Resolve relative to the SKILL.md directory
  const skillDir = dirname(skillMdPath);
  const resolvedPath = resolve(skillDir, relativePath);

  if (!existsSync(resolvedPath)) {
    return {
      success: false,
      path: resolvedPath,
      error: `Referenced prompt file not found: ${resolvedPath}`,
    };
  }

  try {
    const content = readFileSync(resolvedPath, 'utf8');
    return {
      success: true,
      content,
      path: resolvedPath,
    };
  } catch (err) {
    return {
      success: false,
      path: resolvedPath,
      error: `Error reading prompt file: ${err}`,
    };
  }
}

/**
 * List available prompt files for a skill
 */
export function listPromptFiles(skillName: string): string[] {
  const forgewrightDir = detectForgewrightDir();
  const promptsDir = resolve(forgewrightDir, 'skills', skillName, 'prompts');

  if (!existsSync(promptsDir)) {
    return [];
  }

  try {
    const { readdirSync } = require('fs');
    return readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Prompt File Loader — Load external prompt files from skills

Usage:
  node load-prompt-file.ts <skill> <prompt> [options]
  node load-prompt-file.ts --resolve <skill-md-path> <file-ref> [options]
  node load-prompt-file.ts --list <skill>
  node load-prompt-file.ts --help

Options:
  --json    Output JSON format
  --env     Show resolved FORGEWRIGHT_DIR and exit

Examples:
  node load-prompt-file.ts business-analyst system-prompt.md
  node load-prompt-file.ts product-manager scope-template.md
  node load-prompt-file.ts --resolve skills/business-analyst/SKILL.md file://prompts/system-prompt.md
  node load-prompt-file.ts --list business-analyst
`);
    process.exit(0);
  }

  const outputJson = args.includes('--json');
  const showEnv = args.includes('--env');
  const doResolve = args.includes('--resolve');
  const doList = args.includes('--list');

  // Remove options from args
  const cleanArgs = args.filter(
    a => !a.startsWith('--')
  );

  if (showEnv) {
    const dir = detectForgewrightDir();
    console.log(`FORGEWRIGHT_DIR=${dir}`);
    process.exit(0);
  }

  if (doList) {
    const skillName = cleanArgs[0];
    if (!skillName) {
      console.error('Error: --list requires a skill name');
      process.exit(1);
    }
    const files = listPromptFiles(skillName);
    if (files.length === 0) {
      console.log(`No prompt files found for skill: ${skillName}`);
    } else {
      console.log(`Available prompts for ${skillName}:`);
      for (const file of files) {
        console.log(`  - prompts/${file}`);
      }
    }
    process.exit(0);
  }

  if (doResolve) {
    const skillMdPath = cleanArgs[0];
    const fileRef = cleanArgs[1];
    if (!skillMdPath || !fileRef) {
      console.error('Error: --resolve requires <skill-md-path> and <file-ref>');
      process.exit(1);
    }
    const result = resolvePromptReference(skillMdPath, fileRef);
    if (!result.success) {
      if (outputJson) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error(`Error: ${result.error}`);
      }
      process.exit(1);
    }
    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.content);
    }
    process.exit(0);
  }

  // Default: load prompt file
  const skillName = cleanArgs[0];
  const promptName = cleanArgs[1];

  if (!skillName || !promptName) {
    console.error('Error: requires <skill> and <prompt> arguments');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  const result = loadPromptFile(skillName, promptName);

  if (!result.success) {
    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(`Error: ${result.error}`);
    }
    process.exit(1);
  }

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.content);
  }
}

// Export for programmatic use
export { detectForgewrightDir };

// Run if called directly
main();
