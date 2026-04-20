/**
 * Shared types for the Forgewright middleware chain.
 * These define the core interfaces used across all middleware.
 */

export type ToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Delete'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'SemanticSearch'
  | 'Run'
  | 'Task'
  | 'NotebookEdit'
  | 'WebFetch'
  | 'WebSearch'
  | 'ReadLints'
  | 'CallMcpTool'
  | 'FetchMcpResource'
  | 'ListMcpResources'
  | string; // Allow any string for extensibility

export type SkillId =
  | 'orchestrator'
  | 'software-engineer'
  | 'frontend-engineer'
  | 'qa-engineer'
  | 'security-engineer'
  | 'code-reviewer'
  | 'devops'
  | 'sre'
  | 'data-scientist'
  | 'technical-writer'
  | 'ui-designer'
  | 'mobile-engineer'
  | 'mobile-tester'
  | 'api-designer'
  | 'database-engineer'
  | 'debugger'
  | 'prompt-engineer'
  | 'ai-engineer'
  | 'accessibility-engineer'
  | 'performance-engineer'
  | 'ux-researcher'
  | 'data-engineer'
  | 'xlsx-engineer'
  | 'project-manager'
  | 'business-analyst'
  | 'product-manager'
  | 'solution-architect'
  | 'growth-marketer'
  | 'conversion-optimizer'
  | 'web-scraper'
  | 'notebooklm-researcher'
  | 'game-designer'
  | 'unity-engineer'
  | 'unreal-engineer'
  | 'godot-engineer'
  | 'roblox-engineer'
  | 'phaser3-engineer'
  | 'threejs-engineer'
  | 'level-designer'
  | 'narrative-designer'
  | 'technical-artist'
  | 'game-asset-vfx'
  | 'game-audio-engineer'
  | 'unity-shader-artist'
  | 'unity-multiplayer'
  | 'unreal-technical-artist'
  | 'unreal-multiplayer'
  | 'xr-engineer'
  | 'polymath'
  | 'parallel-dispatch'
  | 'memory-manager'
  | 'skill-maker'
  | 'mcp-generator'
  | string;

export type PipelinePhase = 'interpret' | 'define' | 'build' | 'harden' | 'ship' | 'sustain';

export type PipelineMode =
  | 'full-build'
  | 'feature'
  | 'harden'
  | 'ship'
  | 'test'
  | 'review'
  | 'architect'
  | 'document'
  | 'explore'
  | 'research'
  | 'optimize'
  | 'design'
  | 'mobile'
  | 'game-build'
  | 'xr-build'
  | 'ai-build'
  | 'analyze'
  | 'prompt'
  | 'autonomous'
  | 'debug';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface ToolCall {
  id: string;
  toolName: ToolName;
  toolArgs: Record<string, unknown>;
  result?: ToolResult;
  startTime: number;
  endTime?: number;
}

export interface ToolContext {
  call: ToolCall;
  skillId: SkillId;
  mode: PipelineMode;
  phase: PipelinePhase;
  turnNumber: number;
  sessionId: string;
  userMessage: string;
}

export type MiddlewareResult =
  | { action: 'pass'; context: ToolContext }
  | { action: 'block'; context: ToolContext; reason: string }
  | {
      action: 'cached';
      context: ToolContext;
      cachedResult: ToolResult;
      dedup: {
        seenCount: number;
        firstSeenTurn: number;
        tokensSaved: number;
        summary: string;
      };
    }
  | { action: 'mock'; context: ToolContext; mockResult: ToolResult };

export interface Middleware {
  name: string;
  enabled: boolean;
  before_tool?(ctx: ToolContext): MiddlewareResult | Promise<MiddlewareResult>;
  after_tool?(ctx: ToolContext): void | Promise<void>;
  on_error?(ctx: ToolContext, error: Error): void | Promise<void>;
}

export interface MiddlewareConfig {
  session_deduplication?: {
    enabled?: boolean;
    window_turns?: number;
    window_ms?: number;
    max_store_size?: number;
    exclude_tools?: string[];
    include_tools?: string[];
    cache_reads?: boolean;
  };
  guardrail?: {
    enabled?: boolean;
    mode?: 'warn' | 'deny' | 'disabled' | 'dry_run';
  };
  [key: string]: Record<string, unknown> | undefined;
}

export interface SessionMetrics {
  sessionId: string;
  turnNumber: number;
  mode: PipelineMode;
  phase: PipelinePhase;
  startTime: number;
  skillsRun: string[];
  toolsExecuted: number;
  toolsCached: number;
  tokensUsed: number;
  tokensSaved: number;
}
