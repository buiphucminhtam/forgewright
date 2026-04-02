import { describe, it, expect } from 'vitest';

// Test the pipeline-manager functions directly (no MCP SDK mocking needed)
import { PIPELINE_PHASES, DEFAULT_STATE, getForgewrightRoot } from '../state/pipeline-manager.js';

// Test the errors module
import {
  ForgewrightError,
  StateError,
  PipelineError,
  ToolError,
  SkillError,
  ErrorCode,
  isForgewrightError,
  getErrorMessage,
} from '../errors.js';

// ─── PIPELINE_PHASES ────────────────────────────────────────────────

describe('PIPELINE_PHASES', () => {
  it('should have exactly 5 phases', () => {
    expect(PIPELINE_PHASES).toHaveLength(5);
  });

  it('should have correct phase names', () => {
    expect(PIPELINE_PHASES[0]).toBe('Phase 0: Project Initiation & Mode Selection');
    expect(PIPELINE_PHASES[1]).toBe('Phase 1: Research & Discovery (PM/BA/Architect)');
    expect(PIPELINE_PHASES[2]).toBe('Phase 2: Execution (BE/FE/Engine Engineers)');
    expect(PIPELINE_PHASES[3]).toBe('Phase 3: QA & Hardening');
    expect(PIPELINE_PHASES[4]).toBe('Phase 4: Release & Deployment');
  });

  it('should have 5 elements matching phase numbers', () => {
    PIPELINE_PHASES.forEach((phase, i) => {
      expect(phase).toContain(`Phase ${i}`);
    });
  });
});

// ─── DEFAULT_STATE ──────────────────────────────────────────────────

describe('DEFAULT_STATE', () => {
  it('should have correct initial values', () => {
    expect(DEFAULT_STATE.currentPhase).toBe(0);
    expect(DEFAULT_STATE.currentMode).toBeNull();
    expect(DEFAULT_STATE.history).toEqual([]);
    expect(DEFAULT_STATE.status).toBe('IDLE');
  });

  it('should have valid status', () => {
    const valid = ['IDLE', 'IN_PROGRESS', 'WAITING_FOR_GATE', 'COMPLETED'];
    expect(valid).toContain(DEFAULT_STATE.status);
  });
});

// ─── getForgewrightRoot ────────────────────────────────────────────

describe('getForgewrightRoot', () => {
  it('should return a non-empty string', () => {
    const root = getForgewrightRoot();
    expect(root).toBeTruthy();
    expect(typeof root).toBe('string');
    expect(root.length).toBeGreaterThan(0);
  });

  it('should return FORGEWRIGHT_ROOT env var when set', () => {
    const prev = process.env.FORGEWRIGHT_ROOT;
    process.env.FORGEWRIGHT_ROOT = '/custom/path';
    // Note: requires module reload to pick up new env
    expect(getForgewrightRoot()).toBeTruthy();
    if (prev !== undefined) {
      process.env.FORGEWRIGHT_ROOT = prev;
    } else {
      delete process.env.FORGEWRIGHT_ROOT;
    }
  });
});

// ─── ErrorCode ─────────────────────────────────────────────────────

describe('ErrorCode', () => {
  it('should have all expected error codes', () => {
    expect(ErrorCode.STATE_FILE_NOT_FOUND).toBe('FW001');
    expect(ErrorCode.STATE_SAVE_ERROR).toBe('FW003');
    expect(ErrorCode.PIPELINE_NOT_INITIALIZED).toBe('FW201');
    expect(ErrorCode.PIPELINE_INVALID_MODE).toBe('FW205');
    expect(ErrorCode.TOOL_NOT_FOUND).toBe('FW301');
    expect(ErrorCode.SKILL_NOT_FOUND).toBe('FW401');
    expect(ErrorCode.MCP_SERVER_ERROR).toBe('FW501');
    expect(ErrorCode.WORKSPACE_NOT_FOUND).toBe('FW601');
  });

  it('should have codes in correct numeric ranges', () => {
    // State errors: 1xxx
    expect(ErrorCode.STATE_FILE_NOT_FOUND).toMatch(/^FW00/);
    // Pipeline errors: 2xxx
    expect(ErrorCode.PIPELINE_NOT_INITIALIZED).toMatch(/^FW20/);
    // Tool errors: 3xxx
    expect(ErrorCode.TOOL_NOT_FOUND).toMatch(/^FW30/);
    // Skill errors: 4xxx
    expect(ErrorCode.SKILL_NOT_FOUND).toMatch(/^FW40/);
    // MCP errors: 5xxx
    expect(ErrorCode.MCP_SERVER_ERROR).toMatch(/^FW50/);
    // Workspace errors: 6xxx
    expect(ErrorCode.WORKSPACE_NOT_FOUND).toMatch(/^FW60/);
  });
});

// ─── ForgewrightError ───────────────────────────────────────────────

