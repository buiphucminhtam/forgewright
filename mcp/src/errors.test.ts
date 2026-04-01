import { describe, it, expect } from 'vitest'
import {
  ForgewrightError,
  StateError,
  PipelineError,
  ToolError,
  SkillError,
  ErrorCode,
  isForgewrightError,
  getErrorMessage,
} from './errors.js'

describe('ErrorCode', () => {
  it('should have all expected error codes defined', () => {
    expect(ErrorCode.STATE_FILE_NOT_FOUND).toBe('FW001')
    expect(ErrorCode.STATE_PARSE_ERROR).toBe('FW002')
    expect(ErrorCode.STATE_SAVE_ERROR).toBe('FW003')
    expect(ErrorCode.PIPELINE_NOT_INITIALIZED).toBe('FW201')
    expect(ErrorCode.PIPELINE_INVALID_MODE).toBe('FW205')
    expect(ErrorCode.TOOL_NOT_FOUND).toBe('FW301')
    expect(ErrorCode.TOOL_EXECUTION_ERROR).toBe('FW302')
    expect(ErrorCode.SKILL_NOT_FOUND).toBe('FW401')
    expect(ErrorCode.SKILL_YAML_PARSE_ERROR).toBe('FW405')
    expect(ErrorCode.MCP_SERVER_ERROR).toBe('FW501')
    expect(ErrorCode.WORKSPACE_NOT_FOUND).toBe('FW601')
  })

  it('should have numeric ranges for each category', () => {
    // State errors: 1xxx
    expect(ErrorCode.STATE_FILE_NOT_FOUND).toMatch(/^FW00/)
    // Pipeline errors: 2xxx
    expect(ErrorCode.PIPELINE_NOT_INITIALIZED).toMatch(/^FW20/)
    // Tool errors: 3xxx
    expect(ErrorCode.TOOL_NOT_FOUND).toMatch(/^FW30/)
    // Skill errors: 4xxx
    expect(ErrorCode.SKILL_NOT_FOUND).toMatch(/^FW40/)
    // MCP errors: 5xxx
    expect(ErrorCode.MCP_SERVER_ERROR).toMatch(/^FW50/)
    // Workspace errors: 6xxx
    expect(ErrorCode.WORKSPACE_NOT_FOUND).toMatch(/^FW60/)
  })
})

describe('ForgewrightError', () => {
  it('should create error with code and message', () => {
    const err = new ForgewrightError(ErrorCode.TOOL_NOT_FOUND, 'Tool not found: test')
    expect(err.code).toBe('FW301')
    expect(err.message).toBe('Tool not found: test')
    expect(err.name).toBe('ForgewrightError')
    expect(err.recoverable).toBe(true)
  })

  it('should include optional context', () => {
    const err = new ForgewrightError(ErrorCode.STATE_SAVE_ERROR, 'Save failed', {
      file: '/path/state.json',
    })
    expect(err.context).toEqual({ file: '/path/state.json' })
  })

  it('should allow non-recoverable errors', () => {
    const err = new ForgewrightError(ErrorCode.TOOL_EXECUTION_ERROR, 'Execution failed', {}, false)
    expect(err.recoverable).toBe(false)
  })

  it('should serialize to JSON correctly', () => {
    const err = new ForgewrightError(ErrorCode.SKILL_NOT_FOUND, 'Skill missing', { skill: 'test' })
    const json = err.toJSON()
    expect(json).toHaveProperty('name', 'ForgewrightError')
    expect(json).toHaveProperty('code', 'FW401')
    expect(json).toHaveProperty('message', 'Skill missing')
    expect(json).toHaveProperty('context')
    expect(json).toHaveProperty('recoverable', true)
    expect(json).toHaveProperty('stack')
  })

  it('should format to string with context', () => {
    const err = new ForgewrightError(ErrorCode.STATE_SAVE_ERROR, 'Save failed', {
      file: '/path.json',
    })
    expect(err.toString()).toBe('[FW003] Save failed ({"file":"/path.json"})')
  })

  it('should format to string without context', () => {
    const err = new ForgewrightError(ErrorCode.TOOL_NOT_FOUND, 'Tool missing')
    expect(err.toString()).toBe('[FW301] Tool missing')
  })

  it('should be instanceof Error', () => {
    const err = new ForgewrightError(ErrorCode.MCP_SERVER_ERROR, 'Server error')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ForgewrightError)
  })
})

