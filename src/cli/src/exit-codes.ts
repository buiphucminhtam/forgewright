/**
 * Exit codes for Forgewright CLI
 * Standardized for AI agent compatibility
 */

export const EXIT_CODES = {
  /** Success - operation completed successfully */
  OK: 0,

  /** Tool execution failed */
  TOOL_ERROR: 1,

  /** Invalid arguments or usage error */
  USAGE_ERROR: 2,

  /** Configuration error */
  CONFIG_ERROR: 3,

  /** Authentication or permission error */
  AUTH_ERROR: 4,

  /** Operation timed out */
  TIMEOUT: 5,

  /** Required dependency not found */
  MISSING_DEPENDENCY: 6,

  /** Internal/unexpected error */
  INTERNAL_ERROR: 7,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

export const EXIT_CODE_NAMES: Record<ExitCode, string> = {
  [EXIT_CODES.OK]: 'OK',
  [EXIT_CODES.TOOL_ERROR]: 'TOOL_ERROR',
  [EXIT_CODES.USAGE_ERROR]: 'USAGE_ERROR',
  [EXIT_CODES.CONFIG_ERROR]: 'CONFIG_ERROR',
  [EXIT_CODES.AUTH_ERROR]: 'AUTH_ERROR',
  [EXIT_CODES.TIMEOUT]: 'TIMEOUT',
  [EXIT_CODES.MISSING_DEPENDENCY]: 'MISSING_DEPENDENCY',
  [EXIT_CODES.INTERNAL_ERROR]: 'INTERNAL_ERROR',
} as const;

export const EXIT_CODE_MESSAGES: Record<ExitCode, string> = {
  [EXIT_CODES.OK]: 'Success',
  [EXIT_CODES.TOOL_ERROR]: 'Tool execution failed',
  [EXIT_CODES.USAGE_ERROR]: 'Invalid arguments or usage',
  [EXIT_CODES.CONFIG_ERROR]: 'Configuration error',
  [EXIT_CODES.AUTH_ERROR]: 'Authentication or permission error',
  [EXIT_CODES.TIMEOUT]: 'Operation timed out',
  [EXIT_CODES.MISSING_DEPENDENCY]: 'Required dependency not found',
  [EXIT_CODES.INTERNAL_ERROR]: 'Internal error',
} as const;

/**
 * Exit the process with a standardized code
 */
export function exitWithCode(code: ExitCode, message?: string): never {
  if (message) {
    process.stderr.write(`${message}\n`);
  }
  process.exit(code);
}
