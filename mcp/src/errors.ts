// Forgewright Error Codes
// These error codes are used throughout the codebase for structured error handling.

export const ErrorCode = {
  // State management errors (1xxx)
  STATE_FILE_NOT_FOUND: 'FW001',
  STATE_PARSE_ERROR: 'FW002',
  STATE_SAVE_ERROR: 'FW003',
  STATE_LOCKED: 'FW004',

  // Pipeline errors (2xxx)
  PIPELINE_NOT_INITIALIZED: 'FW201',
  PIPELINE_ALREADY_RUNNING: 'FW202',
  PIPELINE_COMPLETED: 'FW203',
  PIPELINE_GATE_NOT_OPEN: 'FW204',
  PIPELINE_INVALID_MODE: 'FW205',
  PIPELINE_INVALID_PHASE: 'FW206',

  // Tool errors (3xxx)
  TOOL_NOT_FOUND: 'FW301',
  TOOL_EXECUTION_ERROR: 'FW302',
  TOOL_INVALID_ARGUMENT: 'FW303',

  // Skill errors (4xxx)
  SKILL_NOT_FOUND: 'FW401',
  SKILL_PARSE_ERROR: 'FW402',
  SKILL_FILE_READ_ERROR: 'FW403',
  SKILLS_DIR_NOT_FOUND: 'FW404',
  SKILL_YAML_PARSE_ERROR: 'FW405',

  // MCP errors (5xxx)
  MCP_SERVER_ERROR: 'FW501',
  MCP_TRANSPORT_ERROR: 'FW502',
  MCP_PROTOCOL_ERROR: 'FW503',

  // Workspace errors (6xxx)
  WORKSPACE_NOT_FOUND: 'FW601',
  WORKSPACE_INIT_ERROR: 'FW602',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export class ForgewrightError extends Error {
  public readonly code: ErrorCode
  public readonly context?: Record<string, unknown>
  public readonly recoverable: boolean

  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    recoverable = true,
  ) {
    super(message)
    this.name = 'ForgewrightError'
    this.code = code
    this.context = context
    this.recoverable = recoverable
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      recoverable: this.recoverable,
      stack: this.stack,
    }
  }

  toString(): string {
    return `[${this.code}] ${this.message}${this.context ? ` (${JSON.stringify(this.context)})` : ''}`
  }
}

export class StateError extends ForgewrightError {
  constructor(code: ErrorCode, message: string, context?: Record<string, unknown>) {
    super(code, message, context, true)
    this.name = 'StateError'
  }
}

export class PipelineError extends ForgewrightError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    recoverable = true,
  ) {
    super(code, message, context, recoverable)
    this.name = 'PipelineError'
  }
}

export class ToolError extends ForgewrightError {
  constructor(code: ErrorCode, message: string, context?: Record<string, unknown>) {
    super(code, message, context, false)
    this.name = 'ToolError'
  }
}

export class SkillError extends ForgewrightError {
  constructor(code: ErrorCode, message: string, context?: Record<string, unknown>) {
    super(code, message, context, true)
    this.name = 'SkillError'
  }
}

export function isForgewrightError(value: unknown): value is ForgewrightError {
  return value instanceof ForgewrightError
}

export function getErrorMessage(error: unknown): string {
  if (isForgewrightError(error)) {
    return error.toString()
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
