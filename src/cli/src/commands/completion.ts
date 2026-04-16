/**
 * Completion Command - Shell completion scripts
 */
import type { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const completionsDir = join(process.cwd(), 'completions');

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion')
    .description('Generate shell completion scripts')
    .argument('<shell>', 'Shell type (bash|zsh|fish)')
    .action(async (shell: string) => {
      await handleCompletion(shell);
    });
}

async function handleCompletion(shell: string): Promise<void> {
  const shells: Record<string, string> = {
    bash: 'forge.bash',
    zsh: 'forge.zsh',
    fish: 'forge.fish',
  };

  const filename = shells[shell.toLowerCase()];

  if (!filename) {
    console.error(`Error: Unknown shell "${shell}". Supported: bash, zsh, fish`);
    process.exit(2);
  }

  const completionPath = join(completionsDir, filename);

  try {
    const content = readFileSync(completionPath, 'utf-8');
    console.log(content);
    process.exit(0);
  } catch (error) {
    console.error(`Error: Failed to load completion script for ${shell}`);
    process.exit(1);
  }
}
