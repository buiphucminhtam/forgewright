/**
 * Forgewright CLI Tool Registry
 *
 * Provides discoverable tool specifications for AI agents
 */
import type { ToolSpec, ToolInputField } from '../types/index.js';

// ============================================================================
// Tool Categories
// ============================================================================

export const TOOL_CATEGORIES = {
  ORCHESTRATION: 'orchestration',
  ENGINEERING: 'engineering',
  GAME_DEV: 'game-dev',
  AI_ML: 'ai-ml',
  DEVOPS: 'devops',
  META: 'meta',
} as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[keyof typeof TOOL_CATEGORIES];

// ============================================================================
// Tool Registry
// ============================================================================

export const TOOL_REGISTRY: readonly ToolSpec[] = [
  // Orchestration
  {
    name: 'orchestrator.execute',
    description: 'Execute the Forgewright orchestration pipeline',
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      mode: {
        type: 'string',
        required: true,
        description: 'Pipeline mode (full-build, feature, harden, ship, sustain)',
        enum: ['full-build', 'feature', 'harden', 'ship', 'sustain', 'grow'],
      },
      request: {
        type: 'string',
        required: true,
        description: 'User request description',
      },
      options: {
        type: 'object',
        required: false,
        description: 'Additional options',
      },
    },
    examples: ['forge tools call orchestrator.execute --args \'{"mode":"feature","request":"add login"}\''],
  },

  // Skills
  {
    name: 'skills.list',
    description: 'List all available Forgewright skills',
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      category: {
        type: 'string',
        required: false,
        description: 'Filter by category',
      },
      format: {
        type: 'string',
        required: false,
        description: 'Output format (table, json)',
        enum: ['table', 'json'],
      },
    },
    examples: ['forge skills list', 'forge skills list --category engineering'],
  },

  {
    name: 'skills.search',
    description: 'Search for skills by keyword',
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      query: {
        type: 'string',
        required: true,
        description: 'Search query',
      },
      category: {
        type: 'string',
        required: false,
        description: 'Filter by category',
      },
    },
    examples: ['forge tools call skills.search --args \'{"query":"api"}\''],
  },

  // Validate
  {
    name: 'validate.quality',
    description: 'Run Forgewright quality gate validation',
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      level: {
        type: 'number',
        required: false,
        description: 'Validation level (1-3)',
        default: 3,
      },
      strict: {
        type: 'boolean',
        required: false,
        description: 'Enable strict mode',
        default: false,
      },
      json: {
        type: 'boolean',
        required: false,
        description: 'Output as JSON',
        default: false,
      },
    },
    examples: ['forge validate --json', 'forge validate --level 2'],
  },

  // Config
  {
    name: 'config.get',
    description: 'Get configuration value',
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      key: {
        type: 'string',
        required: true,
        description: 'Configuration key',
      },
    },
    examples: ['forge config get forge.apiKey'],
  },

  {
    name: 'config.set',
    description: 'Set configuration value',
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      key: {
        type: 'string',
        required: true,
        description: 'Configuration key',
      },
      value: {
        type: 'string',
        required: true,
        description: 'Configuration value',
      },
    },
    examples: ['forge config set forge.apiKey sk-xxx'],
  },

  {
    name: 'config.list',
    description: 'List all configuration values with sources',
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {},
    examples: ['forge config list'],
  },

  // Doctor
  {
    name: 'doctor.check',
    description: 'Run diagnostics and health checks',
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      verbose: {
        type: 'boolean',
        required: false,
        description: 'Verbose output',
        default: false,
      },
    },
    examples: ['forge doctor', 'forge doctor --verbose'],
  },

  // Engineering Skills
  {
    name: 'engineering.software',
    description: 'Software engineering tasks - backend, APIs, databases',
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
      language: {
        type: 'string',
        required: false,
        description: 'Programming language',
      },
    },
    examples: ['forge tools call engineering.software --args \'{"task":"create REST API"}\''],
  },

  {
    name: 'engineering.frontend',
    description: 'Frontend engineering tasks - React, Vue, UI components',
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
      framework: {
        type: 'string',
        required: false,
        description: 'UI framework',
      },
    },
    examples: ['forge tools call engineering.frontend --args \'{"task":"create button component"}\''],
  },

  {
    name: 'engineering.qa',
    description: 'QA engineering - testing, test coverage, quality assurance',
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
    },
    examples: ['forge tools call engineering.qa --args \'{"task":"write unit tests"}\''],
  },

  {
    name: 'engineering.security',
    description: 'Security engineering - audits, hardening, vulnerability checks',
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
    },
    examples: ['forge tools call engineering.security --args \'{"task":"audit authentication"}\''],
  },

  // DevOps
  {
    name: 'devops.deploy',
    description: 'Deployment automation - CI/CD, Docker, Kubernetes',
    category: TOOL_CATEGORIES.DEVOPS,
    inputSchema: {
      target: {
        type: 'string',
        required: true,
        description: 'Deployment target',
      },
      environment: {
        type: 'string',
        required: false,
        description: 'Environment (prod, staging, dev)',
      },
    },
    examples: ['forge tools call devops.deploy --args \'{"target":"aws","environment":"prod"}\''],
  },

  {
    name: 'devops.database',
    description: 'Database engineering - migrations, optimization, backups',
    category: TOOL_CATEGORIES.DEVOPS,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
    },
    examples: ['forge tools call devops.database --args \'{"task":"create migration"}\''],
  },

  // AI/ML
  {
    name: 'ai.engineer',
    description: 'AI engineering - LLM integration, RAG, chatbots',
    category: TOOL_CATEGORIES.AI_ML,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
    },
    examples: ['forge tools call ai.engineer --args \'{"task":"build RAG system"}\''],
  },

  {
    name: 'ai.prompt',
    description: 'Prompt engineering and optimization',
    category: TOOL_CATEGORIES.AI_ML,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
    },
    examples: ['forge tools call ai.prompt --args \'{"task":"optimize classification prompt"}\''],
  },

  // Game Development
  {
    name: 'game.design',
    description: 'Game design - mechanics, narrative, level design',
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
    },
    examples: ['forge tools call game.design --args \'{"task":"design combat system"}\''],
  },

  {
    name: 'game.unity',
    description: 'Unity game development',
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
    },
    examples: ['forge tools call game.unity --args \'{"task":"create player controller"}\''],
  },

  {
    name: 'game.unreal',
    description: 'Unreal Engine game development',
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: 'string',
        required: true,
        description: 'Task description',
      },
    },
    examples: ['forge tools call game.unreal --args \'{"task":"setup character blueprint"}\''],
  },

  // Meta
  {
    name: 'meta.polymath',
    description: 'Research and exploration assistance',
    category: TOOL_CATEGORIES.META,
    inputSchema: {
      query: {
        type: 'string',
        required: true,
        description: 'Research query',
      },
    },
    examples: ['forge tools call meta.polymath --args \'{"query":"how does blockchain work"}\''],
  },

  {
    name: 'meta.memory',
    description: 'Memory and context management',
    category: TOOL_CATEGORIES.META,
    inputSchema: {
      action: {
        type: 'string',
        required: true,
        description: 'Action (read, write, search)',
      },
      key: {
        type: 'string',
        required: false,
        description: 'Memory key',
      },
      value: {
        type: 'string',
        required: false,
        description: 'Value to store',
      },
    },
    examples: ['forge tools call meta.memory --args \'{"action":"read","key":"project-info"}\''],
  },
] as const;

// ============================================================================
// Registry Operations
// ============================================================================

/**
 * Get all tools in the registry
 */
export function getAllTools(): readonly ToolSpec[] {
  return TOOL_REGISTRY;
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): readonly ToolSpec[] {
  return TOOL_REGISTRY.filter((tool) => tool.category === category);
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): ToolSpec | undefined {
  return TOOL_REGISTRY.find((tool) => tool.name === name);
}

/**
 * Search tools by query
 */
export function searchTools(query: string): readonly ToolSpec[] {
  const lowerQuery = query.toLowerCase();
  return TOOL_REGISTRY.filter(
    (tool) =>
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery) ||
      tool.category.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get all unique categories
 */
export function getCategories(): readonly string[] {
  const categories = new Set(TOOL_REGISTRY.map((tool) => tool.category));
  return Array.from(categories).sort();
}

/**
 * Get tool count
 */
export function getToolCount(): number {
  return TOOL_REGISTRY.length;
}

/**
 * Get tool count by category
 */
export function getToolCountByCategory(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tool of TOOL_REGISTRY) {
    counts[tool.category] = (counts[tool.category] || 0) + 1;
  }
  return counts;
}
