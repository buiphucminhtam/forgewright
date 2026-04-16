/**
 * Forgewright CLI Type Definitions
 */

// ============================================================================
// Global Types
// ============================================================================

/** JSON output mode flag */
export interface GlobalFlags {
  json: boolean;
  'no-color': boolean;
  quiet: boolean;
  debug: boolean;
  version: boolean;
  help: boolean;
}

// ============================================================================
// Tool Registry Types
// ============================================================================

/** Input schema for a tool parameter */
export interface ToolInputField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
}

/** Tool specification for registry */
export interface ToolSpec {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, ToolInputField>;
  outputSchema?: Record<string, unknown>;
  examples?: string[];
  aliases?: string[];
}

/** Tool execution result */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration_ms?: number;
}

// ============================================================================
// JSON Envelope Types
// ============================================================================

/** Agent-readable JSON output envelope */
export interface AgentEnvelope<T = unknown> {
  ok: boolean;
  tool: string;
  data: T;
  metadata: {
    duration_ms: number;
    version: string;
    config_source?: string;
  };
  error: {
    code: number;
    message: string;
    details?: unknown;
  } | null;
}

/** Build an agent envelope */
export function buildEnvelope<T>(
  tool: string,
  data: T,
  options: {
    ok: boolean;
    duration_ms: number;
    version: string;
    config_source?: string;
    error?: {
      code: number;
      message: string;
      details?: unknown;
    };
  }
): AgentEnvelope<T> {
  return {
    ok: options.ok,
    tool,
    data,
    metadata: {
      duration_ms: options.duration_ms,
      version: options.version,
      config_source: options.config_source,
    },
    error: options.error ?? null,
  };
}

// ============================================================================
// Config Types
// ============================================================================

/** Configuration source priority (lower = higher priority) */
export const CONFIG_SOURCES = {
  OS_ENV: 1,
  USER_CONFIG: 2,
  PROCESS_ENV: 3,
  DOTENV: 4,
  INLINE_FLAGS: 5,
} as const;

export type ConfigSource = (typeof CONFIG_SOURCES)[keyof typeof CONFIG_SOURCES];

/** Resolved configuration entry */
export interface ConfigEntry {
  key: string;
  value: unknown;
  source: ConfigSource;
}

// ============================================================================
// Command Types
// ============================================================================

/** Command handler function signature */
export type CommandHandler<T = unknown> = (options: T) => Promise<CommandResult<T>>;

/** Command execution result */
export interface CommandResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  exitCode: number;
}