describe('StateError', () => {
  it('should have name StateError', () => {
    const err = new StateError(ErrorCode.STATE_FILE_NOT_FOUND, 'File not found')
    expect(err.name).toBe('StateError')
  })

  it('should be recoverable by default', () => {
    const err = new StateError(ErrorCode.STATE_SAVE_ERROR, 'Save failed')
    expect(err.recoverable).toBe(true)
  })
})

describe('PipelineError', () => {
  it('should have name PipelineError', () => {
    const err = new PipelineError(ErrorCode.PIPELINE_INVALID_MODE, 'Invalid mode')
    expect(err.name).toBe('PipelineError')
  })

  it('should allow non-recoverable pipeline errors', () => {
    const err = new PipelineError(ErrorCode.PIPELINE_COMPLETED, 'Already completed', {}, false)
    expect(err.recoverable).toBe(false)
  })
})

describe('ToolError', () => {
  it('should have name ToolError', () => {
    const err = new ToolError(ErrorCode.TOOL_NOT_FOUND, 'Tool not found')
    expect(err.name).toBe('ToolError')
  })

  it('should be non-recoverable by default', () => {
    const err = new ToolError(ErrorCode.TOOL_EXECUTION_ERROR, 'Execution failed')
    expect(err.recoverable).toBe(false)
  })
})

describe('SkillError', () => {
  it('should have name SkillError', () => {
    const err = new SkillError(ErrorCode.SKILL_PARSE_ERROR, 'Parse failed')
    expect(err.name).toBe('SkillError')
  })

  it('should be recoverable by default', () => {
    const err = new SkillError(ErrorCode.SKILL_YAML_PARSE_ERROR, 'YAML error')
    expect(err.recoverable).toBe(true)
  })
})

describe('isForgewrightError', () => {
  it('should return true for ForgewrightError instances', () => {
    expect(isForgewrightError(new ForgewrightError(ErrorCode.MCP_SERVER_ERROR, 'test'))).toBe(true)
    expect(isForgewrightError(new StateError(ErrorCode.STATE_SAVE_ERROR, 'test'))).toBe(true)
    expect(isForgewrightError(new PipelineError(ErrorCode.PIPELINE_INVALID_MODE, 'test'))).toBe(
      true,
    )
    expect(isForgewrightError(new ToolError(ErrorCode.TOOL_NOT_FOUND, 'test'))).toBe(true)
    expect(isForgewrightError(new SkillError(ErrorCode.SKILL_NOT_FOUND, 'test'))).toBe(true)
  })

  it('should return false for non-ForgewrightError values', () => {
    expect(isForgewrightError(new Error('plain error'))).toBe(false)
    expect(isForgewrightError('string error')).toBe(false)
    expect(isForgewrightError({ code: 'FW001', message: 'test' })).toBe(false)
    expect(isForgewrightError(null)).toBe(false)
    expect(isForgewrightError(undefined)).toBe(false)
  })
})

describe('getErrorMessage', () => {
  it('should return ForgewrightError.toString() for ForgewrightError', () => {
    const err = new ForgewrightError(ErrorCode.TOOL_NOT_FOUND, 'Tool not found', { tool: 'fake' })
    expect(getErrorMessage(err)).toBe('[FW301] Tool not found ({"tool":"fake"})')
  })

  it('should return Error.message for plain Error', () => {
    const err = new Error('Something went wrong')
    expect(getErrorMessage(err)).toBe('Something went wrong')
  })

  it('should convert unknown to string', () => {
    expect(getErrorMessage(123)).toBe('123')
    expect(getErrorMessage({ foo: 'bar' })).toBe('[object Object]')
  })
})