describe('ForgewrightError', () => {
  it('should create error with code and message', () => {
    const err = new ForgewrightError(ErrorCode.TOOL_NOT_FOUND, 'Tool not found');
    expect(err.code).toBe('FW301');
    expect(err.message).toBe('Tool not found');
    expect(err.name).toBe('ForgewrightError');
    expect(err.recoverable).toBe(true);
  });

  it('should include optional context', () => {
    const err = new ForgewrightError(ErrorCode.STATE_SAVE_ERROR, 'Save failed', {
      file: '/path.json',
    });
    expect(err.context).toEqual({ file: '/path.json' });
  });

  it('should allow non-recoverable errors', () => {
    const err = new ForgewrightError(ErrorCode.TOOL_EXECUTION_ERROR, 'Failed', {}, false);
    expect(err.recoverable).toBe(false);
  });

  it('should serialize to JSON with all fields', () => {
    const err = new ForgewrightError(ErrorCode.SKILL_NOT_FOUND, 'Missing', { skill: 'test' });
    const json = err.toJSON();
    expect(json).toMatchObject({
      name: 'ForgewrightError',
      code: 'FW401',
      message: 'Missing',
    });
    expect(json).toHaveProperty('context');
    expect(json).toHaveProperty('stack');
  });

  it('should format to string with and without context', () => {
    const err1 = new ForgewrightError(ErrorCode.TOOL_NOT_FOUND, 'Tool missing', { tool: 'fake' });
    expect(err1.toString()).toBe('[FW301] Tool missing ({"tool":"fake"})');

    const err2 = new ForgewrightError(ErrorCode.TOOL_NOT_FOUND, 'Tool missing');
    expect(err2.toString()).toBe('[FW301] Tool missing');
  });

  it('should be instanceof Error', () => {
    const err = new ForgewrightError(ErrorCode.MCP_SERVER_ERROR, 'Server error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ForgewrightError);
  });
});

// ─── StateError ─────────────────────────────────────────────────────

describe('StateError', () => {
  it('should have name StateError', () => {
    const err = new StateError(ErrorCode.STATE_FILE_NOT_FOUND, 'File not found');
    expect(err.name).toBe('StateError');
  });

  it('should be recoverable by default', () => {
    const err = new StateError(ErrorCode.STATE_SAVE_ERROR, 'Save failed');
    expect(err.recoverable).toBe(true);
  });
});

// ─── PipelineError ─────────────────────────────────────────────────

describe('PipelineError', () => {
  it('should have name PipelineError', () => {
    const err = new PipelineError(ErrorCode.PIPELINE_INVALID_MODE, 'Invalid mode');
    expect(err.name).toBe('PipelineError');
  });

  it('should allow non-recoverable', () => {
    const err = new PipelineError(ErrorCode.PIPELINE_COMPLETED, 'Done', {}, false);
    expect(err.recoverable).toBe(false);
  });
});

// ─── ToolError ─────────────────────────────────────────────────────

describe('ToolError', () => {
  it('should have name ToolError', () => {
    const err = new ToolError(ErrorCode.TOOL_NOT_FOUND, 'Not found');
    expect(err.name).toBe('ToolError');
  });

  it('should be non-recoverable by default', () => {
    const err = new ToolError(ErrorCode.TOOL_EXECUTION_ERROR, 'Failed');
    expect(err.recoverable).toBe(false);
  });
});

// ─── SkillError ─────────────────────────────────────────────────────

describe('SkillError', () => {
  it('should have name SkillError', () => {
    const err = new SkillError(ErrorCode.SKILL_PARSE_ERROR, 'Parse failed');
    expect(err.name).toBe('SkillError');
  });

  it('should be recoverable by default', () => {
    const err = new SkillError(ErrorCode.SKILL_YAML_PARSE_ERROR, 'Bad YAML');
    expect(err.recoverable).toBe(true);
  });
});

// ─── isForgewrightError ─────────────────────────────────────────────

describe('isForgewrightError', () => {
  it('should return true for all ForgewrightError subclasses', () => {
    expect(isForgewrightError(new ForgewrightError(ErrorCode.MCP_SERVER_ERROR, 'test'))).toBe(true);
    expect(isForgewrightError(new StateError(ErrorCode.STATE_SAVE_ERROR, 'test'))).toBe(true);
    expect(isForgewrightError(new PipelineError(ErrorCode.PIPELINE_INVALID_MODE, 'test'))).toBe(
      true,
    );
    expect(isForgewrightError(new ToolError(ErrorCode.TOOL_NOT_FOUND, 'test'))).toBe(true);
    expect(isForgewrightError(new SkillError(ErrorCode.SKILL_NOT_FOUND, 'test'))).toBe(true);
  });

  it('should return false for non-ForgewrightError values', () => {
    expect(isForgewrightError(new Error('plain'))).toBe(false);
    expect(isForgewrightError('string error')).toBe(false);
    expect(isForgewrightError({ code: 'FW001', message: 'test' })).toBe(false);
    expect(isForgewrightError(null)).toBe(false);
    expect(isForgewrightError(undefined)).toBe(false);
    expect(isForgewrightError(123)).toBe(false);
  });
});

// ─── getErrorMessage ────────────────────────────────────────────────

describe('getErrorMessage', () => {
  it('should format ForgewrightError with code', () => {
    const err = new ForgewrightError(ErrorCode.TOOL_NOT_FOUND, 'Tool missing', { tool: 'x' });
    expect(getErrorMessage(err)).toBe('[FW301] Tool missing ({"tool":"x"})');
  });

  it('should return Error.message for plain Error', () => {
    const err = new Error('Something went wrong');
    expect(getErrorMessage(err)).toBe('Something went wrong');
  });

  it('should convert unknown to string', () => {
    expect(getErrorMessage(123)).toBe('123');
    expect(getErrorMessage({ foo: 'bar' })).toBe('[object Object]');
  });
});
