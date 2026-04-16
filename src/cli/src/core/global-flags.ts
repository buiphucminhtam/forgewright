/**
 * Global flags configuration for Forgewright CLI
 */
import type { Command } from 'commander';

export interface GlobalOptions {
  json: boolean;
  'no-color': boolean;
  quiet: boolean;
  debug: boolean;
}

export function registerGlobalFlags(program: Command): void {
  program
    .option('-j, --json', 'Force JSON output (agent mode)')
    .option('--no-color', 'Disable colored output')
    .option('-q, --quiet', 'Suppress stdout output')
    .option('--debug', 'Enable debug mode');
}

/**
 * Check if output should be JSON based on flags or TTY
 */
export function shouldOutputJson(options: GlobalOptions): boolean {
  // Explicit flag takes precedence
  if (options.json !== undefined) {
    return options.json;
  }

  // Auto-detect: non-TTY = JSON (agent mode)
  return !process.stdout.isTTY;
}

/**
 * Check if colors should be enabled
 */
export function shouldUseColors(options: GlobalOptions): boolean {
  // Explicit flag takes precedence
  if (options['no-color']) {
    return false;
  }

  // Auto-detect: no TTY = no colors
  if (!process.stdout.isTTY) {
    return false;
  }

  // Check NO_COLOR env var
  if (process.env.NO_COLOR) {
    return false;
  }

  return true;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(options: GlobalOptions): boolean {
  return options.debug || process.env.FORGE_DEBUG === '1';
}
