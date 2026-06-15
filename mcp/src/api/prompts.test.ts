import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { registerPrompts } from './prompts.js';
import * as skillParser from '../parsers/skill-parser.js';
import * as pipelineManager from '../state/pipeline-manager.js';

// Mock Server from SDK
class MockServer {
  listPromptsHandler!: Function;
  getPromptHandler!: Function;

  setRequestHandler(schema: unknown, handler: Function) {
    if (schema === ListPromptsRequestSchema) {
      this.listPromptsHandler = handler;
    } else if (schema === GetPromptRequestSchema) {
      this.getPromptHandler = handler;
    }
  }
}

describe('registerPrompts', () => {
  let mockServer: MockServer;
  let wsRoot: string;
  const tempDesignMdPath = path.join(process.cwd(), 'DESIGN.md');

  beforeEach(() => {
    mockServer = new MockServer();
    wsRoot = process.cwd();

    // Mock getWorkspaceRoot to return current cwd
    vi.spyOn(pipelineManager, 'getWorkspaceRoot').mockReturnValue(wsRoot);

    // Mock getAllSkills to return some sample skills
    vi.spyOn(skillParser, 'getAllSkills').mockReturnValue([
      {
        name: 'production-grade',
        description: 'Orchestrator',
        filePath: 'skills/production-grade/SKILL.md',
        content: 'Orchestrator Content',
      },
      {
        name: 'ui-designer',
        description: 'UI Designer Skill',
        filePath: 'skills/ui-designer/SKILL.md',
        content: 'UI Designer Content',
      },
      {
        name: 'software-engineer',
        description: 'Software Engineer Skill',
        filePath: 'skills/software-engineer/SKILL.md',
        content: 'Software Engineer Content',
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDesignMdPath)) {
      fs.unlinkSync(tempDesignMdPath);
    }
  });

  it('should register GetPrompt handler', () => {
    registerPrompts(mockServer as unknown as Server);
    expect(mockServer.getPromptHandler).toBeTypeOf('function');
  });

  it('should not inject DESIGN.md if it does not exist', async () => {
    if (fs.existsSync(tempDesignMdPath)) {
      fs.unlinkSync(tempDesignMdPath);
    }

    registerPrompts(mockServer as unknown as Server);
    const handler = mockServer.getPromptHandler;

    // Request UI Designer prompt
    const res = await handler({
      params: { name: 'fw_skill_ui-designer' },
    });

    expect(res.messages[0].content.text).toContain('UI Designer Content');
    expect(res.messages[0].content.text).not.toContain(
      '[MANDATORY DESIGN SOURCE-OF-TRUTH: DESIGN.md]',
    );
  });

  it('should inject DESIGN.md into fw_orchestrator if it exists', async () => {
    fs.writeFileSync(tempDesignMdPath, 'my-mock-design-tokens', 'utf-8');

    registerPrompts(mockServer as unknown as Server);
    const handler = mockServer.getPromptHandler;

    const res = await handler({
      params: { name: 'fw_orchestrator' },
    });

    expect(res.messages[0].content.text).toContain('Orchestrator Content');
    expect(res.messages[0].content.text).toContain('[MANDATORY DESIGN SOURCE-OF-TRUTH: DESIGN.md]');
    expect(res.messages[0].content.text).toContain('my-mock-design-tokens');
  });

  it('should inject DESIGN.md into styling skills if it exists', async () => {
    fs.writeFileSync(tempDesignMdPath, 'my-mock-design-tokens', 'utf-8');

    registerPrompts(mockServer as unknown as Server);
    const handler = mockServer.getPromptHandler;

    const res = await handler({
      params: { name: 'fw_skill_ui-designer' },
    });

    expect(res.messages[0].content.text).toContain('UI Designer Content');
    expect(res.messages[0].content.text).toContain('[MANDATORY DESIGN SOURCE-OF-TRUTH: DESIGN.md]');
    expect(res.messages[0].content.text).toContain('my-mock-design-tokens');
  });

  it('should not inject DESIGN.md into non-styling skills even if it exists', async () => {
    fs.writeFileSync(tempDesignMdPath, 'my-mock-design-tokens', 'utf-8');

    vi.spyOn(skillParser, 'getAllSkills').mockReturnValue([
      {
        name: 'database-engineer',
        description: 'DB Skill',
        filePath: 'skills/database-engineer/SKILL.md',
        content: 'DB Content',
      },
    ]);

    registerPrompts(mockServer as unknown as Server);
    const handler = mockServer.getPromptHandler;

    const res = await handler({
      params: { name: 'fw_skill_database-engineer' },
    });

    expect(res.messages[0].content.text).toContain('DB Content');
    expect(res.messages[0].content.text).not.toContain(
      '[MANDATORY DESIGN SOURCE-OF-TRUTH: DESIGN.md]',
    );
  });
});
