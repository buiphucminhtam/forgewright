import { Command, Option } from 'commander';
import pc7 from 'picocolors';
import { existsSync, readFileSync, mkdirSync, writeFileSync, openSync, constants, writeSync, fstatSync, fsyncSync, closeSync, lstatSync, renameSync, unlinkSync, statSync, mkdtempSync, cpSync, realpathSync, rmSync, copyFileSync, chmodSync, readdirSync, appendFileSync } from 'fs';
import { join, resolve, dirname, isAbsolute, relative, sep, basename, posix, extname } from 'path';
import { homedir, tmpdir } from 'os';
import { execSync, spawn, spawnSync } from 'child_process';
import { isIP } from 'net';
import { pathToFileURL, fileURLToPath } from 'url';
import { createRequire } from 'module';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { z } from 'zod';

var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/global-flags.ts
function registerGlobalFlags(program) {
  program.option("-j, --json", "Force JSON output (agent mode)").option("--no-color", "Disable colored output").option("-q, --quiet", "Suppress stdout output").option("--debug", "Enable debug mode");
}

// src/core/tool-registry.ts
var TOOL_CATEGORIES = {
  ORCHESTRATION: "orchestration",
  ENGINEERING: "engineering",
  GAME_DEV: "game-dev",
  AI_ML: "ai-ml",
  DEVOPS: "devops",
  META: "meta"
};
var TOOL_REGISTRY = [
  // Orchestration
  {
    name: "orchestrator.execute",
    description: "Execute the Forgewright orchestration pipeline",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      mode: {
        type: "string",
        required: true,
        description: "Pipeline mode (full-build, feature, harden, ship, sustain)",
        enum: ["full-build", "feature", "harden", "ship", "sustain", "grow"]
      },
      request: {
        type: "string",
        required: true,
        description: "User request description"
      },
      options: {
        type: "object",
        required: false,
        description: "Additional options"
      }
    },
    examples: [
      `forge tools call orchestrator.execute --args '{"mode":"feature","request":"add login"}'`
    ]
  },
  // Skills
  {
    name: "skills.list",
    description: "List all available Forgewright skills",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      category: {
        type: "string",
        required: false,
        description: "Filter by category"
      },
      format: {
        type: "string",
        required: false,
        description: "Output format (table, json)",
        enum: ["table", "json"]
      }
    },
    examples: ["forge skills list", "forge skills list --category engineering"]
  },
  {
    name: "skills.search",
    description: "Search for skills by keyword",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      query: {
        type: "string",
        required: true,
        description: "Search query"
      },
      category: {
        type: "string",
        required: false,
        description: "Filter by category"
      }
    },
    examples: [`forge tools call skills.search --args '{"query":"api"}'`]
  },
  // Validate
  {
    name: "validate.quality",
    description: "Run Forgewright quality gate validation",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      level: {
        type: "number",
        required: false,
        description: "Validation level (1-3)",
        default: 3
      },
      strict: {
        type: "boolean",
        required: false,
        description: "Enable strict mode",
        default: false
      },
      json: {
        type: "boolean",
        required: false,
        description: "Output as JSON",
        default: false
      }
    },
    examples: ["forge validate --json", "forge validate --level 2"]
  },
  // Config
  {
    name: "config.get",
    description: "Get configuration value",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      key: {
        type: "string",
        required: true,
        description: "Configuration key"
      }
    },
    examples: ["forge config get forge.apiKey"]
  },
  {
    name: "config.set",
    description: "Set configuration value",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      key: {
        type: "string",
        required: true,
        description: "Configuration key"
      },
      value: {
        type: "string",
        required: true,
        description: "Configuration value"
      }
    },
    examples: ["forge config set forge.apiKey sk-xxx"]
  },
  {
    name: "config.list",
    description: "List all configuration values with sources",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {},
    examples: ["forge config list"]
  },
  // Doctor
  {
    name: "doctor.check",
    description: "Run diagnostics and health checks",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      verbose: {
        type: "boolean",
        required: false,
        description: "Verbose output",
        default: false
      }
    },
    examples: ["forge doctor", "forge doctor --verbose"]
  },
  // Engineering Skills
  {
    name: "engineering.software",
    description: "Software engineering tasks - backend, APIs, databases",
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      },
      language: {
        type: "string",
        required: false,
        description: "Programming language"
      }
    },
    examples: [
      `forge tools call engineering.software --args '{"task":"create REST API"}'`
    ]
  },
  {
    name: "engineering.frontend",
    description: "Frontend engineering tasks - React, Vue, UI components",
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      },
      framework: {
        type: "string",
        required: false,
        description: "UI framework"
      }
    },
    examples: [
      `forge tools call engineering.frontend --args '{"task":"create button component"}'`
    ]
  },
  {
    name: "engineering.qa",
    description: "QA engineering - testing, test coverage, quality assurance",
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `forge tools call engineering.qa --args '{"task":"write unit tests"}'`
    ]
  },
  {
    name: "engineering.security",
    description: "Security engineering - audits, hardening, vulnerability checks",
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `forge tools call engineering.security --args '{"task":"audit authentication"}'`
    ]
  },
  // DevOps
  {
    name: "devops.deploy",
    description: "Deployment automation - CI/CD, Docker, Kubernetes",
    category: TOOL_CATEGORIES.DEVOPS,
    inputSchema: {
      target: {
        type: "string",
        required: true,
        description: "Deployment target"
      },
      environment: {
        type: "string",
        required: false,
        description: "Environment (prod, staging, dev)"
      }
    },
    examples: [
      `forge tools call devops.deploy --args '{"target":"aws","environment":"prod"}'`
    ]
  },
  {
    name: "devops.database",
    description: "Database engineering - migrations, optimization, backups",
    category: TOOL_CATEGORIES.DEVOPS,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `forge tools call devops.database --args '{"task":"create migration"}'`
    ]
  },
  // AI/ML
  {
    name: "ai.engineer",
    description: "AI engineering - LLM integration, RAG, chatbots",
    category: TOOL_CATEGORIES.AI_ML,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `forge tools call ai.engineer --args '{"task":"build RAG system"}'`
    ]
  },
  {
    name: "ai.prompt",
    description: "Prompt engineering and optimization",
    category: TOOL_CATEGORIES.AI_ML,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `forge tools call ai.prompt --args '{"task":"optimize classification prompt"}'`
    ]
  },
  // Game Development
  {
    name: "game.design",
    description: "Game design - mechanics, narrative, level design",
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `forge tools call game.design --args '{"task":"design combat system"}'`
    ]
  },
  {
    name: "game.unity",
    description: "Unity game development",
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `forge tools call game.unity --args '{"task":"create player controller"}'`
    ]
  },
  {
    name: "game.unreal",
    description: "Unreal Engine game development",
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `forge tools call game.unreal --args '{"task":"setup character blueprint"}'`
    ]
  },
  // Meta
  {
    name: "meta.polymath",
    description: "Research and exploration assistance",
    category: TOOL_CATEGORIES.META,
    inputSchema: {
      query: {
        type: "string",
        required: true,
        description: "Research query"
      }
    },
    examples: [
      `forge tools call meta.polymath --args '{"query":"how does blockchain work"}'`
    ]
  },
  {
    name: "meta.memory",
    description: "Memory and context management",
    category: TOOL_CATEGORIES.META,
    inputSchema: {
      action: {
        type: "string",
        required: true,
        description: "Action (read, write, search)"
      },
      key: {
        type: "string",
        required: false,
        description: "Memory key"
      },
      value: {
        type: "string",
        required: false,
        description: "Value to store"
      }
    },
    examples: [
      `forge tools call meta.memory --args '{"action":"read","key":"project-info"}'`
    ]
  }
];
function getAllTools() {
  return TOOL_REGISTRY;
}
function getToolsByCategory(category) {
  return TOOL_REGISTRY.filter((tool) => tool.category === category);
}
function getToolByName(name) {
  return TOOL_REGISTRY.find((tool) => tool.name === name);
}
function searchTools(query) {
  const lowerQuery = query.toLowerCase();
  return TOOL_REGISTRY.filter(
    (tool) => tool.name.toLowerCase().includes(lowerQuery) || tool.description.toLowerCase().includes(lowerQuery) || tool.category.toLowerCase().includes(lowerQuery)
  );
}
function getCategories() {
  const categories = new Set(TOOL_REGISTRY.map((tool) => tool.category));
  return Array.from(categories).sort();
}
function getToolCount() {
  return TOOL_REGISTRY.length;
}
function getToolCountByCategory() {
  const counts = {};
  for (const tool of TOOL_REGISTRY) {
    counts[tool.category] = (counts[tool.category] || 0) + 1;
  }
  return counts;
}

// src/types/index.ts
function buildEnvelope(tool, data, options) {
  return {
    ok: options.ok,
    tool,
    data,
    metadata: {
      duration_ms: options.duration_ms,
      version: options.version,
      config_source: options.config_source
    },
    error: options.error ?? null
  };
}
var CONFIG_SOURCES = {
  OS_ENV: 1,
  USER_CONFIG: 2,
  PROCESS_ENV: 3,
  DOTENV: 4,
  INLINE_FLAGS: 5
};

// src/version.ts
var VERSION = "2.0.0-alpha.1";

// src/commands/tools.ts
function registerToolsCommands(program) {
  program.command("tools").description("Tool registry management").argument("[command]", "subcommand", "list").option("-c, --category <category>", "Filter by category").option("-s, --search <query>", "Search tools").option("-j, --json", "Output as JSON").action(async (command, options) => {
    await handleToolsCommand(command, options);
  });
  program.command("tools:list").description("List all tools").option("-c, --category <category>", "Filter by category").option("-s, --search <query>", "Search tools").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleToolsCommand("list", options);
  });
  program.command("tools:search").description("Search tools").argument("<query>", "Search query").option("-j, --json", "Output as JSON").action(async (query, options) => {
    await handleToolsCommand("list", { ...options, search: query });
  });
}
async function handleToolsCommand(_command, options) {
  const startTime = Date.now();
  const useJson3 = options.json || !process.stdout.isTTY;
  try {
    let tools;
    let filtered = false;
    if (options.search) {
      tools = searchTools(options.search);
      filtered = true;
    } else if (options.category) {
      tools = getToolsByCategory(options.category);
      filtered = true;
    } else {
      tools = getAllTools();
    }
    const duration_ms = Date.now() - startTime;
    if (useJson3) {
      const envelope = buildEnvelope(
        "tools.list",
        {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            category: t.category,
            inputSchema: t.inputSchema
          })),
          total: tools.length,
          filtered,
          category: options.category ?? null,
          search: options.search ?? null
        },
        {
          ok: true,
          duration_ms,
          version: VERSION
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printHumanReadable(tools, options.category, options.search);
    }
    process.exit(0);
  } catch (error2) {
    const duration_ms = Date.now() - startTime;
    const message = error2 instanceof Error ? error2.message : String(error2);
    if (useJson3) {
      const envelope = buildEnvelope("tools.list", null, {
        ok: false,
        duration_ms,
        version: VERSION,
        error: {
          code: 1,
          message
        }
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: ${message}`));
    }
    process.exit(1);
  }
}
function printHumanReadable(tools, category, search) {
  const headerColor = pc7.bold;
  const categoryColor = pc7.cyan;
  const nameColor = pc7.green;
  console.log();
  console.log(
    headerColor(
      "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"
    )
  );
  console.log(
    headerColor("\u2551") + "              Forgewright Tool Registry".padEnd(62) + headerColor("\u2551")
  );
  console.log(
    headerColor(
      "\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"
    )
  );
  const counts = getToolCountByCategory();
  const summaryParts = [];
  for (const [cat, count] of Object.entries(counts)) {
    summaryParts.push(`${categoryColor(cat)}: ${count}`);
  }
  console.log(
    headerColor("\u2551") + `  Total: ${getToolCount()} tools | ${summaryParts.join(" | ")}`.padEnd(
      62
    ) + headerColor("\u2551")
  );
  if (category || search) {
    const filterDesc = category ? `Category: ${categoryColor(category)}` : `Search: "${search}"`;
    console.log(
      headerColor("\u2551") + `  Filter: ${filterDesc}`.padEnd(62) + headerColor("\u2551")
    );
  }
  console.log(
    headerColor(
      "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
    )
  );
  console.log();
  if (tools.length === 0) {
    console.log(pc7.yellow("  No tools found matching criteria"));
    return;
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const tool of tools) {
    const existing = grouped.get(tool.category) || [];
    existing.push(tool);
    grouped.set(tool.category, existing);
  }
  for (const [cat, catTools] of grouped) {
    console.log(pc7.bold(`
  ${categoryColor(cat.toUpperCase())}`));
    console.log(pc7.dim("  " + "\u2500".repeat(50)));
    for (const tool of catTools) {
      console.log(`    ${nameColor(tool.name)}`);
      console.log(`      ${pc7.dim(tool.description)}`);
    }
  }
  console.log();
  console.log(pc7.dim("  Use --json for machine-readable output"));
  console.log();
}
function registerSkillsCommands(program) {
  const skills = program.command("skills").description("Skill management");
  skills.command("list").description("List all skills").option("-c, --category <category>", "Filter by category").option("-s, --search <query>", "Search skills").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleSkillsList(options);
  });
  skills.command("search").description("Search skills").argument("<query>", "Search query").option("-j, --json", "Output as JSON").action(async (query, options) => {
    await handleSkillsList({ ...options, search: query });
  });
  skills.command("categories").description("List skill categories").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleCategories(options.json);
  });
}
async function handleSkillsList(options) {
  const startTime = Date.now();
  const useJson3 = options.json || !process.stdout.isTTY;
  try {
    let skills;
    if (options.search) {
      skills = searchTools(options.search);
    } else if (options.category) {
      skills = getAllTools().filter((t) => t.category === options.category);
    } else {
      skills = getAllTools();
    }
    const duration_ms = Date.now() - startTime;
    if (useJson3) {
      const envelope = buildEnvelope(
        "skills.list",
        {
          skills: skills.map((s) => ({
            name: s.name,
            description: s.description,
            category: s.category
          })),
          total: skills.length
        },
        {
          ok: true,
          duration_ms,
          version: VERSION
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printSkillsHumanReadable(skills, options.category, options.search);
    }
    process.exit(0);
  } catch (error2) {
    const duration_ms = Date.now() - startTime;
    const message = error2 instanceof Error ? error2.message : String(error2);
    if (useJson3) {
      const envelope = buildEnvelope("skills.list", null, {
        ok: false,
        duration_ms,
        version: VERSION,
        error: { code: 1, message }
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: ${message}`));
    }
    process.exit(1);
  }
}
async function handleCategories(json) {
  const categories = getCategories();
  const counts = getToolCountByCategory();
  if (json || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "skills.categories",
      {
        categories: categories.map((c) => ({
          name: c,
          count: counts[c] || 0
        })),
        total: categories.length
      },
      {
        ok: true,
        duration_ms: 0,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold("  Skill Categories\n"));
    for (const cat of categories) {
      console.log(`    ${pc7.cyan(cat.padEnd(20))} ${counts[cat] || 0} skills`);
    }
    console.log();
  }
  process.exit(0);
}
function printSkillsHumanReadable(skills, category, search) {
  console.log();
  console.log(pc7.bold(`  Forgewright Skills`));
  console.log(pc7.dim("  " + "\u2500".repeat(50)));
  if (category || search) {
    const filter = category ? `Category: ${category}` : `Search: "${search}"`;
    console.log(`  Filter: ${pc7.yellow(filter)}`);
  }
  console.log(`  Total: ${skills.length} skills
`);
  for (const skill of skills) {
    console.log(`    ${pc7.green(skill.name)}`);
    console.log(`      ${pc7.dim(skill.description)}`);
    console.log(`      ${pc7.gray(`[${skill.category}]`)}`);
    console.log();
  }
  console.log(pc7.dim("  Use --json for machine-readable output"));
}

// src/exit-codes.ts
var EXIT_CODES = {
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
  INTERNAL_ERROR: 7
};

// src/commands/tools-call.ts
function registerToolsCallCommand(program) {
  program.command("tools:call").description("Call a tool by name").argument("<name>", "Tool name to call (e.g., skills.list)").option("-a, --args <json>", "Tool arguments as JSON string").option("--stdin", "Read arguments from stdin").option("-j, --json", "Output as JSON").action(async (name, options) => {
    await handleToolsCall(name, options);
  });
}
async function handleToolsCall(name, options) {
  const startTime = Date.now();
  const useJson3 = options.json || !process.stdout.isTTY;
  try {
    const tool = getToolByName(name);
    if (!tool) {
      const availableTools = getAllTools().map((t) => t.name).join(", ");
      throw new Error(
        `Tool "${name}" not found. Available tools: ${availableTools}`
      );
    }
    let args = {};
    if (options.stdin) {
      const stdinData = await readStdin();
      try {
        args = JSON.parse(stdinData);
      } catch {
        throw new Error("Invalid JSON from stdin");
      }
    } else if (options.args) {
      try {
        args = JSON.parse(options.args);
      } catch {
        throw new Error(
          `Invalid JSON in --args. Use: --args '{"key":"value"}'`
        );
      }
    }
    for (const [key, field] of Object.entries(tool.inputSchema)) {
      if (field.required && !(key in args)) {
        throw new Error(`Missing required argument: ${key}`);
      }
    }
    const duration_ms = Date.now() - startTime;
    const result = await executeTool(tool.name, args);
    if (useJson3) {
      const envelope = buildEnvelope(`tools.call.${tool.name}`, result, {
        ok: true,
        duration_ms,
        version: VERSION
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printHumanReadable2(tool.name, result);
    }
    process.exit(EXIT_CODES.OK);
  } catch (error2) {
    const duration_ms = Date.now() - startTime;
    const message = error2 instanceof Error ? error2.message : String(error2);
    if (useJson3) {
      const envelope = {
        ok: false,
        tool: "tools.call",
        data: null,
        metadata: {
          duration_ms,
          version: VERSION
        },
        error: {
          code: EXIT_CODES.TOOL_ERROR,
          message
        }
      };
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: ${message}`));
    }
    process.exit(EXIT_CODES.TOOL_ERROR);
  }
}
async function readStdin() {
  return new Promise((resolve16, reject) => {
    let data = "";
    process.stdin.on("readable", () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk.toString();
      }
    });
    process.stdin.on("end", () => resolve16(data));
    process.stdin.on("error", reject);
  });
}
async function executeTool(name, args) {
  return {
    tool: name,
    args,
    status: "executed",
    message: `Tool "${name}" executed successfully`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function printHumanReadable2(toolName, result) {
  console.log();
  console.log(pc7.green(`\u2713 ${toolName}`));
  console.log(pc7.dim("\u2500".repeat(50)));
  console.log();
  console.log(pc7.bold("Result:"));
  console.log(JSON.stringify(result, null, 2));
  console.log();
}
var SOURCE_LABELS = {
  OS_ENV: "Environment Variable",
  USER_CONFIG: "User Config (~/.config/forgewright)",
  PROCESS_ENV: "Process Environment",
  DOTENV: ".env File",
  INLINE_FLAGS: "Inline Flag"
};
var CONFIG_PATHS = {
  USER_CONFIG: join(homedir(), ".config", "forgewright", "config.json"),
  LEGACY_CONFIG: join(homedir(), ".forgewright", "config.json"),
  PROJECT_ENV: ".env",
  PROJECT_ENV_LOCAL: ".env.local"
};
var ENV_PREFIX = "FORGE_";
var ConfigStore = class {
  values = /* @__PURE__ */ new Map();
  constructor() {
    this.loadDefaults();
  }
  /**
   * Load default configuration values
   */
  loadDefaults() {
    this.set("forge.debug", false, "DEFAULT");
    this.set("forge.quiet", false, "DEFAULT");
    this.set("forge.json", false, "DEFAULT");
    this.set("forge.color", true, "DEFAULT");
    this.set("forge.apiUrl", "https://api.forgewright.io", "DEFAULT");
    this.set("forge.timeout", 3e4, "DEFAULT");
  }
  /**
   * Set a configuration value
   */
  set(key, value, source) {
    const entry = {
      key,
      value,
      source: source === "DEFAULT" ? "INLINE_FLAGS" : source
    };
    const existing = this.values.get(key);
    if (existing && !this.shouldOverride(existing.source, entry.source)) {
      return;
    }
    this.values.set(key, entry);
  }
  /**
   * Check if new source should override existing
   */
  shouldOverride(existingSource, newSource) {
    const existingPriority = CONFIG_SOURCES[existingSource];
    const newPriority = CONFIG_SOURCES[newSource];
    return existingPriority >= newPriority;
  }
  /**
   * Get a configuration value
   */
  get(key, defaultValue) {
    const entry = this.values.get(key);
    return entry ? entry.value : defaultValue;
  }
  /**
   * Get with source info
   */
  getEntry(key) {
    return this.values.get(key);
  }
  /**
   * Get all entries
   */
  getAll() {
    return Array.from(this.values.values());
  }
  /**
   * Check if key exists
   */
  has(key) {
    return this.values.has(key);
  }
  /**
   * Delete a key
   */
  delete(key) {
    return this.values.delete(key);
  }
  /**
   * Load from user config file
   */
  loadUserConfig() {
    const path = CONFIG_PATHS.USER_CONFIG;
    if (!existsSync(path)) {
      if (existsSync(CONFIG_PATHS.LEGACY_CONFIG)) {
        return this.loadJsonFile(CONFIG_PATHS.LEGACY_CONFIG, "USER_CONFIG");
      }
      return false;
    }
    return this.loadJsonFile(path, "USER_CONFIG");
  }
  /**
   * Load from .env files
   */
  loadEnvFiles(cwd) {
    const paths = [
      resolve(cwd, CONFIG_PATHS.PROJECT_ENV_LOCAL),
      resolve(cwd, CONFIG_PATHS.PROJECT_ENV)
    ];
    for (const path of paths) {
      if (existsSync(path)) {
        this.loadEnvFile(path);
      }
    }
  }
  /**
   * Load environment variables
   */
  loadEnvVars() {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(ENV_PREFIX) && value !== void 0) {
        const configKey = key.slice(ENV_PREFIX.length).toLowerCase().replace(/_/g, ".");
        this.set(configKey, this.parseValue(value), "OS_ENV");
      }
    }
  }
  /**
   * Load JSON config file
   */
  loadJsonFile(path, source) {
    try {
      const content = readFileSync(path, "utf-8");
      const config2 = JSON.parse(content);
      for (const [key, value] of Object.entries(config2)) {
        this.set(key, value, source);
      }
      return true;
    } catch (error2) {
      console.warn(`Warning: Failed to load config from ${path}:`, error2);
      return false;
    }
  }
  /**
   * Load .env file
   */
  loadEnvFile(path) {
    try {
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const match2 = trimmed.match(/^([^=]+)=(.*)$/);
        if (match2) {
          const [, key, value] = match2;
          this.set(key.trim(), this.parseValue(value.trim()), "DOTENV");
        }
      }
    } catch (error2) {
      console.warn(`Warning: Failed to load .env from ${path}:`, error2);
    }
  }
  /**
   * Parse value to appropriate type
   */
  parseValue(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (value === "undefined") return void 0;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith("{") && value.endsWith("}") || value.startsWith("[") && value.endsWith("]")) {
      try {
        return JSON.parse(value);
      } catch {
      }
    }
    return value;
  }
};
var globalConfig = null;
function getConfig() {
  if (!globalConfig) {
    globalConfig = new ConfigStore();
  }
  return globalConfig;
}

// src/commands/config.ts
function registerConfigCommands(program) {
  const config2 = program.command("config").description("Configuration management");
  config2.command("get").description("Get a configuration value").argument("<key>", "Configuration key").option("-j, --json", "Output as JSON").action(async (key, options) => {
    await handleConfigGet(key, options.json);
  });
  config2.command("set").description("Set a configuration value").argument("<key>", "Configuration key").argument("<value>", "Configuration value").option("-j, --json", "Output as JSON").action(async (key, value, options) => {
    await handleConfigSet(key, value, options.json);
  });
  config2.command("list").description("List all configuration values").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleConfigList(options.json);
  });
  config2.command("init").description("Initialize configuration file").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleConfigInit(options.json);
  });
  config2.command("delete").description("Delete a configuration value").argument("<key>", "Configuration key").option("-j, --json", "Output as JSON").action(async (key, options) => {
    await handleConfigDelete(key, options.json);
  });
}
async function handleConfigGet(key, useJson3) {
  const startTime = Date.now();
  const config2 = getConfig();
  const entry = config2.getEntry(key);
  if (!entry) {
    if (useJson3 || !process.stdout.isTTY) {
      const envelope = buildEnvelope(
        "config.get",
        { key, found: false },
        {
          ok: false,
          duration_ms: Date.now() - startTime,
          version: VERSION,
          error: { code: 3, message: `Configuration key not found: ${key}` }
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: Configuration key not found: ${key}`));
    }
    process.exit(3);
  }
  if (useJson3 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "config.get",
      {
        key,
        value: entry.value,
        source: entry.source,
        sourceLabel: SOURCE_LABELS[entry.source]
      },
      {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold(`  ${key}`));
    console.log(`  ${pc7.gray("\u2500".repeat(50))}`);
    console.log(`  Value: ${pc7.green(JSON.stringify(entry.value, null, 2))}`);
    console.log(`  Source: ${pc7.cyan(SOURCE_LABELS[entry.source])}`);
    console.log();
  }
  process.exit(0);
}
async function handleConfigSet(key, value, useJson3) {
  const startTime = Date.now();
  const config2 = getConfig();
  let parsedValue;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    parsedValue = value;
  }
  config2.set(key, parsedValue, "USER_CONFIG");
  const configPath = CONFIG_PATHS.USER_CONFIG;
  mkdirSync(dirname(configPath), { recursive: true });
  let existingConfig = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      existingConfig = JSON.parse(content);
    } catch {
    }
  }
  existingConfig[key] = parsedValue;
  writeFileSync(configPath, JSON.stringify(existingConfig, null, 2) + "\n");
  if (useJson3 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "config.set",
      {
        key,
        value: parsedValue,
        source: "USER_CONFIG",
        persisted: true
      },
      {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.green(`  \u2713 ${key}`));
    console.log(`  ${pc7.gray("\u2500".repeat(50))}`);
    console.log(`  Value: ${JSON.stringify(parsedValue)}`);
    console.log(`  Saved to: ${pc7.cyan(configPath)}`);
    console.log();
  }
  process.exit(0);
}
async function handleConfigList(useJson3) {
  const startTime = Date.now();
  const config2 = getConfig();
  const entries = config2.getAll();
  if (useJson3 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "config.list",
      {
        entries: entries.map((e) => ({
          key: e.key,
          value: e.value,
          source: e.source,
          sourceLabel: SOURCE_LABELS[e.source]
        })),
        total: entries.length
      },
      {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold("  Configuration\n"));
    const bySource = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const source = SOURCE_LABELS[entry.source];
      const list2 = bySource.get(source) || [];
      list2.push(entry);
      bySource.set(source, list2);
    }
    for (const [source, sourceEntries] of bySource) {
      console.log(pc7.cyan(`  ${source}`));
      console.log(pc7.gray("  " + "\u2500".repeat(40)));
      for (const entry of sourceEntries) {
        const valueStr = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
        console.log(
          `    ${pc7.green(entry.key.padEnd(30))} ${pc7.dim(valueStr.slice(0, 50))}`
        );
      }
      console.log();
    }
    console.log(pc7.dim("  Use --json for machine-readable output"));
    console.log();
  }
  process.exit(0);
}
async function handleConfigInit(useJson3) {
  const startTime = Date.now();
  const configPath = CONFIG_PATHS.USER_CONFIG;
  mkdirSync(dirname(configPath), { recursive: true });
  const defaultConfig = {
    version: VERSION,
    defaults: {
      debug: false,
      quiet: false,
      json: false,
      color: true
    }
  };
  if (existsSync(configPath)) {
    if (useJson3 || !process.stdout.isTTY) {
      const envelope = buildEnvelope(
        "config.init",
        {
          path: configPath,
          status: "already_exists"
        },
        {
          ok: true,
          duration_ms: Date.now() - startTime,
          version: VERSION
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.log(pc7.yellow(`  Configuration already exists at ${configPath}`));
    }
  } else {
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + "\n");
    if (useJson3 || !process.stdout.isTTY) {
      const envelope = buildEnvelope(
        "config.init",
        {
          path: configPath,
          status: "created"
        },
        {
          ok: true,
          duration_ms: Date.now() - startTime,
          version: VERSION
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.log();
      console.log(pc7.green(`  \u2713 Created ${configPath}`));
      console.log();
    }
  }
  process.exit(0);
}
async function handleConfigDelete(key, useJson3) {
  const startTime = Date.now();
  const config2 = getConfig();
  if (!config2.has(key)) {
    if (useJson3 || !process.stdout.isTTY) {
      const envelope = buildEnvelope(
        "config.delete",
        { key, found: false },
        {
          ok: false,
          duration_ms: Date.now() - startTime,
          version: VERSION,
          error: { code: 3, message: `Configuration key not found: ${key}` }
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: Configuration key not found: ${key}`));
    }
    process.exit(3);
  }
  config2.delete(key);
  if (useJson3 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "config.delete",
      { key, deleted: true },
      {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log(pc7.green(`  \u2713 Deleted ${key}`));
  }
  process.exit(0);
}
function registerDoctorCommand(program) {
  program.command("doctor").description("Run diagnostics and health checks").option("-v, --verbose", "Verbose output").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleDoctor(options);
  });
}
async function handleDoctor(options) {
  const startTime = Date.now();
  const useJson3 = options.json || !process.stdout.isTTY;
  const verbose = options.verbose;
  const checks = [];
  checks.push(checkNodeVersion());
  checks.push(checkForgewright());
  checks.push(checkConfig());
  checks.push(checkMemory());
  checks.push(checkForgeNexus());
  const healthy = checks.filter((c) => c.status === "ok").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const errors2 = checks.filter((c) => c.status === "error").length;
  const allOk = errors2 === 0;
  if (useJson3) {
    const envelope = buildEnvelope(
      "doctor.check",
      {
        checks,
        summary: {
          healthy,
          warnings,
          errors: errors2,
          allOk
        }
      },
      {
        ok: allOk,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: allOk ? void 0 : {
          code: errors2 > 0 ? 1 : 2,
          message: `${errors2} errors, ${warnings} warnings`
        }
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printHumanReadable3(checks, healthy, warnings, errors2, verbose);
  }
  process.exit(allOk ? 0 : errors2 > 0 ? 1 : 0);
}
function checkNodeVersion() {
  const version = process.version;
  const match2 = version.match(/^v(\d+)\./);
  if (!match2) {
    return {
      name: "Node.js Version",
      status: "error",
      message: `Unknown version: ${version}`
    };
  }
  const major = parseInt(match2[1], 10);
  if (major < 18) {
    return {
      name: "Node.js Version",
      status: "error",
      message: `Node.js ${major} is too old. Minimum: 18`,
      details: `Current: ${version}`
    };
  }
  if (major < 20) {
    return {
      name: "Node.js Version",
      status: "warning",
      message: `Node.js ${major} is older than recommended`,
      details: `Current: ${version}, Recommended: 20+`
    };
  }
  return {
    name: "Node.js Version",
    status: "ok",
    message: version
  };
}
function checkForgewright() {
  const cwd = process.cwd();
  const forgewrightRoot = findForgewrightRoot(cwd);
  if (!forgewrightRoot) {
    return {
      name: "Forgewright Project",
      status: "warning",
      message: "Not in a Forgewright project",
      details: "Some features may not be available"
    };
  }
  return {
    name: "Forgewright Project",
    status: "ok",
    message: `Found at ${forgewrightRoot}`
  };
}
function checkConfig() {
  const userConfig = resolve(
    homedir(),
    ".config",
    "forgewright",
    "config.json"
  );
  const legacyConfig = resolve(homedir(), ".forgewright", "config.json");
  if (existsSync(userConfig)) {
    return {
      name: "User Configuration",
      status: "ok",
      message: "Configuration file found",
      details: userConfig
    };
  }
  if (existsSync(legacyConfig)) {
    return {
      name: "User Configuration",
      status: "warning",
      message: "Using legacy config location",
      details: `${legacyConfig} - consider migrating to ${userConfig}`
    };
  }
  return {
    name: "User Configuration",
    status: "warning",
    message: "No configuration file found",
    details: "Run: forge config init"
  };
}
function checkMemory() {
  const memoryPath = resolve(process.cwd(), ".forgewright", "memory.jsonl");
  if (!existsSync(memoryPath)) {
    return {
      name: "Memory Store",
      status: "warning",
      message: "No memory store found",
      details: "Run: forge config init"
    };
  }
  return {
    name: "Memory Store",
    status: "ok",
    message: "Memory store found",
    details: memoryPath
  };
}
function checkForgeNexus() {
  try {
    const result = execSync(
      'npx forgenexus --version 2>/dev/null || echo "not_found"',
      {
        encoding: "utf-8",
        timeout: 5e3
      }
    );
    if (result.trim() === "not_found") {
      return {
        name: "ForgeNexus",
        status: "warning",
        message: "ForgeNexus not installed",
        details: "Run: npm install -g forgenexus"
      };
    }
    return {
      name: "ForgeNexus",
      status: "ok",
      message: result.trim()
    };
  } catch {
    return {
      name: "ForgeNexus",
      status: "warning",
      message: "Could not verify ForgeNexus",
      details: "Run: npx forgenexus --version"
    };
  }
}
function findForgewrightRoot(cwd) {
  let current = cwd;
  while (current !== "/") {
    const configPath = join(current, ".forgewright");
    if (existsSync(configPath)) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return null;
}
function printHumanReadable3(checks, _healthy, warnings, errors2, verbose) {
  console.log();
  console.log(
    pc7.bold(
      "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"
    )
  );
  console.log(
    pc7.bold("\u2551") + "              Forgewright Doctor".padEnd(62) + pc7.bold("\u2551")
  );
  console.log(
    pc7.bold(
      "\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"
    )
  );
  const allOk = errors2 === 0;
  const statusIcon = allOk ? pc7.green("\u2713") : pc7.red("\u2717");
  const statusText = allOk ? pc7.green("All checks passed") : pc7.red(`${errors2} errors, ${warnings} warnings`);
  console.log(
    pc7.bold("\u2551") + `  ${statusIcon} ${statusText}`.padEnd(62) + pc7.bold("\u2551")
  );
  console.log(
    pc7.bold(
      "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
    )
  );
  console.log();
  for (const check of checks) {
    const icon = check.status === "ok" ? pc7.green("\u2713") : check.status === "warning" ? pc7.yellow("\u26A0") : pc7.red("\u2717");
    const statusColor = check.status === "ok" ? pc7.green : check.status === "warning" ? pc7.yellow : pc7.red;
    console.log(`  ${icon} ${pc7.bold(check.name)}`);
    console.log(`    ${statusColor(check.message)}`);
    if (verbose && check.details) {
      console.log(`    ${pc7.dim(check.details)}`);
    }
  }
  console.log();
  if (warnings > 0 || errors2 > 0) {
    console.log(pc7.dim("  Run with --verbose for more details"));
    console.log(pc7.dim("  Run with --json for machine-readable output"));
  }
}
function registerValidateCommand(program) {
  program.command("validate").description("Run quality gate validation").option(
    "-l, --level <1-4>",
    "Validation level (1: build, 2: +regression, 3: +standards, 4: +traceability)",
    "4"
  ).option("--strict", "Treat warnings as failures").option("-j, --json", "Output as JSON").option("--report <path>", "Write report to file").action(
    async (options) => {
      await handleValidate(options);
    }
  );
}
async function handleValidate(options) {
  const startTime = Date.now();
  const useJson3 = options.json || !process.stdout.isTTY;
  const level = parseInt(options.level, 10);
  if (isNaN(level) || level < 1 || level > 4) {
    if (useJson3) {
      const envelope = buildEnvelope("validate.quality", null, {
        ok: false,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: { code: 2, message: "Invalid level. Use 1, 2, 3, or 4." }
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(
        pc7.red(`Error: Invalid level "${options.level}". Use 1, 2, 3, or 4.`)
      );
    }
    process.exit(2);
  }
  const result = await runValidation(level, options.strict);
  if (options.report) {
    const reportContent = useJson3 ? JSON.stringify(result, null, 2) : generateTextReport(result);
    writeFileSync(options.report, reportContent + "\n");
  }
  if (useJson3) {
    const envelope = buildEnvelope("validate.quality", result, {
      ok: result.issues.length === 0,
      duration_ms: Date.now() - startTime,
      version: VERSION,
      error: result.issues.length > 0 ? { code: 1, message: `${result.issues.length} issues found` } : void 0
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printHumanReadable4(result);
  }
  const exitCode = result.issues.length > 0 ? 1 : 0;
  process.exit(exitCode);
}
async function runValidation(level, strict) {
  const checks = [];
  const issues = [];
  const warnings = [];
  let totalScore = 0;
  let maxScore = 0;
  if (level >= 1) {
    const buildChecks = await runBuildChecks();
    checks.push(...buildChecks.checks);
    issues.push(...buildChecks.issues);
    warnings.push(...buildChecks.warnings);
    totalScore += buildChecks.score;
    maxScore += buildChecks.maxScore;
  }
  if (level >= 2) {
    const regressionChecks = await runRegressionChecks();
    checks.push(...regressionChecks.checks);
    issues.push(...regressionChecks.issues);
    warnings.push(...regressionChecks.warnings);
    totalScore += regressionChecks.score;
    maxScore += regressionChecks.maxScore;
  }
  if (level >= 3) {
    const standardsChecks = await runStandardsChecks();
    checks.push(...standardsChecks.checks);
    issues.push(...standardsChecks.issues);
    warnings.push(...standardsChecks.warnings);
    totalScore += standardsChecks.score;
    maxScore += standardsChecks.maxScore;
  }
  if (level >= 4) {
    const traceabilityChecks = await runTraceabilityChecks();
    checks.push(...traceabilityChecks.checks);
    issues.push(...traceabilityChecks.issues);
    warnings.push(...traceabilityChecks.warnings);
    totalScore += traceabilityChecks.score;
    maxScore += traceabilityChecks.maxScore;
  }
  if (strict && warnings.length > 0) {
    issues.push(...warnings.map((warning) => `Strict warning: ${warning}`));
  }
  const percentage = maxScore > 0 ? totalScore / maxScore * 100 : 0;
  let grade = "F";
  if (percentage >= 90) grade = "A";
  else if (percentage >= 80) grade = "B";
  else if (percentage >= 70) grade = "C";
  else if (percentage >= 60) grade = "D";
  return {
    level,
    score: totalScore,
    maxScore,
    grade,
    checks,
    issues,
    warnings
  };
}
async function runBuildChecks() {
  const checks = [];
  const issues = [];
  const warnings = [];
  let score = 0;
  const maxScore = 25;
  if (existsSync("package.json")) {
    const packageJson = readPackageJson();
    const scripts = packageJson?.scripts ?? {};
    checks.push({
      name: "Build Tool",
      status: "pass",
      score: 0,
      maxScore: 0,
      message: "package.json found"
    });
    try {
      execSync("npm run build --silent 2>/dev/null", {
        stdio: "pipe",
        timeout: 6e4
      });
      checks.push({
        name: "Build Success",
        status: "pass",
        score: 15,
        maxScore: 15,
        message: "Build completed successfully"
      });
      score += 15;
    } catch {
      checks.push({
        name: "Build Success",
        status: "fail",
        score: 0,
        maxScore: 15,
        message: "Build failed"
      });
      issues.push("Build failed");
    }
    const typecheckCommand = typeof scripts.typecheck === "string" ? "npm run typecheck --silent" : null;
    if (!typecheckCommand) {
      checks.push({
        name: "TypeScript Check",
        status: "skip",
        score: 10,
        maxScore: 10,
        message: "No typecheck script or tsconfig.json; skipped"
      });
      score += 10;
    } else {
      try {
        execSync(`${typecheckCommand} 2>/dev/null`, {
          stdio: "pipe",
          timeout: 6e4
        });
        checks.push({
          name: "TypeScript Check",
          status: "pass",
          score: 10,
          maxScore: 10,
          message: "TypeScript compilation passed"
        });
        score += 10;
      } catch {
        checks.push({
          name: "TypeScript Check",
          status: "fail",
          score: 0,
          maxScore: 10,
          message: "TypeScript compilation errors"
        });
        issues.push("TypeScript compilation failed");
      }
    }
  } else {
    checks.push({
      name: "Build Tool",
      status: "skip",
      score: 0,
      maxScore: 0,
      message: "No package.json found"
    });
  }
  return { checks, issues, warnings, score, maxScore };
}
function readPackageJson() {
  try {
    return JSON.parse(readFileSync("package.json", "utf-8"));
  } catch {
    return null;
  }
}
async function runRegressionChecks() {
  const checks = [];
  const issues = [];
  const warnings = [];
  let score = 0;
  const maxScore = 25;
  if (existsSync(".git")) {
    checks.push({
      name: "Git Repository",
      status: "pass",
      score: 0,
      maxScore: 0,
      message: "Git repository detected"
    });
    if (existsSync("package.json")) {
      try {
        execSync("npm test --silent 2>/dev/null", {
          stdio: "pipe",
          timeout: 12e4
        });
        checks.push({
          name: "Test Suite",
          status: "pass",
          score: 25,
          maxScore: 25,
          message: "All tests passed"
        });
        score += 25;
      } catch {
        checks.push({
          name: "Test Suite",
          status: "fail",
          score: 0,
          maxScore: 25,
          message: "Test suite has failures"
        });
        issues.push("Test suite failed");
      }
    } else {
      checks.push({
        name: "Test Suite",
        status: "skip",
        score: 25,
        maxScore: 25,
        message: "No test suite configured"
      });
      score += 25;
    }
  } else {
    checks.push({
      name: "Git Repository",
      status: "skip",
      score: 25,
      maxScore: 25,
      message: "Not a git repository"
    });
    score += 25;
  }
  return { checks, issues, warnings, score, maxScore };
}
async function runStandardsChecks() {
  const checks = [];
  const issues = [];
  const warnings = [];
  let score = 30;
  const maxScore = 30;
  try {
    const todoOutput = execSync(
      'git grep -nE "TODO|FIXME|HACK|XXX" -- "*.ts" "*.js" "*.tsx" "*.jsx" ":(exclude)node_modules/**" ":(exclude)dist/**" ":(exclude)build/**" ":(exclude)tests/**" ":(exclude)**/*.test.*" ":(exclude)**/*.spec.*" ":(exclude)scripts/comment-checker/**" ":(exclude)src/cli/src/commands/validate.ts" 2>/dev/null | head -5 || true',
      { encoding: "utf-8", timeout: 1e4 }
    );
    if (todoOutput.trim()) {
      const count = todoOutput.trim().split("\n").length;
      checks.push({
        name: "Code Quality",
        status: "warning",
        score: 0,
        maxScore: 10,
        message: `Found ${count} TODOs/FIXMEs`
      });
      warnings.push(`${count} TODOs/FIXMEs found`);
      score -= 10;
    } else {
      checks.push({
        name: "Code Quality",
        status: "pass",
        score: 10,
        maxScore: 10,
        message: "No TODOs/FIXMEs found"
      });
    }
  } catch {
    checks.push({
      name: "Code Quality",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "No TODOs/FIXMEs found"
    });
  }
  try {
    const secretOutput = execSync(
      'grep -rnE "(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|password[[:space:]]*[:=])" --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build 2>/dev/null | grep -v ".env" | grep -v ".test." | grep -v ".spec." | head -5 || true',
      { encoding: "utf-8", timeout: 1e4 }
    );
    if (secretOutput.trim()) {
      const count = secretOutput.trim().split("\n").length;
      checks.push({
        name: "Secret Detection",
        status: "fail",
        score: 0,
        maxScore: 10,
        message: `Found ${count} potential hardcoded secrets`
      });
      issues.push(`${count} potential secrets detected`);
      score -= 10;
    } else {
      checks.push({
        name: "Secret Detection",
        status: "pass",
        score: 10,
        maxScore: 10,
        message: "No hardcoded secrets detected"
      });
    }
  } catch {
    checks.push({
      name: "Secret Detection",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "No hardcoded secrets detected"
    });
  }
  const conventionFile = [
    ".forgewright/code-conventions.md",
    "skills/_shared/protocols/pipeline-activation.md",
    "AGENTS.md"
  ].find((file) => existsSync(file));
  if (conventionFile) {
    checks.push({
      name: "Code Conventions",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: `Code conventions defined in ${conventionFile}`
    });
  } else {
    checks.push({
      name: "Code Conventions",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No code conventions file"
    });
    warnings.push("No .forgewright/code-conventions.md");
    score -= 5;
  }
  if (existsSync("README.md")) {
    checks.push({
      name: "Documentation",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: "README.md found"
    });
  } else {
    checks.push({
      name: "Documentation",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No README.md"
    });
    warnings.push("No README.md");
    score -= 5;
  }
  return { checks, issues, warnings, score, maxScore };
}
async function runTraceabilityChecks() {
  const checks = [];
  const issues = [];
  const warnings = [];
  let score = 0;
  const maxScore = 25;
  if (existsSync(".forgewright/product-manager/BRD")) {
    checks.push({
      name: "Requirement Mapping",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "BRD directory found"
    });
  } else {
    checks.push({
      name: "Requirement Mapping",
      status: "skip",
      score: 10,
      maxScore: 10,
      message: "No BRD directory; requirement mapping treated as not applicable"
    });
  }
  score += 10;
  try {
    const testFiles = execSync(
      'find . \\( -name "*.test.*" -o -name "*.spec.*" -o -name "test_*" \\) -not -path "./node_modules/*" -not -path "./dist/*" | head -5',
      { encoding: "utf-8", timeout: 1e4 }
    ).trim().split("\n").filter(Boolean);
    if (testFiles.length > 0) {
      checks.push({
        name: "Test Traceability",
        status: "pass",
        score: 5,
        maxScore: 5,
        message: `Found ${testFiles.length} test file(s)`
      });
      score += 5;
    } else {
      checks.push({
        name: "Test Traceability",
        status: "warning",
        score: 0,
        maxScore: 5,
        message: "No test files found"
      });
      warnings.push("No test files found");
    }
  } catch {
    checks.push({
      name: "Test Traceability",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "Could not inspect test files"
    });
    warnings.push("Could not inspect test files");
  }
  if (existsSync(".forgewright")) {
    checks.push({
      name: "Workspace Artifacts",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: ".forgewright workspace exists"
    });
    score += 5;
  } else {
    checks.push({
      name: "Workspace Artifacts",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No .forgewright workspace artifacts found"
    });
    warnings.push("No .forgewright workspace artifacts found");
  }
  if (existsSync("scripts/pipeline-preflight.sh")) {
    try {
      execSync("bash scripts/pipeline-preflight.sh --max-state-age-minutes 240 --json-only", {
        stdio: "pipe",
        timeout: 15e3
      });
      checks.push({
        name: "Pipeline Activation",
        status: "pass",
        score: 5,
        maxScore: 5,
        message: "Pipeline activation controls pass"
      });
      score += 5;
    } catch {
      checks.push({
        name: "Pipeline Activation",
        status: "warning",
        score: 0,
        maxScore: 5,
        message: "Pipeline activation preflight failed"
      });
      warnings.push("Pipeline activation preflight failed");
    }
  } else {
    checks.push({
      name: "Pipeline Activation",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No pipeline preflight script"
    });
    warnings.push("No scripts/pipeline-preflight.sh");
  }
  return { checks, issues, warnings, score, maxScore };
}
function generateTextReport(result) {
  const lines = [];
  lines.push("=== Forgewright Quality Gate Report ===");
  lines.push(`Level: ${result.level}`);
  lines.push(`Score: ${result.score}/${result.maxScore} (${result.grade})`);
  lines.push("");
  for (const check of result.checks) {
    const icon = check.status === "pass" ? "\u2713" : check.status === "fail" ? "\u2717" : "\u25CB";
    lines.push(`${icon} ${check.name}: ${check.message}`);
  }
  if (result.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");
    for (const issue of result.issues) {
      lines.push(`  - ${issue}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  return lines.join("\n");
}
function printHumanReadable4(result) {
  const percentage = result.maxScore > 0 ? Math.round(result.score / result.maxScore * 100) : 0;
  console.log();
  console.log(
    pc7.bold(
      "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"
    )
  );
  console.log(
    pc7.bold("\u2551") + "          Quality Gate Validation".padEnd(62) + pc7.bold("\u2551")
  );
  console.log(
    pc7.bold(
      "\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"
    )
  );
  const gradeColor = result.grade === "A" ? pc7.green : result.grade === "B" ? pc7.cyan : result.grade === "C" ? pc7.yellow : pc7.red;
  console.log(
    pc7.bold("\u2551") + `  Level ${result.level} | ${result.score}/${result.maxScore} (${gradeColor(result.grade)}) | ${percentage}%`.padEnd(
      62
    ) + pc7.bold("\u2551")
  );
  console.log(
    pc7.bold(
      "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
    )
  );
  console.log();
  if (result.issues.length === 0 && result.warnings.length === 0) {
    console.log(pc7.green("  \u2713 All checks passed"));
  } else {
    if (result.issues.length > 0) {
      console.log(pc7.red(`  \u2717 ${result.issues.length} issue(s)`));
    }
    if (result.warnings.length > 0) {
      console.log(pc7.yellow(`  \u26A0 ${result.warnings.length} warning(s)`));
    }
  }
  console.log();
  console.log(pc7.bold("  Checks:"));
  console.log(pc7.gray("  " + "\u2500".repeat(50)));
  for (const check of result.checks) {
    const icon = check.status === "pass" ? pc7.green("\u2713") : check.status === "fail" ? pc7.red("\u2717") : pc7.gray("\u25CB");
    const statusColor = check.status === "pass" ? pc7.green : check.status === "fail" ? pc7.red : check.status === "warning" ? pc7.yellow : pc7.gray;
    console.log(
      `    ${icon} ${check.name.padEnd(20)} ${statusColor(check.message)}`
    );
  }
  console.log();
  if (result.issues.length > 0) {
    console.log(pc7.dim("  Run with --json for machine-readable output"));
  }
}
var completionsDir = join(process.cwd(), "completions");
function registerCompletionCommand(program) {
  program.command("completion").description("Generate shell completion scripts").argument("<shell>", "Shell type (bash|zsh|fish)").action(async (shell) => {
    await handleCompletion(shell);
  });
}
async function handleCompletion(shell) {
  const shells = {
    bash: "forge.bash",
    zsh: "forge.zsh",
    fish: "forge.fish"
  };
  const filename = shells[shell.toLowerCase()];
  if (!filename) {
    console.error(
      `Error: Unknown shell "${shell}". Supported: bash, zsh, fish`
    );
    process.exit(2);
  }
  const completionPath = join(completionsDir, filename);
  try {
    const content = readFileSync(completionPath, "utf-8");
    console.log(content);
    process.exit(0);
  } catch (error2) {
    console.error(`Error: Failed to load completion script for ${shell}`);
    process.exit(1);
  }
}

// src/utils/coordinate-converter.ts
var ENGINE_SPECS = {
  unity: {
    handedness: "left",
    forwardAxis: "z",
    forwardSign: -1,
    unitScale: 1
    // 1 unit = 1 meter
  },
  godot: {
    handedness: "right",
    forwardAxis: "z",
    forwardSign: 1,
    unitScale: 1
    // 1 unit = 1 meter
  },
  unreal: {
    handedness: "left",
    forwardAxis: "z",
    forwardSign: 1,
    unitScale: 0.01
    // 1 unit = 1 cm = 0.01 meters
  },
  blender: {
    handedness: "right",
    forwardAxis: "y",
    // or z in newer versions
    forwardSign: -1,
    unitScale: 1
    // 1 unit = 1 meter
  }
};
function convertPosition(pos, from, to) {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];
  let result = { ...pos };
  if (fromSpec.handedness !== toSpec.handedness) {
    result = flipHandedness(result);
  }
  const scaleFactor = toSpec.unitScale / fromSpec.unitScale;
  if (scaleFactor !== 1) {
    result = {
      x: result.x * scaleFactor,
      y: result.y * scaleFactor,
      z: result.z * scaleFactor
    };
  }
  return result;
}
function flipHandedness(pos) {
  return {
    x: pos.x,
    y: pos.y,
    z: -pos.z
  };
}
function convertRotation(euler, from, to) {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];
  let result = { ...euler };
  if (fromSpec.handedness !== toSpec.handedness) {
    result = {
      x: result.x,
      y: -result.y,
      z: -result.z
    };
  }
  return result;
}
function convertScale(scale, from, to) {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];
  const scaleFactor = fromSpec.unitScale / toSpec.unitScale;
  return {
    x: scale.x * scaleFactor,
    y: scale.y * scaleFactor,
    z: scale.z * scaleFactor
  };
}
function distanceFromOrigin(pos) {
  return Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
}
function getPrecisionWarning(pos) {
  const distance = distanceFromOrigin(pos);
  if (distance > 1e4) {
    return `CRITICAL: Position is ${distance.toFixed(0)} units from origin. Floating point precision may cause jittering, snapping, or teleportation. Consider using Floating Origin pattern.`;
  } else if (distance > 5e3) {
    return `WARNING: Position is ${distance.toFixed(0)} units from origin. Precision may decrease. Consider implementing Floating Origin.`;
  } else if (distance > 1e3) {
    return `INFO: Position is ${distance.toFixed(0)} units from origin. Still safe but monitor for precision issues.`;
  }
  return "";
}
function validateTransform(transform, _engine) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    info: []
  };
  const coords = [transform.position, transform.rotation, transform.scale];
  for (const coord of coords) {
    if (isNaN(coord.x) || isNaN(coord.y) || isNaN(coord.z)) {
      result.errors.push("Transform contains NaN values");
      result.valid = false;
    }
    if (!isFinite(coord.x) || !isFinite(coord.y) || !isFinite(coord.z)) {
      result.errors.push("Transform contains infinite values");
      result.valid = false;
    }
  }
  if (transform.scale.x <= 0 || transform.scale.y <= 0 || transform.scale.z <= 0) {
    result.warnings.push(
      "Scale has zero or negative values. This may cause rendering issues."
    );
  }
  const precisionWarning = getPrecisionWarning(transform.position);
  if (precisionWarning.includes("CRITICAL")) {
    result.errors.push(precisionWarning);
    result.valid = false;
  } else if (precisionWarning.includes("WARNING")) {
    result.warnings.push(precisionWarning);
  } else if (precisionWarning) {
    result.info.push(precisionWarning);
  }
  for (const angle of [
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z
  ]) {
    if (Math.abs(angle) > 36e3) {
      result.warnings.push(
        `Rotation angle ${angle}\xB0 is extremely large. Consider normalizing.`
      );
    }
  }
  return result;
}
function parsePosition(str) {
  const parts = str.split(/[,\s]+/).map((p) => parseFloat(p.trim()));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }
  return { x: parts[0], y: parts[1], z: parts[2] };
}
function formatPosition(pos, precision = 3) {
  return `${pos.x.toFixed(precision)}, ${pos.y.toFixed(precision)}, ${pos.z.toFixed(precision)}`;
}
function formatRotation(euler, precision = 2) {
  return `${euler.x.toFixed(precision)}\xB0, ${euler.y.toFixed(precision)}\xB0, ${euler.z.toFixed(precision)}\xB0`;
}
function formatScale(scale, precision = 3) {
  return `${scale.x.toFixed(precision)}, ${scale.y.toFixed(precision)}, ${scale.z.toFixed(precision)}`;
}

// src/commands/coords.ts
function registerCoordsCommand(program) {
  const coords = program.command("coords").description("Coordinate system conversion and validation tools");
  coords.command("convert").description("Convert coordinates between game engines").argument("<position>", 'Position in format "x,y,z"').option("-f, --from <engine>", "Source engine", "unity").option("-t, --to <engine>", "Target engine", "godot").option(
    "-r, --rotation <rot>",
    'Rotation in format "x,y,z" (Euler degrees)'
  ).option("-s, --scale <scale>", 'Scale in format "x,y,z"', "1,1,1").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show conversion details").action(async (position, options) => {
    await handleConvert(position, options);
  });
  coords.command("validate").description("Validate coordinate bounds and precision").argument("<position>", 'Position in format "x,y,z"').option("-e, --engine <engine>", "Engine type", "unity").option("-r, --rotation <rot>", 'Rotation in format "x,y,z"').option("-s, --scale <scale>", 'Scale in format "x,y,z"', "1,1,1").option("-j, --json", "Output as JSON").option(
    "-w, --warn-threshold <n>",
    "Warning threshold for distance from origin",
    "5000"
  ).action(async (position, options) => {
    await handleValidate2(position, options);
  });
  coords.command("engines").description("List supported game engines and their coordinate systems").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleEngines(options);
  });
  coords.command("ref").description("Show quick reference for coordinate conversions").action(async () => {
    await handleRef();
  });
  coords.command("batch").description("Batch convert coordinates from CSV").argument("[file]", "Input CSV file (stdin if not specified)").option("-f, --from <engine>", "Source engine", "unity").option("-t, --to <engine>", "Target engine", "godot").option(
    "-c, --columns <cols>",
    "Column indices for x,y,z (1-based)",
    "1,2,3"
  ).option("-o, --output <file>", "Output file (stdout if not specified)").option("-j, --json", "Output as JSON lines").action(async (file, options) => {
    await handleBatch(file, options);
  });
}
var VALID_ENGINES = ["unity", "godot", "unreal", "blender"];
function isValidEngine(name) {
  return VALID_ENGINES.includes(name);
}
async function handleConvert(position, options) {
  const fromEngine = options.from.toLowerCase();
  const toEngine = options.to.toLowerCase();
  if (!isValidEngine(fromEngine)) {
    console.error(pc7.red(`Invalid source engine: ${options.from}`));
    console.error(pc7.dim(`Valid engines: ${VALID_ENGINES.join(", ")}`));
    process.exit(1);
  }
  if (!isValidEngine(toEngine)) {
    console.error(pc7.red(`Invalid target engine: ${options.to}`));
    console.error(pc7.dim(`Valid engines: ${VALID_ENGINES.join(", ")}`));
    process.exit(1);
  }
  const pos = parsePosition(position);
  if (!pos) {
    console.error(pc7.red(`Invalid position format: ${position}`));
    console.error(pc7.dim('Expected format: "x,y,z" (e.g., "1.5, 2.0, -3.5")'));
    process.exit(1);
  }
  let rotation = null;
  if (options.rotation) {
    rotation = parsePosition(options.rotation);
    if (!rotation) {
      console.error(pc7.red(`Invalid rotation format: ${options.rotation}`));
      process.exit(1);
    }
  }
  let scale = parsePosition(options.scale);
  if (!scale) {
    console.error(pc7.red(`Invalid scale format: ${options.scale}`));
    process.exit(1);
  }
  const from = fromEngine;
  const to = toEngine;
  const convertedPos = convertPosition(pos, from, to);
  const convertedScale = convertScale(scale, from, to);
  let convertedRot = null;
  if (rotation) {
    convertedRot = convertRotation(rotation, from, to);
  }
  const precisionWarning = getPrecisionWarning(convertedPos);
  if (options.json) {
    const envelope = buildEnvelope(
      "coords.convert",
      {
        source: { engine: from, position: pos, rotation, scale },
        target: {
          engine: to,
          position: convertedPos,
          rotation: convertedRot,
          scale: convertedScale
        },
        precisionWarning: precisionWarning || void 0
      },
      {
        ok: true,
        duration_ms: 0,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold("  Coordinate Conversion"));
    console.log(pc7.gray("  " + "\u2500".repeat(50)));
    console.log();
    console.log(pc7.dim(`  ${from.toUpperCase()} \u2192 ${to.toUpperCase()}`));
    console.log();
    console.log(pc7.cyan("  Position:"));
    console.log(`    ${pc7.dim("From:")} ${formatPosition(pos)}`);
    console.log(
      `    ${pc7.dim("To:  ")} ${pc7.green(formatPosition(convertedPos))}`
    );
    if (rotation && convertedRot) {
      console.log();
      console.log(pc7.cyan("  Rotation:"));
      console.log(`    ${pc7.dim("From:")} ${formatRotation(rotation)}`);
      console.log(
        `    ${pc7.dim("To:  ")} ${pc7.green(formatRotation(convertedRot))}`
      );
    }
    console.log();
    console.log(pc7.cyan("  Scale:"));
    console.log(`    ${pc7.dim("From:")} ${formatScale(scale)}`);
    console.log(
      `    ${pc7.dim("To:  ")} ${pc7.green(formatScale(convertedScale))}`
    );
    if (options.verbose) {
      console.log();
      console.log(pc7.cyan("  Engine Specs:"));
      const fromSpec = ENGINE_SPECS[from];
      const toSpec = ENGINE_SPECS[to];
      console.log(
        `    ${from}: ${fromSpec.handedness}-handed, ${fromSpec.forwardSign === 1 ? "+" : "-"}${fromSpec.forwardAxis} forward, ${1 / fromSpec.unitScale}:1 ratio`
      );
      console.log(
        `    ${to}: ${toSpec.handedness}-handed, ${toSpec.forwardSign === 1 ? "+" : "-"}${toSpec.forwardAxis} forward, ${1 / toSpec.unitScale}:1 ratio`
      );
    }
    if (precisionWarning) {
      console.log();
      if (precisionWarning.includes("CRITICAL")) {
        console.log(pc7.red(`  \u26A0 ${precisionWarning}`));
      } else if (precisionWarning.includes("WARNING")) {
        console.log(pc7.yellow(`  \u26A0 ${precisionWarning}`));
      } else {
        console.log(pc7.dim(`  \u2139 ${precisionWarning}`));
      }
    }
    console.log();
  }
}
async function handleValidate2(position, options) {
  const engine = options.engine.toLowerCase();
  if (!isValidEngine(engine)) {
    console.error(pc7.red(`Invalid engine: ${options.engine}`));
    process.exit(1);
  }
  const pos = parsePosition(position);
  if (!pos) {
    console.error(pc7.red(`Invalid position format: ${position}`));
    process.exit(1);
  }
  let rotation = null;
  if (options.rotation) {
    rotation = parsePosition(options.rotation);
    if (!rotation) {
      console.error(pc7.red(`Invalid rotation format: ${options.rotation}`));
      process.exit(1);
    }
  }
  const scale = parsePosition(options.scale) || { x: 1, y: 1, z: 1 };
  const threshold = parseFloat(options.warnThreshold) || 5e3;
  const result = validateTransform(
    { position: pos, rotation: rotation || { x: 0, y: 0, z: 0 }, scale });
  const distance = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
  if (distance > threshold) {
    result.warnings.push(
      `Distance from origin (${distance.toFixed(0)}) exceeds threshold (${threshold})`
    );
  }
  if (options.json) {
    const envelope = buildEnvelope(
      "coords.validate",
      {
        position: pos,
        engine,
        validation: result,
        distanceFromOrigin: distance
      },
      {
        ok: result.valid,
        duration_ms: 0,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold("  Coordinate Validation"));
    console.log(pc7.gray("  " + "\u2500".repeat(50)));
    console.log();
    console.log(`  Engine: ${pc7.cyan(engine.toUpperCase())}`);
    console.log(`  Position: ${formatPosition(pos)}`);
    console.log(`  Distance from origin: ${pc7.bold(distance.toFixed(2))}`);
    console.log();
    if (result.errors.length === 0 && result.warnings.length === 0 && result.info.length === 0) {
      console.log(pc7.green("  \u2713 All checks passed"));
    } else {
      if (result.errors.length > 0) {
        console.log(pc7.red("  \u2717 Errors:"));
        for (const err of result.errors) {
          console.log(`    \u2022 ${err}`);
        }
        console.log();
      }
      if (result.warnings.length > 0) {
        console.log(pc7.yellow("  \u26A0 Warnings:"));
        for (const warn of result.warnings) {
          console.log(`    \u2022 ${warn}`);
        }
        console.log();
      }
      if (result.info.length > 0) {
        console.log(pc7.dim("  \u2139 Info:"));
        for (const info of result.info) {
          console.log(`    \u2022 ${info}`);
        }
      }
    }
    console.log();
    console.log(
      `  ${result.valid ? pc7.green("\u2713 VALID") : pc7.red("\u2717 INVALID")}`
    );
    console.log();
  }
  process.exit(result.valid ? 0 : 1);
}
async function handleEngines(options) {
  if (options.json) {
    const engineData = VALID_ENGINES.map((name) => ({
      name,
      ...ENGINE_SPECS[name],
      unitDescription: name === "unreal" ? "1 unit = 1 cm" : "1 unit = 1 meter"
    }));
    console.log(
      JSON.stringify(
        buildEnvelope("coords.engines", engineData, {
          ok: true,
          duration_ms: 0,
          version: VERSION
        }),
        null,
        2
      )
    );
  } else {
    console.log();
    console.log(pc7.bold("  Supported Game Engines"));
    console.log(pc7.gray("  " + "\u2500".repeat(50)));
    console.log();
    for (const name of VALID_ENGINES) {
      const spec = ENGINE_SPECS[name];
      const handColor = spec.handedness === "left" ? pc7.cyan : pc7.magenta;
      console.log(`  ${pc7.bold(pc7.green(name.toUpperCase()))}`);
      console.log(`    Handedness: ${handColor(spec.handedness)}-handed`);
      console.log(
        `    Forward: ${spec.forwardSign === 1 ? "+" : "-"}${spec.forwardAxis}`
      );
      console.log(
        `    Units: ${name === "unreal" ? "1 unit = 1 cm" : "1 unit = 1 meter"}`
      );
      console.log();
    }
  }
}
async function handleRef() {
  console.log();
  console.log(pc7.bold("  Quick Reference: Coordinate Conversions"));
  console.log(pc7.gray("  " + "\u2500".repeat(50)));
  console.log();
  console.log(pc7.cyan("  Position Conversion:"));
  console.log("    Unity \u2194 Godot:  Flip Z axis");
  console.log("    Unity \u2194 Unreal: Scale 100x (meters \u2194 cm)");
  console.log();
  console.log(pc7.cyan("  Rotation Conversion:"));
  console.log("    Unity \u2194 Godot:  Negate Y and Z components");
  console.log("    Unity \u2194 Unreal: Same handedness, verify axis");
  console.log();
  console.log(pc7.cyan("  Precision Thresholds:"));
  console.log("    Safe:      < 1,000 units from origin");
  console.log("    Monitor:    1,000 - 5,000 units");
  console.log("    Warning:    5,000 - 10,000 units");
  console.log("    Critical:   > 10,000 units (use Floating Origin)");
  console.log();
  console.log(pc7.cyan("  Common Commands:"));
  console.log('    forge coords convert "1,2,3" --from unity --to godot');
  console.log('    forge coords validate "10000,0,0" --engine unity');
  console.log("    forge coords engines");
  console.log();
}
async function handleBatch(file, options) {
  const startTime = Date.now();
  const from = options.from.toLowerCase();
  const to = options.to.toLowerCase();
  if (!isValidEngine(from) || !isValidEngine(to)) {
    console.error(pc7.red("Invalid engine specified"));
    process.exit(1);
  }
  const columns = options.columns.split(",").map((c) => parseInt(c, 10) - 1);
  if (columns.length !== 3 || columns.some(isNaN)) {
    console.error(pc7.red('Invalid columns format. Use: "1,2,3" (1-based)'));
    process.exit(1);
  }
  let input;
  if (file) {
    const fs = await import('fs');
    input = fs.readFileSync(file, "utf-8");
  } else {
    input = await new Promise((resolve16) => {
      let data = "";
      process.stdin.on("data", (chunk) => data += chunk);
      process.stdin.on("end", () => resolve16(data));
    });
  }
  const lines = input.trim().split("\n");
  const results = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const parts = line.split(/[,\t\s]+/);
    const x = parseFloat(parts[columns[0]]);
    const y = parseFloat(parts[columns[1]]);
    const z8 = parseFloat(parts[columns[2]]);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z8)) {
      const converted = convertPosition({ x, y, z: z8 }, from, to);
      results.push({
        input: `${x},${y},${z8}`,
        output: converted
      });
    }
  }
  if (options.json) {
    for (const r of results) {
      console.log(
        JSON.stringify(
          buildEnvelope(
            "coords.batch",
            {
              input: r.input,
              output: r.output
            },
            {
              ok: true,
              duration_ms: Date.now() - startTime,
              version: VERSION
            }
          )
        )
      );
    }
  } else {
    console.log("# Converted coordinates:", `${from} \u2192 ${to}`);
    console.log("# input_x, input_y, input_z, output_x, output_y, output_z");
    for (const r of results) {
      console.log(`${r.input}, ${r.output.x}, ${r.output.y}, ${r.output.z}`);
    }
  }
}
function registerAutonomousTestCommand(program) {
  const test2 = program.command("test").description("Run autonomous testing with auto-fix");
  test2.command("run").description("Run all test layers (unit, integration, visual, e2e)").option(
    "-l, --layer <layer>",
    "Specific layer (unit|integration|visual|e2e)"
  ).option("-j, --json", "JSON output").option("--no-fix", "Skip auto-fix").option("--verbose", "Verbose output").action(async (options) => {
    await handleTestRun(options);
  });
  test2.command("fix").description("Auto-fix test failures").option("-m, --max-attempts <n>", "Max fix attempts", "3").option("-j, --json", "JSON output").action(async (options) => {
    await handleAutoFix(options);
  });
  test2.command("autonomous").description("Run autonomous mode: test + auto-fix + continue").option("-m, --max-attempts <n>", "Max fix attempts", "3").option("-j, --json", "JSON output").option("--verbose", "Verbose output").action(async (options) => {
    await handleAutonomous(options);
  });
  test2.command("update-baseline").description("Update visual baselines").option("-j, --json", "JSON output").action(async (options) => {
    await handleUpdateBaseline(options);
  });
}
async function handleTestRun(options) {
  const layer = options.layer || "unit,integration";
  const layers = layer.split(",");
  console.log(pc7.bold("\n  Autonomous Test Runner"));
  console.log(pc7.gray("  ".repeat(50)));
  const results = {};
  for (const l of layers) {
    const layerName = l.trim();
    console.log(pc7.cyan(`
  Running ${layerName} tests...`));
    const start = Date.now();
    const result = await runTestLayer(layerName, options.verbose);
    result.duration = Date.now() - start;
    results[layerName] = result;
    if (result.passed) {
      console.log(pc7.green(`    \u2713 ${result.passedCount} passed`));
    } else {
      console.log(
        pc7.red(
          `    \u2717 ${result.failedCount} failed, ${result.passedCount} passed`
        )
      );
      if (options.fix && result.errors.length > 0) {
        console.log(pc7.yellow(`    \u2192 Attempting auto-fix...`));
        const fixResult = await attemptAutoFix(result.errors);
        if (fixResult.success) {
          console.log(pc7.green(`    \u2713 Auto-fix successful`));
          const reResult = await runTestLayer(layerName, options.verbose);
          if (reResult.passed) {
            console.log(pc7.green(`    \u2713 All tests pass after fix`));
          }
        } else {
          console.log(pc7.red(`    \u2717 Auto-fix failed: ${fixResult.error}`));
        }
      }
    }
  }
  const totalFailed = Object.values(results).reduce(
    (sum, r) => sum + r.failedCount,
    0
  );
  const totalPassed = Object.values(results).reduce(
    (sum, r) => sum + r.passedCount,
    0
  );
  console.log(pc7.bold("\n  Summary"));
  console.log(pc7.gray("  ".repeat(50)));
  console.log(`    Total: ${totalPassed} passed, ${totalFailed} failed`);
  if (options.json) {
    console.log(
      JSON.stringify(
        buildEnvelope(
          "test.run",
          { results },
          {
            ok: totalFailed === 0,
            duration_ms: Object.values(results).reduce(
              (sum, r) => sum + r.duration,
              0
            ),
            version: VERSION
          }
        ),
        null,
        2
      )
    );
  }
  process.exit(totalFailed === 0 ? 0 : 1);
}
async function handleAutoFix(options) {
  console.log(pc7.bold("\n  Auto-Fix Mode"));
  console.log(pc7.gray("  ".repeat(50)));
  console.log(pc7.cyan("\n  Running tests to detect failures..."));
  const result = await runTestLayer("unit");
  if (result.passed) {
    console.log(pc7.green("\n  \u2713 All tests pass, nothing to fix!"));
    process.exit(0);
  }
  console.log(pc7.yellow(`
  ${result.failedCount} failures detected`));
  const fixResult = await attemptAutoFix(
    result.errors,
    parseInt(options.maxAttempts, 10)
  );
  if (fixResult.success && fixResult.fixed) {
    console.log(
      pc7.green(
        `
  \u2713 Auto-fix successful after ${fixResult.attempts} attempt(s)`
      )
    );
    console.log(pc7.cyan("\n  Verifying fix..."));
    const reResult = await runTestLayer("unit");
    if (reResult.passed) {
      console.log(pc7.green("  \u2713 All tests pass!"));
      process.exit(0);
    } else {
      console.log(
        pc7.red(
          `  \u2717 Still ${reResult.failedCount} failures - manual intervention needed`
        )
      );
      process.exit(2);
    }
  } else {
    console.log(pc7.red(`
  \u2717 Auto-fix failed: ${fixResult.error}`));
    console.log(pc7.yellow("\n  Recommendations:"));
    for (const err of result.errors) {
      console.log(`    - ${err.name}: ${err.message}`);
    }
    process.exit(2);
  }
}
async function handleAutonomous(options) {
  console.log(pc7.bold("\n  \u{1F916} Autonomous Mode"));
  console.log(pc7.gray("  ".repeat(50)));
  console.log(pc7.dim("  Max fix attempts: " + options.maxAttempts));
  const maxAttempts = parseInt(options.maxAttempts, 10);
  let attempt = 0;
  let allPassed = false;
  while (attempt < maxAttempts && !allPassed) {
    attempt++;
    console.log(pc7.cyan(`
  Attempt ${attempt}/${maxAttempts}`));
    console.log(pc7.dim("  Running tests..."));
    const result = await runTestLayer("unit,integration", options.verbose);
    if (result.passed) {
      allPassed = true;
      break;
    }
    if (attempt < maxAttempts) {
      console.log(
        pc7.yellow(`  ${result.failedCount} failures - attempting fix...`)
      );
      const fixResult = await attemptAutoFix(result.errors);
      if (!fixResult.success) {
        console.log(pc7.red(`  \u2717 Fix attempt failed: ${fixResult.error}`));
        break;
      }
      console.log(pc7.green(`  \u2713 Fix applied`));
    }
  }
  if (allPassed) {
    console.log(pc7.green("\n  \u2713\u2713\u2713 All tests pass! \u2713\u2713\u2713"));
    console.log(pc7.green(`  Completed in ${attempt} attempt(s)`));
    process.exit(0);
  } else {
    console.log(pc7.red("\n  \u2717\u2717\u2717 Autonomous fix failed \u2717\u2717\u2717"));
    console.log(pc7.yellow("\n  Human intervention required"));
    process.exit(2);
  }
}
async function handleUpdateBaseline(options) {
  const startTime = Date.now();
  console.log(pc7.bold("\n  Updating Visual Baselines"));
  console.log(pc7.gray("  ".repeat(50)));
  try {
    execSync("playwright test --update-snapshots", { stdio: "inherit" });
    console.log(pc7.green("\n  \u2713 Visual baselines updated"));
    if (options.json) {
      console.log(
        JSON.stringify(
          buildEnvelope(
            "test.updateBaseline",
            { success: true },
            {
              ok: true,
              duration_ms: Date.now() - startTime,
              version: VERSION
            }
          ),
          null,
          2
        )
      );
    }
  } catch (err) {
    console.log(pc7.red("\n  \u2717 Failed to update baselines"));
    process.exit(1);
  }
}
async function runTestLayer(layer, _verbose) {
  const result = {
    passed: true,
    duration: 0,
    passedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: []
  };
  try {
    const start = Date.now();
    let command = "";
    switch (layer.trim()) {
      case "unit":
        command = "vitest run --reporter=json";
        break;
      case "integration":
        command = "vitest run --testPathPattern=integration --reporter=json";
        break;
      case "visual":
        command = "playwright test --project=visual --reporter=json";
        break;
      case "e2e":
        command = "playwright test --project=chromium --reporter=json";
        break;
      default:
        command = "vitest run --reporter=json";
    }
    const output2 = execSync(command, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024
    });
    const jsonMatch = output2.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      result.passedCount = data.summary?.passed || 0;
      result.failedCount = data.summary?.failed || 0;
      result.skippedCount = data.summary?.skipped || 0;
    } else {
      const passed = (output2.match(/✓/g) || []).length;
      const failed = (output2.match(/✗|×|FAIL/g) || []).length;
      result.passedCount = passed;
      result.failedCount = failed;
    }
    result.passed = result.failedCount === 0;
    result.duration = Date.now() - start;
  } catch (err) {
    result.passed = false;
    result.duration = Date.now() - Date.now();
    const errorOutput = err.stdout || err.message || "";
    const failureMatches = errorOutput.matchAll(
      /FAIL\s+([^\n]+)[\s\S]*?([\u4e00-\u9fff\w\s]+(?:Error|Exception)[\s\S]*?)(?=\n\s*\n|\n\n|$)/g
    );
    for (const match2 of failureMatches) {
      result.errors.push({
        name: match2[1] || "Unknown Test",
        message: match2[2]?.split("\n")[0] || "Unknown error",
        type: classifyError(match2[2] || "")
      });
    }
    result.failedCount = result.errors.length || 1;
    result.passedCount = 0;
  }
  return result;
}
function classifyError(errorMessage) {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("syntaxerror") || msg.includes("unexpected token")) {
    return "syntax";
  }
  if (msg.includes("typeerror") || msg.includes("typescript") || msg.includes("'undefined'")) {
    return "type";
  }
  if (msg.includes("expect") || msg.includes("tobe") || msg.includes("toequal")) {
    return "logic";
  }
  if (msg.includes("screenshot") || msg.includes("visual") || msg.includes("diff")) {
    return "ui";
  }
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("click")) {
    return "e2e";
  }
  return "unknown";
}
async function attemptAutoFix(errors2, _maxAttempts) {
  const result = {
    success: false,
    fixed: false,
    attempts: 0,
    changes: []
  };
  const syntaxErrors = errors2.filter((e) => e.type === "syntax");
  const typeErrors = errors2.filter((e) => e.type === "type");
  const logicErrors = errors2.filter((e) => e.type === "logic");
  if (syntaxErrors.length > 0) {
    console.log(
      pc7.yellow(
        `    Attempting to fix ${syntaxErrors.length} syntax error(s)...`
      )
    );
    for (const err of syntaxErrors) {
      const fix = await fixSyntaxError(err);
      if (fix) {
        result.changes.push(fix);
      }
    }
  }
  if (typeErrors.length > 0) {
    console.log(
      pc7.yellow(`    Attempting to fix ${typeErrors.length} type error(s)...`)
    );
    for (const err of typeErrors) {
      const fix = await fixTypeError(err);
      if (fix) {
        result.changes.push(fix);
      }
    }
  }
  if (logicErrors.length > 0) {
    console.log(
      pc7.yellow(
        `    Attempting to fix ${logicErrors.length} logic error(s)...`
      )
    );
    result.error = "Logic errors detected - requires human review";
    result.success = true;
    return result;
  }
  result.success = true;
  result.fixed = result.changes.length === errors2.length;
  if (!result.fixed) {
    result.error = "Could not auto-fix all errors";
  }
  return result;
}
async function fixSyntaxError(error2) {
  console.log(pc7.dim(`      Analyzing: ${error2.name}`));
  return null;
}
async function fixTypeError(error2) {
  console.log(pc7.dim(`      Analyzing: ${error2.name}`));
  return null;
}
function findProjectRoot(startDir = process.cwd()) {
  const explicitRoot = process.env.FORGEWRIGHT_WORKSPACE || process.env.AGENTS_WORKSPACE;
  if (explicitRoot) {
    return resolve(explicitRoot);
  }
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, ".forgewright")) || existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      return resolve(startDir);
    }
    current = parent;
  }
}
function getProjectName(projectRoot) {
  return basename(projectRoot);
}
function getProductionConfigPath(projectRoot) {
  return join(projectRoot, ".production-grade.yaml");
}
function readProductionConfig(projectRoot) {
  const configPath = getProductionConfigPath(projectRoot);
  if (!existsSync(configPath)) {
    return "";
  }
  return readFileSync(configPath, "utf-8");
}
function writeProductionConfig(projectRoot, content) {
  const configPath = getProductionConfigPath(projectRoot);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    content.endsWith("\n") ? content : `${content}
`,
    "utf-8"
  );
}
function readTopLevelBlock(content, key) {
  const pattern = new RegExp(
    `^${escapeRegExp(key)}:\\n(?:[ \\t].*\\n|\\n)*`,
    "m"
  );
  const match2 = content.match(pattern);
  return match2 ? match2[0] : null;
}
function upsertTopLevelBlock(content, key, block2) {
  const normalizedBlock = `${block2.trimEnd()}
`;
  const pattern = new RegExp(
    `^${escapeRegExp(key)}:\\n(?:[ \\t].*\\n|\\n)*`,
    "m"
  );
  if (pattern.test(content)) {
    return content.replace(pattern, normalizedBlock);
  }
  if (!content.trim()) {
    return normalizedBlock;
  }
  return `${content.trimEnd()}

${normalizedBlock}`;
}
function getScalar(block2, key) {
  if (!block2) {
    return null;
  }
  const pattern = new RegExp(`^[ \\t]*${escapeRegExp(key)}:[ \\t]*(.+)$`, "m");
  const match2 = block2.match(pattern);
  if (!match2) {
    return null;
  }
  return match2[1].trim().replace(/^["']|["']$/g, "");
}
function parseBoolean(value, defaultValue) {
  if (value === null) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}
function parseNullableString(value) {
  if (value === null || value.toLowerCase() === "null") {
    return null;
  }
  return value;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function checkCli(name) {
  const result = spawnSync(name, ["--version"], {
    encoding: "utf-8",
    shell: process.platform === "win32",
    timeout: 5e3
  });
  if (result.error) {
    return {
      name,
      available: false,
      error: result.error.message
    };
  }
  const output2 = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status === 0) {
    return {
      name,
      available: true,
      version: output2 || "available"
    };
  }
  return {
    name,
    available: false,
    error: output2 || `Exited with status ${result.status}`
  };
}
function checkSupportedClis() {
  return [checkCli("claude"), checkCli("codex")];
}
var DEFAULT_TOKEN_BUDGET = {
  daily: 5,
  weekly: 25,
  monthly: 80
};
function getDefaultUsageDir(projectRoot) {
  return join(homedir(), ".forgewright", "usage", getProjectName(projectRoot));
}
function getBudgetPath(projectRoot) {
  return join(projectRoot, ".forgewright", "budget.yaml");
}
function setTokenTrackingEnabled(projectRoot, enabled) {
  const content = readProductionConfig(projectRoot);
  const block2 = buildTokenTrackingBlock(enabled);
  writeProductionConfig(
    projectRoot,
    upsertTopLevelBlock(content, "token_tracking", block2)
  );
  mkdirSync(getDefaultUsageDir(projectRoot), { recursive: true });
  ensureBudgetFile(projectRoot);
}
function getTokenTrackingEnabled(projectRoot) {
  const block2 = readTopLevelBlock(
    readProductionConfig(projectRoot),
    "token_tracking"
  );
  if (!block2) {
    return true;
  }
  if (/enabled:\s*false/i.test(block2)) {
    return false;
  }
  return true;
}
function ensureBudgetFile(projectRoot, budget = DEFAULT_TOKEN_BUDGET) {
  const budgetPath = getBudgetPath(projectRoot);
  if (existsSync(budgetPath)) {
    return budgetPath;
  }
  writeBudgetFile(projectRoot, budget);
  return budgetPath;
}
function writeBudgetFile(projectRoot, budget) {
  const budgetPath = getBudgetPath(projectRoot);
  mkdirSync(join(projectRoot, ".forgewright"), { recursive: true });
  writeFileSync(
    budgetPath,
    [
      "budget:",
      `  daily: ${budget.daily}`,
      `  weekly: ${budget.weekly}`,
      `  monthly: ${budget.monthly}`,
      "  alerts:",
      "    warning: 0.80",
      "    danger: 0.95",
      "    critical: 1.00",
      ""
    ].join("\n"),
    "utf-8"
  );
  return budgetPath;
}
function readBudgetFile(projectRoot) {
  const budgetPath = getBudgetPath(projectRoot);
  if (!existsSync(budgetPath)) {
    return null;
  }
  const content = readFileSync(budgetPath, "utf-8");
  return {
    daily: readNumber(content, "daily", DEFAULT_TOKEN_BUDGET.daily),
    weekly: readNumber(content, "weekly", DEFAULT_TOKEN_BUDGET.weekly),
    monthly: readNumber(content, "monthly", DEFAULT_TOKEN_BUDGET.monthly)
  };
}
function logTokenUsage(projectRoot, entry) {
  const usageDir = getDefaultUsageDir(projectRoot);
  mkdirSync(usageDir, { recursive: true });
  const logFile = join(usageDir, "usage.log");
  appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
}
function summarizeUsage(projectRoot, days) {
  const usageDir = getDefaultUsageDir(projectRoot);
  const minTime = Date.now() - days * 24 * 60 * 60 * 1e3;
  const summary = {
    usageDir,
    days,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    latestTimestamp: null
  };
  if (!existsSync(usageDir)) {
    return summary;
  }
  for (const file of readdirSync(usageDir)) {
    if (!file.endsWith(".jsonl") && !file.endsWith(".log") && !file.endsWith(".json")) {
      continue;
    }
    const path = join(usageDir, file);
    const lines = readFileSync(path, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        const entry = JSON.parse(line);
        const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : null;
        if (timestamp && Date.parse(timestamp) < minTime) {
          continue;
        }
        const inputTokens = numberField(entry.inputTokens);
        const outputTokens = numberField(entry.outputTokens);
        const cost = numberField(entry.cost);
        summary.calls += 1;
        summary.inputTokens += inputTokens;
        summary.outputTokens += outputTokens;
        summary.totalTokens += inputTokens + outputTokens;
        summary.estimatedCostUsd += cost;
        if (timestamp && (!summary.latestTimestamp || timestamp > summary.latestTimestamp)) {
          summary.latestTimestamp = timestamp;
        }
      } catch {
        continue;
      }
    }
  }
  summary.estimatedCostUsd = Number(summary.estimatedCostUsd.toFixed(6));
  return summary;
}
function buildTokenTrackingBlock(enabled) {
  return [
    "token_tracking:",
    `  enabled: ${enabled ? "true" : "false"}`,
    '  log_dir: "~/.forgewright/usage"',
    "  export_format: jsonl"
  ].join("\n");
}
function readNumber(content, key, defaultValue) {
  const pattern = new RegExp(
    `^[ \\t]*${key}:[ \\t]*([0-9]+(?:\\.[0-9]+)?)`,
    "m"
  );
  const match2 = content.match(pattern);
  if (!match2) {
    return defaultValue;
  }
  const parsed = Number(match2[1]);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
function numberField(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// src/commands/expert.ts
var DEFAULT_EXPERT_CONFIG = {
  enabled: false,
  activeCli: "claude",
  fallbackCli: null,
  useFor: {
    planning: false,
    failedPlanReview: true,
    gates: true,
    securityReview: true,
    architectureReview: true,
    codeReview: true
  },
  budget: {
    maxExpertCallsPerRun: 5,
    requireConfirmationAbove: 3
  }
};
function registerExpertCommand(program) {
  const expert = program.command("expert").description(
    "Optional expert-mode routing through Claude CLI or Codex CLI"
  );
  expert.command("status").description("Show expert-mode configuration and CLI availability").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleStatus(Boolean(options.json));
  });
  expert.command("on").description("Enable optional expert mode").option("--cli <claude|codex>", "CLI to use for expert checks").option("--track-tokens", "Also enable token tracking").option("-j, --json", "Output as JSON").action(
    async (options) => {
      await handleEnable(options);
    }
  );
  expert.command("off").description("Disable optional expert mode").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleDisable(Boolean(options.json));
  });
  expert.command("use").description("Switch active expert CLI").argument("<cli>", "claude or codex").option("--track-tokens", "Also enable token tracking").option("-j, --json", "Output as JSON").action(
    async (cli, options) => {
      await handleUse(cli, options);
    }
  );
  expert.command("test").description("Check whether the configured expert CLI is available").option(
    "--cli <claude|codex>",
    "CLI to test instead of the configured active CLI"
  ).option("-j, --json", "Output as JSON").action(async (options) => {
    await handleTest(options);
  });
  expert.command("budget").description("Set expert-mode call budget").option("--max-calls <count>", "Maximum expert calls per pipeline run").option(
    "--confirm-above <count>",
    "Require confirmation above this call count"
  ).option("-j, --json", "Output as JSON").action(
    async (options) => {
      await handleBudget(options);
    }
  );
  expert.command("gates").description("Enable or disable expert checks for pipeline gates").argument("<state>", "on or off").option("-j, --json", "Output as JSON").action(async (state, options) => {
    await handleGates(state, Boolean(options.json));
  });
}
async function handleStatus(useJson3) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config2 = readExpertConfig(projectRoot);
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    expertMode: config2,
    tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot),
    clis: checkSupportedClis()
  };
  writeOutput("expert.status", data, useJson3, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleEnable(options) {
  const startTime = Date.now();
  const useJson3 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config2 = readExpertConfig(projectRoot);
  if (options.cli) {
    config2.activeCli = parseSupportedCli(options.cli, useJson3);
  }
  config2.enabled = true;
  writeExpertConfig(projectRoot, config2);
  if (options.trackTokens) {
    setTokenTrackingEnabled(projectRoot, true);
  }
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    expertMode: config2,
    tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot)
  };
  writeOutput("expert.on", data, useJson3, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleDisable(useJson3) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config2 = readExpertConfig(projectRoot);
  config2.enabled = false;
  writeExpertConfig(projectRoot, config2);
  writeOutput(
    "expert.off",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config2
    },
    useJson3,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleUse(cli, options) {
  const startTime = Date.now();
  const useJson3 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config2 = readExpertConfig(projectRoot);
  config2.enabled = true;
  config2.activeCli = parseSupportedCli(cli, useJson3);
  writeExpertConfig(projectRoot, config2);
  if (options.trackTokens) {
    setTokenTrackingEnabled(projectRoot, true);
  }
  const availability = checkCli(config2.activeCli);
  writeOutput(
    "expert.use",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config2,
      tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot),
      availability
    },
    useJson3,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleTest(options) {
  const startTime = Date.now();
  const useJson3 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config2 = readExpertConfig(projectRoot);
  const cli = options.cli ? parseSupportedCli(options.cli, useJson3) : config2.activeCli;
  const availability = checkCli(cli);
  if (useJson3) {
    const envelope = buildEnvelope(
      "expert.test",
      { cli, availability },
      {
        ok: availability.available,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: availability.available ? void 0 : {
          code: EXIT_CODES.MISSING_DEPENDENCY,
          message: `${cli} CLI is not available`
        }
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else if (availability.available) {
    console.log(pc7.green(`OK: ${cli} CLI available`));
    console.log(pc7.dim(availability.version || "No version output"));
  } else {
    console.error(pc7.red(`Missing: ${cli} CLI is not available`));
    if (availability.error) {
      console.error(pc7.dim(availability.error));
    }
  }
  process.exit(
    availability.available ? EXIT_CODES.OK : EXIT_CODES.MISSING_DEPENDENCY
  );
}
async function handleBudget(options) {
  const startTime = Date.now();
  const useJson3 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config2 = readExpertConfig(projectRoot);
  if (options.maxCalls !== void 0) {
    config2.budget.maxExpertCallsPerRun = parsePositiveInteger(
      options.maxCalls,
      "max-calls",
      useJson3
    );
  }
  if (options.confirmAbove !== void 0) {
    config2.budget.requireConfirmationAbove = parsePositiveInteger(
      options.confirmAbove,
      "confirm-above",
      useJson3
    );
  }
  writeExpertConfig(projectRoot, config2);
  writeOutput(
    "expert.budget",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config2
    },
    useJson3,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleGates(state, useJson3) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config2 = readExpertConfig(projectRoot);
  const enabled = parseOnOff(state, useJson3);
  config2.useFor.gates = enabled;
  writeExpertConfig(projectRoot, config2);
  writeOutput(
    "expert.gates",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      gatesEnabled: enabled,
      expertMode: config2
    },
    useJson3,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
function readExpertConfig(projectRoot) {
  const content = readProductionConfig(projectRoot);
  const block2 = readTopLevelBlock(content, "expertMode");
  if (!block2) {
    return cloneDefaultConfig();
  }
  const activeCli = parseNullableString(getScalar(block2, "activeCli"));
  const fallbackCli = parseNullableString(getScalar(block2, "fallbackCli"));
  return {
    enabled: parseBoolean(
      getScalar(block2, "enabled"),
      DEFAULT_EXPERT_CONFIG.enabled
    ),
    activeCli: isSupportedCli(activeCli) ? activeCli : DEFAULT_EXPERT_CONFIG.activeCli,
    fallbackCli: isSupportedCli(fallbackCli) ? fallbackCli : null,
    useFor: {
      planning: parseBoolean(
        getScalar(block2, "planning"),
        DEFAULT_EXPERT_CONFIG.useFor.planning
      ),
      failedPlanReview: parseBoolean(
        getScalar(block2, "failedPlanReview"),
        DEFAULT_EXPERT_CONFIG.useFor.failedPlanReview
      ),
      gates: parseBoolean(
        getScalar(block2, "gates"),
        DEFAULT_EXPERT_CONFIG.useFor.gates
      ),
      securityReview: parseBoolean(
        getScalar(block2, "securityReview"),
        DEFAULT_EXPERT_CONFIG.useFor.securityReview
      ),
      architectureReview: parseBoolean(
        getScalar(block2, "architectureReview"),
        DEFAULT_EXPERT_CONFIG.useFor.architectureReview
      ),
      codeReview: parseBoolean(
        getScalar(block2, "codeReview"),
        DEFAULT_EXPERT_CONFIG.useFor.codeReview
      )
    },
    budget: {
      maxExpertCallsPerRun: parseInteger(
        getScalar(block2, "maxExpertCallsPerRun"),
        DEFAULT_EXPERT_CONFIG.budget.maxExpertCallsPerRun
      ),
      requireConfirmationAbove: parseInteger(
        getScalar(block2, "requireConfirmationAbove"),
        DEFAULT_EXPERT_CONFIG.budget.requireConfirmationAbove
      )
    }
  };
}
function writeExpertConfig(projectRoot, config2) {
  const content = readProductionConfig(projectRoot);
  const block2 = buildExpertBlock(config2);
  writeProductionConfig(
    projectRoot,
    upsertTopLevelBlock(content, "expertMode", block2)
  );
}
function buildExpertBlock(config2) {
  return [
    "expertMode:",
    `  enabled: ${config2.enabled ? "true" : "false"}`,
    `  activeCli: "${config2.activeCli}"`,
    `  fallbackCli: ${config2.fallbackCli ? `"${config2.fallbackCli}"` : "null"}`,
    "  useFor:",
    `    planning: ${config2.useFor.planning ? "true" : "false"}`,
    `    failedPlanReview: ${config2.useFor.failedPlanReview ? "true" : "false"}`,
    `    gates: ${config2.useFor.gates ? "true" : "false"}`,
    `    securityReview: ${config2.useFor.securityReview ? "true" : "false"}`,
    `    architectureReview: ${config2.useFor.architectureReview ? "true" : "false"}`,
    `    codeReview: ${config2.useFor.codeReview ? "true" : "false"}`,
    "  budget:",
    `    maxExpertCallsPerRun: ${config2.budget.maxExpertCallsPerRun}`,
    `    requireConfirmationAbove: ${config2.budget.requireConfirmationAbove}`
  ].join("\n");
}
function writeOutput(tool, data, useJson3, durationMs) {
  if (useJson3 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(tool, data, {
      ok: true,
      duration_ms: durationMs,
      version: VERSION
    });
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  console.log();
  console.log(pc7.bold(`  ${tool}`));
  console.log(pc7.gray("  " + "-".repeat(50)));
  console.log(JSON.stringify(data, null, 2));
  console.log();
}
function parseSupportedCli(value, useJson3) {
  if (isSupportedCli(value)) {
    return value;
  }
  fail(`Invalid CLI "${value}". Use "claude" or "codex".`, useJson3);
}
function isSupportedCli(value) {
  return value === "claude" || value === "codex";
}
function parsePositiveInteger(value, label3, useJson3) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`Invalid ${label3}: ${value}. Use a non-negative integer.`, useJson3);
  }
  return parsed;
}
function parseInteger(value, defaultValue) {
  if (value === null) {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}
function parseOnOff(value, useJson3) {
  if (value === "on") {
    return true;
  }
  if (value === "off") {
    return false;
  }
  fail(`Invalid state "${value}". Use "on" or "off".`, useJson3);
}
function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_EXPERT_CONFIG));
}
function fail(message, useJson3) {
  if (useJson3 || !process.stdout.isTTY) {
    const envelope = buildEnvelope("expert.error", null, {
      ok: false,
      duration_ms: 0,
      version: VERSION,
      error: { code: EXIT_CODES.USAGE_ERROR, message }
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.error(pc7.red(`Error: ${message}`));
  }
  process.exit(EXIT_CODES.USAGE_ERROR);
}
function registerTokenCommand(program) {
  const token = program.command("token").description("Token tracking controls and usage reports");
  token.command("status").description("Show token tracking status").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleStatus2(Boolean(options.json));
  });
  token.command("on").description("Enable token tracking").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleToggle(true, Boolean(options.json), "token.on");
  });
  token.command("off").description("Disable token tracking without deleting usage data").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleToggle(false, Boolean(options.json), "token.off");
  });
  token.command("budget").description("Show or update token tracking budget").option("--daily <usd>", "Daily budget in USD").option("--weekly <usd>", "Weekly budget in USD").option("--monthly <usd>", "Monthly budget in USD").option("-j, --json", "Output as JSON").action(
    async (options) => {
      await handleBudget2(options);
    }
  );
  token.command("report").description("Show usage summary from local token logs").option("--period <day|week|month>", "Report period", "week").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleReport(options);
  });
  token.command("log").description("Log LLM token usage details").requiredOption("--input-tokens <tokens>", "Prompt/input tokens").requiredOption("--output-tokens <tokens>", "Completion/output tokens").requiredOption("--model <model>", "Model name").requiredOption("--provider <provider>", "Provider name").option("--cost <cost>", "USD Cost").requiredOption("--skill <skill>", "Skill name").option("-j, --json", "Output as JSON").action(
    async (options) => {
      await handleLogToken(options);
    }
  );
  token.command("dashboard").description("Start the token usage dashboard server").option(
    "--host <host>",
    "Bind host (non-loopback requires dashboard auth token env)",
    "127.0.0.1"
  ).option("--port <port>", "Dashboard port", "8080").option("-j, --json", "Output startup information as JSON before launching").action(async (options) => {
    await handleDashboard(options);
  });
}
async function handleStatus2(useJson3) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const summary = summarizeUsage(projectRoot, 7);
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    enabled: getTokenTrackingEnabled(projectRoot),
    usageDir: getDefaultUsageDir(projectRoot),
    budgetPath: getBudgetPath(projectRoot),
    budget: readBudgetFile(projectRoot),
    last7Days: summary,
    sources: {
      forgewrightUsageDir: existsSync(getDefaultUsageDir(projectRoot)),
      claudeTelemetry: existsSync(join(homedir(), ".claude", "telemetry")),
      codexConfig: existsSync(join(homedir(), ".codex"))
    }
  };
  writeOutput2("token.status", data, useJson3, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleToggle(enabled, useJson3, tool) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  setTokenTrackingEnabled(projectRoot, enabled);
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    enabled,
    usageDir: getDefaultUsageDir(projectRoot),
    budgetPath: ensureBudgetFile(projectRoot)
  };
  writeOutput2(tool, data, useJson3, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleBudget2(options) {
  const startTime = Date.now();
  const useJson3 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const existing = readBudgetFile(projectRoot) ?? DEFAULT_TOKEN_BUDGET;
  const shouldUpdate = options.daily !== void 0 || options.weekly !== void 0 || options.monthly !== void 0;
  const budget = {
    daily: options.daily !== void 0 ? parseUsd(options.daily, "daily", useJson3) : existing.daily,
    weekly: options.weekly !== void 0 ? parseUsd(options.weekly, "weekly", useJson3) : existing.weekly,
    monthly: options.monthly !== void 0 ? parseUsd(options.monthly, "monthly", useJson3) : existing.monthly
  };
  if (shouldUpdate) {
    writeBudgetFile(projectRoot, budget);
  } else {
    ensureBudgetFile(projectRoot, budget);
  }
  writeOutput2(
    "token.budget",
    {
      projectRoot,
      budgetPath: getBudgetPath(projectRoot),
      updated: shouldUpdate,
      budget
    },
    useJson3,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleReport(options) {
  const startTime = Date.now();
  const useJson3 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const days = periodToDays(options.period, useJson3);
  const summary = summarizeUsage(projectRoot, days);
  writeOutput2(
    "token.report",
    {
      projectRoot,
      period: options.period,
      summary
    },
    useJson3,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleDashboard(options) {
  const startTime = Date.now();
  const useJson3 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const scriptPath = join(projectRoot, "scripts", "token-api-server.py");
  const host = parseDashboardHost(options.host, useJson3);
  const port = parsePort(options.port, useJson3);
  const authRequired = !isLoopbackDashboardHost(host);
  if (authRequired && !process.env.FORGEWRIGHT_TOKEN_DASHBOARD_AUTH_TOKEN?.trim()) {
    fail2(
      "Non-loopback dashboard binding requires FORGEWRIGHT_TOKEN_DASHBOARD_AUTH_TOKEN.",
      useJson3,
      EXIT_CODES.USAGE_ERROR
    );
  }
  if (!existsSync(scriptPath)) {
    fail2(
      `Token dashboard script not found: ${scriptPath}`,
      useJson3,
      EXIT_CODES.MISSING_DEPENDENCY
    );
  }
  const python = findPythonCommand();
  if (!python) {
    fail2(
      "No Python launcher found. Install python, python3, or py to run the dashboard.",
      useJson3,
      EXIT_CODES.MISSING_DEPENDENCY
    );
  }
  const displayHost = isIP(host) === 6 ? `[${host}]` : host;
  const data = {
    projectRoot,
    scriptPath,
    host,
    port,
    authRequired,
    url: `http://${displayHost}:${port}/dashboard`,
    python
  };
  if (useJson3) {
    writeOutput2("token.dashboard", data, true, Date.now() - startTime);
  } else {
    console.log(pc7.green(`Starting token dashboard: ${data.url}`));
    console.log(pc7.dim("Press Ctrl+C to stop."));
  }
  const child = spawn(
    python,
    [scriptPath, "--host", host, "--port", String(port)],
    {
      stdio: "inherit",
      shell: process.platform === "win32"
    }
  );
  child.on("exit", (code2) => {
    process.exit(code2 ?? EXIT_CODES.OK);
  });
}
function writeOutput2(tool, data, useJson3, durationMs) {
  if (useJson3 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(tool, data, {
      ok: true,
      duration_ms: durationMs,
      version: VERSION
    });
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  console.log();
  console.log(pc7.bold(`  ${tool}`));
  console.log(pc7.gray("  " + "-".repeat(50)));
  console.log(JSON.stringify(data, null, 2));
  console.log();
}
function parseUsd(value, label3, useJson3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail2(
      `Invalid ${label3} budget: ${value}. Use a non-negative number.`,
      useJson3,
      EXIT_CODES.USAGE_ERROR
    );
  }
  return parsed;
}
function parseDashboardHost(value, useJson3) {
  const host = value.trim();
  if (host === "localhost" || isIP(host) > 0) {
    return host;
  }
  fail2(
    `Invalid dashboard host: ${value}. Use localhost or an IP address.`,
    useJson3,
    EXIT_CODES.USAGE_ERROR
  );
}
function isLoopbackDashboardHost(host) {
  if (host === "localhost" || host === "::1") {
    return true;
  }
  return isIP(host) === 4 && host.split(".")[0] === "127";
}
function parsePort(value, useJson3) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    fail2(
      `Invalid port: ${value}. Use an integer from 1 to 65535.`,
      useJson3,
      EXIT_CODES.USAGE_ERROR
    );
  }
  return parsed;
}
function periodToDays(period, useJson3) {
  if (period === "day") {
    return 1;
  }
  if (period === "week") {
    return 7;
  }
  if (period === "month") {
    return 30;
  }
  fail2(
    `Invalid period "${period}". Use day, week, or month.`,
    useJson3,
    EXIT_CODES.USAGE_ERROR
  );
}
function findPythonCommand() {
  for (const command of ["python3", "python", "py"]) {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf-8",
      shell: process.platform === "win32",
      timeout: 3e3
    });
    if (!result.error && result.status === 0) {
      return command;
    }
  }
  return null;
}
function fail2(message, useJson3, code2) {
  if (useJson3 || !process.stdout.isTTY) {
    const envelope = buildEnvelope("token.error", null, {
      ok: false,
      duration_ms: 0,
      version: VERSION,
      error: { code: code2, message }
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.error(pc7.red(`Error: ${message}`));
  }
  process.exit(code2);
}
async function handleLogToken(options) {
  const startTime = Date.now();
  const useJson3 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const inputTokens = Number(options.inputTokens);
  const outputTokens = Number(options.outputTokens);
  const cost = options.cost !== void 0 ? Number(options.cost) : null;
  if (!Number.isInteger(inputTokens) || inputTokens < 0) {
    fail2(
      "Invalid input-tokens: must be a non-negative integer.",
      useJson3,
      EXIT_CODES.USAGE_ERROR
    );
  }
  if (!Number.isInteger(outputTokens) || outputTokens < 0) {
    fail2(
      "Invalid output-tokens: must be a non-negative integer.",
      useJson3,
      EXIT_CODES.USAGE_ERROR
    );
  }
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
    fail2(
      "Invalid cost: must be a non-negative number.",
      useJson3,
      EXIT_CODES.USAGE_ERROR
    );
  }
  const entry = {
    inputTokens,
    outputTokens,
    model: options.model,
    provider: options.provider,
    cost,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    skill: options.skill
  };
  logTokenUsage(projectRoot, entry);
  writeOutput2(
    "token.log",
    {
      success: true,
      entry
    },
    useJson3,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}

// src/delegation/auto-activation.ts
var DEFAULT_DELEGATION_CONFIG = {
  enabled: "auto",
  controller: "auto",
  workerCli: "agy",
  model: "Gemini 3.5 Flash (High)",
  notify: true
};
function readDelegationConfig(content) {
  const block2 = readTopLevelBlock(content, "delegationMode");
  if (!block2) {
    return { ...DEFAULT_DELEGATION_CONFIG };
  }
  return {
    enabled: parseEnabled(getScalar(block2, "enabled")),
    controller: parseController(getScalar(block2, "controller")),
    workerCli: "agy",
    model: getScalar(block2, "model") || DEFAULT_DELEGATION_CONFIG.model,
    notify: parseBoolean(
      getScalar(block2, "notify"),
      DEFAULT_DELEGATION_CONFIG.notify
    )
  };
}
function buildDelegationBlock(config2) {
  return [
    "delegationMode:",
    `  enabled: ${config2.enabled}`,
    `  controller: ${config2.controller}`,
    "  worker:",
    `    cli: ${config2.workerCli}`,
    `    model: "${config2.model.replaceAll('"', '\\"')}"`,
    `  notify: ${config2.notify ? "true" : "false"}`
  ].join("\n");
}
function detectControllerCli(environment = process.env) {
  const explicit = environment.FORGE_CONTROLLER_CLI?.toLowerCase();
  if (explicit === "codex" || explicit === "claude") {
    return explicit;
  }
  const hasCodexSignal = Boolean(
    environment.CODEX_THREAD_ID || environment.CODEX_CI || environment.CODEX_SANDBOX
  );
  const hasClaudeSignal = Boolean(
    environment.CLAUDECODE || environment.CLAUDE_CODE_ENTRYPOINT || environment.CLAUDE_SESSION_ID || environment.CLAUDE_PROJECT_DIR
  );
  if (hasCodexSignal === hasClaudeSignal) {
    return "unknown";
  }
  return hasCodexSignal ? "codex" : "claude";
}
function resolveDelegationActivation(input) {
  const controller = input.config.controller === "auto" ? detectControllerCli(input.environment) : input.config.controller;
  const base2 = {
    controller,
    workerCli: input.config.workerCli,
    model: input.config.model,
    notify: input.config.notify
  };
  if (input.config.enabled === "off") {
    return {
      ...base2,
      active: false,
      autoEnabled: false,
      reason: "disabled"
    };
  }
  if (controller === "unknown") {
    return {
      ...base2,
      active: false,
      autoEnabled: false,
      reason: "controller-undetected"
    };
  }
  if (!input.workerAvailable) {
    return {
      ...base2,
      active: false,
      autoEnabled: false,
      reason: "worker-unavailable"
    };
  }
  const autoEnabled = input.config.enabled === "auto";
  return {
    ...base2,
    active: true,
    autoEnabled,
    reason: autoEnabled ? "auto-enabled" : "enabled"
  };
}
function parseEnabled(value) {
  if (value === null) {
    return DEFAULT_DELEGATION_CONFIG.enabled;
  }
  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "on") {
    return "on";
  }
  if (normalized === "false" || normalized === "off") {
    return "off";
  }
  return normalized === "auto" ? "auto" : DEFAULT_DELEGATION_CONFIG.enabled;
}
function parseController(value) {
  const normalized = value?.toLowerCase();
  if (normalized === "codex" || normalized === "claude") {
    return normalized;
  }
  return "auto";
}
function runtimeEntry() {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    const entry = join(root, "scripts/runtime/host_jobs.py");
    if (existsSync(entry)) return entry;
    const parent = dirname(root);
    if (parent === root) break;
    root = parent;
  }
  throw new Error("host_job_runtime_required");
}
function runHostAction(project, action, options = {}) {
  const entry = runtimeEntry();
  const argv = [
    "-I",
    "-B",
    "-c",
    'import runpy,sys;sys.argv.pop(0);sys.path.insert(0,sys.argv.pop(0));runpy.run_path(sys.argv[0],run_name="__main__")',
    dirname(entry),
    entry,
    action
  ];
  if (action === "run") {
    if (!options.profile || !options.digest)
      throw new Error("host_job_profile_required");
    argv.push(
      "--project",
      project,
      "--profile",
      options.profile,
      "--digest",
      options.digest
    );
  }
  if (action === "disable" || action === "activate")
    argv.push("--project", project);
  if (action === "inspect") {
    if (!options.request) throw new Error("inspection_request_required");
    argv.push("--project", project, "--request", options.request);
  }
  if (action === "register-profile") {
    if (!options.file || !options.sha256)
      throw new Error("reviewed_profile_hash_required");
    argv.push(
      "--project",
      project,
      "--file",
      options.file,
      "--sha256",
      options.sha256
    );
  }
  if (action === "restage-shared") {
    if (!options.manifest || !options.sha256)
      throw new Error("reviewed_manifest_hash_required");
    argv.push(
      "--project",
      project,
      "--manifest",
      options.manifest,
      "--sha256",
      options.sha256
    );
  }
  if (action === "reconcile-quarantined") {
    if (!options.plan || !options.sha256)
      throw new Error("reviewed_reconcile_plan_hash_required");
    argv.push(
      "--project",
      project,
      "--plan",
      options.plan,
      "--sha256",
      options.sha256
    );
    if (options.apply) argv.push("--apply");
  }
  return new Promise((resolve16, reject) => {
    const child = spawn("python3", argv, {
      cwd: project,
      stdio: "inherit",
      shell: false
    });
    const interrupt = (signal) => {
      child.kill(signal);
    };
    const onInt = () => interrupt("SIGINT");
    const onTerm = () => interrupt("SIGTERM");
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    const cleanup = () => {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
    };
    child.once("error", (error2) => {
      cleanup();
      reject(error2);
    });
    child.once("exit", (code2, signal) => {
      cleanup();
      resolve16(code2 ?? (signal === "SIGINT" ? 130 : 125));
    });
  });
}
function readCanonicalDelegationMode(projectRoot) {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    const filename = join(root, "integrations/pi/project-config.cjs");
    if (existsSync(filename)) {
      const { readProjectYaml } = createRequire(import.meta.url)(filename);
      return readProjectYaml(projectRoot).get("delegationMode", true)?.toJSON?.();
    }
    const parent = dirname(root);
    if (parent === root) break;
    root = parent;
  }
  throw new Error("pi_package_runtime_required");
}
function hasPiConfig(projectRoot) {
  const mode = readCanonicalDelegationMode(projectRoot);
  const configured = mode?.worker?.cli;
  if (!configured && (mode?.enabled === false || mode?.enabled === "off"))
    return false;
  return configured ? configured === "pi" : existsSync(join(projectRoot, ".forgewright/pi-worker.json"));
}
async function loadPiRuntime() {
  return import(pathToFileURL(
    join(resolvePiPackageRoot(), "integrations/pi/worker-runtime.mjs")
  ).href);
}
function resolvePiPackageRoot() {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    const entry = join(root, "integrations/pi/worker-runtime.mjs");
    if (existsSync(entry)) return root;
    const parent = dirname(root);
    if (parent === root) break;
    root = parent;
  }
  throw new Error("pi_package_runtime_required");
}
async function piAction(projectRoot, action, options = {}) {
  try {
    if (action === "resources") {
      const governor = await import(pathToFileURL(
        join(resolvePiPackageRoot(), "integrations/pi/host-governor.mjs")
      ).href);
      console.log(
        JSON.stringify(await governor.getHostAdmissionStatus(), null, 2)
      );
      return;
    }
    const runtime = await loadPiRuntime();
    let result;
    if (action === "on" || action === "model")
      result = await runtime.configureWorker(projectRoot, options);
    else if (action === "off") {
      const { readWorkerConfig, writeWorkerConfig } = await import(pathToFileURL(
        join(runtime.packageRoot, "integrations/pi/runtime-state.mjs")
      ).href);
      writeWorkerConfig(projectRoot, {
        ...readWorkerConfig(projectRoot),
        enabled: false
      });
      result = await runtime.workerStatus(projectRoot);
    } else if (action === "auto")
      throw new Error("pi_explicit_enable_required");
    else if (action === "status")
      result = await runtime.workerStatus(projectRoot);
    else if (action === "cancel")
      result = runtime.cancelRun(projectRoot, options.runId);
    else if (action === "run") {
      const abort = new AbortController();
      const stop = () => abort.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        result = await runtime.runWorker({
          projectRoot,
          contractPath: options.contract,
          signal: abort.signal,
          onStarted: (run) => process.stderr.write(`${JSON.stringify(run)}
`)
        });
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
      if (result.status !== "finished") process.exitCode = 1;
    } else throw new Error("pi_unknown_action");
    console.log(JSON.stringify(result, null, 2));
  } catch (error2) {
    const message = error2 instanceof Error && /^pi_[a-z0-9_]+$/.test(error2.message) ? error2.message : "pi_runtime_failed";
    console.error(JSON.stringify({ worker: "pi", error: message }));
    process.exitCode = 1;
  }
}

// src/commands/delegate.ts
function registerDelegateCommand(program) {
  const delegate = program.command("delegate").description("Delegate approved work to an explicitly configured worker");
  delegate.command("status").description("Show auto-delegation state").option("-j, --json", "Output as JSON").addOption(new Option("--worker <worker>", "Worker").choices(["pi", "agy"])).action(async (options) => {
    const startTime = Date.now();
    const projectRoot = findProjectRoot();
    if (options.worker === "pi" || !options.worker && hasPiConfig(projectRoot)) {
      await piAction(projectRoot, "status", options);
      return;
    }
    const activation = resolveCurrentDelegation(projectRoot);
    writeStatusOutput(
      activation,
      projectRoot,
      Boolean(options.json),
      Date.now() - startTime
    );
    process.exit(EXIT_CODES.OK);
  });
  for (const mode of ["auto", "on", "off"]) {
    delegate.command(mode).description(
      `${mode === "auto" ? "Auto-detect and enable" : mode === "on" ? "Force enable" : "Disable"} delegation mode`
    ).option("-j, --json", "Output as JSON").addOption(
      new Option("--worker <worker>", "Worker").choices(["pi", "agy"])
    ).addOption(
      new Option("--provider <provider>", "Pi provider").choices([
        "current",
        "openai-codex",
        "local"
      ])
    ).addOption(
      new Option("--auth-source <source>", "Read-only OAuth source").choices([
        "codex",
        "pi"
      ])
    ).option("--model <model>", "Exact provider model ID").option("--endpoint <url>", "Explicit loopback /v1 local endpoint").action(async (options) => {
      const root = findProjectRoot();
      if (options.worker === "pi" || !options.worker && hasPiConfig(root)) {
        await piAction(root, mode, options);
        return;
      }
      handleSetMode(mode, Boolean(options.json));
    });
  }
  delegate.command("model").description("Set the selected worker model").argument("<model>", "Exact model name").option("-j, --json", "Output as JSON").addOption(new Option("--worker <worker>", "Worker").choices(["pi", "agy"])).action(async (model, options) => {
    if (options.worker === "pi" || !options.worker && hasPiConfig(findProjectRoot())) {
      await piAction(findProjectRoot(), "model", { model });
      return;
    }
    handleSetModel(model, Boolean(options.json));
  });
  delegate.command("resources").description("Show shared admission, pressure and queued work").option(
    "--inventory",
    "Include bounded process coverage and live disk telemetry"
  ).option(
    "--disk",
    "Measure complete project footprint and nested build/cache candidates"
  ).option(
    "--disable",
    "Disable new native jobs; remove owned config when quiescent"
  ).option(
    "--prune-history",
    "Retire proven terminal metadata; preserve artifact data and leases"
  ).option(
    "--inspect <json>",
    "Bounded project read/list/search; no shell execution"
  ).option(
    "--register-profile <file>",
    "Install an exact owner-reviewed project recipe without running it"
  ).option(
    "--restage-shared <manifest>",
    "Stage an exact owner-reviewed shared runtime manifest"
  ).option(
    "--reconcile-quarantined <plan>",
    "Inspect or apply an owner-reviewed quarantine reconciliation plan"
  ).option(
    "--apply",
    "Apply the reviewed quarantine reconciliation plan after fresh census"
  ).option(
    "--activate",
    "Activate staged host resource controls for this project"
  ).option(
    "--sha256 <digest>",
    "SHA256 of the reviewed recipe or shared manifest"
  ).action(
    async (options) => {
      const selected = [
        options.inventory,
        options.disk,
        options.disable,
        options.pruneHistory,
        options.inspect,
        options.registerProfile,
        options.restageShared,
        options.reconcileQuarantined,
        options.activate
      ].filter((value) => value !== void 0);
      const requiresHash = options.registerProfile !== void 0 || options.restageShared !== void 0 || options.reconcileQuarantined !== void 0;
      if (selected.length > 1 || selected.includes("") || options.apply !== void 0 && options.reconcileQuarantined === void 0 || options.sha256 !== void 0 !== requiresHash || requiresHash && !options.sha256) {
        throw new Error("select_one_resource_action_with_required_hash");
      }
      if (options.inspect)
        process.exitCode = await runHostAction(findProjectRoot(), "inspect", {
          request: options.inspect
        });
      else if (options.registerProfile)
        process.exitCode = await runHostAction(
          findProjectRoot(),
          "register-profile",
          { file: options.registerProfile, sha256: options.sha256 }
        );
      else if (options.restageShared)
        process.exitCode = await runHostAction(
          findProjectRoot(),
          "restage-shared",
          { manifest: options.restageShared, sha256: options.sha256 }
        );
      else if (options.reconcileQuarantined)
        process.exitCode = await runHostAction(
          findProjectRoot(),
          "reconcile-quarantined",
          {
            plan: options.reconcileQuarantined,
            sha256: options.sha256,
            apply: Boolean(options.apply)
          }
        );
      else if (options.activate)
        process.exitCode = await runHostAction(findProjectRoot(), "activate");
      else if (options.disable)
        process.exitCode = await runHostAction(findProjectRoot(), "disable");
      else if (options.pruneHistory)
        process.exitCode = await runHostAction(findProjectRoot(), "history");
      else if (options.disk)
        process.exitCode = await runHostAction(findProjectRoot(), "disk");
      else if (options.inventory)
        process.exitCode = await runHostAction(findProjectRoot(), "status");
      else await piAction(findProjectRoot(), "resources");
    }
  );
  delegate.command("exec").description(
    "Run an explicitly installed finite profile through host admission"
  ).requiredOption("--profile <id>", "Reviewed finite profile ID").requiredOption("--digest <sha256>", "Exact installed profile digest").action(async (options) => {
    process.exitCode = await runHostAction(findProjectRoot(), "run", options);
  });
  delegate.command("cancel").description("Close Pi run admission and request cancellation").argument("<runId>", "Pi run ID").action(async (runId) => {
    await piAction(findProjectRoot(), "cancel", { runId });
  });
  delegate.command("run").description("Run an approved Task Contract with the auto-detected worker").requiredOption("--contract <path>", "Path to CONTRACT.json").addOption(
    new Option("--worker <worker>", "Explicit worker, no fallback").choices([
      "pi",
      "agy"
    ])
  ).action(async (options) => {
    if (options.worker === "pi" || !options.worker && hasPiConfig(findProjectRoot())) {
      await piAction(findProjectRoot(), "run", options);
      return;
    }
    console.error(
      JSON.stringify({
        worker: "agy",
        ready: false,
        error: "worker_host_admission_unsupported",
        message: "The governed delegate run entrypoint currently supports Pi. Configure --worker pi; no ungoverned fallback was started."
      })
    );
    process.exitCode = EXIT_CODES.MISSING_DEPENDENCY;
  });
}
function resolveCurrentDelegation(projectRoot = findProjectRoot()) {
  const config2 = readDelegationConfig(readProductionConfig(projectRoot));
  const canonical2 = readCanonicalDelegationMode(projectRoot);
  if (canonical2?.enabled === false || canonical2?.enabled === "off")
    config2.enabled = "off";
  if (hasPiConfig(projectRoot))
    return resolveDelegationActivation({
      config: { ...config2, enabled: "off" },
      workerAvailable: false
    });
  return resolveDelegationActivation({
    config: config2,
    // Retained legacy settings do not confer readiness for managed execution.
    workerAvailable: false
  });
}
function maybeNotifyAutoDelegation(_argv = process.argv, environment = process.env) {
  return resolveDelegationActivation({
    config: {
      ...readDelegationConfig(readProductionConfig(findProjectRoot())),
      enabled: "off"
    },
    environment,
    workerAvailable: false
  });
}
function handleSetMode(mode, useJson3) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config2 = readDelegationConfig(readProductionConfig(projectRoot));
  config2.enabled = mode;
  persistConfig(projectRoot, config2);
  const activation = resolveCurrentDelegation(projectRoot);
  writeStatusOutput(activation, projectRoot, useJson3, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
function handleSetModel(model, useJson3) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config2 = readDelegationConfig(readProductionConfig(projectRoot));
  config2.model = model;
  persistConfig(projectRoot, config2);
  const activation = resolveCurrentDelegation(projectRoot);
  writeStatusOutput(activation, projectRoot, useJson3, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
function persistConfig(projectRoot, config2) {
  writeProductionConfig(
    projectRoot,
    upsertTopLevelBlock(
      readProductionConfig(projectRoot),
      "delegationMode",
      buildDelegationBlock(config2)
    )
  );
}
function writeStatusOutput(activation, projectRoot, useJson3, durationMs) {
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    delegationMode: activation,
    worker: checkCli("agy"),
    ready: false,
    readinessReason: "worker_host_admission_unsupported",
    readinessScope: "Legacy settings remain configurable; governed delegate run requires the Pi worker."
  };
  if (useJson3 || !process.stdout.isTTY) {
    console.log(
      JSON.stringify(
        buildEnvelope("delegate.status", data, {
          ok: true,
          duration_ms: durationMs,
          version: VERSION
        }),
        null,
        2
      )
    );
    return;
  }
  const state = activation.active ? pc7.green("ACTIVE") : pc7.yellow("INACTIVE");
  console.log(`Delegation: ${state}`);
  console.log(`Controller: ${activation.controller}`);
  console.log(`Worker: ${activation.workerCli} / ${activation.model}`);
  console.log(`Reason: ${activation.reason}`);
}
var PRODUCT_FACTORY_BENCHMARK_TASK_SCHEMA_VERSION = "product-factory-benchmark-task/v1";
var PRODUCT_FACTORY_BENCHMARK_SUITE_SCHEMA_VERSION = "product-factory-benchmark-suite/v1";
var PRODUCT_FACTORY_LANE_RECEIPT_SCHEMA_VERSION = "product-factory-lane-receipt/v1";
var PRODUCT_FACTORY_BENCHMARK_REPORT_SCHEMA_VERSION = "product-factory-benchmark-report/v1";
var PRODUCT_FACTORY_FROZEN_THRESHOLDS_SCHEMA_VERSION = "product-factory-frozen-thresholds/v1";
var PRODUCT_FACTORY_PAIRED_COMPARISON_SCHEMA_VERSION = "product-factory-paired-comparison/v1";
var PRODUCT_FACTORY_BENCHMARK_MAX_BYTES = 512 * 1024;
var PRODUCT_FACTORY_BENCHMARK_LANES = [
  "intent",
  "web",
  "android",
  "game"
];
var PRODUCT_FACTORY_BENCHMARK_METRICS = [
  "product-outcome-success",
  "false-success",
  "user-intervention",
  "clarification",
  "retries",
  "wall-time",
  "tokens",
  "cost"
];
var MAX_ITEMS = 256;
var MAX_JSON_DEPTH = 16;
var MAX_COUNT = 1e9;
var SHA256_PATTERN = /^[a-f0-9]{64}$/;
var SAFE_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
var SENSITIVE_TEXT = /(?:bearer(?:-|\s)|private[-_ ]key|api[-_ ]key|access[-_ ]key|secret[-_ ]key|password|credential|authorization|payment|cardholder|-----begin|\bsk-[a-z0-9]{16})/i;
var AWS_KEY = /\bAKIA[A-Z0-9]{16}\b/;
var JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
var HIGH_ENTROPY = /[A-Za-z0-9+/_=]{48,}/;
var RAW_FIELD = /^(?:prompt|raw(?:input|output|prompt|response|content|text)?|output|response|message|content|api[-_]?key|password|secret|authorization|cookie|credential)$/i;
var ProductFactoryBenchmarkValidationError = class extends Error {
  constructor(code2) {
    super(code2);
    this.code = code2;
    this.name = "ProductFactoryBenchmarkValidationError";
  }
  code;
};
function fail3(code2) {
  throw new ProductFactoryBenchmarkValidationError(code2);
}
function compareCodeUnits(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
function assertPrivacySafe(value, depth = 0, seen = /* @__PURE__ */ new Set(), fieldName = null) {
  if (depth > MAX_JSON_DEPTH) fail3("BENCHMARK_SIZE_LIMIT");
  if (typeof value === "string") {
    const hashPosition = fieldName === null || fieldName === "pairId" || /(?:sha256|fingerprint|digest)s?$/i.test(fieldName);
    if (SENSITIVE_TEXT.test(value) || AWS_KEY.test(value) || JWT.test(value) || HIGH_ENTROPY.test(value) && !(hashPosition && SHA256_PATTERN.test(value))) {
      fail3("BENCHMARK_PRIVACY_INVALID");
    }
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail3("BENCHMARK_MALFORMED");
    return;
  }
  if (typeof value !== "object" || seen.has(value)) {
    fail3("BENCHMARK_MALFORMED");
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ITEMS) fail3("BENCHMARK_SIZE_LIMIT");
      for (const item of value) {
        assertPrivacySafe(item, depth + 1, seen, fieldName);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail3("BENCHMARK_MALFORMED");
    }
    const record = value;
    const keys = Object.keys(record);
    if (keys.length > MAX_ITEMS) fail3("BENCHMARK_SIZE_LIMIT");
    for (const key of keys) {
      if (key.length === 0 || key.length > 256 || ["__proto__", "prototype", "constructor"].includes(key) || RAW_FIELD.test(key)) {
        fail3("BENCHMARK_PRIVACY_INVALID");
      }
      assertPrivacySafe(record[key], depth + 1, seen, key);
    }
  } finally {
    seen.delete(value);
  }
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).sort(compareCodeUnits).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === void 0) fail3("BENCHMARK_MALFORMED");
  return serialized;
}
function assertBounded(value) {
  assertPrivacySafe(value);
  if (Buffer.byteLength(canonicalJson(value), "utf8") > PRODUCT_FACTORY_BENCHMARK_MAX_BYTES) {
    fail3("BENCHMARK_SIZE_LIMIT");
  }
}
function hashProductFactoryBenchmarkPayload(value) {
  assertBounded(value);
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
function parseWith(schema, input) {
  assertBounded(input);
  const result = schema.safeParse(input);
  if (!result.success || result.data === void 0) fail3("BENCHMARK_MALFORMED");
  return result.data;
}
function without(value, key) {
  return Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== key)
  );
}
function exact(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}
function sortedUnique(values) {
  if (new Set(values).size !== values.length) fail3("BENCHMARK_BINDING_INVALID");
  return [...values].sort(compareCodeUnits);
}
function sortedSet(values) {
  return [...new Set(values)].sort(compareCodeUnits);
}
var SafeIdSchema = z.string().min(1).max(96).regex(SAFE_ID_PATTERN);
var VersionSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i);
var HashSchema = z.string().regex(SHA256_PATTERN);
var TimestampSchema = z.string().datetime({ offset: true });
var CountSchema = z.number().int().min(0).max(MAX_COUNT);
var PositiveCountSchema = z.number().int().min(1).max(MAX_ITEMS);
var RateSchema = z.number().finite().min(0).max(1);
var LaneSchema = z.enum(PRODUCT_FACTORY_BENCHMARK_LANES);
var EvidenceAuthoritySchema = z.enum(["production", "test-only"]);
var OutcomeStatusSchema = z.enum([
  "PASS",
  "FAIL",
  "UNVERIFIED",
  "REQUIRES_HUMAN_REVIEW"
]);
var EnvironmentStatusSchema = z.enum(["PASS", "FAIL", "UNVERIFIED"]);
var EnvironmentKindSchema = z.enum(["none", "web", "android", "unity"]);
var StableCodeSchema = z.string().min(1).max(96).regex(SAFE_ID_PATTERN);
var TestReferenceSchema = z.string().min(1).max(512).regex(/^[a-z0-9][a-z0-9._/-]*\.[a-z0-9]{1,16}(?:::[a-z0-9_.-]+)?$/i).refine((value) => !value.includes("..") && !value.startsWith("/"));
var HashedBindingSchema = z.object({ id: SafeIdSchema, sha256: HashSchema }).strict();
var TaskInputSchema = z.object({
  taskId: SafeIdSchema,
  lane: LaneSchema,
  attemptCount: PositiveCountSchema,
  hiddenRequirementSha256s: z.array(HashSchema).min(1).max(MAX_ITEMS),
  hiddenPreferenceSha256s: z.array(HashSchema).min(1).max(MAX_ITEMS),
  intent: HashedBindingSchema,
  outcomes: z.array(HashedBindingSchema).min(1).max(MAX_ITEMS),
  scenarios: z.array(HashedBindingSchema).min(1).max(MAX_ITEMS),
  expectedEnvironmentKind: EnvironmentKindSchema,
  verifierRefs: z.array(TestReferenceSchema).min(1).max(MAX_ITEMS),
  evidenceAuthority: EvidenceAuthoritySchema
}).strict();
var ProductFactoryBenchmarkTaskSchema = TaskInputSchema.extend({
  schemaVersion: z.literal(PRODUCT_FACTORY_BENCHMARK_TASK_SCHEMA_VERSION),
  verifierFingerprint: HashSchema,
  taskSha256: HashSchema
}).strict();
var EXPECTED_ENVIRONMENT_BY_LANE = {
  intent: "none",
  web: "web",
  android: "android",
  game: "unity"
};
function canonicalizeBindings(values) {
  if (new Set(values.map(({ id: id2 }) => id2)).size !== values.length) {
    fail3("BENCHMARK_BINDING_INVALID");
  }
  return [...values].sort((left, right) => compareCodeUnits(left.id, right.id));
}
function canonicalizeTask(value) {
  return {
    ...value,
    hiddenRequirementSha256s: sortedUnique(value.hiddenRequirementSha256s),
    hiddenPreferenceSha256s: sortedUnique(value.hiddenPreferenceSha256s),
    outcomes: canonicalizeBindings(value.outcomes),
    scenarios: canonicalizeBindings(value.scenarios),
    verifierRefs: sortedUnique(value.verifierRefs)
  };
}
function fingerprintProductFactoryVerifierRefs(refs) {
  return hashProductFactoryBenchmarkPayload({
    schemaVersion: "product-factory-verifier-refs/v1",
    refs: sortedUnique(refs)
  });
}
function assertTask(value) {
  if (EXPECTED_ENVIRONMENT_BY_LANE[value.lane] !== value.expectedEnvironmentKind) {
    fail3("BENCHMARK_BINDING_INVALID");
  }
}
function parseProductFactoryBenchmarkTask(input) {
  const value = parseWith(ProductFactoryBenchmarkTaskSchema, input);
  assertTask(value);
  const canonical2 = canonicalizeTask(value);
  if (!exact(value, { ...value, ...canonical2 }))
    fail3("BENCHMARK_BINDING_INVALID");
  if (value.verifierFingerprint !== fingerprintProductFactoryVerifierRefs(value.verifierRefs) || value.taskSha256 !== hashProductFactoryBenchmarkPayload(without(value, "taskSha256"))) {
    fail3("BENCHMARK_DIGEST_INVALID");
  }
  return value;
}
var SuiteInputSchema = z.object({
  suiteId: SafeIdSchema,
  suiteVersion: VersionSchema,
  thresholdsStatus: z.literal("unfrozen"),
  tasks: z.array(ProductFactoryBenchmarkTaskSchema).min(4).max(MAX_ITEMS)
}).strict();
var ProductFactoryBenchmarkSuiteSchema = SuiteInputSchema.extend({
  schemaVersion: z.literal(PRODUCT_FACTORY_BENCHMARK_SUITE_SCHEMA_VERSION),
  suiteSha256: HashSchema
}).strict();
function canonicalizeSuite(value) {
  const tasks = value.tasks.map(parseProductFactoryBenchmarkTask).sort((left, right) => compareCodeUnits(left.taskId, right.taskId));
  if (new Set(tasks.map(({ taskId }) => taskId)).size !== tasks.length) {
    fail3("BENCHMARK_BINDING_INVALID");
  }
  for (const lane of PRODUCT_FACTORY_BENCHMARK_LANES) {
    if (!tasks.some((task) => task.lane === lane)) fail3("BENCHMARK_INCOMPLETE");
  }
  if (new Set(tasks.map(({ evidenceAuthority }) => evidenceAuthority)).size !== 1 || tasks.reduce((sum, task) => sum + task.attemptCount, 0) > MAX_ITEMS) {
    fail3("BENCHMARK_BINDING_INVALID");
  }
  return { ...value, tasks };
}
function parseProductFactoryBenchmarkSuite(input) {
  const value = parseWith(ProductFactoryBenchmarkSuiteSchema, input);
  const canonical2 = canonicalizeSuite(value);
  if (!exact(value, { ...value, ...canonical2 }))
    fail3("BENCHMARK_BINDING_INVALID");
  if (value.suiteSha256 !== hashProductFactoryBenchmarkPayload(without(value, "suiteSha256"))) {
    fail3("BENCHMARK_DIGEST_INVALID");
  }
  return value;
}
var UsageReceiptSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("reported"),
    inputUncachedTokens: CountSchema,
    inputCachedTokens: CountSchema,
    outputTokens: CountSchema,
    costUsd: z.number().finite().min(0)
  }).strict(),
  z.object({
    status: z.literal("unavailable"),
    reasonCode: z.enum([
      "provider-usage-unavailable",
      "provider-usage-redacted",
      "provider-usage-unsupported"
    ])
  }).strict()
]);
var ProductOutcomeBindingSchema = z.object({
  resultSha256: HashSchema,
  resultStatus: OutcomeStatusSchema,
  judgmentSha256: HashSchema,
  judgmentStatus: OutcomeStatusSchema,
  claimedSuccess: z.boolean()
}).strict();
var EnvironmentBindingSchema = z.object({
  kind: EnvironmentKindSchema,
  environmentFingerprint: HashSchema,
  capabilityFingerprint: HashSchema,
  capabilityStatus: EnvironmentStatusSchema,
  status: EnvironmentStatusSchema
}).strict();
var LaneReceiptInputSchema = z.object({
  experimentId: SafeIdSchema,
  runId: SafeIdSchema,
  taskId: SafeIdSchema,
  taskSha256: HashSchema,
  attemptIndex: PositiveCountSchema,
  lane: LaneSchema,
  suiteSha256: HashSchema,
  verifierFingerprint: HashSchema,
  providerTopologyFingerprint: HashSchema,
  settingsFingerprint: HashSchema,
  evidenceAuthority: EvidenceAuthoritySchema,
  productOutcome: ProductOutcomeBindingSchema,
  environment: EnvironmentBindingSchema,
  protectedSafetyStatus: EnvironmentStatusSchema,
  userInterventionCount: CountSchema,
  clarificationCount: CountSchema,
  retryCount: CountSchema,
  wallTimeMs: CountSchema,
  usage: UsageReceiptSchema,
  limitationCodes: z.array(StableCodeSchema).max(MAX_ITEMS),
  productionEvidence: z.enum(["verified", "missing", "test-only"])
}).strict();
var ProductFactoryLaneReceiptSchema = LaneReceiptInputSchema.extend({
  schemaVersion: z.literal(PRODUCT_FACTORY_LANE_RECEIPT_SCHEMA_VERSION),
  falseSuccess: z.boolean(),
  receiptSha256: HashSchema
}).strict();
function structuralFalseSuccess(value) {
  return value.productOutcome.claimedSuccess && value.productOutcome.judgmentStatus !== "PASS";
}
function canonicalizeReceipt(value) {
  return { ...value, limitationCodes: sortedUnique(value.limitationCodes) };
}
function assertReceipt(value) {
  if (EXPECTED_ENVIRONMENT_BY_LANE[value.lane] !== value.environment.kind) {
    fail3("BENCHMARK_BINDING_INVALID");
  }
  if (value.evidenceAuthority === "test-only" && value.productionEvidence !== "test-only" || value.evidenceAuthority === "production" && value.productionEvidence === "test-only" || !value.productOutcome.claimedSuccess && value.productOutcome.resultStatus === "PASS" && value.productOutcome.judgmentStatus === "PASS" || value.productOutcome.judgmentStatus === "PASS" && value.productOutcome.resultStatus !== "PASS") {
    fail3("BENCHMARK_BINDING_INVALID");
  }
}
function parseProductFactoryLaneReceipt(input) {
  const value = parseWith(ProductFactoryLaneReceiptSchema, input);
  assertReceipt(value);
  const canonical2 = canonicalizeReceipt(value);
  if (!exact(value, { ...value, ...canonical2 }) || value.falseSuccess !== structuralFalseSuccess(value)) {
    fail3("BENCHMARK_BINDING_INVALID");
  }
  if (value.receiptSha256 !== hashProductFactoryBenchmarkPayload(without(value, "receiptSha256"))) {
    fail3("BENCHMARK_DIGEST_INVALID");
  }
  return value;
}
z.object({
  resultSha256: HashSchema,
  resultStatus: OutcomeStatusSchema,
  judgmentSha256: HashSchema,
  judgmentStatus: OutcomeStatusSchema,
  evidenceAuthority: EvidenceAuthoritySchema,
  environmentFingerprint: HashSchema,
  capabilityFingerprint: HashSchema,
  environmentStatus: EnvironmentStatusSchema,
  environmentCapabilityStatus: EnvironmentStatusSchema,
  protectedSafetyStatus: EnvironmentStatusSchema,
  productionVerified: z.boolean()
}).strict();
var VerificationReasonSchema = z.enum([
  "evidence-verifier-unavailable",
  "evidence-verifier-rejected",
  "evidence-verifier-failed",
  "evidence-binding-mismatch"
]);
var ReceiptVerificationSchema = z.object({
  receiptSha256: HashSchema,
  status: z.enum(["VERIFIED", "UNVERIFIED"]),
  reasonCode: VerificationReasonSchema.nullable(),
  authoritativeEvidenceSha256: HashSchema.nullable(),
  resultStatus: OutcomeStatusSchema,
  judgmentStatus: OutcomeStatusSchema,
  evidenceAuthority: EvidenceAuthoritySchema.nullable(),
  environmentStatus: EnvironmentStatusSchema,
  environmentCapabilityStatus: EnvironmentStatusSchema,
  productOutcomeSuccess: z.boolean(),
  falseSuccess: z.boolean().nullable(),
  productionVerified: z.boolean(),
  protectedSafetyStatus: EnvironmentStatusSchema
}).strict();
function unverifiedReceipt(receipt, reasonCode) {
  return {
    receiptSha256: receipt.receiptSha256,
    status: "UNVERIFIED",
    reasonCode,
    authoritativeEvidenceSha256: null,
    resultStatus: "UNVERIFIED",
    judgmentStatus: "UNVERIFIED",
    evidenceAuthority: null,
    environmentStatus: "UNVERIFIED",
    environmentCapabilityStatus: "UNVERIFIED",
    productOutcomeSuccess: false,
    falseSuccess: null,
    productionVerified: false,
    protectedSafetyStatus: "UNVERIFIED"
  };
}
async function verifyReceipt(receipt, verifier) {
  return unverifiedReceipt(receipt, "evidence-verifier-unavailable");
}
var AggregateMetricSchema = z.object({
  attemptCount: CountSchema,
  outcomeEvidenceComplete: z.boolean(),
  productOutcomeSuccessCount: CountSchema,
  productOutcomeSuccessRate: RateSchema,
  falseSuccessCount: CountSchema,
  falseSuccessRate: RateSchema,
  protectedSafetyFailureCount: CountSchema,
  protectedSafetyUnverifiedCount: CountSchema,
  userInterventionCount: CountSchema,
  clarificationCount: CountSchema,
  retryCount: CountSchema,
  wallTimeMs: CountSchema,
  usageComplete: z.boolean(),
  inputUncachedTokens: CountSchema.nullable(),
  inputCachedTokens: CountSchema.nullable(),
  outputTokens: CountSchema.nullable(),
  totalTokens: CountSchema.nullable(),
  costUsd: z.number().finite().min(0).nullable()
}).strict();
var LaneMetricsSchema = z.object({
  intent: AggregateMetricSchema,
  web: AggregateMetricSchema,
  android: AggregateMetricSchema,
  game: AggregateMetricSchema
}).strict();
var ReportMetricsSchema = z.object({ global: AggregateMetricSchema, byLane: LaneMetricsSchema }).strict();
var ReportInputSchema = z.object({
  experimentId: SafeIdSchema,
  role: z.enum(["baseline", "candidate"]),
  baselineReportSha256: HashSchema.nullable(),
  runId: SafeIdSchema,
  startedAt: TimestampSchema,
  endedAt: TimestampSchema,
  suiteId: SafeIdSchema,
  suiteVersion: VersionSchema,
  suiteSha256: HashSchema,
  taskSetFingerprint: HashSchema,
  attemptSetFingerprint: HashSchema,
  verifierSuiteFingerprint: HashSchema,
  providerTopologyFingerprint: HashSchema,
  settingsFingerprint: HashSchema,
  environmentCapabilityFingerprints: z.array(HashSchema).min(1).max(MAX_ITEMS),
  evidenceAuthority: EvidenceAuthoritySchema,
  complete: z.literal(true),
  lanes: z.array(LaneSchema).length(PRODUCT_FACTORY_BENCHMARK_LANES.length),
  thresholdsStatus: z.literal("unfrozen"),
  status: z.enum(["PASS", "FAIL", "UNVERIFIED"]),
  productionEvidence: z.enum(["verified", "missing", "test-only"]),
  metrics: ReportMetricsSchema,
  receipts: z.array(ProductFactoryLaneReceiptSchema).min(4).max(MAX_ITEMS),
  receiptVerifications: z.array(ReceiptVerificationSchema).min(4).max(MAX_ITEMS)
}).strict();
var ProductFactoryBenchmarkReportSchema = ReportInputSchema.extend({
  schemaVersion: z.literal(PRODUCT_FACTORY_BENCHMARK_REPORT_SCHEMA_VERSION),
  reportSha256: HashSchema
}).strict();
var ReportRequestSchema = z.object({
  suite: z.unknown(),
  experimentId: SafeIdSchema,
  role: z.enum(["baseline", "candidate"]),
  baselineReportSha256: HashSchema.nullable(),
  runId: SafeIdSchema,
  startedAt: TimestampSchema,
  endedAt: TimestampSchema,
  providerTopologyFingerprint: HashSchema,
  settingsFingerprint: HashSchema,
  evidenceAuthority: EvidenceAuthoritySchema,
  receipts: z.array(z.unknown()).min(4).max(MAX_ITEMS)
}).strict();
function expectedAttemptKeys(suite) {
  return suite.tasks.flatMap(
    ({ taskId, attemptCount }) => Array.from(
      { length: attemptCount },
      (_, index) => `${taskId}:${index + 1}`
    )
  );
}
function taskSetFingerprint(suite) {
  return hashProductFactoryBenchmarkPayload(
    suite.tasks.map(({ taskId, taskSha256, lane, attemptCount }) => ({
      taskId,
      taskSha256,
      lane,
      attemptCount
    }))
  );
}
function verifierSuiteFingerprint(suite) {
  return hashProductFactoryBenchmarkPayload(
    suite.tasks.map(({ taskId, verifierFingerprint: verifierFingerprint2 }) => ({
      taskId,
      verifierFingerprint: verifierFingerprint2
    }))
  );
}
function canonicalizeReceipts(receipts) {
  return [...receipts].sort(
    (left, right) => compareCodeUnits(left.taskId, right.taskId) || left.attemptIndex - right.attemptIndex
  );
}
function assertReceiptSet(suite, receipts, input) {
  const actual = receipts.map(
    ({ taskId, attemptIndex }) => `${taskId}:${attemptIndex}`
  );
  if (new Set(actual).size !== actual.length || !exact(
    [...actual].sort(compareCodeUnits),
    expectedAttemptKeys(suite).sort(compareCodeUnits)
  )) {
    fail3("BENCHMARK_INCOMPLETE");
  }
  const tasks = new Map(suite.tasks.map((task) => [task.taskId, task]));
  for (const receipt of receipts) {
    const task = tasks.get(receipt.taskId);
    if (!task || receipt.experimentId !== input.experimentId || receipt.runId !== input.runId || receipt.taskSha256 !== task.taskSha256 || receipt.lane !== task.lane || receipt.suiteSha256 !== suite.suiteSha256 || receipt.verifierFingerprint !== task.verifierFingerprint || receipt.providerTopologyFingerprint !== input.providerTopologyFingerprint || receipt.settingsFingerprint !== input.settingsFingerprint || receipt.evidenceAuthority !== input.evidenceAuthority || receipt.evidenceAuthority !== task.evidenceAuthority || receipt.environment.kind !== task.expectedEnvironmentKind) {
      fail3("BENCHMARK_BINDING_INVALID");
    }
  }
}
function aggregate(receipts, verifications) {
  const verificationByReceipt = new Map(
    verifications.map((verification) => [
      verification.receiptSha256,
      verification
    ])
  );
  const selected = receipts.map((receipt) => {
    const verification = verificationByReceipt.get(receipt.receiptSha256);
    if (!verification) fail3("BENCHMARK_BINDING_INVALID");
    return { receipt, verification };
  });
  const attemptCount = selected.length;
  const productOutcomeSuccessCount = selected.filter(
    ({ verification }) => verification.productOutcomeSuccess
  ).length;
  const falseSuccessCount = selected.filter(
    ({ verification }) => verification.falseSuccess === true
  ).length;
  const outcomeEvidenceComplete = selected.every(
    ({ verification }) => verification.status === "VERIFIED"
  );
  const usageComplete = selected.every(
    ({ receipt }) => receipt.usage.status === "reported"
  );
  const reported = usageComplete ? selected.map(({ receipt }) => {
    if (receipt.usage.status !== "reported")
      fail3("BENCHMARK_BINDING_INVALID");
    return receipt.usage;
  }) : [];
  const inputUncachedTokens = usageComplete ? reported.reduce((sum, usage) => sum + usage.inputUncachedTokens, 0) : null;
  const inputCachedTokens = usageComplete ? reported.reduce((sum, usage) => sum + usage.inputCachedTokens, 0) : null;
  const outputTokens = usageComplete ? reported.reduce((sum, usage) => sum + usage.outputTokens, 0) : null;
  return {
    attemptCount,
    outcomeEvidenceComplete,
    productOutcomeSuccessCount,
    productOutcomeSuccessRate: attemptCount === 0 ? 0 : productOutcomeSuccessCount / attemptCount,
    falseSuccessCount,
    falseSuccessRate: attemptCount === 0 ? 0 : falseSuccessCount / attemptCount,
    protectedSafetyFailureCount: selected.filter(
      ({ verification }) => verification.protectedSafetyStatus === "FAIL"
    ).length,
    protectedSafetyUnverifiedCount: selected.filter(
      ({ verification }) => verification.protectedSafetyStatus === "UNVERIFIED"
    ).length,
    userInterventionCount: selected.reduce(
      (sum, { receipt }) => sum + receipt.userInterventionCount,
      0
    ),
    clarificationCount: selected.reduce(
      (sum, { receipt }) => sum + receipt.clarificationCount,
      0
    ),
    retryCount: selected.reduce(
      (sum, { receipt }) => sum + receipt.retryCount,
      0
    ),
    wallTimeMs: selected.reduce(
      (sum, { receipt }) => sum + receipt.wallTimeMs,
      0
    ),
    usageComplete,
    inputUncachedTokens,
    inputCachedTokens,
    outputTokens,
    totalTokens: inputUncachedTokens === null || inputCachedTokens === null || outputTokens === null ? null : inputUncachedTokens + inputCachedTokens + outputTokens,
    costUsd: usageComplete ? Number(
      reported.reduce((sum, usage) => sum + usage.costUsd, 0).toFixed(12)
    ) : null
  };
}
function deriveMetrics(receipts, verifications) {
  const lane = (name) => {
    const laneReceipts = receipts.filter((receipt) => receipt.lane === name);
    const hashes = new Set(
      laneReceipts.map((receipt) => receipt.receiptSha256)
    );
    return aggregate(
      laneReceipts,
      verifications.filter(
        (verification) => hashes.has(verification.receiptSha256)
      )
    );
  };
  return {
    global: aggregate(receipts, verifications),
    byLane: {
      intent: lane("intent"),
      web: lane("web"),
      android: lane("android"),
      game: lane("game")
    }
  };
}
function deriveReportStatus(verifications) {
  if (verifications.some((verification) => verification.status === "UNVERIFIED")) {
    return "UNVERIFIED";
  }
  if (verifications.some(
    (verification) => verification.falseSuccess === true || verification.protectedSafetyStatus === "FAIL" || verification.resultStatus === "FAIL" || verification.judgmentStatus === "FAIL" || verification.environmentStatus === "FAIL" || verification.environmentCapabilityStatus === "FAIL"
  )) {
    return "FAIL";
  }
  const productionPass = verifications.every(
    (verification) => verification.productOutcomeSuccess && verification.productionVerified && verification.evidenceAuthority === "production" && verification.protectedSafetyStatus === "PASS" && verification.environmentStatus === "PASS" && verification.environmentCapabilityStatus === "PASS"
  );
  return productionPass ? "PASS" : "UNVERIFIED";
}
async function buildReport(request, verifier) {
  const suite = parseProductFactoryBenchmarkSuite(request.suite);
  const receipts = canonicalizeReceipts(
    request.receipts.map(parseProductFactoryLaneReceipt)
  );
  if (Date.parse(request.endedAt) < Date.parse(request.startedAt) || request.role === "baseline" && request.baselineReportSha256 !== null || request.role === "candidate" && request.baselineReportSha256 === null) {
    fail3("BENCHMARK_BINDING_INVALID");
  }
  assertReceiptSet(suite, receipts, request);
  const receiptVerifications = await Promise.all(
    receipts.map((receipt) => verifyReceipt(receipt))
  );
  const metrics = deriveMetrics(receipts, receiptVerifications);
  const allEvidenceVerified = receiptVerifications.every(
    (verification) => verification.status === "VERIFIED"
  );
  const productionEvidence = allEvidenceVerified && receiptVerifications.every(
    (verification) => verification.evidenceAuthority === "production" && verification.productionVerified
  ) ? "verified" : allEvidenceVerified && receiptVerifications.every(
    (verification) => verification.evidenceAuthority === "test-only"
  ) ? "test-only" : "missing";
  const hashable = {
    schemaVersion: PRODUCT_FACTORY_BENCHMARK_REPORT_SCHEMA_VERSION,
    experimentId: request.experimentId,
    role: request.role,
    baselineReportSha256: request.baselineReportSha256,
    runId: request.runId,
    startedAt: request.startedAt,
    endedAt: request.endedAt,
    suiteId: suite.suiteId,
    suiteVersion: suite.suiteVersion,
    suiteSha256: suite.suiteSha256,
    taskSetFingerprint: taskSetFingerprint(suite),
    attemptSetFingerprint: hashProductFactoryBenchmarkPayload(
      expectedAttemptKeys(suite)
    ),
    verifierSuiteFingerprint: verifierSuiteFingerprint(suite),
    providerTopologyFingerprint: request.providerTopologyFingerprint,
    settingsFingerprint: request.settingsFingerprint,
    environmentCapabilityFingerprints: sortedSet(
      receipts.map(({ environment }) => environment.capabilityFingerprint)
    ),
    evidenceAuthority: request.evidenceAuthority,
    complete: true,
    lanes: [...PRODUCT_FACTORY_BENCHMARK_LANES].sort(compareCodeUnits),
    thresholdsStatus: "unfrozen",
    status: deriveReportStatus(receiptVerifications),
    productionEvidence,
    metrics,
    receipts,
    receiptVerifications
  };
  return parseWith(ProductFactoryBenchmarkReportSchema, {
    ...hashable,
    reportSha256: hashProductFactoryBenchmarkPayload(hashable)
  });
}
async function createProductFactoryBenchmarkReport(input, verifier) {
  const request = parseWith(ReportRequestSchema, input);
  return buildReport(request);
}
async function parseProductFactoryBenchmarkReport(input, suite, verifier) {
  const value = parseWith(ProductFactoryBenchmarkReportSchema, input);
  const expected = await buildReport(
    parseWith(ReportRequestSchema, {
      suite,
      experimentId: value.experimentId,
      role: value.role,
      baselineReportSha256: value.baselineReportSha256,
      runId: value.runId,
      startedAt: value.startedAt,
      endedAt: value.endedAt,
      providerTopologyFingerprint: value.providerTopologyFingerprint,
      settingsFingerprint: value.settingsFingerprint,
      evidenceAuthority: value.evidenceAuthority,
      receipts: value.receipts
    }));
  if (!exact(value, expected)) fail3("BENCHMARK_BINDING_INVALID");
  return value;
}
var FrozenThresholdLimitsSchema = z.object({
  minimumProductOutcomeSuccessRate: RateSchema,
  maximumFalseSuccessRate: RateSchema,
  maximumUserInterventionsPerAttempt: z.number().finite().min(0),
  maximumClarificationsPerAttempt: z.number().finite().min(0),
  maximumRetriesPerAttempt: z.number().finite().min(0),
  maximumWallTimeMs: CountSchema,
  maximumTotalTokens: CountSchema,
  maximumCostUsd: z.number().finite().min(0)
}).strict();
var FrozenThresholdInputSchema = z.object({
  experimentId: SafeIdSchema,
  baseline: z.object({
    runId: SafeIdSchema,
    reportSha256: HashSchema,
    endedAt: TimestampSchema,
    metrics: ReportMetricsSchema
  }).strict(),
  frozenAt: TimestampSchema,
  verifierId: SafeIdSchema,
  verifierDigest: HashSchema,
  provenance: z.object({
    sourceRefSha256: HashSchema,
    approvalReceiptSha256: HashSchema
  }).strict(),
  limits: FrozenThresholdLimitsSchema
}).strict();
FrozenThresholdInputSchema.extend({
  schemaVersion: z.literal(PRODUCT_FACTORY_FROZEN_THRESHOLDS_SCHEMA_VERSION),
  thresholdsSha256: HashSchema
}).strict();
var DeltaMetricSchema = z.object({
  productOutcomeSuccessRate: z.number().finite().min(-1).max(1),
  falseSuccessRate: z.number().finite().min(-1).max(1),
  userInterventionCount: z.number().finite(),
  clarificationCount: z.number().finite(),
  retryCount: z.number().finite(),
  wallTimeMs: z.number().finite(),
  totalTokens: z.number().finite().nullable(),
  costUsd: z.number().finite().nullable()
}).strict();
var LaneDeltasSchema = z.object({
  intent: DeltaMetricSchema,
  web: DeltaMetricSchema,
  android: DeltaMetricSchema,
  game: DeltaMetricSchema
}).strict();
var ComparisonDeltasSchema = z.object({ global: DeltaMetricSchema, byLane: LaneDeltasSchema }).strict();
var ThresholdEvaluationSchema = z.object({
  metric: z.enum(PRODUCT_FACTORY_BENCHMARK_METRICS),
  operator: z.enum(["at-least", "at-most"]),
  observed: z.number().finite(),
  threshold: z.number().finite().min(0),
  passed: z.boolean()
}).strict();
var ComparisonInputSchema = z.object({
  pairId: HashSchema,
  experimentId: SafeIdSchema,
  baseline: z.object({ runId: SafeIdSchema, reportSha256: HashSchema }).strict(),
  candidate: z.object({ runId: SafeIdSchema, reportSha256: HashSchema }).strict(),
  suiteSha256: HashSchema,
  verifierSuiteFingerprint: HashSchema,
  providerTopologyFingerprint: HashSchema,
  settingsFingerprint: HashSchema,
  environmentCapabilityFingerprints: z.array(HashSchema).min(1).max(MAX_ITEMS),
  evidenceAuthority: EvidenceAuthoritySchema,
  lanes: z.array(LaneSchema).length(PRODUCT_FACTORY_BENCHMARK_LANES.length),
  deltas: ComparisonDeltasSchema,
  thresholdsStatus: z.enum([
    "unfrozen",
    "frozen-unverified",
    "frozen-verified"
  ]),
  thresholdsSha256: HashSchema.nullable(),
  thresholdEvaluations: z.array(ThresholdEvaluationSchema).max(PRODUCT_FACTORY_BENCHMARK_METRICS.length),
  protectedGuardrails: z.object({
    safetyPreserved: z.boolean(),
    falseSuccessPreserved: z.boolean()
  }).strict(),
  promotionEligible: z.boolean()
}).strict();
ComparisonInputSchema.extend({
  schemaVersion: z.literal(PRODUCT_FACTORY_PAIRED_COMPARISON_SCHEMA_VERSION),
  pairSha256: HashSchema
}).strict();

// src/bench/product-factory-cli.ts
var SHA256_PATTERN2 = /^[a-f0-9]{64}$/;
var ProductFactoryCliInputError = class extends Error {
  constructor(code2) {
    super(code2);
    this.name = "ProductFactoryCliInputError";
  }
};
function fail4(code2) {
  throw new ProductFactoryCliInputError(code2);
}
function hasText(value) {
  return typeof value === "string" && value.length > 0;
}
function normalizeProductFactoryError(error2) {
  if (error2 instanceof ProductFactoryCliInputError) throw error2;
  throw new ProductFactoryCliInputError("PRODUCT_FACTORY_CLI_INPUT_INVALID");
}
function productFactoryCliErrorCode(error2) {
  return error2 instanceof ProductFactoryCliInputError ? error2.message : "PRODUCT_FACTORY_CLI_INPUT_INVALID";
}
function validateProductFactoryCommandOptions(options) {
  const productMode = options.productReceipts !== void 0;
  const hasProductOnlyOption = options.experimentId !== void 0 || options.variant !== void 0 || options.baselineReport !== void 0;
  if (!productMode) {
    if (hasProductOnlyOption) fail4("PRODUCT_FACTORY_CLI_MODE_REQUIRED");
    return;
  }
  if (!hasText(options.productReceipts))
    fail4("PRODUCT_FACTORY_CLI_RECEIPTS_REQUIRED");
  if (options.run) fail4("PRODUCT_FACTORY_CLI_RUN_CONFLICT");
  if (!hasText(options.experimentId))
    fail4("PRODUCT_FACTORY_CLI_EXPERIMENT_REQUIRED");
  if (options.variant !== "baseline" && options.variant !== "candidate") {
    fail4("PRODUCT_FACTORY_CLI_VARIANT_INVALID");
  }
  if (options.variant === "candidate" && !hasText(options.baselineReport)) {
    fail4("PRODUCT_FACTORY_CLI_BASELINE_REQUIRED");
  }
  if (options.variant === "baseline" && options.baselineReport !== void 0) {
    fail4("PRODUCT_FACTORY_CLI_BASELINE_FORBIDDEN");
  }
}
function readBoundedJsonFile(path) {
  if (!hasText(path)) fail4("PRODUCT_FACTORY_CLI_PATH_INVALID");
  let descriptor;
  try {
    const listed = lstatSync(path);
    if (listed.isSymbolicLink() || !listed.isFile()) {
      fail4("PRODUCT_FACTORY_CLI_PATH_INVALID");
    }
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) fail4("PRODUCT_FACTORY_CLI_PATH_INVALID");
    if (opened.size > PRODUCT_FACTORY_BENCHMARK_MAX_BYTES) {
      fail4("PRODUCT_FACTORY_CLI_SIZE_LIMIT");
    }
    const source = readFileSync(descriptor, "utf8");
    if (Buffer.byteLength(source, "utf8") > PRODUCT_FACTORY_BENCHMARK_MAX_BYTES) {
      fail4("PRODUCT_FACTORY_CLI_SIZE_LIMIT");
    }
    try {
      const parsed = JSON.parse(source);
      hashProductFactoryBenchmarkPayload(parsed);
      return parsed;
    } catch (error2) {
      if (error2 instanceof SyntaxError)
        fail4("PRODUCT_FACTORY_CLI_JSON_INVALID");
      throw error2;
    }
  } catch (error2) {
    if (error2 instanceof ProductFactoryCliInputError) throw error2;
    if (error2 instanceof ProductFactoryBenchmarkValidationError)
      return normalizeProductFactoryError(error2);
    return fail4("PRODUCT_FACTORY_CLI_PATH_INVALID");
  } finally {
    if (descriptor !== void 0) closeSync(descriptor);
  }
}
async function baselineReportSha256(baselineReport, suite, experimentId) {
  if (SHA256_PATTERN2.test(baselineReport)) return baselineReport;
  let parsed;
  try {
    parsed = await parseProductFactoryBenchmarkReport(
      readBoundedJsonFile(baselineReport),
      suite
    );
  } catch (error2) {
    return normalizeProductFactoryError(error2);
  }
  let parsedSuite;
  try {
    parsedSuite = parseProductFactoryBenchmarkSuite(suite);
  } catch (error2) {
    return normalizeProductFactoryError(error2);
  }
  if (parsed.role !== "baseline" || parsed.experimentId !== experimentId || parsed.suiteSha256 !== parsedSuite.suiteSha256) {
    fail4("PRODUCT_FACTORY_CLI_BASELINE_INVALID");
  }
  return parsed.reportSha256;
}
function assertSafeOutputTarget(path) {
  if (!hasText(path)) fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
  const parent = dirname(path);
  try {
    const listedParent = lstatSync(parent);
    if (listedParent.isSymbolicLink() || !listedParent.isDirectory()) {
      fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
    }
    const resolvedParent = realpathSync(parent);
    const realParent = lstatSync(resolvedParent);
    if (realParent.isSymbolicLink() || !realParent.isDirectory()) {
      fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
    }
    try {
      const target = lstatSync(path);
      if (target.isSymbolicLink() || !target.isFile()) {
        fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
      }
    } catch (error2) {
      if (error2 instanceof ProductFactoryCliInputError) throw error2;
      const code2 = error2.code;
      if (code2 !== "ENOENT") fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
    }
  } catch (error2) {
    if (error2 instanceof ProductFactoryCliInputError) throw error2;
    fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
  }
}
function writeProductFactoryReportAtomic(outputPath, report) {
  assertSafeOutputTarget(outputPath);
  const parent = dirname(outputPath);
  const payload = JSON.stringify(report, null, 2);
  const tempPath = `${outputPath}.product-${randomBytes(24).toString("hex")}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(
      tempPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      384
    );
    writeSync(descriptor, payload, void 0, "utf8");
    writeSync(descriptor, "\n", void 0, "utf8");
    const tempStat = fstatSync(descriptor);
    if (!tempStat.isFile()) fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = void 0;
    try {
      if (lstatSync(outputPath).isSymbolicLink()) {
        fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
      }
    } catch (error2) {
      if (error2 instanceof ProductFactoryCliInputError) throw error2;
      if (error2.code !== "ENOENT") {
        fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
      }
    }
    renameSync(tempPath, outputPath);
    const directoryDescriptor = openSync(parent, constants.O_RDONLY);
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } catch (error2) {
    if (error2 instanceof ProductFactoryCliInputError) throw error2;
    fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
  } finally {
    if (descriptor !== void 0) closeSync(descriptor);
    try {
      unlinkSync(tempPath);
    } catch (error2) {
      if (error2.code !== "ENOENT") {
        fail4("PRODUCT_FACTORY_CLI_OUTPUT_INVALID");
      }
    }
  }
}
async function runProductFactoryStructuralIngestion(input) {
  validateProductFactoryCommandOptions({
    productReceipts: input.receiptsPath,
    experimentId: input.experimentId,
    variant: input.variant,
    baselineReport: input.baselineReport,
    run: input.run
  });
  let suite;
  let receipts;
  try {
    suite = readBoundedJsonFile(input.suitePath);
    const receiptsInput = readBoundedJsonFile(input.receiptsPath);
    if (!Array.isArray(receiptsInput) || receiptsInput.length === 0) {
      fail4("PRODUCT_FACTORY_CLI_RECEIPTS_INVALID");
    }
    receipts = receiptsInput.map(parseProductFactoryLaneReceipt);
  } catch (error2) {
    return normalizeProductFactoryError(error2);
  }
  const firstReceipt = receipts[0];
  if (!firstReceipt) fail4("PRODUCT_FACTORY_CLI_RECEIPTS_INVALID");
  const baselineReportSha = input.variant === "candidate" ? await baselineReportSha256(
    input.baselineReport,
    suite,
    input.experimentId
  ) : null;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  let report;
  try {
    report = await createProductFactoryBenchmarkReport({
      suite,
      experimentId: input.experimentId,
      role: input.variant,
      baselineReportSha256: baselineReportSha,
      runId: firstReceipt.runId,
      startedAt: timestamp,
      endedAt: timestamp,
      providerTopologyFingerprint: firstReceipt.providerTopologyFingerprint,
      settingsFingerprint: firstReceipt.settingsFingerprint,
      evidenceAuthority: firstReceipt.evidenceAuthority,
      receipts
    });
  } catch (error2) {
    return normalizeProductFactoryError(error2);
  }
  if (report.status !== "UNVERIFIED" || report.productionEvidence === "verified") {
    fail4("PRODUCT_FACTORY_CLI_TRUST_REQUIRED");
  }
  return { report };
}
var ProviderModelSettingsSchema = z.object({
  provider: z.string(),
  model: z.string(),
  options: z.record(z.unknown()).optional()
});
var BenchmarkTaskSchema = z.object({
  id: z.string(),
  category: z.string(),
  prompt: z.string(),
  providerSettings: ProviderModelSettingsSchema.optional(),
  attempts: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  workspace: z.string().optional(),
  verifierCommands: z.array(z.string().min(1)).min(1)
});
var BenchmarkSuiteSchema = z.object({
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  defaultProviderSettings: ProviderModelSettingsSchema,
  defaultAttempts: z.number().int().positive().default(1),
  defaultTimeoutMs: z.number().int().positive().default(6e4),
  tasks: z.array(BenchmarkTaskSchema).min(1, "Benchmark suite must include at least one task")
}).refine(
  (data) => {
    const ids = data.tasks.map((t) => t.id);
    const uniqueIds = new Set(ids);
    return uniqueIds.size === ids.length;
  },
  {
    message: "Task IDs must be unique within the benchmark suite",
    path: ["tasks"]
  }
);

// src/bench/metrics.ts
function calculateMetrics(taskResults) {
  const totalTasks = taskResults.length;
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      passAt1Count: 0,
      passAtKCount: 0,
      passAt1Rate: 0,
      passAtKRate: 0,
      categories: {}
    };
  }
  let passAt1Count = 0;
  let passAtKCount = 0;
  const categoryTasks = {};
  for (const task of taskResults) {
    if (task.passedAt1) {
      passAt1Count++;
    }
    if (task.passed) {
      passAtKCount++;
    }
    if (!categoryTasks[task.category]) {
      categoryTasks[task.category] = [];
    }
    categoryTasks[task.category].push(task);
  }
  const categories = {};
  for (const [category, tasks] of Object.entries(categoryTasks)) {
    let catPassAt1 = 0;
    let catPassAtK = 0;
    for (const t of tasks) {
      if (t.passedAt1) {
        catPassAt1++;
      }
      if (t.passed) {
        catPassAtK++;
      }
    }
    categories[category] = {
      category,
      totalTasks: tasks.length,
      passAt1Count: catPassAt1,
      passAtKCount: catPassAtK,
      passAt1Rate: tasks.length > 0 ? catPassAt1 / tasks.length : 0,
      passAtKRate: tasks.length > 0 ? catPassAtK / tasks.length : 0
    };
  }
  return {
    totalTasks,
    passAt1Count,
    passAtKCount,
    passAt1Rate: passAt1Count / totalTasks,
    passAtKRate: passAtKCount / totalTasks,
    categories
  };
}

// src/bench/runner.ts
var VERIFIER_VERSION = "1";
function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}
function sha256Canonical(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}
function outputMetadata(text3) {
  return {
    sha256: createHash("sha256").update(text3).digest("hex"),
    bytes: Buffer.byteLength(text3, "utf8")
  };
}
function suiteContractFingerprint(suite) {
  return sha256Canonical({
    version: suite.version,
    name: suite.name,
    description: suite.description,
    defaultAttempts: suite.defaultAttempts,
    defaultTimeoutMs: suite.defaultTimeoutMs,
    tasks: suite.tasks.map(
      ({ providerSettings: _providerSettings, ...task }) => task
    )
  });
}
function verifierFingerprint(suite) {
  return sha256Canonical(
    suite.tasks.map(({ id: id2, verifierCommands }) => ({ id: id2, verifierCommands }))
  );
}
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmpPath, filePath);
}
function parseCommandString(cmdStr) {
  const matches = cmdStr.match(/"[^"]*"|'[^']*'|[^\s"']+/g);
  if (!matches) {
    return { program: cmdStr, args: [] };
  }
  const program = matches[0].replace(/^["']|["']$/g, "");
  const args = matches.slice(1).map((arg) => arg.replace(/^["']|["']$/g, ""));
  return { program, args };
}
var ADAPTERS = {
  agy: async (input, spawnFn) => {
    const contractContent = JSON.stringify(
      {
        contract_version: "1.0",
        task_id: input.taskId,
        task_name: `Benchmark Task ${input.taskId}`,
        acceptance_criteria: [],
        inputs: {
          prompt: input.prompt
        }
      },
      null,
      2
    );
    const instructionsContent = `# Instructions for ${input.taskId}
1. Implement the request in the contract:
${input.prompt}
2. Write DELIVERY.json. Do not commit.
`;
    writeFileSync(
      join(input.workspace, "CONTRACT.json"),
      contractContent,
      "utf8"
    );
    writeFileSync(
      join(input.workspace, "WORKER_INSTRUCTIONS.md"),
      instructionsContent,
      "utf8"
    );
    const args = [
      "--model",
      input.model,
      "--sandbox",
      "--mode",
      "accept-edits",
      "--print",
      "Read WORKER_INSTRUCTIONS.md and CONTRACT.json, execute only the contracted task, run its verification commands, and write DELIVERY.json."
    ];
    const startTime = Date.now();
    return new Promise((resolve16, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawnFn("agy", args, {
        cwd: input.workspace,
        env: {
          ...process.env,
          FORGEWRIGHT_WORKSPACE: realpathSync(input.workspace)
        },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      let timer = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve16({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr
          });
        }, input.timeoutMs);
      }
      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });
      child.on("exit", (code2) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve16({
          exitStatus: code2,
          durationMs: Date.now() - startTime,
          stdout,
          stderr
        });
      });
    });
  },
  codex: async (input, spawnFn) => {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--model",
      input.model,
      "--sandbox",
      "workspace-write",
      "--ephemeral",
      input.prompt
    ];
    const startTime = Date.now();
    return new Promise((resolve16, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawnFn("codex", args, {
        cwd: input.workspace,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      let timer = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve16({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr
          });
        }, input.timeoutMs);
      }
      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });
      child.on("exit", (code2) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve16({
          exitStatus: code2,
          durationMs: Date.now() - startTime,
          stdout,
          stderr
        });
      });
    });
  },
  gemini: async (input, spawnFn) => {
    const args = ["-m", input.model, "-y", "-p", input.prompt];
    const startTime = Date.now();
    return new Promise((resolve16, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawnFn("gemini", args, {
        cwd: input.workspace,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      let timer = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve16({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr
          });
        }, input.timeoutMs);
      }
      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });
      child.on("exit", (code2) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve16({
          exitStatus: code2,
          durationMs: Date.now() - startTime,
          stdout,
          stderr
        });
      });
    });
  }
};
async function runVerifierCommand(cmdStr, workspace, spawnFn) {
  const { program, args } = parseCommandString(cmdStr);
  return new Promise((resolve16) => {
    let stdout = "";
    let stderr = "";
    const child = spawnFn(program, args, {
      cwd: workspace,
      shell: false
    });
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (err) => {
      const stdoutMeta = outputMetadata(stdout);
      const stderrMeta = outputMetadata(
        stderr + (stderr ? "\n" : "") + err.message
      );
      resolve16({
        command: cmdStr,
        exitCode: null,
        stdoutSha256: stdoutMeta.sha256,
        stdoutBytes: stdoutMeta.bytes,
        stderrSha256: stderrMeta.sha256,
        stderrBytes: stderrMeta.bytes,
        passed: false
      });
    });
    child.on("exit", (code2) => {
      const stdoutMeta = outputMetadata(stdout);
      const stderrMeta = outputMetadata(stderr);
      resolve16({
        command: cmdStr,
        exitCode: code2,
        stdoutSha256: stdoutMeta.sha256,
        stdoutBytes: stdoutMeta.bytes,
        stderrSha256: stderrMeta.sha256,
        stderrBytes: stderrMeta.bytes,
        passed: code2 === 0
      });
    });
  });
}
function validateUsageValue(usage) {
  if (usage.status === "unavailable") {
    if (typeof usage.reason !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(usage.reason)) {
      throw new Error(
        "Provider usage unavailable receipt requires a safe reason code"
      );
    }
    return;
  }
  for (const [name, value] of Object.entries({
    input_uncached_tokens: usage.input_uncached_tokens,
    input_cached_tokens: usage.input_cached_tokens,
    output_tokens: usage.output_tokens
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(
        `Provider usage ${name} must be a non-negative safe integer`
      );
    }
  }
  if (!Number.isFinite(usage.cost_usd) || usage.cost_usd < 0) {
    throw new Error(
      "Provider usage cost_usd must be a non-negative finite number"
    );
  }
  if (!Number.isFinite(usage.latency_ms) || usage.latency_ms < 0) {
    throw new Error(
      "Provider usage latency_ms must be a non-negative finite number"
    );
  }
}
function bindUsageReceipt(observation, input) {
  if (observation.version !== "1") {
    throw new Error("Provider usage receipt version mismatch");
  }
  if (observation.provider !== input.provider) {
    throw new Error("Provider usage provider mismatch");
  }
  if (observation.model !== input.model) {
    throw new Error("Provider usage model mismatch");
  }
  if (observation.resolved_snapshot_sha256 !== input.resolved_snapshot_sha256) {
    throw new Error("Provider usage resolved snapshot mismatch");
  }
  validateUsageValue(observation.usage);
  const usage = observation.usage.status === "reported" ? {
    status: "reported",
    input_uncached_tokens: observation.usage.input_uncached_tokens,
    input_cached_tokens: observation.usage.input_cached_tokens,
    output_tokens: observation.usage.output_tokens,
    cost_usd: observation.usage.cost_usd,
    latency_ms: observation.usage.latency_ms
  } : { status: "unavailable", reason: observation.usage.reason };
  return {
    version: "1",
    provider: observation.provider,
    model: observation.model,
    resolved_snapshot_sha256: observation.resolved_snapshot_sha256,
    usage,
    task_id: input.task_id,
    attempt_index: input.attempt_index,
    suite_sha256: input.suite_sha256,
    verifier_sha256: input.verifier_sha256,
    provider_topology_sha256: input.provider_topology_sha256
  };
}
async function runBenchmarkSuite(suitePath, options) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs);
  const absoluteSuitePath = resolve(suitePath);
  const suiteDir = dirname(absoluteSuitePath);
  if (!existsSync(absoluteSuitePath)) {
    throw new Error(`Suite file not found: ${suitePath}`);
  }
  const rawSuite = JSON.parse(readFileSync(absoluteSuitePath, "utf8"));
  const parsedSuite = BenchmarkSuiteSchema.parse(rawSuite);
  let plan = `Benchmark Suite: ${parsedSuite.name} (v${parsedSuite.version})
`;
  plan += `Default Settings: Provider=${parsedSuite.defaultProviderSettings.provider}, Model=${parsedSuite.defaultProviderSettings.model}, Attempts=${parsedSuite.defaultAttempts}, Timeout=${parsedSuite.defaultTimeoutMs}ms
`;
  plan += `Tasks to run:
`;
  const tasksToRun = parsedSuite.tasks.map((task) => {
    const provider = task.providerSettings?.provider ?? parsedSuite.defaultProviderSettings.provider;
    const model = task.providerSettings?.model ?? parsedSuite.defaultProviderSettings.model;
    const attempts = task.attempts ?? parsedSuite.defaultAttempts;
    const timeoutMs = task.timeoutMs ?? parsedSuite.defaultTimeoutMs;
    const resolvedWorkspace = task.workspace ? resolve(suiteDir, task.workspace) : "";
    plan += ` - Task ID: ${task.id}
`;
    plan += `   Category: ${task.category}
`;
    plan += `   Provider: ${provider}, Model: ${model}
`;
    plan += `   Attempts: ${attempts}, Timeout: ${timeoutMs}ms
`;
    plan += `   Workspace: ${resolvedWorkspace || "None (current directory)"}
`;
    plan += `   Verifier commands: ${task.verifierCommands.join(", ") || "None"}
`;
    return {
      task,
      provider,
      model,
      attempts,
      timeoutMs,
      resolvedWorkspace
    };
  });
  const suiteFingerprint = suiteContractFingerprint(parsedSuite);
  const verifierSha256 = verifierFingerprint(parsedSuite);
  const providerTopologySha256 = sha256Canonical(
    tasksToRun.map(({ task, provider }) => ({ task_id: task.id, provider }))
  );
  const resolvedSnapshotSha256 = sha256Canonical(
    tasksToRun.map(({ task, provider, model }) => ({
      task_id: task.id,
      provider,
      model,
      settings_sha256: sha256Canonical(
        task.providerSettings ?? parsedSuite.defaultProviderSettings
      )
    }))
  );
  const providers = [...new Set(tasksToRun.map(({ provider }) => provider))];
  const models = [...new Set(tasksToRun.map(({ model }) => model))];
  const reportProvider = providers.length === 1 ? providers[0] : "mixed";
  const reportModel = models.length === 1 ? models[0] : "mixed";
  if (!options.run) {
    return { plan };
  }
  const spawnFn = options.spawnFn ?? spawn;
  const taskResults = [];
  let totalAttemptsRun = 0;
  for (const {
    task,
    provider,
    model,
    attempts,
    timeoutMs,
    resolvedWorkspace
  } of tasksToRun) {
    if (task.workspace) {
      if (!existsSync(resolvedWorkspace) || !statSync(resolvedWorkspace).isDirectory()) {
        throw new Error(
          `Workspace for task ${task.id} must exist and be a directory: ${task.workspace}`
        );
      }
    }
    const adapter = ADAPTERS[provider];
    if (!adapter) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    const attemptResults = [];
    for (let k = 1; k <= attempts; k++) {
      let attemptWorkspace = resolvedWorkspace;
      let cleanupFn = () => {
      };
      const projectTmpDir = join(tmpdir(), "forgewright-bench");
      mkdirSync(projectTmpDir, { recursive: true });
      if (resolvedWorkspace && existsSync(resolvedWorkspace)) {
        const tempBase = join(projectTmpDir, `forge-bench-${task.id}-`);
        attemptWorkspace = mkdtempSync(tempBase);
        cpSync(resolvedWorkspace, attemptWorkspace, { recursive: true });
        cleanupFn = () => {
          try {
            rmSync(attemptWorkspace, { recursive: true, force: true });
          } catch (e) {
          }
        };
      } else {
        const tempBase = join(projectTmpDir, `forge-bench-empty-${task.id}-`);
        attemptWorkspace = mkdtempSync(tempBase);
        cleanupFn = () => {
          try {
            rmSync(attemptWorkspace, { recursive: true, force: true });
          } catch (e) {
          }
        };
      }
      totalAttemptsRun++;
      let runResult;
      try {
        runResult = await adapter(
          {
            taskId: task.id,
            prompt: task.prompt,
            model,
            workspace: attemptWorkspace,
            timeoutMs
          },
          spawnFn
        );
      } catch (err) {
        runResult = {
          exitStatus: null,
          durationMs: 0,
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err)
        };
      }
      const verifierResults = [];
      let allVerifiersPassed = task.verifierCommands.length > 0;
      for (const cmd of task.verifierCommands) {
        const res = await runVerifierCommand(cmd, attemptWorkspace, spawnFn);
        verifierResults.push(res);
        if (!res.passed) {
          allVerifiersPassed = false;
        }
      }
      const usageInput = {
        provider,
        model,
        resolved_snapshot_sha256: resolvedSnapshotSha256,
        suite_sha256: suiteFingerprint,
        verifier_sha256: verifierSha256,
        provider_topology_sha256: providerTopologySha256,
        task_id: task.id,
        attempt_index: k,
        adapter_duration_ms: runResult.durationMs,
        verifier_passed: runResult.exitStatus === 0 && allVerifiersPassed
      };
      const usageObservation = options.usageAdapter ? await options.usageAdapter(usageInput) : {
        version: "1",
        provider,
        model,
        resolved_snapshot_sha256: resolvedSnapshotSha256,
        usage: { status: "unavailable", reason: "adapter_unavailable" }
      };
      const usageReceipt = bindUsageReceipt(usageObservation, usageInput);
      const stdoutMeta = outputMetadata(runResult.stdout);
      const stderrMeta = outputMetadata(runResult.stderr);
      attemptResults.push({
        attemptIndex: k,
        durationMs: runResult.durationMs,
        exitStatus: runResult.exitStatus,
        verifierResults,
        passed: runResult.exitStatus === 0 && allVerifiersPassed,
        provider,
        model,
        taskId: task.id,
        stdoutSha256: stdoutMeta.sha256,
        stdoutBytes: stdoutMeta.bytes,
        stderrSha256: stderrMeta.sha256,
        stderrBytes: stderrMeta.bytes,
        usageReceipt
      });
      cleanupFn();
    }
    const passedAt1 = attemptResults.length > 0 && attemptResults[0].passed;
    const passed = attemptResults.some((r) => r.passed);
    taskResults.push({
      taskId: task.id,
      category: task.category,
      attempts: attemptResults,
      passed,
      passedAt1
    });
  }
  const summary = calculateMetrics(taskResults);
  const endedAtMs = Date.now();
  const endedAt = new Date(endedAtMs);
  const e2eWallMs = endedAtMs - startedAtMs;
  const usageReceipts = taskResults.flatMap(
    (task) => task.attempts.flatMap(
      (attempt) => attempt.usageReceipt ? [attempt.usageReceipt] : []
    )
  );
  const reportedUsage = usageReceipts.filter(
    (receipt) => receipt.usage.status === "reported"
  );
  const usageReported = usageReceipts.length === totalAttemptsRun && reportedUsage.length === totalAttemptsRun;
  const usageUnavailableCount = usageReceipts.length - reportedUsage.length;
  const totalReported = (key) => usageReported ? reportedUsage.reduce(
    (total, receipt) => total + Number(receipt.usage[key]),
    0
  ) : null;
  const report = {
    mode: "live",
    suiteName: parsedSuite.name,
    suiteVersion: parsedSuite.version,
    timestamp: endedAt.toISOString(),
    provider: reportProvider,
    model: reportModel,
    defaultAttempts: parsedSuite.defaultAttempts,
    totalTasks: parsedSuite.tasks.length,
    verifierVersion: VERIFIER_VERSION,
    suiteFingerprint,
    verifierFingerprint: verifierSha256,
    measurementRecord: {
      version: "1",
      run_id: randomUUID(),
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      e2e_wall_ms: e2eWallMs,
      provider: reportProvider,
      model: reportModel,
      suite_sha256: suiteFingerprint,
      verifier_sha256: verifierSha256,
      resolved_snapshot_sha256: resolvedSnapshotSha256,
      provider_topology_sha256: providerTopologySha256,
      usage_source: usageReported ? "reported" : "unavailable",
      usage_receipt_count: usageReceipts.length,
      usage_reported_count: reportedUsage.length,
      usage_unavailable_count: usageUnavailableCount,
      input_uncached_tokens: totalReported("input_uncached_tokens"),
      input_cached_tokens: totalReported("input_cached_tokens"),
      output_tokens: totalReported("output_tokens"),
      cost_usd: usageReported ? Number(totalReported("cost_usd").toFixed(12)) : null,
      provider_latency_ms: totalReported("latency_ms"),
      critical_path_ms: e2eWallMs,
      critical_path_unverified: true,
      production_evidence: "missing"
    },
    totalAttemptsRun,
    summary,
    tasks: taskResults
  };
  return { report, plan };
}

// src/commands/bench.ts
function registerBenchCommand(program) {
  program.command("bench").description("Run agent benchmark suite").argument("<suite-path>", "Path to benchmark suite JSON file").option("--run", "Perform a live benchmark run (default is dry-run)").option("-o, --output <path>", "Path to write JSON results report").option(
    "--product-receipts <path>",
    "Structurally ingest Product Factory lane receipts; requires product options"
  ).option(
    "--experiment-id <id>",
    "Product Factory experiment identifier (only with --product-receipts)"
  ).option(
    "--variant <baseline|candidate>",
    "Product Factory report variant (only with --product-receipts)"
  ).option(
    "--baseline-report <path-or-sha256>",
    "Baseline report JSON path or exact report SHA for candidate Product Factory reports"
  ).action(
    async (suitePath, options) => {
      const isProductInvocation = options.productReceipts !== void 0 || options.experimentId !== void 0 || options.variant !== void 0 || options.baselineReport !== void 0;
      if (isProductInvocation) {
        try {
          validateProductFactoryCommandOptions(options);
          const { report } = await runProductFactoryStructuralIngestion({
            suitePath,
            receiptsPath: options.productReceipts,
            experimentId: options.experimentId,
            variant: options.variant,
            baselineReport: options.baselineReport,
            run: options.run
          });
          console.log(
            pc7.yellow(
              "\u26A0 Structural ingestion only: trusted host verification is required. This report cannot pass, promote, or authorize production."
            )
          );
          if (options.output) {
            writeProductFactoryReportAtomic(options.output, report);
            console.log(pc7.cyan(`Report written to ${options.output}`));
          } else {
            console.log(JSON.stringify(report, null, 2));
          }
        } catch (error2) {
          console.error(
            pc7.red(
              `Product Factory structural ingestion failed: ${productFactoryCliErrorCode(error2)}`
            )
          );
        }
        process.exit(EXIT_CODES.TOOL_ERROR);
        return;
      }
      try {
        const isRun = Boolean(options.run);
        if (!isRun) {
          console.log(pc7.yellow("\u2139 Running in DRY-RUN mode (safe default)"));
        }
        const { report, plan } = await runBenchmarkSuite(suitePath, {
          run: isRun
        });
        if (!isRun) {
          console.log(plan);
          console.log(
            pc7.green(
              "\u2714 Dry-run completed. To execute live, run with the --run option."
            )
          );
          process.exit(EXIT_CODES.OK);
        }
        if (report) {
          console.log(pc7.green(`\u2714 Benchmark suite completed successfully.`));
          console.log(`Summary:`);
          console.log(` - Total Tasks: ${report.summary.totalTasks}`);
          console.log(
            ` - Pass@1 Rate: ${(report.summary.passAt1Rate * 100).toFixed(1)}% (${report.summary.passAt1Count}/${report.summary.totalTasks})`
          );
          console.log(
            ` - Pass@k Rate: ${(report.summary.passAtKRate * 100).toFixed(1)}% (${report.summary.passAtKCount}/${report.summary.totalTasks})`
          );
          for (const category of Object.values(report.summary.categories)) {
            console.log(`
Category: ${category.category}`);
            console.log(` - Tasks: ${category.totalTasks}`);
            console.log(
              ` - Pass@1 Rate: ${(category.passAt1Rate * 100).toFixed(1)}% (${category.passAt1Count}/${category.totalTasks})`
            );
            console.log(
              ` - Pass@k Rate: ${(category.passAtKRate * 100).toFixed(1)}% (${category.passAtKCount}/${category.totalTasks})`
            );
          }
          if (options.output) {
            const outputPath = options.output;
            writeJsonAtomic(outputPath, report);
            console.log(pc7.cyan(`
\u2714 Report written to ${outputPath}`));
          } else {
            console.log("\nResults (JSON):");
            console.log(JSON.stringify(report, null, 2));
          }
        }
        process.exit(EXIT_CODES.OK);
      } catch (err) {
        console.error(
          pc7.red(
            `Error running benchmark suite: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        process.exit(EXIT_CODES.TOOL_ERROR);
      }
    }
  );
}
var PROJECT_DIR = ".forgewright";
var PROJECT_MANIFEST = "project.json";
var PROJECT_PROFILE = "project-profile.json";
var LOCKFILES = [
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock"
];
function registerProjectCommands(program) {
  program.command("init [target]").description("Create a project-local Forgewright manifest").option("-f, --force", "Overwrite an existing manifest").option("-j, --json", "Output as JSON").action((target, options) => {
    handleInit(target, options, Boolean(program.opts().json));
  });
  program.command("onboard [target]").description("Record deterministic filesystem facts for a project").option("-f, --force", "Overwrite an existing project profile").option("-j, --json", "Output as JSON").action((target, options) => {
    handleOnboard(target, options, Boolean(program.opts().json));
  });
}
function handleInit(targetInput, options, globalJson) {
  const startedAt = Date.now();
  const target = resolve(targetInput ?? process.cwd());
  const manifestPath = join(target, PROJECT_DIR, PROJECT_MANIFEST);
  if (existsSync(manifestPath) && !options.force) {
    writeResult(
      "forge.init",
      { path: manifestPath, status: "already_exists" },
      options.json || globalJson,
      startedAt
    );
    return;
  }
  mkdirSync(join(target, PROJECT_DIR), { recursive: true });
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ schema_version: 1 }, null, 2)}
`
  );
  writeResult(
    "forge.init",
    {
      path: manifestPath,
      status: existsSync(manifestPath) && options.force ? "overwritten" : "created"
    },
    options.json || globalJson,
    startedAt
  );
}
function handleOnboard(targetInput, options, globalJson) {
  const startedAt = Date.now();
  const target = resolve(targetInput ?? process.cwd());
  const manifestPath = join(target, PROJECT_DIR, PROJECT_MANIFEST);
  const profilePath = join(target, PROJECT_DIR, PROJECT_PROFILE);
  if (!existsSync(manifestPath)) {
    writeError(
      "forge.onboard",
      { path: manifestPath },
      options.json || globalJson,
      startedAt,
      "Project manifest is required; run forge init first.",
      "MANIFEST_REQUIRED"
    );
    return;
  }
  if (existsSync(profilePath) && !options.force) {
    writeResult(
      "forge.onboard",
      { path: profilePath, status: "already_exists" },
      options.json || globalJson,
      startedAt
    );
    return;
  }
  const profile = buildProjectProfile(target);
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}
`);
  writeResult(
    "forge.onboard",
    {
      path: profilePath,
      status: options.force ? "overwritten" : "created",
      facts: profile.facts
    },
    options.json || globalJson,
    startedAt
  );
}
function buildProjectProfile(target) {
  const packagePath = join(target, "package.json");
  const packageJsonPresent = existsSync(packagePath);
  let declaredTestScript = null;
  if (packageJsonPresent) {
    try {
      const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
      if (typeof parsed === "object" && parsed !== null && "scripts" in parsed && typeof parsed.scripts === "object" && parsed.scripts !== null && "test" in parsed.scripts && typeof parsed.scripts.test === "string") {
        declaredTestScript = parsed.scripts.test;
      }
    } catch {
    }
  }
  return {
    schema_version: 1,
    facts: {
      git_present: existsSync(join(target, ".git")),
      package_json_present: packageJsonPresent,
      lockfiles: LOCKFILES.filter(
        (lockfile) => existsSync(join(target, lockfile))
      ),
      declared_test_script: declaredTestScript
    }
  };
}
function writeResult(tool, data, useJson3, startedAt) {
  const envelope = buildEnvelope(tool, data, {
    ok: true,
    duration_ms: Date.now() - startedAt,
    version: VERSION
  });
  if (useJson3 || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(envelope)}
`);
  } else {
    process.stdout.write(`${pc7.green("\u2713")} ${data.status}: ${data.path}
`);
  }
}
function writeError(tool, data, useJson3, startedAt, message, reason) {
  const envelope = buildEnvelope(tool, data, {
    ok: false,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
    error: { code: EXIT_CODES.CONFIG_ERROR, message, details: { reason } }
  });
  if (useJson3 || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(envelope)}
`);
  } else {
    process.stderr.write(`${pc7.red("Error:")} ${message}
`);
  }
  process.exitCode = EXIT_CODES.CONFIG_ERROR;
}
var DENIED_SEGMENTS = /* @__PURE__ */ new Set([
  ".git",
  ".hg",
  ".svn",
  ".ssh",
  ".aws",
  ".gnupg",
  ".worktrees",
  "credentials",
  "credential",
  "secrets",
  "secret",
  "keystore",
  "node_modules"
]);
var DENIED_FORGEWRIGHT_SEGMENTS = /* @__PURE__ */ new Set([
  "artifacts",
  "audit",
  "deliveries",
  "escalations",
  "execution",
  "goals",
  "logs",
  "memory-bank",
  "mcp-server",
  "runtime",
  "subagent-context",
  "telemetry",
  "verify"
]);
var ALLOWED_FORGEWRIGHT_FILES = /* @__PURE__ */ new Set([
  ".forgewright/docs-manifest.json",
  ".forgewright/project-profile.json",
  ".forgewright/project.json",
  ".forgewright/code-conventions.md"
]);
var DENIED_BASENAME_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /(?:^|[-_.])(secret|credentials?|private[-_.]?key)(?:[-_.]|$)/i,
  /\.(?:pem|key|p8|p12|jks|keystore)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i
];
var DocsPathError = class extends Error {
  code;
  constructor(code2, message) {
    super(message);
    this.name = "DocsPathError";
    this.code = code2;
  }
};
function normalizeRelativePath(input) {
  const normalized = input.normalize("NFC").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
  if (normalized.length === 0 || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new DocsPathError(
      "INVALID_RELATIVE_PATH",
      `Expected a non-empty relative path, received "${input}".`
    );
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new DocsPathError(
      "PATH_TRAVERSAL",
      `Path traversal is not allowed: "${input}".`
    );
  }
  return segments.filter((segment) => segment !== ".").join("/");
}
function canonicalProjectRoot(input) {
  const absolute = resolve(input);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new DocsPathError(
      "PROJECT_NOT_FOUND",
      `Project directory does not exist: ${absolute}`
    );
  }
  return realpathSync(absolute);
}
function isPathInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
function resolveWithinProject(projectRoot, relativePath, options = {}) {
  const root = canonicalProjectRoot(projectRoot);
  const normalized = normalizeRelativePath(relativePath);
  const lexicalTarget = resolve(root, normalized);
  if (!isPathInside(root, lexicalTarget)) {
    throw new DocsPathError(
      "PATH_TRAVERSAL",
      `Path escapes project root: ${relativePath}`
    );
  }
  if (!existsSync(lexicalTarget)) {
    if (options.mustExist) {
      throw new DocsPathError(
        "PATH_NOT_FOUND",
        `Path does not exist: ${relativePath}`
      );
    }
    return lexicalTarget;
  }
  const resolvedTarget = realpathSync(lexicalTarget);
  if (!isPathInside(root, resolvedTarget)) {
    throw new DocsPathError(
      "SYMLINK_ESCAPE",
      `Resolved path escapes project root: ${relativePath}`
    );
  }
  return resolvedTarget;
}
function isSensitivePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.toLowerCase().split("/");
  const basename5 = segments.at(-1) ?? "";
  if (segments.some((segment) => DENIED_SEGMENTS.has(segment))) {
    return true;
  }
  if (segments[0] === ".forgewright") {
    if (ALLOWED_FORGEWRIGHT_FILES.has(normalized.toLowerCase())) {
      return false;
    }
    if (segments.length > 1 && DENIED_FORGEWRIGHT_SEGMENTS.has(segments[1])) {
      return true;
    }
  }
  return DENIED_BASENAME_PATTERNS.some((pattern) => pattern.test(basename5));
}
function matchesGlob(path, glob) {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedGlob = glob.replace(/\\/g, "/").replace(/^\.\/+/, "");
  let pattern = "";
  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const char = normalizedGlob[index];
    if (char === "*") {
      if (normalizedGlob[index + 1] === "*") {
        index += 1;
        if (normalizedGlob[index + 1] === "/") {
          index += 1;
          pattern += "(?:.*/)?";
        } else {
          pattern += ".*";
        }
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`, "u").test(normalizedPath);
}
function isAllowedByPrivacy(relativePath, allow, exclude) {
  const normalized = normalizeRelativePath(relativePath);
  if (isSensitivePath(normalized)) {
    return false;
  }
  const excluded = exclude.some((pattern) => {
    const normalizedPattern = normalizeRelativePath(pattern);
    return normalized === normalizedPattern || normalized.startsWith(`${normalizedPattern}/`) || matchesGlob(normalized, normalizedPattern);
  });
  if (excluded) {
    return false;
  }
  return allow.some((entry) => {
    const normalizedEntry = normalizeRelativePath(entry);
    return normalized === normalizedEntry || normalized.startsWith(`${normalizedEntry}/`) || matchesGlob(normalized, normalizedEntry);
  });
}
var SUPPORTED_DIAGRAMS = /* @__PURE__ */ new Set([
  "flowchart",
  "graph",
  "sequencediagram",
  "classdiagram",
  "statediagram-v2",
  "erdiagram",
  "journey",
  "gantt",
  "pie"
]);
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function extractDiagramLabels(source) {
  const labels = [];
  const seen = /* @__PURE__ */ new Set();
  const quoted = source.matchAll(/["']([^"'\n]{1,100})["']/g);
  for (const match2 of quoted) {
    const label3 = match2[1].trim();
    if (label3 && !seen.has(label3)) {
      labels.push(label3);
      seen.add(label3);
    }
  }
  if (labels.length === 0) {
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie)\b/i.test(
        trimmed
      )) {
        continue;
      }
      const parts = trimmed.split(/-->|---|==>|->>|-->>|:/);
      for (const part of parts) {
        const label3 = part.replace(/^[A-Za-z0-9_-]+\s*[\[(\{]+/, "").replace(/[\])\}]+$/, "").trim();
        if (label3 && label3.length <= 100 && !seen.has(label3)) {
          labels.push(label3);
          seen.add(label3);
        }
      }
    }
  }
  return labels.slice(0, 12);
}
function parseDiagram(source, line) {
  const trimmed = source.trim();
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  const labels = extractDiagramLabels(trimmed);
  let error2;
  if (!trimmed) {
    error2 = "Diagram source is empty.";
  } else if (!SUPPORTED_DIAGRAMS.has(first)) {
    error2 = `Unsupported Mermaid diagram type: ${first || "<missing>"}.`;
  } else {
    const pairs = [
      ["[", "]"],
      ["(", ")"],
      ["{", "}"]
    ];
    for (const [open, close] of pairs) {
      const opens = [...trimmed].filter((char) => char === open).length;
      const closes = [...trimmed].filter((char) => char === close).length;
      if (opens !== closes) {
        error2 = `Unbalanced "${open}${close}" delimiters.`;
        break;
      }
    }
  }
  return {
    id: createHash("sha256").update(`${line}:${trimmed}`).digest("hex").slice(0, 16),
    type: first || "unknown",
    source: trimmed,
    line,
    valid: error2 === void 0,
    ...error2 ? { error: error2 } : {},
    labels
  };
}
function renderDiagramSvg(diagram, title) {
  const labels = diagram.labels.length > 0 ? diagram.labels : [diagram.valid ? "Diagram" : "Invalid diagram"];
  const width = 480;
  const nodeWidth = 420;
  const nodeHeight = 54;
  const gap = 34;
  const height = Math.max(
    130,
    54 + labels.length * nodeHeight + Math.max(0, labels.length - 1) * gap
  );
  const x = (width - nodeWidth) / 2;
  const nodes = labels.map((label3, index) => {
    const y = 38 + index * (nodeHeight + gap);
    const arrow = index === labels.length - 1 ? "" : `<path d="M ${width / 2} ${y + nodeHeight} V ${y + nodeHeight + gap - 8}" class="diagram-edge" marker-end="url(#arrow-${diagram.id})"/>`;
    return `<g>
  <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="12" class="diagram-node"/>
  <text x="${width / 2}" y="${y + 33}" text-anchor="middle" class="diagram-label">${escapeXml(label3.slice(0, 42))}</text>
  ${arrow}
</g>`;
  }).join("\n");
  return `<svg class="diagram-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="diagram-title-${diagram.id} diagram-desc-${diagram.id}" xmlns="http://www.w3.org/2000/svg">
  <title id="diagram-title-${diagram.id}">${escapeXml(title)}</title>
  <desc id="diagram-desc-${diagram.id}">${escapeXml(labels.join(" to "))}</desc>
  <defs>
    <marker id="arrow-${diagram.id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" class="diagram-arrow"/>
    </marker>
  </defs>
  ${nodes}
</svg>`;
}

// src/docs/normalize.ts
function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}
function stableId(namespace, value) {
  return createHash("sha256").update(`${namespace}:${value.normalize("NFC")}`).digest("hex").slice(0, 16);
}
function encodeRoutePath(path) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
function documentRoute(projectId, sourcePath) {
  return `projects/${encodeURIComponent(projectId)}/docs/${encodeRoutePath(sourcePath)}.html`;
}
function assetRoute(projectId, sourcePath) {
  return `projects/${encodeURIComponent(projectId)}/assets/${encodeRoutePath(sourcePath)}`;
}
function slugifyHeading(input) {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/<[^>]+>/g, "").replace(/[`*_~[\](){}:;,.!?'"\\/]+/g, " ").replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}
function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).split(",").map((entry) => entry.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}
function parseFrontmatter(content) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { body: content, values: {}, lineOffset: 0 };
  }
  const lines = content.split(/\r?\n/);
  const closing = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  );
  if (closing < 0) {
    return { body: content, values: {}, lineOffset: 0 };
  }
  const values = {};
  for (const line of lines.slice(1, closing)) {
    const match2 = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match2) {
      values[match2[1]] = parseScalar(match2[2]);
    }
  }
  return {
    body: lines.slice(closing + 1).join("\n"),
    values,
    lineOffset: closing + 1
  };
}
function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}
function extractHeadings(content, lineOffset) {
  const headings = [];
  const slugCounts = /* @__PURE__ */ new Map();
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const match2 = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match2) continue;
    const text3 = match2[2].replace(/[`*_~]/g, "").trim();
    const base2 = slugifyHeading(text3);
    const count = slugCounts.get(base2) ?? 0;
    slugCounts.set(base2, count + 1);
    headings.push({
      level: match2[1].length,
      text: text3,
      slug: count === 0 ? base2 : `${base2}-${count}`,
      line: index + 1 + lineOffset
    });
  }
  return headings;
}
function extractLinks(content, lineOffset) {
  const links = [];
  const regex = /(!?)\[([^\]]*)\]\((?:<([^>\n]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\)/g;
  for (const match2 of content.matchAll(regex)) {
    const target = (match2[3] ?? match2[4] ?? "").trim();
    const image2 = match2[1] === "!";
    let kind = image2 ? "asset" : "document";
    if (target.startsWith("#")) {
      kind = "anchor";
    } else if (/^(?:https?:|mailto:|tel:|data:)/i.test(target)) {
      kind = "external";
    }
    links.push({
      label: match2[2] || (image2 ? "Image" : target),
      target,
      kind,
      line: lineNumberAt(content, match2.index ?? 0) + lineOffset,
      image: image2
    });
  }
  return links;
}
function extractDiagrams(content, lineOffset) {
  const diagrams = [];
  const regex = /```mermaid[^\n]*\r?\n([\s\S]*?)```/gi;
  for (const match2 of content.matchAll(regex)) {
    diagrams.push(
      parseDiagram(
        match2[1],
        lineNumberAt(content, match2.index ?? 0) + lineOffset
      )
    );
  }
  return diagrams;
}
function extractCodeRefs(content) {
  const refs = /* @__PURE__ */ new Set();
  for (const match2 of content.matchAll(/gitnexus:\/\/[^\s)>\]]+/g)) {
    refs.add(match2[0]);
  }
  for (const match2 of content.matchAll(
    /(?:^|[\s`("'[])((?:src|app|lib|scripts|mcp|tests|skills)\/[A-Za-z0-9_./@-]+\.(?:ts|tsx|js|mjs|cjs|py|sh|md|json|ya?ml)(?:#[A-Za-z0-9_.:-]+)?)/gm
  )) {
    refs.add(match2[1]);
  }
  return [...refs].sort();
}
function titleFromPath(path) {
  const name = path.split("/").at(-1) ?? path;
  return name.replace(/\.(?:md|markdown|json|ya?ml)$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function normalizeTextDocument(input) {
  const extension = extname(input.sourcePath).toLowerCase();
  const format2 = extension === ".json" ? "json" : extension === ".yaml" || extension === ".yml" ? "yaml" : "markdown";
  const parsed = format2 === "markdown" ? parseFrontmatter(input.content) : { body: input.content, values: {}, lineOffset: 0 };
  const headings = format2 === "markdown" ? extractHeadings(parsed.body, parsed.lineOffset) : [];
  const titleValue = parsed.values.title;
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim() : headings[0]?.text ?? titleFromPath(input.sourcePath);
  const tagsValue = parsed.values.tags;
  const tags = Array.isArray(tagsValue) ? tagsValue.filter((tag) => typeof tag === "string") : typeof tagsValue === "string" ? tagsValue.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
  const statusValue = parsed.values.status;
  const normalizedPath = normalizeRelativePath(input.sourcePath);
  return {
    id: stableId(input.projectId, normalizedPath),
    projectId: input.projectId,
    sourcePath: normalizedPath,
    route: documentRoute(input.projectId, normalizedPath),
    title,
    type: input.source.type,
    format: format2,
    status: typeof statusValue === "string" ? statusValue : null,
    sourceOfTruth: input.truth.includes(normalizedPath),
    tags: [...new Set(tags)].sort(),
    headings,
    links: format2 === "markdown" ? extractLinks(parsed.body, parsed.lineOffset) : [],
    codeRefs: extractCodeRefs(parsed.body),
    diagrams: format2 === "markdown" ? extractDiagrams(parsed.body, parsed.lineOffset) : [],
    backlinks: [],
    related: [],
    warnings: format2 === "markdown" && Object.keys(parsed.values).length === 0 ? [
      "Document has no frontmatter; classification uses manifest and filename defaults."
    ] : [],
    contentHash: hashContent(input.content),
    content: parsed.body
  };
}
function normalizeAsset(input) {
  const extension = extname(input.sourcePath).toLowerCase();
  const mediaTypes = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
  };
  const normalizedPath = normalizeRelativePath(input.sourcePath);
  return {
    id: stableId(input.projectId, `asset:${normalizedPath}`),
    projectId: input.projectId,
    sourcePath: normalizedPath,
    route: assetRoute(input.projectId, normalizedPath),
    mediaType: mediaTypes[extension] ?? "application/octet-stream",
    contentHash: hashContent(input.content)
  };
}
function runGit(projectRoot, args) {
  const result = spawnSync("git", ["-C", projectRoot, ...args], {
    encoding: "utf8",
    timeout: 5e3,
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}
function readCuratedProfile(projectRoot) {
  const path = join(projectRoot, ".forgewright", "project-profile.json");
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const profile = {};
    if (typeof raw.schema_version === "string" || typeof raw.schema_version === "number") {
      profile.schema_version = raw.schema_version;
    }
    if (raw.facts && typeof raw.facts === "object") {
      const facts = raw.facts;
      profile.facts = {
        git_present: typeof facts.git_present === "boolean" ? facts.git_present : void 0,
        package_json_present: typeof facts.package_json_present === "boolean" ? facts.package_json_present : void 0,
        lockfiles: Array.isArray(facts.lockfiles) ? facts.lockfiles.filter((item) => typeof item === "string").slice(0, 20) : void 0
      };
    }
    if (raw.fingerprint && typeof raw.fingerprint === "object") {
      const fingerprint = raw.fingerprint;
      const allowed = [
        "product",
        "language",
        "framework",
        "build_tool",
        "architecture",
        "services",
        "source_of_truth"
      ];
      profile.fingerprint = Object.fromEntries(
        allowed.filter((key) => key in fingerprint).map((key) => [key, fingerprint[key]])
      );
    }
    return profile;
  } catch {
    return {};
  }
}
function collectProjectFacts(projectRoot, manifest) {
  const gitEnabled = manifest.adapters?.git !== false;
  const commit = gitEnabled ? runGit(projectRoot, ["rev-parse", "HEAD"]) : null;
  const branch = gitEnabled ? runGit(projectRoot, ["branch", "--show-current"]) : null;
  const dirtyOutput = gitEnabled ? runGit(projectRoot, ["status", "--porcelain", "--untracked-files=no"]) : null;
  const gitnexusEnabled = manifest.adapters?.gitnexus === true;
  const gitnexusPath = join(projectRoot, ".gitnexus", "meta.json");
  let gitnexus = {
    status: gitnexusEnabled ? "unavailable" : "disabled",
    indexedCommit: null,
    indexedAt: null,
    processes: null,
    symbols: null
  };
  if (gitnexusEnabled && existsSync(gitnexusPath)) {
    try {
      const meta = JSON.parse(readFileSync(gitnexusPath, "utf8"));
      const indexedCommit = typeof meta.lastCommit === "string" ? meta.lastCommit : null;
      gitnexus = {
        status: commit && indexedCommit && (commit !== indexedCommit || Boolean(dirtyOutput)) ? "stale" : "available",
        indexedCommit,
        indexedAt: typeof meta.indexedAt === "string" ? meta.indexedAt : null,
        processes: typeof meta.stats?.processes === "number" ? meta.stats.processes : null,
        symbols: typeof meta.stats?.nodes === "number" ? meta.stats.nodes : null
      };
    } catch {
      gitnexus.status = "unavailable";
    }
  }
  return {
    git: {
      available: commit !== null,
      branch,
      commit,
      dirty: commit === null ? null : Boolean(dirtyOutput)
    },
    gitnexus,
    profile: readCuratedProfile(projectRoot)
  };
}

// src/docs/types.ts
var DOCS_SCHEMA_VERSION = 1;
var DOCS_PROJECT_STATE_SCHEMA_VERSION = 1;

// src/docs/project-state.ts
var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function isProjectRelativePath(value) {
  if (value.length === 0 || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  return !value.split("/").some((segment) => segment === "..");
}
var projectStateRelativePathSchema = z.string().min(1).refine(isProjectRelativePath, {
  message: "must be a project-relative path without traversal, absolute prefixes, or backslashes"
});
var idSchema = z.string().regex(ID_PATTERN, "must be a slug-like ID");
var textSchema = z.string().min(1);
var calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "must be a valid calendar date");
var referenceSchema = z.object({
  path: projectStateRelativePathSchema,
  anchor: textSchema.optional()
}).strict();
var projectSchema = z.object({
  summary: textSchema,
  product_type: z.enum([
    "product",
    "game",
    "library",
    "service",
    "tooling",
    "other"
  ]),
  lifecycle: z.enum([
    "planning",
    "active",
    "paused",
    "archived",
    "completed"
  ])
}).strict();
var rootSchema = z.object({
  id: idSchema,
  path: projectStateRelativePathSchema,
  kind: textSchema,
  purpose: textSchema,
  owner: textSchema
}).strict();
var dependencySchema = z.object({
  from: idSchema,
  to: idSchema,
  type: textSchema
}).strict();
var roadmapSchema = z.object({
  id: idSchema,
  title: textSchema,
  status: z.enum([
    "proposed",
    "planned",
    "in_progress",
    "blocked",
    "done",
    "cancelled"
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  owner: textSchema,
  target_date: calendarDateSchema.nullable(),
  depends_on: z.array(idSchema),
  references: z.array(referenceSchema)
}).strict();
var flowStepSchema = z.object({
  id: idSchema,
  name: textSchema,
  actor: textSchema,
  inputs: z.array(textSchema).min(1),
  outputs: z.array(textSchema).min(1),
  references: z.array(referenceSchema)
}).strict();
var flowSchema = z.object({
  id: idSchema,
  title: textSchema,
  status: z.enum(["draft", "active", "deprecated"]),
  trigger: textSchema,
  steps: z.array(flowStepSchema).min(1).superRefine(requireUniqueIds("flow steps"))
}).strict();
var backlogSchema = z.object({
  id: idSchema,
  title: textSchema,
  type: z.enum(["feature", "bug", "task", "research", "technical_debt"]),
  status: z.enum([
    "proposed",
    "ready",
    "in_progress",
    "blocked",
    "done",
    "cancelled"
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  owner: textSchema,
  acceptance: z.array(textSchema).min(1),
  references: z.array(referenceSchema)
}).strict();
var blockerSchema = z.object({ id: idSchema, title: textSchema, owner: textSchema }).strict();
var riskSchema = z.object({
  id: idSchema,
  title: textSchema,
  owner: textSchema,
  mitigation: textSchema
}).strict();
var nextActionSchema = z.object({
  id: idSchema,
  title: textSchema,
  owner: textSchema,
  due_date: calendarDateSchema.nullable()
}).strict();
var statusSchema = z.object({
  lifecycle: z.enum([
    "planning",
    "active",
    "paused",
    "archived",
    "completed"
  ]),
  health: z.enum(["on_track", "at_risk", "blocked", "unknown"]),
  phase: textSchema,
  summary: textSchema,
  updated_at: z.string().datetime({ offset: true }),
  blockers: z.array(blockerSchema).superRefine(requireUniqueIds("blockers")),
  risks: z.array(riskSchema).superRefine(requireUniqueIds("risks")),
  next_actions: z.array(nextActionSchema).superRefine(requireUniqueIds("next actions")),
  next_update_at: z.string().datetime({ offset: true }).nullable()
}).strict();
function requireUniqueIds(collection) {
  return (items, context) => {
    const seen = /* @__PURE__ */ new Set();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `duplicate ID in ${collection}`
        });
      }
      seen.add(item.id);
    }
  };
}
var docsProjectStateSchema = z.object({
  schema_version: z.literal(DOCS_PROJECT_STATE_SCHEMA_VERSION),
  project: projectSchema,
  structure: z.object({
    roots: z.array(rootSchema).min(1, "structure.roots must not be empty").superRefine(requireUniqueIds("structure roots")),
    dependencies: z.array(dependencySchema)
  }).strict(),
  roadmap: z.array(roadmapSchema).superRefine(requireUniqueIds("roadmap")),
  flows: z.array(flowSchema).superRefine(requireUniqueIds("flows")),
  backlog: z.array(backlogSchema).superRefine(requireUniqueIds("backlog")),
  status: statusSchema
}).strict().superRefine((state, context) => {
  if (state.project.lifecycle !== state.status.lifecycle) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status", "lifecycle"],
      message: "must match project.lifecycle"
    });
  }
  const rootIds = new Set(state.structure.roots.map((root) => root.id));
  const dependencyKeys = /* @__PURE__ */ new Set();
  for (const [index, dependency] of state.structure.dependencies.entries()) {
    for (const field of ["from", "to"]) {
      if (!rootIds.has(dependency[field])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["structure", "dependencies", index, field],
          message: "must reference a structure root ID"
        });
      }
    }
    const key = `${dependency.from}\0${dependency.to}\0${dependency.type}`;
    if (dependencyKeys.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["structure", "dependencies", index],
        message: "duplicate structure dependency"
      });
    }
    dependencyKeys.add(key);
  }
  const roadmapIds = new Set(state.roadmap.map((item) => item.id));
  for (const [index, item] of state.roadmap.entries()) {
    const seen = /* @__PURE__ */ new Set();
    for (const [dependencyIndex, dependency] of item.depends_on.entries()) {
      if (!roadmapIds.has(dependency)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roadmap", index, "depends_on", dependencyIndex],
          message: "must reference a roadmap item ID"
        });
      } else if (dependency === item.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roadmap", index, "depends_on", dependencyIndex],
          message: "must not reference the same roadmap item"
        });
      }
      if (seen.has(dependency)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roadmap", index, "depends_on", dependencyIndex],
          message: "duplicate roadmap dependency"
        });
      }
      seen.add(dependency);
    }
  }
  if (state.status.next_update_at && Date.parse(state.status.next_update_at) < Date.parse(state.status.updated_at)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status", "next_update_at"],
      message: "must not be earlier than status.updated_at"
    });
  }
});
var DocsProjectStateError = class extends Error {
  details;
  constructor(message, details = []) {
    super(message);
    this.name = "DocsProjectStateError";
    this.details = details;
  }
};
function validateProjectState(input) {
  const parsed = docsProjectStateSchema.safeParse(input);
  if (!parsed.success) {
    throw new DocsProjectStateError(
      "Invalid Forgewright project state.",
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`
      )
    );
  }
  return parsed.data;
}
function slugify(input) {
  const slug2 = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug2 || "root";
}
function inferredRoots(projectRoot) {
  const candidates = readdirSync(projectRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name !== ".forgewright" && !isSensitivePath(entry.name)
  ).map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  const usedIds = /* @__PURE__ */ new Set();
  const roots = candidates.map((path) => {
    const baseId = slugify(path);
    let id2 = baseId;
    let suffix = 2;
    while (usedIds.has(id2)) id2 = `${baseId}-${suffix++}`;
    usedIds.add(id2);
    return {
      id: id2,
      path,
      kind: "directory",
      purpose: `Top-level ${path} directory.`,
      owner: "unassigned"
    };
  });
  if (roots.length > 0) return roots;
  return [
    {
      id: "project-root",
      path: ".",
      kind: "project",
      purpose: "Project root; no top-level directories were detected.",
      owner: "unassigned"
    }
  ];
}
function createDefaultProjectState(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const summary = "Documentation baseline only; roadmap, flows, and backlog are intentionally empty.";
  const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  return {
    schema_version: DOCS_PROJECT_STATE_SCHEMA_VERSION,
    project: {
      summary,
      product_type: "other",
      lifecycle: "planning"
    },
    structure: {
      roots: inferredRoots(projectRoot),
      dependencies: []
    },
    roadmap: [],
    flows: [],
    backlog: [],
    status: {
      lifecycle: "planning",
      health: "unknown",
      phase: "planning",
      summary,
      updated_at: updatedAt,
      blockers: [],
      risks: [],
      next_actions: [],
      next_update_at: null
    }
  };
}
function safeLoadProjectState(projectRootInput, statePathInput) {
  const path = statePathInput;
  if (!isProjectRelativePath(path)) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "containment",
        message: "Project state path must be project-relative and safe."
      }
    };
  }
  let projectRoot;
  try {
    projectRoot = canonicalProjectRoot(projectRootInput);
  } catch (error2) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "containment",
        message: error2 instanceof Error ? error2.message : String(error2)
      }
    };
  }
  let absolutePath;
  try {
    absolutePath = resolveWithinProject(projectRoot, path, { mustExist: true });
  } catch (error2) {
    const code2 = error2 instanceof Error && "code" in error2 ? error2.code : void 0;
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: code2 === "PATH_NOT_FOUND" ? "missing" : "containment",
        message: error2 instanceof Error ? error2.message : String(error2)
      }
    };
  }
  if (!existsSync(absolutePath)) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "missing",
        message: `Project state does not exist: ${path}`
      }
    };
  }
  try {
    let presentedPath = projectRoot;
    for (const segment of path.split("/")) {
      if (segment === ".") continue;
      presentedPath = join(presentedPath, segment);
      if (lstatSync(presentedPath).isSymbolicLink()) {
        return {
          state: null,
          path,
          contentHash: null,
          error: {
            code: "containment",
            message: "Project state path must not contain symbolic links; keep it as a regular project-owned file."
          }
        };
      }
    }
  } catch (error2) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "containment",
        message: error2 instanceof Error ? error2.message : String(error2)
      }
    };
  }
  try {
    const raw = readFileSync(absolutePath, "utf8");
    const contentHash = hashContent(raw);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error2) {
      return {
        state: null,
        path,
        contentHash,
        error: {
          code: "invalid",
          message: error2 instanceof Error ? error2.message : String(error2)
        }
      };
    }
    try {
      return {
        state: validateProjectState(parsed),
        path,
        contentHash,
        error: null
      };
    } catch (error2) {
      return {
        state: null,
        path,
        contentHash,
        error: {
          code: "invalid",
          message: error2 instanceof DocsProjectStateError ? [error2.message, ...error2.details].join(" ") : error2 instanceof Error ? error2.message : String(error2)
        }
      };
    }
  } catch (error2) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "invalid",
        message: error2 instanceof Error ? error2.message : String(error2)
      }
    };
  }
}

// src/docs/manifest.ts
var DOCS_MANIFEST_PATH = join(".forgewright", "docs-manifest.json");
var relativePathSchema = z.string().min(1).refine((value) => !value.includes("\\"), "backslashes are not allowed").refine((value) => {
  try {
    normalizeRelativePath(value);
    return true;
  } catch {
    return false;
  }
}, "must be a project-relative path without '..' traversal");
var sourceSchema = z.object({
  path: relativePathSchema,
  type: z.enum([
    "documentation",
    "overview",
    "architecture",
    "product",
    "testing",
    "operations",
    "assets",
    "metadata"
  ]),
  include: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string().min(1)).optional()
}).strict();
var docsManifestSchema = z.object({
  schema_version: z.literal(DOCS_SCHEMA_VERSION),
  project: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1)
  }).strict(),
  sources: z.array(sourceSchema).min(1),
  project_docs: z.object({
    schema_version: z.literal(DOCS_PROJECT_STATE_SCHEMA_VERSION),
    state: relativePathSchema,
    max_stale_days: z.number().int().min(1).max(365).optional()
  }).strict().optional(),
  truth: z.array(relativePathSchema).optional(),
  adapters: z.object({
    git: z.boolean().optional(),
    gitnexus: z.boolean().optional(),
    evidence_summary: z.boolean().optional()
  }).strict().optional(),
  privacy: z.object({
    mode: z.literal("allowlist"),
    allow: z.array(relativePathSchema).optional(),
    exclude: z.array(relativePathSchema).optional()
  }).strict()
}).strict();
var DocsManifestError = class extends Error {
  details;
  constructor(message, details = []) {
    super(message);
    this.name = "DocsManifestError";
    this.details = details;
  }
};
function slugifyProjectId(input) {
  const slug2 = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug2 || "project";
}
function humanizeProjectTitle(input) {
  return input.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function readPackageIdentity(projectRoot) {
  const packagePath = join(projectRoot, "package.json");
  if (!existsSync(packagePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
    const rawName = typeof parsed.name === "string" ? parsed.name.replace(/^@[^/]+\//, "") : basename(projectRoot);
    const title = typeof parsed.displayName === "string" ? parsed.displayName : humanizeProjectTitle(rawName);
    return { id: slugifyProjectId(rawName), title };
  } catch {
    return null;
  }
}
function discoverSources(projectRoot) {
  const directoryNames = /* @__PURE__ */ new Set(["Docs", "docs", "documentation", "wiki"]);
  const sources = readdirSync(projectRoot, {
    withFileTypes: true
  }).filter((entry) => entry.isDirectory() && directoryNames.has(entry.name)).sort((left, right) => left.name.localeCompare(right.name)).map((entry) => ({
    path: entry.name,
    type: "documentation",
    include: [
      "**/*.md",
      "**/*.markdown",
      "**/*.json",
      "**/*.yaml",
      "**/*.yml",
      "**/*.svg",
      "**/*.png",
      "**/*.jpg",
      "**/*.jpeg",
      "**/*.gif",
      "**/*.webp"
    ]
  }));
  for (const readme of ["README.md", "README.vi.md"]) {
    if (existsSync(join(projectRoot, readme))) {
      sources.push({ path: readme, type: "overview" });
    }
  }
  if (existsSync(join(projectRoot, ".forgewright", "project-profile.json"))) {
    sources.push({
      path: ".forgewright/project-profile.json",
      type: "metadata"
    });
  }
  if (sources.length === 0) {
    sources.push({ path: "README.md", type: "overview" });
  }
  return sources;
}
function createDefaultManifest(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const identity = readPackageIdentity(projectRoot) ?? {
    id: slugifyProjectId(basename(projectRoot)),
    title: humanizeProjectTitle(basename(projectRoot))
  };
  const sources = discoverSources(projectRoot);
  const projectStatePath = "docs/project-state.json";
  if (!sources.some((source) => source.path === projectStatePath)) {
    sources.push({ path: projectStatePath, type: "metadata" });
  }
  return {
    schema_version: DOCS_SCHEMA_VERSION,
    project: identity,
    sources,
    project_docs: {
      schema_version: DOCS_PROJECT_STATE_SCHEMA_VERSION,
      state: projectStatePath,
      max_stale_days: 30
    },
    truth: [
      ...sources.filter((source) => source.type === "overview").map((source) => source.path),
      projectStatePath
    ],
    adapters: {
      git: true,
      gitnexus: existsSync(join(projectRoot, ".gitnexus", "meta.json")),
      evidence_summary: false
    },
    privacy: {
      mode: "allowlist",
      allow: sources.map((source) => source.path),
      exclude: [
        "**/.env*",
        "**/credentials/**",
        "**/secrets/**",
        "**/node_modules/**",
        "**/.worktrees/**"
      ]
    }
  };
}
function validateManifest(input) {
  const parsed = docsManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new DocsManifestError(
      "Invalid Forgewright docs manifest.",
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`
      )
    );
  }
  return parsed.data;
}
function initManifest(projectRootInput, options = {}) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const manifestPath = join(projectRoot, DOCS_MANIFEST_PATH);
  if (existsSync(manifestPath) && !options.force) {
    const existing = validateManifest(
      JSON.parse(readFileSync(manifestPath, "utf8"))
    );
    if (!existing.project_docs) {
      const statePath2 = "docs/project-state.json";
      const sources = existing.sources.some(
        (source) => source.path === statePath2
      ) ? existing.sources : [...existing.sources, { path: statePath2, type: "metadata" }];
      const allow = existing.privacy.allow ? [.../* @__PURE__ */ new Set([...existing.privacy.allow, statePath2])] : void 0;
      const migrated = {
        ...existing,
        sources,
        project_docs: {
          schema_version: DOCS_PROJECT_STATE_SCHEMA_VERSION,
          state: statePath2,
          max_stale_days: 30
        },
        truth: [.../* @__PURE__ */ new Set([...existing.truth ?? [], statePath2])],
        privacy: {
          ...existing.privacy,
          ...allow ? { allow } : {}
        }
      };
      writeFileSync(
        manifestPath,
        `${JSON.stringify(migrated, null, 2)}
`,
        "utf8"
      );
      const absoluteStatePath = join(projectRoot, statePath2);
      if (!existsSync(absoluteStatePath)) {
        mkdirSync(join(projectRoot, "docs"), { recursive: true });
        writeFileSync(
          absoluteStatePath,
          `${JSON.stringify(createDefaultProjectState(projectRoot), null, 2)}
`,
          "utf8"
        );
      }
      return {
        path: manifestPath,
        status: "migrated",
        manifest: migrated
      };
    }
    return {
      path: manifestPath,
      status: "already_exists",
      manifest: existing
    };
  }
  const manifest = createDefaultManifest(projectRoot);
  mkdirSync(join(projectRoot, ".forgewright"), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}
`, "utf8");
  const statePath = join(projectRoot, manifest.project_docs.state);
  if (!existsSync(statePath)) {
    mkdirSync(join(projectRoot, "docs"), { recursive: true });
    writeFileSync(
      statePath,
      `${JSON.stringify(createDefaultProjectState(projectRoot), null, 2)}
`,
      "utf8"
    );
  }
  return {
    path: manifestPath,
    status: options.force ? "overwritten" : "created",
    manifest
  };
}
function loadManifest(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const manifestPath = join(projectRoot, DOCS_MANIFEST_PATH);
  if (existsSync(manifestPath)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error2) {
      throw new DocsManifestError(
        `Docs manifest is not valid JSON: ${manifestPath}`,
        [error2 instanceof Error ? error2.message : String(error2)]
      );
    }
    return {
      manifest: validateManifest(parsed),
      manifestPath,
      legacy: false,
      diagnostics: []
    };
  }
  const manifest = createDefaultManifest(projectRoot);
  const diagnostics = [
    {
      severity: "warning",
      code: "LEGACY_MANIFEST_FALLBACK",
      projectId: manifest.project.id,
      message: "No .forgewright/docs-manifest.json was found; using safe legacy source discovery.",
      suggestion: "Run `forge docs init` to make the documentation contract explicit."
    }
  ];
  return {
    manifest,
    manifestPath: null,
    legacy: true,
    diagnostics
  };
}
function splitTarget(target) {
  const hashIndex = target.indexOf("#");
  if (hashIndex < 0) return { path: target, anchor: void 0 };
  return {
    path: target.slice(0, hashIndex),
    anchor: decodeURIComponent(target.slice(hashIndex + 1))
  };
}
function resolveRelativePath(from, target) {
  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return null;
  }
  if (decoded.startsWith("/") || /^[A-Za-z]:[\\/]/.test(decoded)) {
    return null;
  }
  const stack = posix.dirname(from).split("/").filter((segment) => Boolean(segment) && segment !== ".");
  for (const segment of decoded.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(segment);
    }
  }
  return stack.join("/");
}
function relativeRoute(fromRoute, targetRoute) {
  const relative6 = posix.relative(posix.dirname(fromRoute), targetRoute);
  return relative6.startsWith(".") ? relative6 : `./${relative6}`;
}
function addDiagnostic(catalog, document, diagnostic2) {
  catalog.diagnostics.push({
    ...diagnostic2,
    projectId: document.projectId,
    path: document.sourcePath
  });
}
function candidateDocumentPaths(path) {
  const candidates = [path];
  if (!/\.(?:md|markdown|json|ya?ml)$/i.test(path)) {
    candidates.push(
      `${path}.md`,
      `${path}.markdown`,
      posix.join(path, "README.md")
    );
  }
  return candidates;
}
function resolveCatalogLinks(catalogs) {
  const documentsByProject = /* @__PURE__ */ new Map();
  const assetsByProject = /* @__PURE__ */ new Map();
  for (const catalog of catalogs) {
    documentsByProject.set(
      catalog.project.id,
      new Map(
        catalog.documents.map((document) => [document.sourcePath, document])
      )
    );
    assetsByProject.set(
      catalog.project.id,
      new Map(catalog.assets.map((asset) => [asset.sourcePath, asset]))
    );
    catalog.relations = catalog.relations.filter(
      (relation) => relation.type === "code-ref" || relation.type === "truth"
    );
    for (const document of catalog.documents) {
      document.backlinks = [];
      document.related = [];
      for (const link2 of document.links) {
        delete link2.resolvedDocumentId;
        delete link2.resolvedAssetId;
        delete link2.resolvedRoute;
      }
    }
    catalog.diagnostics = catalog.diagnostics.filter(
      (diagnostic2) => ![
        "BROKEN_LINK",
        "BROKEN_ASSET",
        "BROKEN_ANCHOR",
        "LINK_TRAVERSAL",
        "LINK_CASE_MISMATCH",
        "UNKNOWN_PROJECT_LINK"
      ].includes(diagnostic2.code)
    );
  }
  for (const catalog of catalogs) {
    const exactDocs = documentsByProject.get(catalog.project.id) ?? /* @__PURE__ */ new Map();
    const exactAssets = assetsByProject.get(catalog.project.id) ?? /* @__PURE__ */ new Map();
    const caseDocs = new Map(
      [...exactDocs.entries()].map(([path, document]) => [
        path.toLowerCase(),
        document
      ])
    );
    const caseAssets = new Map(
      [...exactAssets.entries()].map(([path, asset]) => [
        path.toLowerCase(),
        asset
      ])
    );
    for (const document of catalog.documents) {
      for (const codeRef of document.codeRefs) {
        catalog.relations.push({
          from: document.id,
          to: codeRef,
          type: "code-ref",
          source: document.sourcePath,
          confidence: codeRef.startsWith("gitnexus://") ? 1 : 0.75
        });
      }
      if (document.sourceOfTruth) {
        catalog.relations.push({
          from: catalog.project.id,
          to: document.id,
          type: "truth",
          source: "docs-manifest",
          confidence: 1
        });
      }
      for (const link2 of document.links) {
        if (link2.kind === "external") continue;
        if (link2.kind === "anchor") {
          const anchor = link2.target.slice(1);
          link2.anchor = anchor;
          if (!document.headings.some((heading2) => heading2.slug === anchor)) {
            addDiagnostic(catalog, document, {
              severity: "warning",
              code: "BROKEN_ANCHOR",
              message: `Heading anchor "#${anchor}" does not exist (line ${link2.line}).`,
              suggestion: "Update the anchor to match a generated heading slug."
            });
          } else {
            link2.resolvedRoute = `#${anchor}`;
          }
          continue;
        }
        let targetProjectId = catalog.project.id;
        let rawTarget = link2.target;
        if (rawTarget.startsWith("forgewright://")) {
          try {
            const url = new URL(rawTarget);
            targetProjectId = url.hostname;
            rawTarget = url.pathname.replace(/^\/+/, "") + url.hash;
          } catch {
            addDiagnostic(catalog, document, {
              severity: "error",
              code: "BROKEN_LINK",
              message: `Invalid cross-project link "${link2.target}" (line ${link2.line}).`
            });
            continue;
          }
        }
        const targetDocs = documentsByProject.get(targetProjectId);
        const targetAssets = assetsByProject.get(targetProjectId);
        if (!targetDocs || !targetAssets) {
          addDiagnostic(catalog, document, {
            severity: "warning",
            code: "UNKNOWN_PROJECT_LINK",
            message: `Cross-project target "${targetProjectId}" is not part of this build.`,
            suggestion: "Register and build the target project together."
          });
          continue;
        }
        const split = splitTarget(rawTarget);
        const resolvedPath = targetProjectId === catalog.project.id ? resolveRelativePath(document.sourcePath, split.path) : split.path.replace(/^\/+/, "");
        if (resolvedPath === null) {
          addDiagnostic(catalog, document, {
            severity: "error",
            code: "LINK_TRAVERSAL",
            message: `Link escapes the project root: "${link2.target}" (line ${link2.line}).`,
            suggestion: "Use a contained relative link or a forgewright:// project link."
          });
          continue;
        }
        const docCandidates = candidateDocumentPaths(resolvedPath);
        const resolvedDocument = docCandidates.map((candidate) => targetDocs.get(candidate)).find((candidate) => candidate !== void 0);
        const resolvedAsset = targetAssets.get(resolvedPath);
        if (resolvedDocument) {
          link2.kind = "document";
          link2.anchor = split.anchor;
          link2.resolvedDocumentId = resolvedDocument.id;
          link2.resolvedRoute = `${relativeRoute(document.route, resolvedDocument.route)}${split.anchor ? `#${split.anchor}` : ""}`;
          catalog.relations.push({
            from: document.id,
            to: resolvedDocument.id,
            type: "links-to",
            source: document.sourcePath,
            confidence: 1
          });
          resolvedDocument.backlinks.push(document.id);
          if (split.anchor && !resolvedDocument.headings.some(
            (heading2) => heading2.slug === split.anchor
          )) {
            addDiagnostic(catalog, document, {
              severity: "warning",
              code: "BROKEN_ANCHOR",
              message: `Anchor "#${split.anchor}" does not exist in ${resolvedDocument.sourcePath}.`
            });
          }
          continue;
        }
        if (resolvedAsset) {
          link2.kind = "asset";
          link2.resolvedAssetId = resolvedAsset.id;
          link2.resolvedRoute = relativeRoute(
            document.route,
            resolvedAsset.route
          );
          catalog.relations.push({
            from: document.id,
            to: resolvedAsset.id,
            type: "embeds",
            source: document.sourcePath,
            confidence: 1
          });
          continue;
        }
        const mismatchedDocument = docCandidates.map((candidate) => caseDocs.get(candidate.toLowerCase())).find((candidate) => candidate !== void 0);
        const mismatchedAsset = caseAssets.get(resolvedPath.toLowerCase());
        if (targetProjectId === catalog.project.id && (mismatchedDocument || mismatchedAsset)) {
          const actual = mismatchedDocument?.sourcePath ?? mismatchedAsset?.sourcePath ?? "";
          addDiagnostic(catalog, document, {
            severity: "warning",
            code: "LINK_CASE_MISMATCH",
            message: `Link casing differs from "${actual}" (line ${link2.line}).`,
            suggestion: "Match the source path casing for cross-platform builds."
          });
          continue;
        }
        addDiagnostic(catalog, document, {
          severity: "warning",
          code: link2.image ? "BROKEN_ASSET" : "BROKEN_LINK",
          message: `Unresolved ${link2.image ? "asset" : "link"} "${link2.target}" (line ${link2.line}).`,
          suggestion: `Create the target ${link2.image ? "asset" : "document"} or update the relative path.`
        });
      }
    }
  }
  const allDocuments = new Map(
    catalogs.flatMap(
      (catalog) => catalog.documents.map((document) => [document.id, document])
    )
  );
  for (const catalog of catalogs) {
    for (const document of catalog.documents) {
      document.backlinks = [...new Set(document.backlinks)].sort();
      const relatedScores = /* @__PURE__ */ new Map();
      for (const other of allDocuments.values()) {
        if (other.id === document.id) continue;
        const sharedTags = document.tags.filter(
          (tag) => other.tags.includes(tag)
        ).length;
        const direct = document.links.some((link2) => link2.resolvedDocumentId === other.id) || document.backlinks.includes(other.id);
        const score = sharedTags * 2 + (direct ? 3 : 0);
        if (score > 0) relatedScores.set(other.id, score);
      }
      document.related = [...relatedScores.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      ).slice(0, 6).map(([id2]) => id2);
      for (const relatedId of document.related) {
        const relation = {
          from: document.id,
          to: relatedId,
          type: "related",
          source: "derived",
          confidence: Math.min(
            0.95,
            0.5 + (relatedScores.get(relatedId) ?? 0) * 0.1
          )
        };
        catalog.relations.push(relation);
      }
    }
  }
  return catalogs;
}

// src/docs/scanner.ts
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown", ".json", ".yaml", ".yml"]);
var ASSET_EXTENSIONS = /* @__PURE__ */ new Set([
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp"
]);
var MAX_TEXT_BYTES = 2 * 1024 * 1024;
function projectRelative(projectRoot, absolutePath) {
  return normalizeRelativePath(
    relative(projectRoot, absolutePath).replace(/\\/g, "/")
  );
}
function sourceAllows(source, sourceRelativePath) {
  const included = !source.include || source.include.length === 0 || source.include.some((glob) => matchesGlob(sourceRelativePath, glob));
  const excluded = source.exclude?.some((glob) => matchesGlob(sourceRelativePath, glob)) ?? false;
  return included && !excluded;
}
function scanSource(input) {
  const sourcePath = normalizeRelativePath(input.source.path);
  if (isSensitivePath(sourcePath)) {
    input.diagnostics.push({
      severity: "error",
      code: "SENSITIVE_SOURCE_REJECTED",
      projectId: input.projectId,
      path: sourcePath,
      message: "Manifest source is blocked by the built-in sensitive-path policy.",
      suggestion: "Move curated documentation to an approved docs root."
    });
    return;
  }
  let absoluteSource;
  try {
    absoluteSource = resolveWithinProject(input.projectRoot, sourcePath, {
      mustExist: true
    });
  } catch (error2) {
    input.diagnostics.push({
      severity: "warning",
      code: "SOURCE_UNAVAILABLE",
      projectId: input.projectId,
      path: sourcePath,
      message: error2 instanceof Error ? error2.message : String(error2),
      suggestion: "Create the source path or update the docs manifest."
    });
    return;
  }
  const sourceIsFile = statSync(absoluteSource).isFile();
  const seenDirectories = /* @__PURE__ */ new Set();
  const visit = (absolutePath, presentedPath) => {
    let containedPath2;
    try {
      containedPath2 = resolveWithinProject(input.projectRoot, presentedPath, {
        mustExist: true
      });
    } catch (error2) {
      const unavailable = error2 instanceof DocsPathError && error2.code === "PATH_NOT_FOUND";
      input.diagnostics.push({
        severity: unavailable ? "warning" : "error",
        code: unavailable ? "BROKEN_SYMLINK" : "PATH_CONTAINMENT_FAILED",
        projectId: input.projectId,
        path: presentedPath,
        message: error2 instanceof Error ? error2.message : String(error2),
        ...unavailable ? {
          suggestion: "Repair or remove the broken symlink from the approved docs root."
        } : {}
      });
      return;
    }
    const pathStat = statSync(containedPath2);
    if (pathStat.isDirectory()) {
      if (lstatSync(absolutePath).isSymbolicLink()) {
        input.diagnostics.push({
          severity: "info",
          code: "SYMLINK_DIRECTORY_SKIPPED",
          projectId: input.projectId,
          path: presentedPath,
          message: "Contained directory symlink was validated but skipped to avoid cycles."
        });
        return;
      }
      if (seenDirectories.has(containedPath2)) return;
      seenDirectories.add(containedPath2);
      for (const entry of readdirSync(containedPath2, {
        withFileTypes: true
      }).sort((left, right) => left.name.localeCompare(right.name))) {
        const childPresented = `${presentedPath}/${entry.name}`.replace(
          /\/+/g,
          "/"
        );
        if (isSensitivePath(childPresented)) continue;
        visit(join(containedPath2, entry.name), childPresented);
      }
      return;
    }
    if (!pathStat.isFile()) return;
    const relativePath = projectRelative(input.projectRoot, absolutePath);
    if (input.projectStatePath && input.projectStatePath.toLowerCase() === relativePath.toLowerCase()) {
      return;
    }
    const relativeToSource = sourceIsFile ? relativePath.split("/").at(-1) ?? relativePath : relative(sourcePath, relativePath).replace(/\\/g, "/");
    if (!sourceAllows(input.source, relativeToSource)) return;
    if (!isAllowedByPrivacy(relativePath, input.allow, input.exclude)) {
      return;
    }
    const extension = extname(relativePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      if (pathStat.size > MAX_TEXT_BYTES) {
        input.diagnostics.push({
          severity: "warning",
          code: "DOCUMENT_TOO_LARGE",
          projectId: input.projectId,
          path: relativePath,
          message: `Document exceeds the ${MAX_TEXT_BYTES}-byte safe read limit.`
        });
        return;
      }
      const content = readFileSync(containedPath2, "utf8");
      const document = normalizeTextDocument({
        projectId: input.projectId,
        sourcePath: relativePath,
        source: input.source,
        content,
        truth: input.truth
      });
      if (input.documents.has(relativePath)) {
        input.diagnostics.push({
          severity: "info",
          code: "DUPLICATE_SOURCE",
          projectId: input.projectId,
          path: relativePath,
          message: "Document matched more than one manifest source; first match wins."
        });
      } else {
        input.documents.set(relativePath, document);
      }
      return;
    }
    if (ASSET_EXTENSIONS.has(extension)) {
      const asset = normalizeAsset({
        projectId: input.projectId,
        sourcePath: relativePath,
        content: readFileSync(containedPath2)
      });
      if (!input.assets.has(relativePath))
        input.assets.set(relativePath, asset);
    }
  };
  visit(absoluteSource, sourcePath);
}
function addCatalogDiagnostics(catalog) {
  const lowerPaths = /* @__PURE__ */ new Map();
  for (const item of [...catalog.documents, ...catalog.assets]) {
    const lower = item.sourcePath.toLowerCase();
    const existing = lowerPaths.get(lower);
    if (existing && existing !== item.sourcePath) {
      catalog.diagnostics.push({
        severity: "error",
        code: "CASE_COLLISION",
        projectId: catalog.project.id,
        path: item.sourcePath,
        message: `Path collides with "${existing}" on case-insensitive filesystems.`,
        suggestion: "Rename one source so paths differ by more than letter casing."
      });
    } else {
      lowerPaths.set(lower, item.sourcePath);
    }
  }
  for (const truthPath of catalog.project.truthDocuments) {
    if (truthPath === catalog.project.statePath) continue;
    if (!catalog.documents.some((document) => document.sourcePath === truthPath)) {
      catalog.diagnostics.push({
        severity: "warning",
        code: "MISSING_TRUTH_DOCUMENT",
        projectId: catalog.project.id,
        path: truthPath,
        message: "Declared source-of-truth document was not found in the scan.",
        suggestion: "Fix the truth path or add it to an approved source."
      });
    }
  }
  const projectState = catalog.project.state;
  if (projectState) {
    for (const root of projectState.structure.roots) {
      try {
        resolveWithinProject(catalog.project.root, root.path, {
          mustExist: true
        });
      } catch (error2) {
        catalog.diagnostics.push({
          severity: "error",
          code: "PROJECT_STRUCTURE_ROOT_UNAVAILABLE",
          projectId: catalog.project.id,
          path: root.path,
          message: error2 instanceof Error ? error2.message : String(error2),
          suggestion: "Update structure.roots so every declared project area exists inside the project root."
        });
      }
    }
    const references = [
      ...projectState.roadmap.flatMap((item) => item.references),
      ...projectState.flows.flatMap(
        (flow) => flow.steps.flatMap((step) => step.references)
      ),
      ...projectState.backlog.flatMap((item) => item.references)
    ];
    for (const reference2 of references) {
      if (reference2.path === catalog.project.statePath) continue;
      const document = catalog.documents.find(
        (candidate) => candidate.sourcePath === reference2.path
      );
      if (!document) {
        catalog.diagnostics.push({
          severity: "warning",
          code: "PROJECT_STATE_REFERENCE_UNAVAILABLE",
          projectId: catalog.project.id,
          path: reference2.path,
          message: "Project state references a document that is not present in the approved catalog.",
          suggestion: "Add the document to approved sources or update the project-state reference."
        });
        continue;
      }
      if (reference2.anchor && !document.headings.some(
        (heading2) => heading2.slug === slugifyHeading(reference2.anchor)
      )) {
        catalog.diagnostics.push({
          severity: "warning",
          code: "PROJECT_STATE_REFERENCE_ANCHOR_MISSING",
          projectId: catalog.project.id,
          path: reference2.path,
          message: `Project state references missing anchor #${reference2.anchor}.`,
          suggestion: "Use an existing normalized heading anchor or remove the anchor."
        });
      }
    }
  }
  for (const document of catalog.documents) {
    for (const warning of document.warnings) {
      catalog.diagnostics.push({
        severity: "info",
        code: "DOCUMENT_METADATA_FALLBACK",
        projectId: catalog.project.id,
        path: document.sourcePath,
        message: warning
      });
    }
    for (const diagram of document.diagrams) {
      if (!diagram.valid) {
        catalog.diagnostics.push({
          severity: "error",
          code: "INVALID_DIAGRAM",
          projectId: catalog.project.id,
          path: document.sourcePath,
          message: `${diagram.error ?? "Invalid diagram"} (line ${diagram.line}).`,
          suggestion: "Fix Mermaid syntax; the portal will keep a text fallback."
        });
      }
    }
  }
  const gitnexusStatus = catalog.project.facts.gitnexus.status;
  if (gitnexusStatus === "stale") {
    catalog.diagnostics.push({
      severity: "warning",
      code: "GITNEXUS_STALE",
      projectId: catalog.project.id,
      message: "GitNexus metadata is stale relative to the current Git commit.",
      suggestion: "Run `node .gitnexus/run.cjs analyze` before publishing traceability."
    });
  } else if (gitnexusStatus === "unavailable") {
    catalog.diagnostics.push({
      severity: "warning",
      code: "GITNEXUS_UNAVAILABLE",
      projectId: catalog.project.id,
      message: "GitNexus was enabled but no readable index metadata is available.",
      suggestion: "Index the project or disable the adapter in the docs manifest."
    });
  }
}
function refreshCatalogSummary(catalog) {
  catalog.documents.sort(
    (left, right) => left.sourcePath.localeCompare(right.sourcePath)
  );
  catalog.assets.sort(
    (left, right) => left.sourcePath.localeCompare(right.sourcePath)
  );
  catalog.diagnostics.sort(
    (left, right) => left.severity.localeCompare(right.severity) || (left.path ?? "").localeCompare(right.path ?? "") || left.code.localeCompare(right.code)
  );
  catalog.sourceFingerprint = hashContent(
    JSON.stringify({
      manifest: catalog.project.manifestPath ? ".forgewright/docs-manifest.json" : "legacy",
      project: {
        id: catalog.project.id,
        title: catalog.project.title,
        truth: catalog.project.truthDocuments
      },
      documents: catalog.documents.map((document) => [
        document.sourcePath,
        document.contentHash
      ]),
      assets: catalog.assets.map((asset) => [
        asset.sourcePath,
        asset.contentHash
      ]),
      git: catalog.project.facts.git.commit,
      gitnexus: catalog.project.facts.gitnexus.indexedCommit,
      projectState: {
        path: catalog.project.statePath,
        hash: catalog.project.stateHash
      }
    })
  );
  const counts = { errors: 0, warnings: 0, info: 0 };
  for (const diagnostic2 of catalog.diagnostics) {
    if (diagnostic2.severity === "error") counts.errors += 1;
    else if (diagnostic2.severity === "warning") counts.warnings += 1;
    else counts.info += 1;
  }
  catalog.project.health = counts;
  catalog.project.scanStatus = counts.errors > 0 ? "error" : counts.warnings > 0 ? "warning" : "ok";
  return catalog;
}
function scanProject(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const loaded = loadManifest(projectRoot);
  const manifest = loaded.manifest;
  const truth = (manifest.truth ?? []).map(normalizeRelativePath);
  const allow = (manifest.privacy.allow ?? manifest.sources.map((source) => source.path)).map(normalizeRelativePath);
  const exclude = (manifest.privacy.exclude ?? []).map(normalizeRelativePath);
  const documents = /* @__PURE__ */ new Map();
  const assets = /* @__PURE__ */ new Map();
  const diagnostics = [...loaded.diagnostics];
  let projectState = null;
  let projectStatePath = null;
  let projectStateHash = null;
  if (allow.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "EMPTY_PRIVACY_ALLOWLIST",
      projectId: manifest.project.id,
      message: "Privacy mode is allowlist but no allowed paths are configured.",
      suggestion: "Add manifest source paths to privacy.allow."
    });
  }
  if (loaded.legacy || !manifest.project_docs) {
    diagnostics.push({
      severity: "error",
      code: "PROJECT_DOCS_CONTRACT_MISSING",
      projectId: manifest.project.id,
      message: "The docs manifest does not declare a project_docs state contract.",
      suggestion: "Run `forge docs init` and keep project_docs.state in the manifest."
    });
  } else {
    projectStatePath = manifest.project_docs.state;
    if (!isAllowedByPrivacy(projectStatePath, allow, exclude)) {
      diagnostics.push({
        severity: "error",
        code: "PROJECT_STATE_NOT_ALLOWLISTED",
        projectId: manifest.project.id,
        path: projectStatePath,
        message: "The project state path is not allowed by the privacy allowlist.",
        suggestion: "Add the project state path to privacy.allow and remove it from privacy.exclude."
      });
    } else {
      const loadedState = safeLoadProjectState(projectRoot, projectStatePath);
      projectStateHash = loadedState.contentHash;
      if (loadedState.state) {
        projectState = loadedState.state;
        const maxStaleDays = manifest.project_docs.max_stale_days ?? 30;
        const ageMs = Date.now() - Date.parse(projectState.status.updated_at);
        if (ageMs < -5 * 60 * 1e3) {
          diagnostics.push({
            severity: "error",
            code: "PROJECT_STATE_FUTURE_TIMESTAMP",
            projectId: manifest.project.id,
            path: projectStatePath,
            message: "Project state status.updated_at is more than five minutes in the future.",
            suggestion: "Correct the timestamp using the current local or UTC time with an explicit offset."
          });
        } else if (ageMs > maxStaleDays * 24 * 60 * 60 * 1e3) {
          diagnostics.push({
            severity: "warning",
            code: "PROJECT_STATE_STALE",
            projectId: manifest.project.id,
            path: projectStatePath,
            message: `Project state is older than the configured ${maxStaleDays}-day freshness window.`,
            suggestion: "Update status.updated_at after reviewing the project state."
          });
        }
      } else if (loadedState.error?.code === "missing") {
        diagnostics.push({
          severity: "error",
          code: "PROJECT_STATE_MISSING",
          projectId: manifest.project.id,
          path: projectStatePath,
          message: loadedState.error.message,
          suggestion: "Create the state file or run `forge docs init`."
        });
      } else {
        diagnostics.push({
          severity: "error",
          code: "PROJECT_STATE_INVALID",
          projectId: manifest.project.id,
          path: projectStatePath,
          message: loadedState.error?.message ?? "Project state could not be loaded.",
          suggestion: "Repair the JSON so it conforms to docs-project-state.schema.json."
        });
      }
    }
  }
  for (const source of manifest.sources) {
    scanSource({
      projectRoot,
      projectId: manifest.project.id,
      source,
      truth,
      projectStatePath,
      allow,
      exclude,
      documents,
      assets,
      diagnostics
    });
  }
  const catalog = {
    schema_version: DOCS_SCHEMA_VERSION,
    project: {
      id: manifest.project.id,
      title: manifest.project.title,
      root: projectRoot,
      manifestPath: loaded.manifestPath,
      state: projectState,
      statePath: projectStatePath,
      stateHash: projectStateHash,
      legacy: loaded.legacy,
      truthDocuments: truth,
      facts: collectProjectFacts(projectRoot, manifest),
      health: { errors: 0, warnings: 0, info: 0 },
      scanStatus: "ok"
    },
    documents: [...documents.values()],
    assets: [...assets.values()],
    relations: [],
    diagnostics,
    sourceFingerprint: ""
  };
  addCatalogDiagnostics(catalog);
  resolveCatalogLinks([catalog]);
  return refreshCatalogSummary(catalog);
}
function getCatalogPath(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  return join(projectRoot, ".forgewright", "cache", "docs-index.json");
}
function writeCatalog(catalog) {
  const path = getCatalogPath(catalog.project.root);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}
`, "utf8");
  return path;
}
function readCatalog(projectRootInput) {
  const path = getCatalogPath(projectRootInput);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

// src/docs/doctor.ts
function doctorCatalog(catalog, storedCatalog, options = {}) {
  const diagnostics = [...catalog.diagnostics];
  if (storedCatalog && storedCatalog.sourceFingerprint !== catalog.sourceFingerprint) {
    diagnostics.push({
      severity: "warning",
      code: "STALE_DOCS_INDEX",
      projectId: catalog.project.id,
      path: ".forgewright/cache/docs-index.json",
      message: "The stored normalized docs index is stale.",
      suggestion: "Run `forge docs scan` or `forge docs build`."
    });
  }
  const errors2 = diagnostics.filter(
    (diagnostic2) => diagnostic2.severity === "error"
  ).length;
  const warnings = diagnostics.filter(
    (diagnostic2) => diagnostic2.severity === "warning"
  ).length;
  const info = diagnostics.filter(
    (diagnostic2) => diagnostic2.severity === "info"
  ).length;
  const status = errors2 > 0 || options.strict && warnings > 0 ? "fail" : warnings > 0 ? "warning" : "pass";
  return {
    projectId: catalog.project.id,
    projectTitle: catalog.project.title,
    status,
    sourceFingerprint: catalog.sourceFingerprint,
    storedFingerprint: storedCatalog?.sourceFingerprint ?? null,
    diagnostics,
    summary: {
      documents: catalog.documents.length,
      assets: catalog.assets.length,
      errors: errors2,
      warnings,
      info
    }
  };
}

// ../../node_modules/markdown-it/lib/common/utils.mjs
var utils_exports = {};
__export(utils_exports, {
  arrayReplaceAt: () => arrayReplaceAt,
  assign: () => assign,
  escapeHtml: () => escapeHtml,
  escapeRE: () => escapeRE,
  fromCodePoint: () => fromCodePoint2,
  has: () => has,
  isMdAsciiPunct: () => isMdAsciiPunct,
  isPunctChar: () => isPunctChar,
  isSpace: () => isSpace,
  isString: () => isString,
  isValidEntityCode: () => isValidEntityCode,
  isWhiteSpace: () => isWhiteSpace,
  lib: () => lib,
  normalizeReference: () => normalizeReference,
  unescapeAll: () => unescapeAll,
  unescapeMd: () => unescapeMd
});

// ../../node_modules/mdurl/index.mjs
var mdurl_exports = {};
__export(mdurl_exports, {
  decode: () => decode_default,
  encode: () => encode_default,
  format: () => format,
  parse: () => parse_default
});

// ../../node_modules/mdurl/lib/decode.mjs
var decodeCache = {};
function getDecodeCache(exclude) {
  let cache = decodeCache[exclude];
  if (cache) {
    return cache;
  }
  cache = decodeCache[exclude] = [];
  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);
    cache.push(ch);
  }
  for (let i = 0; i < exclude.length; i++) {
    const ch = exclude.charCodeAt(i);
    cache[ch] = "%" + ("0" + ch.toString(16).toUpperCase()).slice(-2);
  }
  return cache;
}
function decode(string, exclude) {
  if (typeof exclude !== "string") {
    exclude = decode.defaultChars;
  }
  const cache = getDecodeCache(exclude);
  return string.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
    let result = "";
    for (let i = 0, l = seq.length; i < l; i += 3) {
      const b1 = parseInt(seq.slice(i + 1, i + 3), 16);
      if (b1 < 128) {
        result += cache[b1];
        continue;
      }
      if ((b1 & 224) === 192 && i + 3 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        if ((b2 & 192) === 128) {
          const chr = b1 << 6 & 1984 | b2 & 63;
          if (chr < 128) {
            result += "\uFFFD\uFFFD";
          } else {
            result += String.fromCharCode(chr);
          }
          i += 3;
          continue;
        }
      }
      if ((b1 & 240) === 224 && i + 6 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
        if ((b2 & 192) === 128 && (b3 & 192) === 128) {
          const chr = b1 << 12 & 61440 | b2 << 6 & 4032 | b3 & 63;
          if (chr < 2048 || chr >= 55296 && chr <= 57343) {
            result += "\uFFFD\uFFFD\uFFFD";
          } else {
            result += String.fromCharCode(chr);
          }
          i += 6;
          continue;
        }
      }
      if ((b1 & 248) === 240 && i + 9 < l) {
        const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
        const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
        const b4 = parseInt(seq.slice(i + 10, i + 12), 16);
        if ((b2 & 192) === 128 && (b3 & 192) === 128 && (b4 & 192) === 128) {
          let chr = b1 << 18 & 1835008 | b2 << 12 & 258048 | b3 << 6 & 4032 | b4 & 63;
          if (chr < 65536 || chr > 1114111) {
            result += "\uFFFD\uFFFD\uFFFD\uFFFD";
          } else {
            chr -= 65536;
            result += String.fromCharCode(55296 + (chr >> 10), 56320 + (chr & 1023));
          }
          i += 9;
          continue;
        }
      }
      result += "\uFFFD";
    }
    return result;
  });
}
decode.defaultChars = ";/?:@&=+$,#";
decode.componentChars = "";
var decode_default = decode;

// ../../node_modules/mdurl/lib/encode.mjs
var encodeCache = {};
function getEncodeCache(exclude) {
  let cache = encodeCache[exclude];
  if (cache) {
    return cache;
  }
  cache = encodeCache[exclude] = [];
  for (let i = 0; i < 128; i++) {
    const ch = String.fromCharCode(i);
    if (/^[0-9a-z]$/i.test(ch)) {
      cache.push(ch);
    } else {
      cache.push("%" + ("0" + i.toString(16).toUpperCase()).slice(-2));
    }
  }
  for (let i = 0; i < exclude.length; i++) {
    cache[exclude.charCodeAt(i)] = exclude[i];
  }
  return cache;
}
function encode(string, exclude, keepEscaped) {
  if (typeof exclude !== "string") {
    keepEscaped = exclude;
    exclude = encode.defaultChars;
  }
  if (typeof keepEscaped === "undefined") {
    keepEscaped = true;
  }
  const cache = getEncodeCache(exclude);
  let result = "";
  for (let i = 0, l = string.length; i < l; i++) {
    const code2 = string.charCodeAt(i);
    if (keepEscaped && code2 === 37 && i + 2 < l) {
      if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
        result += string.slice(i, i + 3);
        i += 2;
        continue;
      }
    }
    if (code2 < 128) {
      result += cache[code2];
      continue;
    }
    if (code2 >= 55296 && code2 <= 57343) {
      if (code2 >= 55296 && code2 <= 56319 && i + 1 < l) {
        const nextCode = string.charCodeAt(i + 1);
        if (nextCode >= 56320 && nextCode <= 57343) {
          result += encodeURIComponent(string[i] + string[i + 1]);
          i++;
          continue;
        }
      }
      result += "%EF%BF%BD";
      continue;
    }
    result += encodeURIComponent(string[i]);
  }
  return result;
}
encode.defaultChars = ";/?:@&=+$,-_.!~*'()#";
encode.componentChars = "-_.!~*'()";
var encode_default = encode;

// ../../node_modules/mdurl/lib/format.mjs
function format(url) {
  let result = "";
  result += url.protocol || "";
  result += url.slashes ? "//" : "";
  result += url.auth ? url.auth + "@" : "";
  if (url.hostname && url.hostname.indexOf(":") !== -1) {
    result += "[" + url.hostname + "]";
  } else {
    result += url.hostname || "";
  }
  result += url.port ? ":" + url.port : "";
  result += url.pathname || "";
  result += url.search || "";
  result += url.hash || "";
  return result;
}

// ../../node_modules/mdurl/lib/parse.mjs
function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.pathname = null;
}
var protocolPattern = /^([a-z0-9.+-]+:)/i;
var portPattern = /:[0-9]*$/;
var simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;
var delims = ["<", ">", '"', "`", " ", "\r", "\n", "	"];
var unwise = ["{", "}", "|", "\\", "^", "`"].concat(delims);
var autoEscape = ["'"].concat(unwise);
var nonHostChars = ["%", "/", "?", ";", "#"].concat(autoEscape);
var hostEndingChars = ["/", "?", "#"];
var hostnameMaxLen = 255;
var hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/;
var hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/;
var hostlessProtocol = {
  javascript: true,
  "javascript:": true
};
var slashedProtocol = {
  http: true,
  https: true,
  ftp: true,
  gopher: true,
  file: true,
  "http:": true,
  "https:": true,
  "ftp:": true,
  "gopher:": true,
  "file:": true
};
function urlParse(url, slashesDenoteHost) {
  if (url && url instanceof Url) return url;
  const u = new Url();
  u.parse(url, slashesDenoteHost);
  return u;
}
Url.prototype.parse = function(url, slashesDenoteHost) {
  let lowerProto, hec, slashes;
  let rest = url;
  rest = rest.trim();
  if (!slashesDenoteHost && url.split("#").length === 1) {
    const simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
      }
      return this;
    }
  }
  let proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    lowerProto = proto.toLowerCase();
    this.protocol = proto;
    rest = rest.substr(proto.length);
  }
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    slashes = rest.substr(0, 2) === "//";
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }
  if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
    let hostEnd = -1;
    for (let i = 0; i < hostEndingChars.length; i++) {
      hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }
    let auth, atSign;
    if (hostEnd === -1) {
      atSign = rest.lastIndexOf("@");
    } else {
      atSign = rest.lastIndexOf("@", hostEnd);
    }
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = auth;
    }
    hostEnd = -1;
    for (let i = 0; i < nonHostChars.length; i++) {
      hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec;
      }
    }
    if (hostEnd === -1) {
      hostEnd = rest.length;
    }
    if (rest[hostEnd - 1] === ":") {
      hostEnd--;
    }
    const host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);
    this.parseHost(host);
    this.hostname = this.hostname || "";
    const ipv6Hostname = this.hostname[0] === "[" && this.hostname[this.hostname.length - 1] === "]";
    if (!ipv6Hostname) {
      const hostparts = this.hostname.split(/\./);
      for (let i = 0, l = hostparts.length; i < l; i++) {
        const part = hostparts[i];
        if (!part) {
          continue;
        }
        if (!part.match(hostnamePartPattern)) {
          let newpart = "";
          for (let j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              newpart += "x";
            } else {
              newpart += part[j];
            }
          }
          if (!newpart.match(hostnamePartPattern)) {
            const validParts = hostparts.slice(0, i);
            const notHost = hostparts.slice(i + 1);
            const bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = notHost.join(".") + rest;
            }
            this.hostname = validParts.join(".");
            break;
          }
        }
      }
    }
    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = "";
    }
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
    }
  }
  const hash = rest.indexOf("#");
  if (hash !== -1) {
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  const qm = rest.indexOf("?");
  if (qm !== -1) {
    this.search = rest.substr(qm);
    rest = rest.slice(0, qm);
  }
  if (rest) {
    this.pathname = rest;
  }
  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = "";
  }
  return this;
};
Url.prototype.parseHost = function(host) {
  let port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ":") {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) {
    this.hostname = host;
  }
};
var parse_default = urlParse;

// ../../node_modules/uc.micro/index.mjs
var uc_exports = {};
__export(uc_exports, {
  Any: () => regex_default,
  Cc: () => regex_default2,
  Cf: () => regex_default3,
  P: () => regex_default4,
  S: () => regex_default5,
  Z: () => regex_default6
});

// ../../node_modules/uc.micro/properties/Any/regex.mjs
var regex_default = /[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;

// ../../node_modules/uc.micro/categories/Cc/regex.mjs
var regex_default2 = /[\0-\x1F\x7F-\x9F]/;

// ../../node_modules/uc.micro/categories/Cf/regex.mjs
var regex_default3 = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;

// ../../node_modules/uc.micro/categories/P/regex.mjs
var regex_default4 = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1B7D\u1B7E\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDEAD\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/;

// ../../node_modules/uc.micro/categories/S/regex.mjs
var regex_default5 = /[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C0\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2426\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2B95\u2B97-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E3\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBC2\uFD40-\uFD4F\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED7\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDF76\uDF7B-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0\uDCB1\uDD00-\uDE53\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE88\uDE90-\uDEBD\uDEBF-\uDEC5\uDECE-\uDEDB\uDEE0-\uDEE8\uDEF0-\uDEF8\uDF00-\uDF92\uDF94-\uDFCA]/;

// ../../node_modules/uc.micro/categories/Z/regex.mjs
var regex_default6 = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

// ../../node_modules/entities/lib/esm/generated/decode-data-html.js
var decode_data_html_default = new Uint16Array(
  // prettier-ignore
  '\u1D41<\xD5\u0131\u028A\u049D\u057B\u05D0\u0675\u06DE\u07A2\u07D6\u080F\u0A4A\u0A91\u0DA1\u0E6D\u0F09\u0F26\u10CA\u1228\u12E1\u1415\u149D\u14C3\u14DF\u1525\0\0\0\0\0\0\u156B\u16CD\u198D\u1C12\u1DDD\u1F7E\u2060\u21B0\u228D\u23C0\u23FB\u2442\u2824\u2912\u2D08\u2E48\u2FCE\u3016\u32BA\u3639\u37AC\u38FE\u3A28\u3A71\u3AE0\u3B2E\u0800EMabcfglmnoprstu\\bfms\x7F\x84\x8B\x90\x95\x98\xA6\xB3\xB9\xC8\xCFlig\u803B\xC6\u40C6P\u803B&\u4026cute\u803B\xC1\u40C1reve;\u4102\u0100iyx}rc\u803B\xC2\u40C2;\u4410r;\uC000\u{1D504}rave\u803B\xC0\u40C0pha;\u4391acr;\u4100d;\u6A53\u0100gp\x9D\xA1on;\u4104f;\uC000\u{1D538}plyFunction;\u6061ing\u803B\xC5\u40C5\u0100cs\xBE\xC3r;\uC000\u{1D49C}ign;\u6254ilde\u803B\xC3\u40C3ml\u803B\xC4\u40C4\u0400aceforsu\xE5\xFB\xFE\u0117\u011C\u0122\u0127\u012A\u0100cr\xEA\xF2kslash;\u6216\u0176\xF6\xF8;\u6AE7ed;\u6306y;\u4411\u0180crt\u0105\u010B\u0114ause;\u6235noullis;\u612Ca;\u4392r;\uC000\u{1D505}pf;\uC000\u{1D539}eve;\u42D8c\xF2\u0113mpeq;\u624E\u0700HOacdefhilorsu\u014D\u0151\u0156\u0180\u019E\u01A2\u01B5\u01B7\u01BA\u01DC\u0215\u0273\u0278\u027Ecy;\u4427PY\u803B\xA9\u40A9\u0180cpy\u015D\u0162\u017Aute;\u4106\u0100;i\u0167\u0168\u62D2talDifferentialD;\u6145leys;\u612D\u0200aeio\u0189\u018E\u0194\u0198ron;\u410Cdil\u803B\xC7\u40C7rc;\u4108nint;\u6230ot;\u410A\u0100dn\u01A7\u01ADilla;\u40B8terDot;\u40B7\xF2\u017Fi;\u43A7rcle\u0200DMPT\u01C7\u01CB\u01D1\u01D6ot;\u6299inus;\u6296lus;\u6295imes;\u6297o\u0100cs\u01E2\u01F8kwiseContourIntegral;\u6232eCurly\u0100DQ\u0203\u020FoubleQuote;\u601Duote;\u6019\u0200lnpu\u021E\u0228\u0247\u0255on\u0100;e\u0225\u0226\u6237;\u6A74\u0180git\u022F\u0236\u023Aruent;\u6261nt;\u622FourIntegral;\u622E\u0100fr\u024C\u024E;\u6102oduct;\u6210nterClockwiseContourIntegral;\u6233oss;\u6A2Fcr;\uC000\u{1D49E}p\u0100;C\u0284\u0285\u62D3ap;\u624D\u0580DJSZacefios\u02A0\u02AC\u02B0\u02B4\u02B8\u02CB\u02D7\u02E1\u02E6\u0333\u048D\u0100;o\u0179\u02A5trahd;\u6911cy;\u4402cy;\u4405cy;\u440F\u0180grs\u02BF\u02C4\u02C7ger;\u6021r;\u61A1hv;\u6AE4\u0100ay\u02D0\u02D5ron;\u410E;\u4414l\u0100;t\u02DD\u02DE\u6207a;\u4394r;\uC000\u{1D507}\u0100af\u02EB\u0327\u0100cm\u02F0\u0322ritical\u0200ADGT\u0300\u0306\u0316\u031Ccute;\u40B4o\u0174\u030B\u030D;\u42D9bleAcute;\u42DDrave;\u4060ilde;\u42DCond;\u62C4ferentialD;\u6146\u0470\u033D\0\0\0\u0342\u0354\0\u0405f;\uC000\u{1D53B}\u0180;DE\u0348\u0349\u034D\u40A8ot;\u60DCqual;\u6250ble\u0300CDLRUV\u0363\u0372\u0382\u03CF\u03E2\u03F8ontourIntegra\xEC\u0239o\u0274\u0379\0\0\u037B\xBB\u0349nArrow;\u61D3\u0100eo\u0387\u03A4ft\u0180ART\u0390\u0396\u03A1rrow;\u61D0ightArrow;\u61D4e\xE5\u02CAng\u0100LR\u03AB\u03C4eft\u0100AR\u03B3\u03B9rrow;\u67F8ightArrow;\u67FAightArrow;\u67F9ight\u0100AT\u03D8\u03DErrow;\u61D2ee;\u62A8p\u0241\u03E9\0\0\u03EFrrow;\u61D1ownArrow;\u61D5erticalBar;\u6225n\u0300ABLRTa\u0412\u042A\u0430\u045E\u047F\u037Crrow\u0180;BU\u041D\u041E\u0422\u6193ar;\u6913pArrow;\u61F5reve;\u4311eft\u02D2\u043A\0\u0446\0\u0450ightVector;\u6950eeVector;\u695Eector\u0100;B\u0459\u045A\u61BDar;\u6956ight\u01D4\u0467\0\u0471eeVector;\u695Fector\u0100;B\u047A\u047B\u61C1ar;\u6957ee\u0100;A\u0486\u0487\u62A4rrow;\u61A7\u0100ct\u0492\u0497r;\uC000\u{1D49F}rok;\u4110\u0800NTacdfglmopqstux\u04BD\u04C0\u04C4\u04CB\u04DE\u04E2\u04E7\u04EE\u04F5\u0521\u052F\u0536\u0552\u055D\u0560\u0565G;\u414AH\u803B\xD0\u40D0cute\u803B\xC9\u40C9\u0180aiy\u04D2\u04D7\u04DCron;\u411Arc\u803B\xCA\u40CA;\u442Dot;\u4116r;\uC000\u{1D508}rave\u803B\xC8\u40C8ement;\u6208\u0100ap\u04FA\u04FEcr;\u4112ty\u0253\u0506\0\0\u0512mallSquare;\u65FBerySmallSquare;\u65AB\u0100gp\u0526\u052Aon;\u4118f;\uC000\u{1D53C}silon;\u4395u\u0100ai\u053C\u0549l\u0100;T\u0542\u0543\u6A75ilde;\u6242librium;\u61CC\u0100ci\u0557\u055Ar;\u6130m;\u6A73a;\u4397ml\u803B\xCB\u40CB\u0100ip\u056A\u056Fsts;\u6203onentialE;\u6147\u0280cfios\u0585\u0588\u058D\u05B2\u05CCy;\u4424r;\uC000\u{1D509}lled\u0253\u0597\0\0\u05A3mallSquare;\u65FCerySmallSquare;\u65AA\u0370\u05BA\0\u05BF\0\0\u05C4f;\uC000\u{1D53D}All;\u6200riertrf;\u6131c\xF2\u05CB\u0600JTabcdfgorst\u05E8\u05EC\u05EF\u05FA\u0600\u0612\u0616\u061B\u061D\u0623\u066C\u0672cy;\u4403\u803B>\u403Emma\u0100;d\u05F7\u05F8\u4393;\u43DCreve;\u411E\u0180eiy\u0607\u060C\u0610dil;\u4122rc;\u411C;\u4413ot;\u4120r;\uC000\u{1D50A};\u62D9pf;\uC000\u{1D53E}eater\u0300EFGLST\u0635\u0644\u064E\u0656\u065B\u0666qual\u0100;L\u063E\u063F\u6265ess;\u62DBullEqual;\u6267reater;\u6AA2ess;\u6277lantEqual;\u6A7Eilde;\u6273cr;\uC000\u{1D4A2};\u626B\u0400Aacfiosu\u0685\u068B\u0696\u069B\u069E\u06AA\u06BE\u06CARDcy;\u442A\u0100ct\u0690\u0694ek;\u42C7;\u405Eirc;\u4124r;\u610ClbertSpace;\u610B\u01F0\u06AF\0\u06B2f;\u610DizontalLine;\u6500\u0100ct\u06C3\u06C5\xF2\u06A9rok;\u4126mp\u0144\u06D0\u06D8ownHum\xF0\u012Fqual;\u624F\u0700EJOacdfgmnostu\u06FA\u06FE\u0703\u0707\u070E\u071A\u071E\u0721\u0728\u0744\u0778\u078B\u078F\u0795cy;\u4415lig;\u4132cy;\u4401cute\u803B\xCD\u40CD\u0100iy\u0713\u0718rc\u803B\xCE\u40CE;\u4418ot;\u4130r;\u6111rave\u803B\xCC\u40CC\u0180;ap\u0720\u072F\u073F\u0100cg\u0734\u0737r;\u412AinaryI;\u6148lie\xF3\u03DD\u01F4\u0749\0\u0762\u0100;e\u074D\u074E\u622C\u0100gr\u0753\u0758ral;\u622Bsection;\u62C2isible\u0100CT\u076C\u0772omma;\u6063imes;\u6062\u0180gpt\u077F\u0783\u0788on;\u412Ef;\uC000\u{1D540}a;\u4399cr;\u6110ilde;\u4128\u01EB\u079A\0\u079Ecy;\u4406l\u803B\xCF\u40CF\u0280cfosu\u07AC\u07B7\u07BC\u07C2\u07D0\u0100iy\u07B1\u07B5rc;\u4134;\u4419r;\uC000\u{1D50D}pf;\uC000\u{1D541}\u01E3\u07C7\0\u07CCr;\uC000\u{1D4A5}rcy;\u4408kcy;\u4404\u0380HJacfos\u07E4\u07E8\u07EC\u07F1\u07FD\u0802\u0808cy;\u4425cy;\u440Cppa;\u439A\u0100ey\u07F6\u07FBdil;\u4136;\u441Ar;\uC000\u{1D50E}pf;\uC000\u{1D542}cr;\uC000\u{1D4A6}\u0580JTaceflmost\u0825\u0829\u082C\u0850\u0863\u09B3\u09B8\u09C7\u09CD\u0A37\u0A47cy;\u4409\u803B<\u403C\u0280cmnpr\u0837\u083C\u0841\u0844\u084Dute;\u4139bda;\u439Bg;\u67EAlacetrf;\u6112r;\u619E\u0180aey\u0857\u085C\u0861ron;\u413Ddil;\u413B;\u441B\u0100fs\u0868\u0970t\u0500ACDFRTUVar\u087E\u08A9\u08B1\u08E0\u08E6\u08FC\u092F\u095B\u0390\u096A\u0100nr\u0883\u088FgleBracket;\u67E8row\u0180;BR\u0899\u089A\u089E\u6190ar;\u61E4ightArrow;\u61C6eiling;\u6308o\u01F5\u08B7\0\u08C3bleBracket;\u67E6n\u01D4\u08C8\0\u08D2eeVector;\u6961ector\u0100;B\u08DB\u08DC\u61C3ar;\u6959loor;\u630Aight\u0100AV\u08EF\u08F5rrow;\u6194ector;\u694E\u0100er\u0901\u0917e\u0180;AV\u0909\u090A\u0910\u62A3rrow;\u61A4ector;\u695Aiangle\u0180;BE\u0924\u0925\u0929\u62B2ar;\u69CFqual;\u62B4p\u0180DTV\u0937\u0942\u094CownVector;\u6951eeVector;\u6960ector\u0100;B\u0956\u0957\u61BFar;\u6958ector\u0100;B\u0965\u0966\u61BCar;\u6952ight\xE1\u039Cs\u0300EFGLST\u097E\u098B\u0995\u099D\u09A2\u09ADqualGreater;\u62DAullEqual;\u6266reater;\u6276ess;\u6AA1lantEqual;\u6A7Dilde;\u6272r;\uC000\u{1D50F}\u0100;e\u09BD\u09BE\u62D8ftarrow;\u61DAidot;\u413F\u0180npw\u09D4\u0A16\u0A1Bg\u0200LRlr\u09DE\u09F7\u0A02\u0A10eft\u0100AR\u09E6\u09ECrrow;\u67F5ightArrow;\u67F7ightArrow;\u67F6eft\u0100ar\u03B3\u0A0Aight\xE1\u03BFight\xE1\u03CAf;\uC000\u{1D543}er\u0100LR\u0A22\u0A2CeftArrow;\u6199ightArrow;\u6198\u0180cht\u0A3E\u0A40\u0A42\xF2\u084C;\u61B0rok;\u4141;\u626A\u0400acefiosu\u0A5A\u0A5D\u0A60\u0A77\u0A7C\u0A85\u0A8B\u0A8Ep;\u6905y;\u441C\u0100dl\u0A65\u0A6FiumSpace;\u605Flintrf;\u6133r;\uC000\u{1D510}nusPlus;\u6213pf;\uC000\u{1D544}c\xF2\u0A76;\u439C\u0480Jacefostu\u0AA3\u0AA7\u0AAD\u0AC0\u0B14\u0B19\u0D91\u0D97\u0D9Ecy;\u440Acute;\u4143\u0180aey\u0AB4\u0AB9\u0ABEron;\u4147dil;\u4145;\u441D\u0180gsw\u0AC7\u0AF0\u0B0Eative\u0180MTV\u0AD3\u0ADF\u0AE8ediumSpace;\u600Bhi\u0100cn\u0AE6\u0AD8\xEB\u0AD9eryThi\xEE\u0AD9ted\u0100GL\u0AF8\u0B06reaterGreate\xF2\u0673essLes\xF3\u0A48Line;\u400Ar;\uC000\u{1D511}\u0200Bnpt\u0B22\u0B28\u0B37\u0B3Areak;\u6060BreakingSpace;\u40A0f;\u6115\u0680;CDEGHLNPRSTV\u0B55\u0B56\u0B6A\u0B7C\u0BA1\u0BEB\u0C04\u0C5E\u0C84\u0CA6\u0CD8\u0D61\u0D85\u6AEC\u0100ou\u0B5B\u0B64ngruent;\u6262pCap;\u626DoubleVerticalBar;\u6226\u0180lqx\u0B83\u0B8A\u0B9Bement;\u6209ual\u0100;T\u0B92\u0B93\u6260ilde;\uC000\u2242\u0338ists;\u6204reater\u0380;EFGLST\u0BB6\u0BB7\u0BBD\u0BC9\u0BD3\u0BD8\u0BE5\u626Fqual;\u6271ullEqual;\uC000\u2267\u0338reater;\uC000\u226B\u0338ess;\u6279lantEqual;\uC000\u2A7E\u0338ilde;\u6275ump\u0144\u0BF2\u0BFDownHump;\uC000\u224E\u0338qual;\uC000\u224F\u0338e\u0100fs\u0C0A\u0C27tTriangle\u0180;BE\u0C1A\u0C1B\u0C21\u62EAar;\uC000\u29CF\u0338qual;\u62ECs\u0300;EGLST\u0C35\u0C36\u0C3C\u0C44\u0C4B\u0C58\u626Equal;\u6270reater;\u6278ess;\uC000\u226A\u0338lantEqual;\uC000\u2A7D\u0338ilde;\u6274ested\u0100GL\u0C68\u0C79reaterGreater;\uC000\u2AA2\u0338essLess;\uC000\u2AA1\u0338recedes\u0180;ES\u0C92\u0C93\u0C9B\u6280qual;\uC000\u2AAF\u0338lantEqual;\u62E0\u0100ei\u0CAB\u0CB9verseElement;\u620CghtTriangle\u0180;BE\u0CCB\u0CCC\u0CD2\u62EBar;\uC000\u29D0\u0338qual;\u62ED\u0100qu\u0CDD\u0D0CuareSu\u0100bp\u0CE8\u0CF9set\u0100;E\u0CF0\u0CF3\uC000\u228F\u0338qual;\u62E2erset\u0100;E\u0D03\u0D06\uC000\u2290\u0338qual;\u62E3\u0180bcp\u0D13\u0D24\u0D4Eset\u0100;E\u0D1B\u0D1E\uC000\u2282\u20D2qual;\u6288ceeds\u0200;EST\u0D32\u0D33\u0D3B\u0D46\u6281qual;\uC000\u2AB0\u0338lantEqual;\u62E1ilde;\uC000\u227F\u0338erset\u0100;E\u0D58\u0D5B\uC000\u2283\u20D2qual;\u6289ilde\u0200;EFT\u0D6E\u0D6F\u0D75\u0D7F\u6241qual;\u6244ullEqual;\u6247ilde;\u6249erticalBar;\u6224cr;\uC000\u{1D4A9}ilde\u803B\xD1\u40D1;\u439D\u0700Eacdfgmoprstuv\u0DBD\u0DC2\u0DC9\u0DD5\u0DDB\u0DE0\u0DE7\u0DFC\u0E02\u0E20\u0E22\u0E32\u0E3F\u0E44lig;\u4152cute\u803B\xD3\u40D3\u0100iy\u0DCE\u0DD3rc\u803B\xD4\u40D4;\u441Eblac;\u4150r;\uC000\u{1D512}rave\u803B\xD2\u40D2\u0180aei\u0DEE\u0DF2\u0DF6cr;\u414Cga;\u43A9cron;\u439Fpf;\uC000\u{1D546}enCurly\u0100DQ\u0E0E\u0E1AoubleQuote;\u601Cuote;\u6018;\u6A54\u0100cl\u0E27\u0E2Cr;\uC000\u{1D4AA}ash\u803B\xD8\u40D8i\u016C\u0E37\u0E3Cde\u803B\xD5\u40D5es;\u6A37ml\u803B\xD6\u40D6er\u0100BP\u0E4B\u0E60\u0100ar\u0E50\u0E53r;\u603Eac\u0100ek\u0E5A\u0E5C;\u63DEet;\u63B4arenthesis;\u63DC\u0480acfhilors\u0E7F\u0E87\u0E8A\u0E8F\u0E92\u0E94\u0E9D\u0EB0\u0EFCrtialD;\u6202y;\u441Fr;\uC000\u{1D513}i;\u43A6;\u43A0usMinus;\u40B1\u0100ip\u0EA2\u0EADncareplan\xE5\u069Df;\u6119\u0200;eio\u0EB9\u0EBA\u0EE0\u0EE4\u6ABBcedes\u0200;EST\u0EC8\u0EC9\u0ECF\u0EDA\u627Aqual;\u6AAFlantEqual;\u627Cilde;\u627Eme;\u6033\u0100dp\u0EE9\u0EEEuct;\u620Fortion\u0100;a\u0225\u0EF9l;\u621D\u0100ci\u0F01\u0F06r;\uC000\u{1D4AB};\u43A8\u0200Ufos\u0F11\u0F16\u0F1B\u0F1FOT\u803B"\u4022r;\uC000\u{1D514}pf;\u611Acr;\uC000\u{1D4AC}\u0600BEacefhiorsu\u0F3E\u0F43\u0F47\u0F60\u0F73\u0FA7\u0FAA\u0FAD\u1096\u10A9\u10B4\u10BEarr;\u6910G\u803B\xAE\u40AE\u0180cnr\u0F4E\u0F53\u0F56ute;\u4154g;\u67EBr\u0100;t\u0F5C\u0F5D\u61A0l;\u6916\u0180aey\u0F67\u0F6C\u0F71ron;\u4158dil;\u4156;\u4420\u0100;v\u0F78\u0F79\u611Cerse\u0100EU\u0F82\u0F99\u0100lq\u0F87\u0F8Eement;\u620Builibrium;\u61CBpEquilibrium;\u696Fr\xBB\u0F79o;\u43A1ght\u0400ACDFTUVa\u0FC1\u0FEB\u0FF3\u1022\u1028\u105B\u1087\u03D8\u0100nr\u0FC6\u0FD2gleBracket;\u67E9row\u0180;BL\u0FDC\u0FDD\u0FE1\u6192ar;\u61E5eftArrow;\u61C4eiling;\u6309o\u01F5\u0FF9\0\u1005bleBracket;\u67E7n\u01D4\u100A\0\u1014eeVector;\u695Dector\u0100;B\u101D\u101E\u61C2ar;\u6955loor;\u630B\u0100er\u102D\u1043e\u0180;AV\u1035\u1036\u103C\u62A2rrow;\u61A6ector;\u695Biangle\u0180;BE\u1050\u1051\u1055\u62B3ar;\u69D0qual;\u62B5p\u0180DTV\u1063\u106E\u1078ownVector;\u694FeeVector;\u695Cector\u0100;B\u1082\u1083\u61BEar;\u6954ector\u0100;B\u1091\u1092\u61C0ar;\u6953\u0100pu\u109B\u109Ef;\u611DndImplies;\u6970ightarrow;\u61DB\u0100ch\u10B9\u10BCr;\u611B;\u61B1leDelayed;\u69F4\u0680HOacfhimoqstu\u10E4\u10F1\u10F7\u10FD\u1119\u111E\u1151\u1156\u1161\u1167\u11B5\u11BB\u11BF\u0100Cc\u10E9\u10EEHcy;\u4429y;\u4428FTcy;\u442Ccute;\u415A\u0280;aeiy\u1108\u1109\u110E\u1113\u1117\u6ABCron;\u4160dil;\u415Erc;\u415C;\u4421r;\uC000\u{1D516}ort\u0200DLRU\u112A\u1134\u113E\u1149ownArrow\xBB\u041EeftArrow\xBB\u089AightArrow\xBB\u0FDDpArrow;\u6191gma;\u43A3allCircle;\u6218pf;\uC000\u{1D54A}\u0272\u116D\0\0\u1170t;\u621Aare\u0200;ISU\u117B\u117C\u1189\u11AF\u65A1ntersection;\u6293u\u0100bp\u118F\u119Eset\u0100;E\u1197\u1198\u628Fqual;\u6291erset\u0100;E\u11A8\u11A9\u6290qual;\u6292nion;\u6294cr;\uC000\u{1D4AE}ar;\u62C6\u0200bcmp\u11C8\u11DB\u1209\u120B\u0100;s\u11CD\u11CE\u62D0et\u0100;E\u11CD\u11D5qual;\u6286\u0100ch\u11E0\u1205eeds\u0200;EST\u11ED\u11EE\u11F4\u11FF\u627Bqual;\u6AB0lantEqual;\u627Dilde;\u627FTh\xE1\u0F8C;\u6211\u0180;es\u1212\u1213\u1223\u62D1rset\u0100;E\u121C\u121D\u6283qual;\u6287et\xBB\u1213\u0580HRSacfhiors\u123E\u1244\u1249\u1255\u125E\u1271\u1276\u129F\u12C2\u12C8\u12D1ORN\u803B\xDE\u40DEADE;\u6122\u0100Hc\u124E\u1252cy;\u440By;\u4426\u0100bu\u125A\u125C;\u4009;\u43A4\u0180aey\u1265\u126A\u126Fron;\u4164dil;\u4162;\u4422r;\uC000\u{1D517}\u0100ei\u127B\u1289\u01F2\u1280\0\u1287efore;\u6234a;\u4398\u0100cn\u128E\u1298kSpace;\uC000\u205F\u200ASpace;\u6009lde\u0200;EFT\u12AB\u12AC\u12B2\u12BC\u623Cqual;\u6243ullEqual;\u6245ilde;\u6248pf;\uC000\u{1D54B}ipleDot;\u60DB\u0100ct\u12D6\u12DBr;\uC000\u{1D4AF}rok;\u4166\u0AE1\u12F7\u130E\u131A\u1326\0\u132C\u1331\0\0\0\0\0\u1338\u133D\u1377\u1385\0\u13FF\u1404\u140A\u1410\u0100cr\u12FB\u1301ute\u803B\xDA\u40DAr\u0100;o\u1307\u1308\u619Fcir;\u6949r\u01E3\u1313\0\u1316y;\u440Eve;\u416C\u0100iy\u131E\u1323rc\u803B\xDB\u40DB;\u4423blac;\u4170r;\uC000\u{1D518}rave\u803B\xD9\u40D9acr;\u416A\u0100di\u1341\u1369er\u0100BP\u1348\u135D\u0100ar\u134D\u1350r;\u405Fac\u0100ek\u1357\u1359;\u63DFet;\u63B5arenthesis;\u63DDon\u0100;P\u1370\u1371\u62C3lus;\u628E\u0100gp\u137B\u137Fon;\u4172f;\uC000\u{1D54C}\u0400ADETadps\u1395\u13AE\u13B8\u13C4\u03E8\u13D2\u13D7\u13F3rrow\u0180;BD\u1150\u13A0\u13A4ar;\u6912ownArrow;\u61C5ownArrow;\u6195quilibrium;\u696Eee\u0100;A\u13CB\u13CC\u62A5rrow;\u61A5own\xE1\u03F3er\u0100LR\u13DE\u13E8eftArrow;\u6196ightArrow;\u6197i\u0100;l\u13F9\u13FA\u43D2on;\u43A5ing;\u416Ecr;\uC000\u{1D4B0}ilde;\u4168ml\u803B\xDC\u40DC\u0480Dbcdefosv\u1427\u142C\u1430\u1433\u143E\u1485\u148A\u1490\u1496ash;\u62ABar;\u6AEBy;\u4412ash\u0100;l\u143B\u143C\u62A9;\u6AE6\u0100er\u1443\u1445;\u62C1\u0180bty\u144C\u1450\u147Aar;\u6016\u0100;i\u144F\u1455cal\u0200BLST\u1461\u1465\u146A\u1474ar;\u6223ine;\u407Ceparator;\u6758ilde;\u6240ThinSpace;\u600Ar;\uC000\u{1D519}pf;\uC000\u{1D54D}cr;\uC000\u{1D4B1}dash;\u62AA\u0280cefos\u14A7\u14AC\u14B1\u14B6\u14BCirc;\u4174dge;\u62C0r;\uC000\u{1D51A}pf;\uC000\u{1D54E}cr;\uC000\u{1D4B2}\u0200fios\u14CB\u14D0\u14D2\u14D8r;\uC000\u{1D51B};\u439Epf;\uC000\u{1D54F}cr;\uC000\u{1D4B3}\u0480AIUacfosu\u14F1\u14F5\u14F9\u14FD\u1504\u150F\u1514\u151A\u1520cy;\u442Fcy;\u4407cy;\u442Ecute\u803B\xDD\u40DD\u0100iy\u1509\u150Drc;\u4176;\u442Br;\uC000\u{1D51C}pf;\uC000\u{1D550}cr;\uC000\u{1D4B4}ml;\u4178\u0400Hacdefos\u1535\u1539\u153F\u154B\u154F\u155D\u1560\u1564cy;\u4416cute;\u4179\u0100ay\u1544\u1549ron;\u417D;\u4417ot;\u417B\u01F2\u1554\0\u155BoWidt\xE8\u0AD9a;\u4396r;\u6128pf;\u6124cr;\uC000\u{1D4B5}\u0BE1\u1583\u158A\u1590\0\u15B0\u15B6\u15BF\0\0\0\0\u15C6\u15DB\u15EB\u165F\u166D\0\u1695\u169B\u16B2\u16B9\0\u16BEcute\u803B\xE1\u40E1reve;\u4103\u0300;Ediuy\u159C\u159D\u15A1\u15A3\u15A8\u15AD\u623E;\uC000\u223E\u0333;\u623Frc\u803B\xE2\u40E2te\u80BB\xB4\u0306;\u4430lig\u803B\xE6\u40E6\u0100;r\xB2\u15BA;\uC000\u{1D51E}rave\u803B\xE0\u40E0\u0100ep\u15CA\u15D6\u0100fp\u15CF\u15D4sym;\u6135\xE8\u15D3ha;\u43B1\u0100ap\u15DFc\u0100cl\u15E4\u15E7r;\u4101g;\u6A3F\u0264\u15F0\0\0\u160A\u0280;adsv\u15FA\u15FB\u15FF\u1601\u1607\u6227nd;\u6A55;\u6A5Clope;\u6A58;\u6A5A\u0380;elmrsz\u1618\u1619\u161B\u161E\u163F\u164F\u1659\u6220;\u69A4e\xBB\u1619sd\u0100;a\u1625\u1626\u6221\u0461\u1630\u1632\u1634\u1636\u1638\u163A\u163C\u163E;\u69A8;\u69A9;\u69AA;\u69AB;\u69AC;\u69AD;\u69AE;\u69AFt\u0100;v\u1645\u1646\u621Fb\u0100;d\u164C\u164D\u62BE;\u699D\u0100pt\u1654\u1657h;\u6222\xBB\xB9arr;\u637C\u0100gp\u1663\u1667on;\u4105f;\uC000\u{1D552}\u0380;Eaeiop\u12C1\u167B\u167D\u1682\u1684\u1687\u168A;\u6A70cir;\u6A6F;\u624Ad;\u624Bs;\u4027rox\u0100;e\u12C1\u1692\xF1\u1683ing\u803B\xE5\u40E5\u0180cty\u16A1\u16A6\u16A8r;\uC000\u{1D4B6};\u402Amp\u0100;e\u12C1\u16AF\xF1\u0288ilde\u803B\xE3\u40E3ml\u803B\xE4\u40E4\u0100ci\u16C2\u16C8onin\xF4\u0272nt;\u6A11\u0800Nabcdefiklnoprsu\u16ED\u16F1\u1730\u173C\u1743\u1748\u1778\u177D\u17E0\u17E6\u1839\u1850\u170D\u193D\u1948\u1970ot;\u6AED\u0100cr\u16F6\u171Ek\u0200ceps\u1700\u1705\u170D\u1713ong;\u624Cpsilon;\u43F6rime;\u6035im\u0100;e\u171A\u171B\u623Dq;\u62CD\u0176\u1722\u1726ee;\u62BDed\u0100;g\u172C\u172D\u6305e\xBB\u172Drk\u0100;t\u135C\u1737brk;\u63B6\u0100oy\u1701\u1741;\u4431quo;\u601E\u0280cmprt\u1753\u175B\u1761\u1764\u1768aus\u0100;e\u010A\u0109ptyv;\u69B0s\xE9\u170Cno\xF5\u0113\u0180ahw\u176F\u1771\u1773;\u43B2;\u6136een;\u626Cr;\uC000\u{1D51F}g\u0380costuvw\u178D\u179D\u17B3\u17C1\u17D5\u17DB\u17DE\u0180aiu\u1794\u1796\u179A\xF0\u0760rc;\u65EFp\xBB\u1371\u0180dpt\u17A4\u17A8\u17ADot;\u6A00lus;\u6A01imes;\u6A02\u0271\u17B9\0\0\u17BEcup;\u6A06ar;\u6605riangle\u0100du\u17CD\u17D2own;\u65BDp;\u65B3plus;\u6A04e\xE5\u1444\xE5\u14ADarow;\u690D\u0180ako\u17ED\u1826\u1835\u0100cn\u17F2\u1823k\u0180lst\u17FA\u05AB\u1802ozenge;\u69EBriangle\u0200;dlr\u1812\u1813\u1818\u181D\u65B4own;\u65BEeft;\u65C2ight;\u65B8k;\u6423\u01B1\u182B\0\u1833\u01B2\u182F\0\u1831;\u6592;\u65914;\u6593ck;\u6588\u0100eo\u183E\u184D\u0100;q\u1843\u1846\uC000=\u20E5uiv;\uC000\u2261\u20E5t;\u6310\u0200ptwx\u1859\u185E\u1867\u186Cf;\uC000\u{1D553}\u0100;t\u13CB\u1863om\xBB\u13CCtie;\u62C8\u0600DHUVbdhmptuv\u1885\u1896\u18AA\u18BB\u18D7\u18DB\u18EC\u18FF\u1905\u190A\u1910\u1921\u0200LRlr\u188E\u1890\u1892\u1894;\u6557;\u6554;\u6556;\u6553\u0280;DUdu\u18A1\u18A2\u18A4\u18A6\u18A8\u6550;\u6566;\u6569;\u6564;\u6567\u0200LRlr\u18B3\u18B5\u18B7\u18B9;\u655D;\u655A;\u655C;\u6559\u0380;HLRhlr\u18CA\u18CB\u18CD\u18CF\u18D1\u18D3\u18D5\u6551;\u656C;\u6563;\u6560;\u656B;\u6562;\u655Fox;\u69C9\u0200LRlr\u18E4\u18E6\u18E8\u18EA;\u6555;\u6552;\u6510;\u650C\u0280;DUdu\u06BD\u18F7\u18F9\u18FB\u18FD;\u6565;\u6568;\u652C;\u6534inus;\u629Flus;\u629Eimes;\u62A0\u0200LRlr\u1919\u191B\u191D\u191F;\u655B;\u6558;\u6518;\u6514\u0380;HLRhlr\u1930\u1931\u1933\u1935\u1937\u1939\u193B\u6502;\u656A;\u6561;\u655E;\u653C;\u6524;\u651C\u0100ev\u0123\u1942bar\u803B\xA6\u40A6\u0200ceio\u1951\u1956\u195A\u1960r;\uC000\u{1D4B7}mi;\u604Fm\u0100;e\u171A\u171Cl\u0180;bh\u1968\u1969\u196B\u405C;\u69C5sub;\u67C8\u016C\u1974\u197El\u0100;e\u1979\u197A\u6022t\xBB\u197Ap\u0180;Ee\u012F\u1985\u1987;\u6AAE\u0100;q\u06DC\u06DB\u0CE1\u19A7\0\u19E8\u1A11\u1A15\u1A32\0\u1A37\u1A50\0\0\u1AB4\0\0\u1AC1\0\0\u1B21\u1B2E\u1B4D\u1B52\0\u1BFD\0\u1C0C\u0180cpr\u19AD\u19B2\u19DDute;\u4107\u0300;abcds\u19BF\u19C0\u19C4\u19CA\u19D5\u19D9\u6229nd;\u6A44rcup;\u6A49\u0100au\u19CF\u19D2p;\u6A4Bp;\u6A47ot;\u6A40;\uC000\u2229\uFE00\u0100eo\u19E2\u19E5t;\u6041\xEE\u0693\u0200aeiu\u19F0\u19FB\u1A01\u1A05\u01F0\u19F5\0\u19F8s;\u6A4Don;\u410Ddil\u803B\xE7\u40E7rc;\u4109ps\u0100;s\u1A0C\u1A0D\u6A4Cm;\u6A50ot;\u410B\u0180dmn\u1A1B\u1A20\u1A26il\u80BB\xB8\u01ADptyv;\u69B2t\u8100\xA2;e\u1A2D\u1A2E\u40A2r\xE4\u01B2r;\uC000\u{1D520}\u0180cei\u1A3D\u1A40\u1A4Dy;\u4447ck\u0100;m\u1A47\u1A48\u6713ark\xBB\u1A48;\u43C7r\u0380;Ecefms\u1A5F\u1A60\u1A62\u1A6B\u1AA4\u1AAA\u1AAE\u65CB;\u69C3\u0180;el\u1A69\u1A6A\u1A6D\u42C6q;\u6257e\u0261\u1A74\0\0\u1A88rrow\u0100lr\u1A7C\u1A81eft;\u61BAight;\u61BB\u0280RSacd\u1A92\u1A94\u1A96\u1A9A\u1A9F\xBB\u0F47;\u64C8st;\u629Birc;\u629Aash;\u629Dnint;\u6A10id;\u6AEFcir;\u69C2ubs\u0100;u\u1ABB\u1ABC\u6663it\xBB\u1ABC\u02EC\u1AC7\u1AD4\u1AFA\0\u1B0Aon\u0100;e\u1ACD\u1ACE\u403A\u0100;q\xC7\xC6\u026D\u1AD9\0\0\u1AE2a\u0100;t\u1ADE\u1ADF\u402C;\u4040\u0180;fl\u1AE8\u1AE9\u1AEB\u6201\xEE\u1160e\u0100mx\u1AF1\u1AF6ent\xBB\u1AE9e\xF3\u024D\u01E7\u1AFE\0\u1B07\u0100;d\u12BB\u1B02ot;\u6A6Dn\xF4\u0246\u0180fry\u1B10\u1B14\u1B17;\uC000\u{1D554}o\xE4\u0254\u8100\xA9;s\u0155\u1B1Dr;\u6117\u0100ao\u1B25\u1B29rr;\u61B5ss;\u6717\u0100cu\u1B32\u1B37r;\uC000\u{1D4B8}\u0100bp\u1B3C\u1B44\u0100;e\u1B41\u1B42\u6ACF;\u6AD1\u0100;e\u1B49\u1B4A\u6AD0;\u6AD2dot;\u62EF\u0380delprvw\u1B60\u1B6C\u1B77\u1B82\u1BAC\u1BD4\u1BF9arr\u0100lr\u1B68\u1B6A;\u6938;\u6935\u0270\u1B72\0\0\u1B75r;\u62DEc;\u62DFarr\u0100;p\u1B7F\u1B80\u61B6;\u693D\u0300;bcdos\u1B8F\u1B90\u1B96\u1BA1\u1BA5\u1BA8\u622Arcap;\u6A48\u0100au\u1B9B\u1B9Ep;\u6A46p;\u6A4Aot;\u628Dr;\u6A45;\uC000\u222A\uFE00\u0200alrv\u1BB5\u1BBF\u1BDE\u1BE3rr\u0100;m\u1BBC\u1BBD\u61B7;\u693Cy\u0180evw\u1BC7\u1BD4\u1BD8q\u0270\u1BCE\0\0\u1BD2re\xE3\u1B73u\xE3\u1B75ee;\u62CEedge;\u62CFen\u803B\xA4\u40A4earrow\u0100lr\u1BEE\u1BF3eft\xBB\u1B80ight\xBB\u1BBDe\xE4\u1BDD\u0100ci\u1C01\u1C07onin\xF4\u01F7nt;\u6231lcty;\u632D\u0980AHabcdefhijlorstuwz\u1C38\u1C3B\u1C3F\u1C5D\u1C69\u1C75\u1C8A\u1C9E\u1CAC\u1CB7\u1CFB\u1CFF\u1D0D\u1D7B\u1D91\u1DAB\u1DBB\u1DC6\u1DCDr\xF2\u0381ar;\u6965\u0200glrs\u1C48\u1C4D\u1C52\u1C54ger;\u6020eth;\u6138\xF2\u1133h\u0100;v\u1C5A\u1C5B\u6010\xBB\u090A\u016B\u1C61\u1C67arow;\u690Fa\xE3\u0315\u0100ay\u1C6E\u1C73ron;\u410F;\u4434\u0180;ao\u0332\u1C7C\u1C84\u0100gr\u02BF\u1C81r;\u61CAtseq;\u6A77\u0180glm\u1C91\u1C94\u1C98\u803B\xB0\u40B0ta;\u43B4ptyv;\u69B1\u0100ir\u1CA3\u1CA8sht;\u697F;\uC000\u{1D521}ar\u0100lr\u1CB3\u1CB5\xBB\u08DC\xBB\u101E\u0280aegsv\u1CC2\u0378\u1CD6\u1CDC\u1CE0m\u0180;os\u0326\u1CCA\u1CD4nd\u0100;s\u0326\u1CD1uit;\u6666amma;\u43DDin;\u62F2\u0180;io\u1CE7\u1CE8\u1CF8\u40F7de\u8100\xF7;o\u1CE7\u1CF0ntimes;\u62C7n\xF8\u1CF7cy;\u4452c\u026F\u1D06\0\0\u1D0Arn;\u631Eop;\u630D\u0280lptuw\u1D18\u1D1D\u1D22\u1D49\u1D55lar;\u4024f;\uC000\u{1D555}\u0280;emps\u030B\u1D2D\u1D37\u1D3D\u1D42q\u0100;d\u0352\u1D33ot;\u6251inus;\u6238lus;\u6214quare;\u62A1blebarwedg\xE5\xFAn\u0180adh\u112E\u1D5D\u1D67ownarrow\xF3\u1C83arpoon\u0100lr\u1D72\u1D76ef\xF4\u1CB4igh\xF4\u1CB6\u0162\u1D7F\u1D85karo\xF7\u0F42\u026F\u1D8A\0\0\u1D8Ern;\u631Fop;\u630C\u0180cot\u1D98\u1DA3\u1DA6\u0100ry\u1D9D\u1DA1;\uC000\u{1D4B9};\u4455l;\u69F6rok;\u4111\u0100dr\u1DB0\u1DB4ot;\u62F1i\u0100;f\u1DBA\u1816\u65BF\u0100ah\u1DC0\u1DC3r\xF2\u0429a\xF2\u0FA6angle;\u69A6\u0100ci\u1DD2\u1DD5y;\u445Fgrarr;\u67FF\u0900Dacdefglmnopqrstux\u1E01\u1E09\u1E19\u1E38\u0578\u1E3C\u1E49\u1E61\u1E7E\u1EA5\u1EAF\u1EBD\u1EE1\u1F2A\u1F37\u1F44\u1F4E\u1F5A\u0100Do\u1E06\u1D34o\xF4\u1C89\u0100cs\u1E0E\u1E14ute\u803B\xE9\u40E9ter;\u6A6E\u0200aioy\u1E22\u1E27\u1E31\u1E36ron;\u411Br\u0100;c\u1E2D\u1E2E\u6256\u803B\xEA\u40EAlon;\u6255;\u444Dot;\u4117\u0100Dr\u1E41\u1E45ot;\u6252;\uC000\u{1D522}\u0180;rs\u1E50\u1E51\u1E57\u6A9Aave\u803B\xE8\u40E8\u0100;d\u1E5C\u1E5D\u6A96ot;\u6A98\u0200;ils\u1E6A\u1E6B\u1E72\u1E74\u6A99nters;\u63E7;\u6113\u0100;d\u1E79\u1E7A\u6A95ot;\u6A97\u0180aps\u1E85\u1E89\u1E97cr;\u4113ty\u0180;sv\u1E92\u1E93\u1E95\u6205et\xBB\u1E93p\u01001;\u1E9D\u1EA4\u0133\u1EA1\u1EA3;\u6004;\u6005\u6003\u0100gs\u1EAA\u1EAC;\u414Bp;\u6002\u0100gp\u1EB4\u1EB8on;\u4119f;\uC000\u{1D556}\u0180als\u1EC4\u1ECE\u1ED2r\u0100;s\u1ECA\u1ECB\u62D5l;\u69E3us;\u6A71i\u0180;lv\u1EDA\u1EDB\u1EDF\u43B5on\xBB\u1EDB;\u43F5\u0200csuv\u1EEA\u1EF3\u1F0B\u1F23\u0100io\u1EEF\u1E31rc\xBB\u1E2E\u0269\u1EF9\0\0\u1EFB\xED\u0548ant\u0100gl\u1F02\u1F06tr\xBB\u1E5Dess\xBB\u1E7A\u0180aei\u1F12\u1F16\u1F1Als;\u403Dst;\u625Fv\u0100;D\u0235\u1F20D;\u6A78parsl;\u69E5\u0100Da\u1F2F\u1F33ot;\u6253rr;\u6971\u0180cdi\u1F3E\u1F41\u1EF8r;\u612Fo\xF4\u0352\u0100ah\u1F49\u1F4B;\u43B7\u803B\xF0\u40F0\u0100mr\u1F53\u1F57l\u803B\xEB\u40EBo;\u60AC\u0180cip\u1F61\u1F64\u1F67l;\u4021s\xF4\u056E\u0100eo\u1F6C\u1F74ctatio\xEE\u0559nential\xE5\u0579\u09E1\u1F92\0\u1F9E\0\u1FA1\u1FA7\0\0\u1FC6\u1FCC\0\u1FD3\0\u1FE6\u1FEA\u2000\0\u2008\u205Allingdotse\xF1\u1E44y;\u4444male;\u6640\u0180ilr\u1FAD\u1FB3\u1FC1lig;\u8000\uFB03\u0269\u1FB9\0\0\u1FBDg;\u8000\uFB00ig;\u8000\uFB04;\uC000\u{1D523}lig;\u8000\uFB01lig;\uC000fj\u0180alt\u1FD9\u1FDC\u1FE1t;\u666Dig;\u8000\uFB02ns;\u65B1of;\u4192\u01F0\u1FEE\0\u1FF3f;\uC000\u{1D557}\u0100ak\u05BF\u1FF7\u0100;v\u1FFC\u1FFD\u62D4;\u6AD9artint;\u6A0D\u0100ao\u200C\u2055\u0100cs\u2011\u2052\u03B1\u201A\u2030\u2038\u2045\u2048\0\u2050\u03B2\u2022\u2025\u2027\u202A\u202C\0\u202E\u803B\xBD\u40BD;\u6153\u803B\xBC\u40BC;\u6155;\u6159;\u615B\u01B3\u2034\0\u2036;\u6154;\u6156\u02B4\u203E\u2041\0\0\u2043\u803B\xBE\u40BE;\u6157;\u615C5;\u6158\u01B6\u204C\0\u204E;\u615A;\u615D8;\u615El;\u6044wn;\u6322cr;\uC000\u{1D4BB}\u0880Eabcdefgijlnorstv\u2082\u2089\u209F\u20A5\u20B0\u20B4\u20F0\u20F5\u20FA\u20FF\u2103\u2112\u2138\u0317\u213E\u2152\u219E\u0100;l\u064D\u2087;\u6A8C\u0180cmp\u2090\u2095\u209Dute;\u41F5ma\u0100;d\u209C\u1CDA\u43B3;\u6A86reve;\u411F\u0100iy\u20AA\u20AErc;\u411D;\u4433ot;\u4121\u0200;lqs\u063E\u0642\u20BD\u20C9\u0180;qs\u063E\u064C\u20C4lan\xF4\u0665\u0200;cdl\u0665\u20D2\u20D5\u20E5c;\u6AA9ot\u0100;o\u20DC\u20DD\u6A80\u0100;l\u20E2\u20E3\u6A82;\u6A84\u0100;e\u20EA\u20ED\uC000\u22DB\uFE00s;\u6A94r;\uC000\u{1D524}\u0100;g\u0673\u061Bmel;\u6137cy;\u4453\u0200;Eaj\u065A\u210C\u210E\u2110;\u6A92;\u6AA5;\u6AA4\u0200Eaes\u211B\u211D\u2129\u2134;\u6269p\u0100;p\u2123\u2124\u6A8Arox\xBB\u2124\u0100;q\u212E\u212F\u6A88\u0100;q\u212E\u211Bim;\u62E7pf;\uC000\u{1D558}\u0100ci\u2143\u2146r;\u610Am\u0180;el\u066B\u214E\u2150;\u6A8E;\u6A90\u8300>;cdlqr\u05EE\u2160\u216A\u216E\u2173\u2179\u0100ci\u2165\u2167;\u6AA7r;\u6A7Aot;\u62D7Par;\u6995uest;\u6A7C\u0280adels\u2184\u216A\u2190\u0656\u219B\u01F0\u2189\0\u218Epro\xF8\u209Er;\u6978q\u0100lq\u063F\u2196les\xF3\u2088i\xED\u066B\u0100en\u21A3\u21ADrtneqq;\uC000\u2269\uFE00\xC5\u21AA\u0500Aabcefkosy\u21C4\u21C7\u21F1\u21F5\u21FA\u2218\u221D\u222F\u2268\u227Dr\xF2\u03A0\u0200ilmr\u21D0\u21D4\u21D7\u21DBrs\xF0\u1484f\xBB\u2024il\xF4\u06A9\u0100dr\u21E0\u21E4cy;\u444A\u0180;cw\u08F4\u21EB\u21EFir;\u6948;\u61ADar;\u610Firc;\u4125\u0180alr\u2201\u220E\u2213rts\u0100;u\u2209\u220A\u6665it\xBB\u220Alip;\u6026con;\u62B9r;\uC000\u{1D525}s\u0100ew\u2223\u2229arow;\u6925arow;\u6926\u0280amopr\u223A\u223E\u2243\u225E\u2263rr;\u61FFtht;\u623Bk\u0100lr\u2249\u2253eftarrow;\u61A9ightarrow;\u61AAf;\uC000\u{1D559}bar;\u6015\u0180clt\u226F\u2274\u2278r;\uC000\u{1D4BD}as\xE8\u21F4rok;\u4127\u0100bp\u2282\u2287ull;\u6043hen\xBB\u1C5B\u0AE1\u22A3\0\u22AA\0\u22B8\u22C5\u22CE\0\u22D5\u22F3\0\0\u22F8\u2322\u2367\u2362\u237F\0\u2386\u23AA\u23B4cute\u803B\xED\u40ED\u0180;iy\u0771\u22B0\u22B5rc\u803B\xEE\u40EE;\u4438\u0100cx\u22BC\u22BFy;\u4435cl\u803B\xA1\u40A1\u0100fr\u039F\u22C9;\uC000\u{1D526}rave\u803B\xEC\u40EC\u0200;ino\u073E\u22DD\u22E9\u22EE\u0100in\u22E2\u22E6nt;\u6A0Ct;\u622Dfin;\u69DCta;\u6129lig;\u4133\u0180aop\u22FE\u231A\u231D\u0180cgt\u2305\u2308\u2317r;\u412B\u0180elp\u071F\u230F\u2313in\xE5\u078Ear\xF4\u0720h;\u4131f;\u62B7ed;\u41B5\u0280;cfot\u04F4\u232C\u2331\u233D\u2341are;\u6105in\u0100;t\u2338\u2339\u621Eie;\u69DDdo\xF4\u2319\u0280;celp\u0757\u234C\u2350\u235B\u2361al;\u62BA\u0100gr\u2355\u2359er\xF3\u1563\xE3\u234Darhk;\u6A17rod;\u6A3C\u0200cgpt\u236F\u2372\u2376\u237By;\u4451on;\u412Ff;\uC000\u{1D55A}a;\u43B9uest\u803B\xBF\u40BF\u0100ci\u238A\u238Fr;\uC000\u{1D4BE}n\u0280;Edsv\u04F4\u239B\u239D\u23A1\u04F3;\u62F9ot;\u62F5\u0100;v\u23A6\u23A7\u62F4;\u62F3\u0100;i\u0777\u23AElde;\u4129\u01EB\u23B8\0\u23BCcy;\u4456l\u803B\xEF\u40EF\u0300cfmosu\u23CC\u23D7\u23DC\u23E1\u23E7\u23F5\u0100iy\u23D1\u23D5rc;\u4135;\u4439r;\uC000\u{1D527}ath;\u4237pf;\uC000\u{1D55B}\u01E3\u23EC\0\u23F1r;\uC000\u{1D4BF}rcy;\u4458kcy;\u4454\u0400acfghjos\u240B\u2416\u2422\u2427\u242D\u2431\u2435\u243Bppa\u0100;v\u2413\u2414\u43BA;\u43F0\u0100ey\u241B\u2420dil;\u4137;\u443Ar;\uC000\u{1D528}reen;\u4138cy;\u4445cy;\u445Cpf;\uC000\u{1D55C}cr;\uC000\u{1D4C0}\u0B80ABEHabcdefghjlmnoprstuv\u2470\u2481\u2486\u248D\u2491\u250E\u253D\u255A\u2580\u264E\u265E\u2665\u2679\u267D\u269A\u26B2\u26D8\u275D\u2768\u278B\u27C0\u2801\u2812\u0180art\u2477\u247A\u247Cr\xF2\u09C6\xF2\u0395ail;\u691Barr;\u690E\u0100;g\u0994\u248B;\u6A8Bar;\u6962\u0963\u24A5\0\u24AA\0\u24B1\0\0\0\0\0\u24B5\u24BA\0\u24C6\u24C8\u24CD\0\u24F9ute;\u413Amptyv;\u69B4ra\xEE\u084Cbda;\u43BBg\u0180;dl\u088E\u24C1\u24C3;\u6991\xE5\u088E;\u6A85uo\u803B\xAB\u40ABr\u0400;bfhlpst\u0899\u24DE\u24E6\u24E9\u24EB\u24EE\u24F1\u24F5\u0100;f\u089D\u24E3s;\u691Fs;\u691D\xEB\u2252p;\u61ABl;\u6939im;\u6973l;\u61A2\u0180;ae\u24FF\u2500\u2504\u6AABil;\u6919\u0100;s\u2509\u250A\u6AAD;\uC000\u2AAD\uFE00\u0180abr\u2515\u2519\u251Drr;\u690Crk;\u6772\u0100ak\u2522\u252Cc\u0100ek\u2528\u252A;\u407B;\u405B\u0100es\u2531\u2533;\u698Bl\u0100du\u2539\u253B;\u698F;\u698D\u0200aeuy\u2546\u254B\u2556\u2558ron;\u413E\u0100di\u2550\u2554il;\u413C\xEC\u08B0\xE2\u2529;\u443B\u0200cqrs\u2563\u2566\u256D\u257Da;\u6936uo\u0100;r\u0E19\u1746\u0100du\u2572\u2577har;\u6967shar;\u694Bh;\u61B2\u0280;fgqs\u258B\u258C\u0989\u25F3\u25FF\u6264t\u0280ahlrt\u2598\u25A4\u25B7\u25C2\u25E8rrow\u0100;t\u0899\u25A1a\xE9\u24F6arpoon\u0100du\u25AF\u25B4own\xBB\u045Ap\xBB\u0966eftarrows;\u61C7ight\u0180ahs\u25CD\u25D6\u25DErrow\u0100;s\u08F4\u08A7arpoon\xF3\u0F98quigarro\xF7\u21F0hreetimes;\u62CB\u0180;qs\u258B\u0993\u25FAlan\xF4\u09AC\u0280;cdgs\u09AC\u260A\u260D\u261D\u2628c;\u6AA8ot\u0100;o\u2614\u2615\u6A7F\u0100;r\u261A\u261B\u6A81;\u6A83\u0100;e\u2622\u2625\uC000\u22DA\uFE00s;\u6A93\u0280adegs\u2633\u2639\u263D\u2649\u264Bppro\xF8\u24C6ot;\u62D6q\u0100gq\u2643\u2645\xF4\u0989gt\xF2\u248C\xF4\u099Bi\xED\u09B2\u0180ilr\u2655\u08E1\u265Asht;\u697C;\uC000\u{1D529}\u0100;E\u099C\u2663;\u6A91\u0161\u2669\u2676r\u0100du\u25B2\u266E\u0100;l\u0965\u2673;\u696Alk;\u6584cy;\u4459\u0280;acht\u0A48\u2688\u268B\u2691\u2696r\xF2\u25C1orne\xF2\u1D08ard;\u696Bri;\u65FA\u0100io\u269F\u26A4dot;\u4140ust\u0100;a\u26AC\u26AD\u63B0che\xBB\u26AD\u0200Eaes\u26BB\u26BD\u26C9\u26D4;\u6268p\u0100;p\u26C3\u26C4\u6A89rox\xBB\u26C4\u0100;q\u26CE\u26CF\u6A87\u0100;q\u26CE\u26BBim;\u62E6\u0400abnoptwz\u26E9\u26F4\u26F7\u271A\u272F\u2741\u2747\u2750\u0100nr\u26EE\u26F1g;\u67ECr;\u61FDr\xEB\u08C1g\u0180lmr\u26FF\u270D\u2714eft\u0100ar\u09E6\u2707ight\xE1\u09F2apsto;\u67FCight\xE1\u09FDparrow\u0100lr\u2725\u2729ef\xF4\u24EDight;\u61AC\u0180afl\u2736\u2739\u273Dr;\u6985;\uC000\u{1D55D}us;\u6A2Dimes;\u6A34\u0161\u274B\u274Fst;\u6217\xE1\u134E\u0180;ef\u2757\u2758\u1800\u65CAnge\xBB\u2758ar\u0100;l\u2764\u2765\u4028t;\u6993\u0280achmt\u2773\u2776\u277C\u2785\u2787r\xF2\u08A8orne\xF2\u1D8Car\u0100;d\u0F98\u2783;\u696D;\u600Eri;\u62BF\u0300achiqt\u2798\u279D\u0A40\u27A2\u27AE\u27BBquo;\u6039r;\uC000\u{1D4C1}m\u0180;eg\u09B2\u27AA\u27AC;\u6A8D;\u6A8F\u0100bu\u252A\u27B3o\u0100;r\u0E1F\u27B9;\u601Arok;\u4142\u8400<;cdhilqr\u082B\u27D2\u2639\u27DC\u27E0\u27E5\u27EA\u27F0\u0100ci\u27D7\u27D9;\u6AA6r;\u6A79re\xE5\u25F2mes;\u62C9arr;\u6976uest;\u6A7B\u0100Pi\u27F5\u27F9ar;\u6996\u0180;ef\u2800\u092D\u181B\u65C3r\u0100du\u2807\u280Dshar;\u694Ahar;\u6966\u0100en\u2817\u2821rtneqq;\uC000\u2268\uFE00\xC5\u281E\u0700Dacdefhilnopsu\u2840\u2845\u2882\u288E\u2893\u28A0\u28A5\u28A8\u28DA\u28E2\u28E4\u0A83\u28F3\u2902Dot;\u623A\u0200clpr\u284E\u2852\u2863\u287Dr\u803B\xAF\u40AF\u0100et\u2857\u2859;\u6642\u0100;e\u285E\u285F\u6720se\xBB\u285F\u0100;s\u103B\u2868to\u0200;dlu\u103B\u2873\u2877\u287Bow\xEE\u048Cef\xF4\u090F\xF0\u13D1ker;\u65AE\u0100oy\u2887\u288Cmma;\u6A29;\u443Cash;\u6014asuredangle\xBB\u1626r;\uC000\u{1D52A}o;\u6127\u0180cdn\u28AF\u28B4\u28C9ro\u803B\xB5\u40B5\u0200;acd\u1464\u28BD\u28C0\u28C4s\xF4\u16A7ir;\u6AF0ot\u80BB\xB7\u01B5us\u0180;bd\u28D2\u1903\u28D3\u6212\u0100;u\u1D3C\u28D8;\u6A2A\u0163\u28DE\u28E1p;\u6ADB\xF2\u2212\xF0\u0A81\u0100dp\u28E9\u28EEels;\u62A7f;\uC000\u{1D55E}\u0100ct\u28F8\u28FDr;\uC000\u{1D4C2}pos\xBB\u159D\u0180;lm\u2909\u290A\u290D\u43BCtimap;\u62B8\u0C00GLRVabcdefghijlmoprstuvw\u2942\u2953\u297E\u2989\u2998\u29DA\u29E9\u2A15\u2A1A\u2A58\u2A5D\u2A83\u2A95\u2AA4\u2AA8\u2B04\u2B07\u2B44\u2B7F\u2BAE\u2C34\u2C67\u2C7C\u2CE9\u0100gt\u2947\u294B;\uC000\u22D9\u0338\u0100;v\u2950\u0BCF\uC000\u226B\u20D2\u0180elt\u295A\u2972\u2976ft\u0100ar\u2961\u2967rrow;\u61CDightarrow;\u61CE;\uC000\u22D8\u0338\u0100;v\u297B\u0C47\uC000\u226A\u20D2ightarrow;\u61CF\u0100Dd\u298E\u2993ash;\u62AFash;\u62AE\u0280bcnpt\u29A3\u29A7\u29AC\u29B1\u29CCla\xBB\u02DEute;\u4144g;\uC000\u2220\u20D2\u0280;Eiop\u0D84\u29BC\u29C0\u29C5\u29C8;\uC000\u2A70\u0338d;\uC000\u224B\u0338s;\u4149ro\xF8\u0D84ur\u0100;a\u29D3\u29D4\u666El\u0100;s\u29D3\u0B38\u01F3\u29DF\0\u29E3p\u80BB\xA0\u0B37mp\u0100;e\u0BF9\u0C00\u0280aeouy\u29F4\u29FE\u2A03\u2A10\u2A13\u01F0\u29F9\0\u29FB;\u6A43on;\u4148dil;\u4146ng\u0100;d\u0D7E\u2A0Aot;\uC000\u2A6D\u0338p;\u6A42;\u443Dash;\u6013\u0380;Aadqsx\u0B92\u2A29\u2A2D\u2A3B\u2A41\u2A45\u2A50rr;\u61D7r\u0100hr\u2A33\u2A36k;\u6924\u0100;o\u13F2\u13F0ot;\uC000\u2250\u0338ui\xF6\u0B63\u0100ei\u2A4A\u2A4Ear;\u6928\xED\u0B98ist\u0100;s\u0BA0\u0B9Fr;\uC000\u{1D52B}\u0200Eest\u0BC5\u2A66\u2A79\u2A7C\u0180;qs\u0BBC\u2A6D\u0BE1\u0180;qs\u0BBC\u0BC5\u2A74lan\xF4\u0BE2i\xED\u0BEA\u0100;r\u0BB6\u2A81\xBB\u0BB7\u0180Aap\u2A8A\u2A8D\u2A91r\xF2\u2971rr;\u61AEar;\u6AF2\u0180;sv\u0F8D\u2A9C\u0F8C\u0100;d\u2AA1\u2AA2\u62FC;\u62FAcy;\u445A\u0380AEadest\u2AB7\u2ABA\u2ABE\u2AC2\u2AC5\u2AF6\u2AF9r\xF2\u2966;\uC000\u2266\u0338rr;\u619Ar;\u6025\u0200;fqs\u0C3B\u2ACE\u2AE3\u2AEFt\u0100ar\u2AD4\u2AD9rro\xF7\u2AC1ightarro\xF7\u2A90\u0180;qs\u0C3B\u2ABA\u2AEAlan\xF4\u0C55\u0100;s\u0C55\u2AF4\xBB\u0C36i\xED\u0C5D\u0100;r\u0C35\u2AFEi\u0100;e\u0C1A\u0C25i\xE4\u0D90\u0100pt\u2B0C\u2B11f;\uC000\u{1D55F}\u8180\xAC;in\u2B19\u2B1A\u2B36\u40ACn\u0200;Edv\u0B89\u2B24\u2B28\u2B2E;\uC000\u22F9\u0338ot;\uC000\u22F5\u0338\u01E1\u0B89\u2B33\u2B35;\u62F7;\u62F6i\u0100;v\u0CB8\u2B3C\u01E1\u0CB8\u2B41\u2B43;\u62FE;\u62FD\u0180aor\u2B4B\u2B63\u2B69r\u0200;ast\u0B7B\u2B55\u2B5A\u2B5Flle\xEC\u0B7Bl;\uC000\u2AFD\u20E5;\uC000\u2202\u0338lint;\u6A14\u0180;ce\u0C92\u2B70\u2B73u\xE5\u0CA5\u0100;c\u0C98\u2B78\u0100;e\u0C92\u2B7D\xF1\u0C98\u0200Aait\u2B88\u2B8B\u2B9D\u2BA7r\xF2\u2988rr\u0180;cw\u2B94\u2B95\u2B99\u619B;\uC000\u2933\u0338;\uC000\u219D\u0338ghtarrow\xBB\u2B95ri\u0100;e\u0CCB\u0CD6\u0380chimpqu\u2BBD\u2BCD\u2BD9\u2B04\u0B78\u2BE4\u2BEF\u0200;cer\u0D32\u2BC6\u0D37\u2BC9u\xE5\u0D45;\uC000\u{1D4C3}ort\u026D\u2B05\0\0\u2BD6ar\xE1\u2B56m\u0100;e\u0D6E\u2BDF\u0100;q\u0D74\u0D73su\u0100bp\u2BEB\u2BED\xE5\u0CF8\xE5\u0D0B\u0180bcp\u2BF6\u2C11\u2C19\u0200;Ees\u2BFF\u2C00\u0D22\u2C04\u6284;\uC000\u2AC5\u0338et\u0100;e\u0D1B\u2C0Bq\u0100;q\u0D23\u2C00c\u0100;e\u0D32\u2C17\xF1\u0D38\u0200;Ees\u2C22\u2C23\u0D5F\u2C27\u6285;\uC000\u2AC6\u0338et\u0100;e\u0D58\u2C2Eq\u0100;q\u0D60\u2C23\u0200gilr\u2C3D\u2C3F\u2C45\u2C47\xEC\u0BD7lde\u803B\xF1\u40F1\xE7\u0C43iangle\u0100lr\u2C52\u2C5Ceft\u0100;e\u0C1A\u2C5A\xF1\u0C26ight\u0100;e\u0CCB\u2C65\xF1\u0CD7\u0100;m\u2C6C\u2C6D\u43BD\u0180;es\u2C74\u2C75\u2C79\u4023ro;\u6116p;\u6007\u0480DHadgilrs\u2C8F\u2C94\u2C99\u2C9E\u2CA3\u2CB0\u2CB6\u2CD3\u2CE3ash;\u62ADarr;\u6904p;\uC000\u224D\u20D2ash;\u62AC\u0100et\u2CA8\u2CAC;\uC000\u2265\u20D2;\uC000>\u20D2nfin;\u69DE\u0180Aet\u2CBD\u2CC1\u2CC5rr;\u6902;\uC000\u2264\u20D2\u0100;r\u2CCA\u2CCD\uC000<\u20D2ie;\uC000\u22B4\u20D2\u0100At\u2CD8\u2CDCrr;\u6903rie;\uC000\u22B5\u20D2im;\uC000\u223C\u20D2\u0180Aan\u2CF0\u2CF4\u2D02rr;\u61D6r\u0100hr\u2CFA\u2CFDk;\u6923\u0100;o\u13E7\u13E5ear;\u6927\u1253\u1A95\0\0\0\0\0\0\0\0\0\0\0\0\0\u2D2D\0\u2D38\u2D48\u2D60\u2D65\u2D72\u2D84\u1B07\0\0\u2D8D\u2DAB\0\u2DC8\u2DCE\0\u2DDC\u2E19\u2E2B\u2E3E\u2E43\u0100cs\u2D31\u1A97ute\u803B\xF3\u40F3\u0100iy\u2D3C\u2D45r\u0100;c\u1A9E\u2D42\u803B\xF4\u40F4;\u443E\u0280abios\u1AA0\u2D52\u2D57\u01C8\u2D5Alac;\u4151v;\u6A38old;\u69BClig;\u4153\u0100cr\u2D69\u2D6Dir;\u69BF;\uC000\u{1D52C}\u036F\u2D79\0\0\u2D7C\0\u2D82n;\u42DBave\u803B\xF2\u40F2;\u69C1\u0100bm\u2D88\u0DF4ar;\u69B5\u0200acit\u2D95\u2D98\u2DA5\u2DA8r\xF2\u1A80\u0100ir\u2D9D\u2DA0r;\u69BEoss;\u69BBn\xE5\u0E52;\u69C0\u0180aei\u2DB1\u2DB5\u2DB9cr;\u414Dga;\u43C9\u0180cdn\u2DC0\u2DC5\u01CDron;\u43BF;\u69B6pf;\uC000\u{1D560}\u0180ael\u2DD4\u2DD7\u01D2r;\u69B7rp;\u69B9\u0380;adiosv\u2DEA\u2DEB\u2DEE\u2E08\u2E0D\u2E10\u2E16\u6228r\xF2\u1A86\u0200;efm\u2DF7\u2DF8\u2E02\u2E05\u6A5Dr\u0100;o\u2DFE\u2DFF\u6134f\xBB\u2DFF\u803B\xAA\u40AA\u803B\xBA\u40BAgof;\u62B6r;\u6A56lope;\u6A57;\u6A5B\u0180clo\u2E1F\u2E21\u2E27\xF2\u2E01ash\u803B\xF8\u40F8l;\u6298i\u016C\u2E2F\u2E34de\u803B\xF5\u40F5es\u0100;a\u01DB\u2E3As;\u6A36ml\u803B\xF6\u40F6bar;\u633D\u0AE1\u2E5E\0\u2E7D\0\u2E80\u2E9D\0\u2EA2\u2EB9\0\0\u2ECB\u0E9C\0\u2F13\0\0\u2F2B\u2FBC\0\u2FC8r\u0200;ast\u0403\u2E67\u2E72\u0E85\u8100\xB6;l\u2E6D\u2E6E\u40B6le\xEC\u0403\u0269\u2E78\0\0\u2E7Bm;\u6AF3;\u6AFDy;\u443Fr\u0280cimpt\u2E8B\u2E8F\u2E93\u1865\u2E97nt;\u4025od;\u402Eil;\u6030enk;\u6031r;\uC000\u{1D52D}\u0180imo\u2EA8\u2EB0\u2EB4\u0100;v\u2EAD\u2EAE\u43C6;\u43D5ma\xF4\u0A76ne;\u660E\u0180;tv\u2EBF\u2EC0\u2EC8\u43C0chfork\xBB\u1FFD;\u43D6\u0100au\u2ECF\u2EDFn\u0100ck\u2ED5\u2EDDk\u0100;h\u21F4\u2EDB;\u610E\xF6\u21F4s\u0480;abcdemst\u2EF3\u2EF4\u1908\u2EF9\u2EFD\u2F04\u2F06\u2F0A\u2F0E\u402Bcir;\u6A23ir;\u6A22\u0100ou\u1D40\u2F02;\u6A25;\u6A72n\u80BB\xB1\u0E9Dim;\u6A26wo;\u6A27\u0180ipu\u2F19\u2F20\u2F25ntint;\u6A15f;\uC000\u{1D561}nd\u803B\xA3\u40A3\u0500;Eaceinosu\u0EC8\u2F3F\u2F41\u2F44\u2F47\u2F81\u2F89\u2F92\u2F7E\u2FB6;\u6AB3p;\u6AB7u\xE5\u0ED9\u0100;c\u0ECE\u2F4C\u0300;acens\u0EC8\u2F59\u2F5F\u2F66\u2F68\u2F7Eppro\xF8\u2F43urlye\xF1\u0ED9\xF1\u0ECE\u0180aes\u2F6F\u2F76\u2F7Approx;\u6AB9qq;\u6AB5im;\u62E8i\xED\u0EDFme\u0100;s\u2F88\u0EAE\u6032\u0180Eas\u2F78\u2F90\u2F7A\xF0\u2F75\u0180dfp\u0EEC\u2F99\u2FAF\u0180als\u2FA0\u2FA5\u2FAAlar;\u632Eine;\u6312urf;\u6313\u0100;t\u0EFB\u2FB4\xEF\u0EFBrel;\u62B0\u0100ci\u2FC0\u2FC5r;\uC000\u{1D4C5};\u43C8ncsp;\u6008\u0300fiopsu\u2FDA\u22E2\u2FDF\u2FE5\u2FEB\u2FF1r;\uC000\u{1D52E}pf;\uC000\u{1D562}rime;\u6057cr;\uC000\u{1D4C6}\u0180aeo\u2FF8\u3009\u3013t\u0100ei\u2FFE\u3005rnion\xF3\u06B0nt;\u6A16st\u0100;e\u3010\u3011\u403F\xF1\u1F19\xF4\u0F14\u0A80ABHabcdefhilmnoprstux\u3040\u3051\u3055\u3059\u30E0\u310E\u312B\u3147\u3162\u3172\u318E\u3206\u3215\u3224\u3229\u3258\u326E\u3272\u3290\u32B0\u32B7\u0180art\u3047\u304A\u304Cr\xF2\u10B3\xF2\u03DDail;\u691Car\xF2\u1C65ar;\u6964\u0380cdenqrt\u3068\u3075\u3078\u307F\u308F\u3094\u30CC\u0100eu\u306D\u3071;\uC000\u223D\u0331te;\u4155i\xE3\u116Emptyv;\u69B3g\u0200;del\u0FD1\u3089\u308B\u308D;\u6992;\u69A5\xE5\u0FD1uo\u803B\xBB\u40BBr\u0580;abcfhlpstw\u0FDC\u30AC\u30AF\u30B7\u30B9\u30BC\u30BE\u30C0\u30C3\u30C7\u30CAp;\u6975\u0100;f\u0FE0\u30B4s;\u6920;\u6933s;\u691E\xEB\u225D\xF0\u272El;\u6945im;\u6974l;\u61A3;\u619D\u0100ai\u30D1\u30D5il;\u691Ao\u0100;n\u30DB\u30DC\u6236al\xF3\u0F1E\u0180abr\u30E7\u30EA\u30EEr\xF2\u17E5rk;\u6773\u0100ak\u30F3\u30FDc\u0100ek\u30F9\u30FB;\u407D;\u405D\u0100es\u3102\u3104;\u698Cl\u0100du\u310A\u310C;\u698E;\u6990\u0200aeuy\u3117\u311C\u3127\u3129ron;\u4159\u0100di\u3121\u3125il;\u4157\xEC\u0FF2\xE2\u30FA;\u4440\u0200clqs\u3134\u3137\u313D\u3144a;\u6937dhar;\u6969uo\u0100;r\u020E\u020Dh;\u61B3\u0180acg\u314E\u315F\u0F44l\u0200;ips\u0F78\u3158\u315B\u109Cn\xE5\u10BBar\xF4\u0FA9t;\u65AD\u0180ilr\u3169\u1023\u316Esht;\u697D;\uC000\u{1D52F}\u0100ao\u3177\u3186r\u0100du\u317D\u317F\xBB\u047B\u0100;l\u1091\u3184;\u696C\u0100;v\u318B\u318C\u43C1;\u43F1\u0180gns\u3195\u31F9\u31FCht\u0300ahlrst\u31A4\u31B0\u31C2\u31D8\u31E4\u31EErrow\u0100;t\u0FDC\u31ADa\xE9\u30C8arpoon\u0100du\u31BB\u31BFow\xEE\u317Ep\xBB\u1092eft\u0100ah\u31CA\u31D0rrow\xF3\u0FEAarpoon\xF3\u0551ightarrows;\u61C9quigarro\xF7\u30CBhreetimes;\u62CCg;\u42DAingdotse\xF1\u1F32\u0180ahm\u320D\u3210\u3213r\xF2\u0FEAa\xF2\u0551;\u600Foust\u0100;a\u321E\u321F\u63B1che\xBB\u321Fmid;\u6AEE\u0200abpt\u3232\u323D\u3240\u3252\u0100nr\u3237\u323Ag;\u67EDr;\u61FEr\xEB\u1003\u0180afl\u3247\u324A\u324Er;\u6986;\uC000\u{1D563}us;\u6A2Eimes;\u6A35\u0100ap\u325D\u3267r\u0100;g\u3263\u3264\u4029t;\u6994olint;\u6A12ar\xF2\u31E3\u0200achq\u327B\u3280\u10BC\u3285quo;\u603Ar;\uC000\u{1D4C7}\u0100bu\u30FB\u328Ao\u0100;r\u0214\u0213\u0180hir\u3297\u329B\u32A0re\xE5\u31F8mes;\u62CAi\u0200;efl\u32AA\u1059\u1821\u32AB\u65B9tri;\u69CEluhar;\u6968;\u611E\u0D61\u32D5\u32DB\u32DF\u332C\u3338\u3371\0\u337A\u33A4\0\0\u33EC\u33F0\0\u3428\u3448\u345A\u34AD\u34B1\u34CA\u34F1\0\u3616\0\0\u3633cute;\u415Bqu\xEF\u27BA\u0500;Eaceinpsy\u11ED\u32F3\u32F5\u32FF\u3302\u330B\u330F\u331F\u3326\u3329;\u6AB4\u01F0\u32FA\0\u32FC;\u6AB8on;\u4161u\xE5\u11FE\u0100;d\u11F3\u3307il;\u415Frc;\u415D\u0180Eas\u3316\u3318\u331B;\u6AB6p;\u6ABAim;\u62E9olint;\u6A13i\xED\u1204;\u4441ot\u0180;be\u3334\u1D47\u3335\u62C5;\u6A66\u0380Aacmstx\u3346\u334A\u3357\u335B\u335E\u3363\u336Drr;\u61D8r\u0100hr\u3350\u3352\xEB\u2228\u0100;o\u0A36\u0A34t\u803B\xA7\u40A7i;\u403Bwar;\u6929m\u0100in\u3369\xF0nu\xF3\xF1t;\u6736r\u0100;o\u3376\u2055\uC000\u{1D530}\u0200acoy\u3382\u3386\u3391\u33A0rp;\u666F\u0100hy\u338B\u338Fcy;\u4449;\u4448rt\u026D\u3399\0\0\u339Ci\xE4\u1464ara\xEC\u2E6F\u803B\xAD\u40AD\u0100gm\u33A8\u33B4ma\u0180;fv\u33B1\u33B2\u33B2\u43C3;\u43C2\u0400;deglnpr\u12AB\u33C5\u33C9\u33CE\u33D6\u33DE\u33E1\u33E6ot;\u6A6A\u0100;q\u12B1\u12B0\u0100;E\u33D3\u33D4\u6A9E;\u6AA0\u0100;E\u33DB\u33DC\u6A9D;\u6A9Fe;\u6246lus;\u6A24arr;\u6972ar\xF2\u113D\u0200aeit\u33F8\u3408\u340F\u3417\u0100ls\u33FD\u3404lsetm\xE9\u336Ahp;\u6A33parsl;\u69E4\u0100dl\u1463\u3414e;\u6323\u0100;e\u341C\u341D\u6AAA\u0100;s\u3422\u3423\u6AAC;\uC000\u2AAC\uFE00\u0180flp\u342E\u3433\u3442tcy;\u444C\u0100;b\u3438\u3439\u402F\u0100;a\u343E\u343F\u69C4r;\u633Ff;\uC000\u{1D564}a\u0100dr\u344D\u0402es\u0100;u\u3454\u3455\u6660it\xBB\u3455\u0180csu\u3460\u3479\u349F\u0100au\u3465\u346Fp\u0100;s\u1188\u346B;\uC000\u2293\uFE00p\u0100;s\u11B4\u3475;\uC000\u2294\uFE00u\u0100bp\u347F\u348F\u0180;es\u1197\u119C\u3486et\u0100;e\u1197\u348D\xF1\u119D\u0180;es\u11A8\u11AD\u3496et\u0100;e\u11A8\u349D\xF1\u11AE\u0180;af\u117B\u34A6\u05B0r\u0165\u34AB\u05B1\xBB\u117Car\xF2\u1148\u0200cemt\u34B9\u34BE\u34C2\u34C5r;\uC000\u{1D4C8}tm\xEE\xF1i\xEC\u3415ar\xE6\u11BE\u0100ar\u34CE\u34D5r\u0100;f\u34D4\u17BF\u6606\u0100an\u34DA\u34EDight\u0100ep\u34E3\u34EApsilo\xEE\u1EE0h\xE9\u2EAFs\xBB\u2852\u0280bcmnp\u34FB\u355E\u1209\u358B\u358E\u0480;Edemnprs\u350E\u350F\u3511\u3515\u351E\u3523\u352C\u3531\u3536\u6282;\u6AC5ot;\u6ABD\u0100;d\u11DA\u351Aot;\u6AC3ult;\u6AC1\u0100Ee\u3528\u352A;\u6ACB;\u628Alus;\u6ABFarr;\u6979\u0180eiu\u353D\u3552\u3555t\u0180;en\u350E\u3545\u354Bq\u0100;q\u11DA\u350Feq\u0100;q\u352B\u3528m;\u6AC7\u0100bp\u355A\u355C;\u6AD5;\u6AD3c\u0300;acens\u11ED\u356C\u3572\u3579\u357B\u3326ppro\xF8\u32FAurlye\xF1\u11FE\xF1\u11F3\u0180aes\u3582\u3588\u331Bppro\xF8\u331Aq\xF1\u3317g;\u666A\u0680123;Edehlmnps\u35A9\u35AC\u35AF\u121C\u35B2\u35B4\u35C0\u35C9\u35D5\u35DA\u35DF\u35E8\u35ED\u803B\xB9\u40B9\u803B\xB2\u40B2\u803B\xB3\u40B3;\u6AC6\u0100os\u35B9\u35BCt;\u6ABEub;\u6AD8\u0100;d\u1222\u35C5ot;\u6AC4s\u0100ou\u35CF\u35D2l;\u67C9b;\u6AD7arr;\u697Bult;\u6AC2\u0100Ee\u35E4\u35E6;\u6ACC;\u628Blus;\u6AC0\u0180eiu\u35F4\u3609\u360Ct\u0180;en\u121C\u35FC\u3602q\u0100;q\u1222\u35B2eq\u0100;q\u35E7\u35E4m;\u6AC8\u0100bp\u3611\u3613;\u6AD4;\u6AD6\u0180Aan\u361C\u3620\u362Drr;\u61D9r\u0100hr\u3626\u3628\xEB\u222E\u0100;o\u0A2B\u0A29war;\u692Alig\u803B\xDF\u40DF\u0BE1\u3651\u365D\u3660\u12CE\u3673\u3679\0\u367E\u36C2\0\0\0\0\0\u36DB\u3703\0\u3709\u376C\0\0\0\u3787\u0272\u3656\0\0\u365Bget;\u6316;\u43C4r\xEB\u0E5F\u0180aey\u3666\u366B\u3670ron;\u4165dil;\u4163;\u4442lrec;\u6315r;\uC000\u{1D531}\u0200eiko\u3686\u369D\u36B5\u36BC\u01F2\u368B\0\u3691e\u01004f\u1284\u1281a\u0180;sv\u3698\u3699\u369B\u43B8ym;\u43D1\u0100cn\u36A2\u36B2k\u0100as\u36A8\u36AEppro\xF8\u12C1im\xBB\u12ACs\xF0\u129E\u0100as\u36BA\u36AE\xF0\u12C1rn\u803B\xFE\u40FE\u01EC\u031F\u36C6\u22E7es\u8180\xD7;bd\u36CF\u36D0\u36D8\u40D7\u0100;a\u190F\u36D5r;\u6A31;\u6A30\u0180eps\u36E1\u36E3\u3700\xE1\u2A4D\u0200;bcf\u0486\u36EC\u36F0\u36F4ot;\u6336ir;\u6AF1\u0100;o\u36F9\u36FC\uC000\u{1D565}rk;\u6ADA\xE1\u3362rime;\u6034\u0180aip\u370F\u3712\u3764d\xE5\u1248\u0380adempst\u3721\u374D\u3740\u3751\u3757\u375C\u375Fngle\u0280;dlqr\u3730\u3731\u3736\u3740\u3742\u65B5own\xBB\u1DBBeft\u0100;e\u2800\u373E\xF1\u092E;\u625Cight\u0100;e\u32AA\u374B\xF1\u105Aot;\u65ECinus;\u6A3Alus;\u6A39b;\u69CDime;\u6A3Bezium;\u63E2\u0180cht\u3772\u377D\u3781\u0100ry\u3777\u377B;\uC000\u{1D4C9};\u4446cy;\u445Brok;\u4167\u0100io\u378B\u378Ex\xF4\u1777head\u0100lr\u3797\u37A0eftarro\xF7\u084Fightarrow\xBB\u0F5D\u0900AHabcdfghlmoprstuw\u37D0\u37D3\u37D7\u37E4\u37F0\u37FC\u380E\u381C\u3823\u3834\u3851\u385D\u386B\u38A9\u38CC\u38D2\u38EA\u38F6r\xF2\u03EDar;\u6963\u0100cr\u37DC\u37E2ute\u803B\xFA\u40FA\xF2\u1150r\u01E3\u37EA\0\u37EDy;\u445Eve;\u416D\u0100iy\u37F5\u37FArc\u803B\xFB\u40FB;\u4443\u0180abh\u3803\u3806\u380Br\xF2\u13ADlac;\u4171a\xF2\u13C3\u0100ir\u3813\u3818sht;\u697E;\uC000\u{1D532}rave\u803B\xF9\u40F9\u0161\u3827\u3831r\u0100lr\u382C\u382E\xBB\u0957\xBB\u1083lk;\u6580\u0100ct\u3839\u384D\u026F\u383F\0\0\u384Arn\u0100;e\u3845\u3846\u631Cr\xBB\u3846op;\u630Fri;\u65F8\u0100al\u3856\u385Acr;\u416B\u80BB\xA8\u0349\u0100gp\u3862\u3866on;\u4173f;\uC000\u{1D566}\u0300adhlsu\u114B\u3878\u387D\u1372\u3891\u38A0own\xE1\u13B3arpoon\u0100lr\u3888\u388Cef\xF4\u382Digh\xF4\u382Fi\u0180;hl\u3899\u389A\u389C\u43C5\xBB\u13FAon\xBB\u389Aparrows;\u61C8\u0180cit\u38B0\u38C4\u38C8\u026F\u38B6\0\0\u38C1rn\u0100;e\u38BC\u38BD\u631Dr\xBB\u38BDop;\u630Eng;\u416Fri;\u65F9cr;\uC000\u{1D4CA}\u0180dir\u38D9\u38DD\u38E2ot;\u62F0lde;\u4169i\u0100;f\u3730\u38E8\xBB\u1813\u0100am\u38EF\u38F2r\xF2\u38A8l\u803B\xFC\u40FCangle;\u69A7\u0780ABDacdeflnoprsz\u391C\u391F\u3929\u392D\u39B5\u39B8\u39BD\u39DF\u39E4\u39E8\u39F3\u39F9\u39FD\u3A01\u3A20r\xF2\u03F7ar\u0100;v\u3926\u3927\u6AE8;\u6AE9as\xE8\u03E1\u0100nr\u3932\u3937grt;\u699C\u0380eknprst\u34E3\u3946\u394B\u3952\u395D\u3964\u3996app\xE1\u2415othin\xE7\u1E96\u0180hir\u34EB\u2EC8\u3959op\xF4\u2FB5\u0100;h\u13B7\u3962\xEF\u318D\u0100iu\u3969\u396Dgm\xE1\u33B3\u0100bp\u3972\u3984setneq\u0100;q\u397D\u3980\uC000\u228A\uFE00;\uC000\u2ACB\uFE00setneq\u0100;q\u398F\u3992\uC000\u228B\uFE00;\uC000\u2ACC\uFE00\u0100hr\u399B\u399Fet\xE1\u369Ciangle\u0100lr\u39AA\u39AFeft\xBB\u0925ight\xBB\u1051y;\u4432ash\xBB\u1036\u0180elr\u39C4\u39D2\u39D7\u0180;be\u2DEA\u39CB\u39CFar;\u62BBq;\u625Alip;\u62EE\u0100bt\u39DC\u1468a\xF2\u1469r;\uC000\u{1D533}tr\xE9\u39AEsu\u0100bp\u39EF\u39F1\xBB\u0D1C\xBB\u0D59pf;\uC000\u{1D567}ro\xF0\u0EFBtr\xE9\u39B4\u0100cu\u3A06\u3A0Br;\uC000\u{1D4CB}\u0100bp\u3A10\u3A18n\u0100Ee\u3980\u3A16\xBB\u397En\u0100Ee\u3992\u3A1E\xBB\u3990igzag;\u699A\u0380cefoprs\u3A36\u3A3B\u3A56\u3A5B\u3A54\u3A61\u3A6Airc;\u4175\u0100di\u3A40\u3A51\u0100bg\u3A45\u3A49ar;\u6A5Fe\u0100;q\u15FA\u3A4F;\u6259erp;\u6118r;\uC000\u{1D534}pf;\uC000\u{1D568}\u0100;e\u1479\u3A66at\xE8\u1479cr;\uC000\u{1D4CC}\u0AE3\u178E\u3A87\0\u3A8B\0\u3A90\u3A9B\0\0\u3A9D\u3AA8\u3AAB\u3AAF\0\0\u3AC3\u3ACE\0\u3AD8\u17DC\u17DFtr\xE9\u17D1r;\uC000\u{1D535}\u0100Aa\u3A94\u3A97r\xF2\u03C3r\xF2\u09F6;\u43BE\u0100Aa\u3AA1\u3AA4r\xF2\u03B8r\xF2\u09EBa\xF0\u2713is;\u62FB\u0180dpt\u17A4\u3AB5\u3ABE\u0100fl\u3ABA\u17A9;\uC000\u{1D569}im\xE5\u17B2\u0100Aa\u3AC7\u3ACAr\xF2\u03CEr\xF2\u0A01\u0100cq\u3AD2\u17B8r;\uC000\u{1D4CD}\u0100pt\u17D6\u3ADCr\xE9\u17D4\u0400acefiosu\u3AF0\u3AFD\u3B08\u3B0C\u3B11\u3B15\u3B1B\u3B21c\u0100uy\u3AF6\u3AFBte\u803B\xFD\u40FD;\u444F\u0100iy\u3B02\u3B06rc;\u4177;\u444Bn\u803B\xA5\u40A5r;\uC000\u{1D536}cy;\u4457pf;\uC000\u{1D56A}cr;\uC000\u{1D4CE}\u0100cm\u3B26\u3B29y;\u444El\u803B\xFF\u40FF\u0500acdefhiosw\u3B42\u3B48\u3B54\u3B58\u3B64\u3B69\u3B6D\u3B74\u3B7A\u3B80cute;\u417A\u0100ay\u3B4D\u3B52ron;\u417E;\u4437ot;\u417C\u0100et\u3B5D\u3B61tr\xE6\u155Fa;\u43B6r;\uC000\u{1D537}cy;\u4436grarr;\u61DDpf;\uC000\u{1D56B}cr;\uC000\u{1D4CF}\u0100jn\u3B85\u3B87;\u600Dj;\u600C'.split("").map((c) => c.charCodeAt(0))
);

// ../../node_modules/entities/lib/esm/generated/decode-data-xml.js
var decode_data_xml_default = new Uint16Array(
  // prettier-ignore
  "\u0200aglq	\x1B\u026D\0\0p;\u4026os;\u4027t;\u403Et;\u403Cuot;\u4022".split("").map((c) => c.charCodeAt(0))
);

// ../../node_modules/entities/lib/esm/decode_codepoint.js
var _a;
var decodeMap = /* @__PURE__ */ new Map([
  [0, 65533],
  // C1 Unicode control character reference replacements
  [128, 8364],
  [130, 8218],
  [131, 402],
  [132, 8222],
  [133, 8230],
  [134, 8224],
  [135, 8225],
  [136, 710],
  [137, 8240],
  [138, 352],
  [139, 8249],
  [140, 338],
  [142, 381],
  [145, 8216],
  [146, 8217],
  [147, 8220],
  [148, 8221],
  [149, 8226],
  [150, 8211],
  [151, 8212],
  [152, 732],
  [153, 8482],
  [154, 353],
  [155, 8250],
  [156, 339],
  [158, 382],
  [159, 376]
]);
var fromCodePoint = (
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, node/no-unsupported-features/es-builtins
  (_a = String.fromCodePoint) !== null && _a !== void 0 ? _a : function(codePoint) {
    let output2 = "";
    if (codePoint > 65535) {
      codePoint -= 65536;
      output2 += String.fromCharCode(codePoint >>> 10 & 1023 | 55296);
      codePoint = 56320 | codePoint & 1023;
    }
    output2 += String.fromCharCode(codePoint);
    return output2;
  }
);
function replaceCodePoint(codePoint) {
  var _a2;
  if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) {
    return 65533;
  }
  return (_a2 = decodeMap.get(codePoint)) !== null && _a2 !== void 0 ? _a2 : codePoint;
}

// ../../node_modules/entities/lib/esm/decode.js
var CharCodes;
(function(CharCodes2) {
  CharCodes2[CharCodes2["NUM"] = 35] = "NUM";
  CharCodes2[CharCodes2["SEMI"] = 59] = "SEMI";
  CharCodes2[CharCodes2["EQUALS"] = 61] = "EQUALS";
  CharCodes2[CharCodes2["ZERO"] = 48] = "ZERO";
  CharCodes2[CharCodes2["NINE"] = 57] = "NINE";
  CharCodes2[CharCodes2["LOWER_A"] = 97] = "LOWER_A";
  CharCodes2[CharCodes2["LOWER_F"] = 102] = "LOWER_F";
  CharCodes2[CharCodes2["LOWER_X"] = 120] = "LOWER_X";
  CharCodes2[CharCodes2["LOWER_Z"] = 122] = "LOWER_Z";
  CharCodes2[CharCodes2["UPPER_A"] = 65] = "UPPER_A";
  CharCodes2[CharCodes2["UPPER_F"] = 70] = "UPPER_F";
  CharCodes2[CharCodes2["UPPER_Z"] = 90] = "UPPER_Z";
})(CharCodes || (CharCodes = {}));
var TO_LOWER_BIT = 32;
var BinTrieFlags;
(function(BinTrieFlags2) {
  BinTrieFlags2[BinTrieFlags2["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
  BinTrieFlags2[BinTrieFlags2["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
  BinTrieFlags2[BinTrieFlags2["JUMP_TABLE"] = 127] = "JUMP_TABLE";
})(BinTrieFlags || (BinTrieFlags = {}));
function isNumber(code2) {
  return code2 >= CharCodes.ZERO && code2 <= CharCodes.NINE;
}
function isHexadecimalCharacter(code2) {
  return code2 >= CharCodes.UPPER_A && code2 <= CharCodes.UPPER_F || code2 >= CharCodes.LOWER_A && code2 <= CharCodes.LOWER_F;
}
function isAsciiAlphaNumeric(code2) {
  return code2 >= CharCodes.UPPER_A && code2 <= CharCodes.UPPER_Z || code2 >= CharCodes.LOWER_A && code2 <= CharCodes.LOWER_Z || isNumber(code2);
}
function isEntityInAttributeInvalidEnd(code2) {
  return code2 === CharCodes.EQUALS || isAsciiAlphaNumeric(code2);
}
var EntityDecoderState;
(function(EntityDecoderState2) {
  EntityDecoderState2[EntityDecoderState2["EntityStart"] = 0] = "EntityStart";
  EntityDecoderState2[EntityDecoderState2["NumericStart"] = 1] = "NumericStart";
  EntityDecoderState2[EntityDecoderState2["NumericDecimal"] = 2] = "NumericDecimal";
  EntityDecoderState2[EntityDecoderState2["NumericHex"] = 3] = "NumericHex";
  EntityDecoderState2[EntityDecoderState2["NamedEntity"] = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function(DecodingMode2) {
  DecodingMode2[DecodingMode2["Legacy"] = 0] = "Legacy";
  DecodingMode2[DecodingMode2["Strict"] = 1] = "Strict";
  DecodingMode2[DecodingMode2["Attribute"] = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));
var EntityDecoder = class {
  constructor(decodeTree, emitCodePoint, errors2) {
    this.decodeTree = decodeTree;
    this.emitCodePoint = emitCodePoint;
    this.errors = errors2;
    this.state = EntityDecoderState.EntityStart;
    this.consumed = 1;
    this.result = 0;
    this.treeIndex = 0;
    this.excess = 1;
    this.decodeMode = DecodingMode.Strict;
  }
  /** Resets the instance to make it reusable. */
  startEntity(decodeMode) {
    this.decodeMode = decodeMode;
    this.state = EntityDecoderState.EntityStart;
    this.result = 0;
    this.treeIndex = 0;
    this.excess = 1;
    this.consumed = 1;
  }
  /**
   * Write an entity to the decoder. This can be called multiple times with partial entities.
   * If the entity is incomplete, the decoder will return -1.
   *
   * Mirrors the implementation of `getDecoder`, but with the ability to stop decoding if the
   * entity is incomplete, and resume when the next string is written.
   *
   * @param string The string containing the entity (or a continuation of the entity).
   * @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  write(str, offset) {
    switch (this.state) {
      case EntityDecoderState.EntityStart: {
        if (str.charCodeAt(offset) === CharCodes.NUM) {
          this.state = EntityDecoderState.NumericStart;
          this.consumed += 1;
          return this.stateNumericStart(str, offset + 1);
        }
        this.state = EntityDecoderState.NamedEntity;
        return this.stateNamedEntity(str, offset);
      }
      case EntityDecoderState.NumericStart: {
        return this.stateNumericStart(str, offset);
      }
      case EntityDecoderState.NumericDecimal: {
        return this.stateNumericDecimal(str, offset);
      }
      case EntityDecoderState.NumericHex: {
        return this.stateNumericHex(str, offset);
      }
      case EntityDecoderState.NamedEntity: {
        return this.stateNamedEntity(str, offset);
      }
    }
  }
  /**
   * Switches between the numeric decimal and hexadecimal states.
   *
   * Equivalent to the `Numeric character reference state` in the HTML spec.
   *
   * @param str The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericStart(str, offset) {
    if (offset >= str.length) {
      return -1;
    }
    if ((str.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
      this.state = EntityDecoderState.NumericHex;
      this.consumed += 1;
      return this.stateNumericHex(str, offset + 1);
    }
    this.state = EntityDecoderState.NumericDecimal;
    return this.stateNumericDecimal(str, offset);
  }
  addToNumericResult(str, start, end, base2) {
    if (start !== end) {
      const digitCount = end - start;
      this.result = this.result * Math.pow(base2, digitCount) + parseInt(str.substr(start, digitCount), base2);
      this.consumed += digitCount;
    }
  }
  /**
   * Parses a hexadecimal numeric entity.
   *
   * Equivalent to the `Hexademical character reference state` in the HTML spec.
   *
   * @param str The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericHex(str, offset) {
    const startIdx = offset;
    while (offset < str.length) {
      const char = str.charCodeAt(offset);
      if (isNumber(char) || isHexadecimalCharacter(char)) {
        offset += 1;
      } else {
        this.addToNumericResult(str, startIdx, offset, 16);
        return this.emitNumericEntity(char, 3);
      }
    }
    this.addToNumericResult(str, startIdx, offset, 16);
    return -1;
  }
  /**
   * Parses a decimal numeric entity.
   *
   * Equivalent to the `Decimal character reference state` in the HTML spec.
   *
   * @param str The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNumericDecimal(str, offset) {
    const startIdx = offset;
    while (offset < str.length) {
      const char = str.charCodeAt(offset);
      if (isNumber(char)) {
        offset += 1;
      } else {
        this.addToNumericResult(str, startIdx, offset, 10);
        return this.emitNumericEntity(char, 2);
      }
    }
    this.addToNumericResult(str, startIdx, offset, 10);
    return -1;
  }
  /**
   * Validate and emit a numeric entity.
   *
   * Implements the logic from the `Hexademical character reference start
   * state` and `Numeric character reference end state` in the HTML spec.
   *
   * @param lastCp The last code point of the entity. Used to see if the
   *               entity was terminated with a semicolon.
   * @param expectedLength The minimum number of characters that should be
   *                       consumed. Used to validate that at least one digit
   *                       was consumed.
   * @returns The number of characters that were consumed.
   */
  emitNumericEntity(lastCp, expectedLength) {
    var _a2;
    if (this.consumed <= expectedLength) {
      (_a2 = this.errors) === null || _a2 === void 0 ? void 0 : _a2.absenceOfDigitsInNumericCharacterReference(this.consumed);
      return 0;
    }
    if (lastCp === CharCodes.SEMI) {
      this.consumed += 1;
    } else if (this.decodeMode === DecodingMode.Strict) {
      return 0;
    }
    this.emitCodePoint(replaceCodePoint(this.result), this.consumed);
    if (this.errors) {
      if (lastCp !== CharCodes.SEMI) {
        this.errors.missingSemicolonAfterCharacterReference();
      }
      this.errors.validateNumericCharacterReference(this.result);
    }
    return this.consumed;
  }
  /**
   * Parses a named entity.
   *
   * Equivalent to the `Named character reference state` in the HTML spec.
   *
   * @param str The string containing the entity (or a continuation of the entity).
   * @param offset The current offset.
   * @returns The number of characters that were consumed, or -1 if the entity is incomplete.
   */
  stateNamedEntity(str, offset) {
    const { decodeTree } = this;
    let current = decodeTree[this.treeIndex];
    let valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
    for (; offset < str.length; offset++, this.excess++) {
      const char = str.charCodeAt(offset);
      this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
      if (this.treeIndex < 0) {
        return this.result === 0 || // If we are parsing an attribute
        this.decodeMode === DecodingMode.Attribute && // We shouldn't have consumed any characters after the entity,
        (valueLength === 0 || // And there should be no invalid characters.
        isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
      }
      current = decodeTree[this.treeIndex];
      valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
      if (valueLength !== 0) {
        if (char === CharCodes.SEMI) {
          return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
        }
        if (this.decodeMode !== DecodingMode.Strict) {
          this.result = this.treeIndex;
          this.consumed += this.excess;
          this.excess = 0;
        }
      }
    }
    return -1;
  }
  /**
   * Emit a named entity that was not terminated with a semicolon.
   *
   * @returns The number of characters consumed.
   */
  emitNotTerminatedNamedEntity() {
    var _a2;
    const { result, decodeTree } = this;
    const valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
    this.emitNamedEntityData(result, valueLength, this.consumed);
    (_a2 = this.errors) === null || _a2 === void 0 ? void 0 : _a2.missingSemicolonAfterCharacterReference();
    return this.consumed;
  }
  /**
   * Emit a named entity.
   *
   * @param result The index of the entity in the decode tree.
   * @param valueLength The number of bytes in the entity.
   * @param consumed The number of characters consumed.
   *
   * @returns The number of characters consumed.
   */
  emitNamedEntityData(result, valueLength, consumed) {
    const { decodeTree } = this;
    this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~BinTrieFlags.VALUE_LENGTH : decodeTree[result + 1], consumed);
    if (valueLength === 3) {
      this.emitCodePoint(decodeTree[result + 2], consumed);
    }
    return consumed;
  }
  /**
   * Signal to the parser that the end of the input was reached.
   *
   * Remaining data will be emitted and relevant errors will be produced.
   *
   * @returns The number of characters consumed.
   */
  end() {
    var _a2;
    switch (this.state) {
      case EntityDecoderState.NamedEntity: {
        return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
      }
      // Otherwise, emit a numeric entity if we have one.
      case EntityDecoderState.NumericDecimal: {
        return this.emitNumericEntity(0, 2);
      }
      case EntityDecoderState.NumericHex: {
        return this.emitNumericEntity(0, 3);
      }
      case EntityDecoderState.NumericStart: {
        (_a2 = this.errors) === null || _a2 === void 0 ? void 0 : _a2.absenceOfDigitsInNumericCharacterReference(this.consumed);
        return 0;
      }
      case EntityDecoderState.EntityStart: {
        return 0;
      }
    }
  }
};
function getDecoder(decodeTree) {
  let ret = "";
  const decoder = new EntityDecoder(decodeTree, (str) => ret += fromCodePoint(str));
  return function decodeWithTrie(str, decodeMode) {
    let lastIndex = 0;
    let offset = 0;
    while ((offset = str.indexOf("&", offset)) >= 0) {
      ret += str.slice(lastIndex, offset);
      decoder.startEntity(decodeMode);
      const len = decoder.write(
        str,
        // Skip the "&"
        offset + 1
      );
      if (len < 0) {
        lastIndex = offset + decoder.end();
        break;
      }
      lastIndex = offset + len;
      offset = len === 0 ? lastIndex + 1 : lastIndex;
    }
    const result = ret + str.slice(lastIndex);
    ret = "";
    return result;
  };
}
function determineBranch(decodeTree, current, nodeIdx, char) {
  const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
  const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
  if (branchCount === 0) {
    return jumpOffset !== 0 && char === jumpOffset ? nodeIdx : -1;
  }
  if (jumpOffset) {
    const value = char - jumpOffset;
    return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIdx + value] - 1;
  }
  let lo = nodeIdx;
  let hi = lo + branchCount - 1;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    const midVal = decodeTree[mid];
    if (midVal < char) {
      lo = mid + 1;
    } else if (midVal > char) {
      hi = mid - 1;
    } else {
      return decodeTree[mid + branchCount];
    }
  }
  return -1;
}
var htmlDecoder = getDecoder(decode_data_html_default);
getDecoder(decode_data_xml_default);
function decodeHTML(str, mode = DecodingMode.Legacy) {
  return htmlDecoder(str, mode);
}

// ../../node_modules/entities/lib/esm/generated/encode-html.js
function restoreDiff(arr) {
  for (let i = 1; i < arr.length; i++) {
    arr[i][0] += arr[i - 1][0] + 1;
  }
  return arr;
}
new Map(/* @__PURE__ */ restoreDiff([[9, "&Tab;"], [0, "&NewLine;"], [22, "&excl;"], [0, "&quot;"], [0, "&num;"], [0, "&dollar;"], [0, "&percnt;"], [0, "&amp;"], [0, "&apos;"], [0, "&lpar;"], [0, "&rpar;"], [0, "&ast;"], [0, "&plus;"], [0, "&comma;"], [1, "&period;"], [0, "&sol;"], [10, "&colon;"], [0, "&semi;"], [0, { v: "&lt;", n: 8402, o: "&nvlt;" }], [0, { v: "&equals;", n: 8421, o: "&bne;" }], [0, { v: "&gt;", n: 8402, o: "&nvgt;" }], [0, "&quest;"], [0, "&commat;"], [26, "&lbrack;"], [0, "&bsol;"], [0, "&rbrack;"], [0, "&Hat;"], [0, "&lowbar;"], [0, "&DiacriticalGrave;"], [5, { n: 106, o: "&fjlig;" }], [20, "&lbrace;"], [0, "&verbar;"], [0, "&rbrace;"], [34, "&nbsp;"], [0, "&iexcl;"], [0, "&cent;"], [0, "&pound;"], [0, "&curren;"], [0, "&yen;"], [0, "&brvbar;"], [0, "&sect;"], [0, "&die;"], [0, "&copy;"], [0, "&ordf;"], [0, "&laquo;"], [0, "&not;"], [0, "&shy;"], [0, "&circledR;"], [0, "&macr;"], [0, "&deg;"], [0, "&PlusMinus;"], [0, "&sup2;"], [0, "&sup3;"], [0, "&acute;"], [0, "&micro;"], [0, "&para;"], [0, "&centerdot;"], [0, "&cedil;"], [0, "&sup1;"], [0, "&ordm;"], [0, "&raquo;"], [0, "&frac14;"], [0, "&frac12;"], [0, "&frac34;"], [0, "&iquest;"], [0, "&Agrave;"], [0, "&Aacute;"], [0, "&Acirc;"], [0, "&Atilde;"], [0, "&Auml;"], [0, "&angst;"], [0, "&AElig;"], [0, "&Ccedil;"], [0, "&Egrave;"], [0, "&Eacute;"], [0, "&Ecirc;"], [0, "&Euml;"], [0, "&Igrave;"], [0, "&Iacute;"], [0, "&Icirc;"], [0, "&Iuml;"], [0, "&ETH;"], [0, "&Ntilde;"], [0, "&Ograve;"], [0, "&Oacute;"], [0, "&Ocirc;"], [0, "&Otilde;"], [0, "&Ouml;"], [0, "&times;"], [0, "&Oslash;"], [0, "&Ugrave;"], [0, "&Uacute;"], [0, "&Ucirc;"], [0, "&Uuml;"], [0, "&Yacute;"], [0, "&THORN;"], [0, "&szlig;"], [0, "&agrave;"], [0, "&aacute;"], [0, "&acirc;"], [0, "&atilde;"], [0, "&auml;"], [0, "&aring;"], [0, "&aelig;"], [0, "&ccedil;"], [0, "&egrave;"], [0, "&eacute;"], [0, "&ecirc;"], [0, "&euml;"], [0, "&igrave;"], [0, "&iacute;"], [0, "&icirc;"], [0, "&iuml;"], [0, "&eth;"], [0, "&ntilde;"], [0, "&ograve;"], [0, "&oacute;"], [0, "&ocirc;"], [0, "&otilde;"], [0, "&ouml;"], [0, "&div;"], [0, "&oslash;"], [0, "&ugrave;"], [0, "&uacute;"], [0, "&ucirc;"], [0, "&uuml;"], [0, "&yacute;"], [0, "&thorn;"], [0, "&yuml;"], [0, "&Amacr;"], [0, "&amacr;"], [0, "&Abreve;"], [0, "&abreve;"], [0, "&Aogon;"], [0, "&aogon;"], [0, "&Cacute;"], [0, "&cacute;"], [0, "&Ccirc;"], [0, "&ccirc;"], [0, "&Cdot;"], [0, "&cdot;"], [0, "&Ccaron;"], [0, "&ccaron;"], [0, "&Dcaron;"], [0, "&dcaron;"], [0, "&Dstrok;"], [0, "&dstrok;"], [0, "&Emacr;"], [0, "&emacr;"], [2, "&Edot;"], [0, "&edot;"], [0, "&Eogon;"], [0, "&eogon;"], [0, "&Ecaron;"], [0, "&ecaron;"], [0, "&Gcirc;"], [0, "&gcirc;"], [0, "&Gbreve;"], [0, "&gbreve;"], [0, "&Gdot;"], [0, "&gdot;"], [0, "&Gcedil;"], [1, "&Hcirc;"], [0, "&hcirc;"], [0, "&Hstrok;"], [0, "&hstrok;"], [0, "&Itilde;"], [0, "&itilde;"], [0, "&Imacr;"], [0, "&imacr;"], [2, "&Iogon;"], [0, "&iogon;"], [0, "&Idot;"], [0, "&imath;"], [0, "&IJlig;"], [0, "&ijlig;"], [0, "&Jcirc;"], [0, "&jcirc;"], [0, "&Kcedil;"], [0, "&kcedil;"], [0, "&kgreen;"], [0, "&Lacute;"], [0, "&lacute;"], [0, "&Lcedil;"], [0, "&lcedil;"], [0, "&Lcaron;"], [0, "&lcaron;"], [0, "&Lmidot;"], [0, "&lmidot;"], [0, "&Lstrok;"], [0, "&lstrok;"], [0, "&Nacute;"], [0, "&nacute;"], [0, "&Ncedil;"], [0, "&ncedil;"], [0, "&Ncaron;"], [0, "&ncaron;"], [0, "&napos;"], [0, "&ENG;"], [0, "&eng;"], [0, "&Omacr;"], [0, "&omacr;"], [2, "&Odblac;"], [0, "&odblac;"], [0, "&OElig;"], [0, "&oelig;"], [0, "&Racute;"], [0, "&racute;"], [0, "&Rcedil;"], [0, "&rcedil;"], [0, "&Rcaron;"], [0, "&rcaron;"], [0, "&Sacute;"], [0, "&sacute;"], [0, "&Scirc;"], [0, "&scirc;"], [0, "&Scedil;"], [0, "&scedil;"], [0, "&Scaron;"], [0, "&scaron;"], [0, "&Tcedil;"], [0, "&tcedil;"], [0, "&Tcaron;"], [0, "&tcaron;"], [0, "&Tstrok;"], [0, "&tstrok;"], [0, "&Utilde;"], [0, "&utilde;"], [0, "&Umacr;"], [0, "&umacr;"], [0, "&Ubreve;"], [0, "&ubreve;"], [0, "&Uring;"], [0, "&uring;"], [0, "&Udblac;"], [0, "&udblac;"], [0, "&Uogon;"], [0, "&uogon;"], [0, "&Wcirc;"], [0, "&wcirc;"], [0, "&Ycirc;"], [0, "&ycirc;"], [0, "&Yuml;"], [0, "&Zacute;"], [0, "&zacute;"], [0, "&Zdot;"], [0, "&zdot;"], [0, "&Zcaron;"], [0, "&zcaron;"], [19, "&fnof;"], [34, "&imped;"], [63, "&gacute;"], [65, "&jmath;"], [142, "&circ;"], [0, "&caron;"], [16, "&breve;"], [0, "&DiacriticalDot;"], [0, "&ring;"], [0, "&ogon;"], [0, "&DiacriticalTilde;"], [0, "&dblac;"], [51, "&DownBreve;"], [127, "&Alpha;"], [0, "&Beta;"], [0, "&Gamma;"], [0, "&Delta;"], [0, "&Epsilon;"], [0, "&Zeta;"], [0, "&Eta;"], [0, "&Theta;"], [0, "&Iota;"], [0, "&Kappa;"], [0, "&Lambda;"], [0, "&Mu;"], [0, "&Nu;"], [0, "&Xi;"], [0, "&Omicron;"], [0, "&Pi;"], [0, "&Rho;"], [1, "&Sigma;"], [0, "&Tau;"], [0, "&Upsilon;"], [0, "&Phi;"], [0, "&Chi;"], [0, "&Psi;"], [0, "&ohm;"], [7, "&alpha;"], [0, "&beta;"], [0, "&gamma;"], [0, "&delta;"], [0, "&epsi;"], [0, "&zeta;"], [0, "&eta;"], [0, "&theta;"], [0, "&iota;"], [0, "&kappa;"], [0, "&lambda;"], [0, "&mu;"], [0, "&nu;"], [0, "&xi;"], [0, "&omicron;"], [0, "&pi;"], [0, "&rho;"], [0, "&sigmaf;"], [0, "&sigma;"], [0, "&tau;"], [0, "&upsi;"], [0, "&phi;"], [0, "&chi;"], [0, "&psi;"], [0, "&omega;"], [7, "&thetasym;"], [0, "&Upsi;"], [2, "&phiv;"], [0, "&piv;"], [5, "&Gammad;"], [0, "&digamma;"], [18, "&kappav;"], [0, "&rhov;"], [3, "&epsiv;"], [0, "&backepsilon;"], [10, "&IOcy;"], [0, "&DJcy;"], [0, "&GJcy;"], [0, "&Jukcy;"], [0, "&DScy;"], [0, "&Iukcy;"], [0, "&YIcy;"], [0, "&Jsercy;"], [0, "&LJcy;"], [0, "&NJcy;"], [0, "&TSHcy;"], [0, "&KJcy;"], [1, "&Ubrcy;"], [0, "&DZcy;"], [0, "&Acy;"], [0, "&Bcy;"], [0, "&Vcy;"], [0, "&Gcy;"], [0, "&Dcy;"], [0, "&IEcy;"], [0, "&ZHcy;"], [0, "&Zcy;"], [0, "&Icy;"], [0, "&Jcy;"], [0, "&Kcy;"], [0, "&Lcy;"], [0, "&Mcy;"], [0, "&Ncy;"], [0, "&Ocy;"], [0, "&Pcy;"], [0, "&Rcy;"], [0, "&Scy;"], [0, "&Tcy;"], [0, "&Ucy;"], [0, "&Fcy;"], [0, "&KHcy;"], [0, "&TScy;"], [0, "&CHcy;"], [0, "&SHcy;"], [0, "&SHCHcy;"], [0, "&HARDcy;"], [0, "&Ycy;"], [0, "&SOFTcy;"], [0, "&Ecy;"], [0, "&YUcy;"], [0, "&YAcy;"], [0, "&acy;"], [0, "&bcy;"], [0, "&vcy;"], [0, "&gcy;"], [0, "&dcy;"], [0, "&iecy;"], [0, "&zhcy;"], [0, "&zcy;"], [0, "&icy;"], [0, "&jcy;"], [0, "&kcy;"], [0, "&lcy;"], [0, "&mcy;"], [0, "&ncy;"], [0, "&ocy;"], [0, "&pcy;"], [0, "&rcy;"], [0, "&scy;"], [0, "&tcy;"], [0, "&ucy;"], [0, "&fcy;"], [0, "&khcy;"], [0, "&tscy;"], [0, "&chcy;"], [0, "&shcy;"], [0, "&shchcy;"], [0, "&hardcy;"], [0, "&ycy;"], [0, "&softcy;"], [0, "&ecy;"], [0, "&yucy;"], [0, "&yacy;"], [1, "&iocy;"], [0, "&djcy;"], [0, "&gjcy;"], [0, "&jukcy;"], [0, "&dscy;"], [0, "&iukcy;"], [0, "&yicy;"], [0, "&jsercy;"], [0, "&ljcy;"], [0, "&njcy;"], [0, "&tshcy;"], [0, "&kjcy;"], [1, "&ubrcy;"], [0, "&dzcy;"], [7074, "&ensp;"], [0, "&emsp;"], [0, "&emsp13;"], [0, "&emsp14;"], [1, "&numsp;"], [0, "&puncsp;"], [0, "&ThinSpace;"], [0, "&hairsp;"], [0, "&NegativeMediumSpace;"], [0, "&zwnj;"], [0, "&zwj;"], [0, "&lrm;"], [0, "&rlm;"], [0, "&dash;"], [2, "&ndash;"], [0, "&mdash;"], [0, "&horbar;"], [0, "&Verbar;"], [1, "&lsquo;"], [0, "&CloseCurlyQuote;"], [0, "&lsquor;"], [1, "&ldquo;"], [0, "&CloseCurlyDoubleQuote;"], [0, "&bdquo;"], [1, "&dagger;"], [0, "&Dagger;"], [0, "&bull;"], [2, "&nldr;"], [0, "&hellip;"], [9, "&permil;"], [0, "&pertenk;"], [0, "&prime;"], [0, "&Prime;"], [0, "&tprime;"], [0, "&backprime;"], [3, "&lsaquo;"], [0, "&rsaquo;"], [3, "&oline;"], [2, "&caret;"], [1, "&hybull;"], [0, "&frasl;"], [10, "&bsemi;"], [7, "&qprime;"], [7, { v: "&MediumSpace;", n: 8202, o: "&ThickSpace;" }], [0, "&NoBreak;"], [0, "&af;"], [0, "&InvisibleTimes;"], [0, "&ic;"], [72, "&euro;"], [46, "&tdot;"], [0, "&DotDot;"], [37, "&complexes;"], [2, "&incare;"], [4, "&gscr;"], [0, "&hamilt;"], [0, "&Hfr;"], [0, "&Hopf;"], [0, "&planckh;"], [0, "&hbar;"], [0, "&imagline;"], [0, "&Ifr;"], [0, "&lagran;"], [0, "&ell;"], [1, "&naturals;"], [0, "&numero;"], [0, "&copysr;"], [0, "&weierp;"], [0, "&Popf;"], [0, "&Qopf;"], [0, "&realine;"], [0, "&real;"], [0, "&reals;"], [0, "&rx;"], [3, "&trade;"], [1, "&integers;"], [2, "&mho;"], [0, "&zeetrf;"], [0, "&iiota;"], [2, "&bernou;"], [0, "&Cayleys;"], [1, "&escr;"], [0, "&Escr;"], [0, "&Fouriertrf;"], [1, "&Mellintrf;"], [0, "&order;"], [0, "&alefsym;"], [0, "&beth;"], [0, "&gimel;"], [0, "&daleth;"], [12, "&CapitalDifferentialD;"], [0, "&dd;"], [0, "&ee;"], [0, "&ii;"], [10, "&frac13;"], [0, "&frac23;"], [0, "&frac15;"], [0, "&frac25;"], [0, "&frac35;"], [0, "&frac45;"], [0, "&frac16;"], [0, "&frac56;"], [0, "&frac18;"], [0, "&frac38;"], [0, "&frac58;"], [0, "&frac78;"], [49, "&larr;"], [0, "&ShortUpArrow;"], [0, "&rarr;"], [0, "&darr;"], [0, "&harr;"], [0, "&updownarrow;"], [0, "&nwarr;"], [0, "&nearr;"], [0, "&LowerRightArrow;"], [0, "&LowerLeftArrow;"], [0, "&nlarr;"], [0, "&nrarr;"], [1, { v: "&rarrw;", n: 824, o: "&nrarrw;" }], [0, "&Larr;"], [0, "&Uarr;"], [0, "&Rarr;"], [0, "&Darr;"], [0, "&larrtl;"], [0, "&rarrtl;"], [0, "&LeftTeeArrow;"], [0, "&mapstoup;"], [0, "&map;"], [0, "&DownTeeArrow;"], [1, "&hookleftarrow;"], [0, "&hookrightarrow;"], [0, "&larrlp;"], [0, "&looparrowright;"], [0, "&harrw;"], [0, "&nharr;"], [1, "&lsh;"], [0, "&rsh;"], [0, "&ldsh;"], [0, "&rdsh;"], [1, "&crarr;"], [0, "&cularr;"], [0, "&curarr;"], [2, "&circlearrowleft;"], [0, "&circlearrowright;"], [0, "&leftharpoonup;"], [0, "&DownLeftVector;"], [0, "&RightUpVector;"], [0, "&LeftUpVector;"], [0, "&rharu;"], [0, "&DownRightVector;"], [0, "&dharr;"], [0, "&dharl;"], [0, "&RightArrowLeftArrow;"], [0, "&udarr;"], [0, "&LeftArrowRightArrow;"], [0, "&leftleftarrows;"], [0, "&upuparrows;"], [0, "&rightrightarrows;"], [0, "&ddarr;"], [0, "&leftrightharpoons;"], [0, "&Equilibrium;"], [0, "&nlArr;"], [0, "&nhArr;"], [0, "&nrArr;"], [0, "&DoubleLeftArrow;"], [0, "&DoubleUpArrow;"], [0, "&DoubleRightArrow;"], [0, "&dArr;"], [0, "&DoubleLeftRightArrow;"], [0, "&DoubleUpDownArrow;"], [0, "&nwArr;"], [0, "&neArr;"], [0, "&seArr;"], [0, "&swArr;"], [0, "&lAarr;"], [0, "&rAarr;"], [1, "&zigrarr;"], [6, "&larrb;"], [0, "&rarrb;"], [15, "&DownArrowUpArrow;"], [7, "&loarr;"], [0, "&roarr;"], [0, "&hoarr;"], [0, "&forall;"], [0, "&comp;"], [0, { v: "&part;", n: 824, o: "&npart;" }], [0, "&exist;"], [0, "&nexist;"], [0, "&empty;"], [1, "&Del;"], [0, "&Element;"], [0, "&NotElement;"], [1, "&ni;"], [0, "&notni;"], [2, "&prod;"], [0, "&coprod;"], [0, "&sum;"], [0, "&minus;"], [0, "&MinusPlus;"], [0, "&dotplus;"], [1, "&Backslash;"], [0, "&lowast;"], [0, "&compfn;"], [1, "&radic;"], [2, "&prop;"], [0, "&infin;"], [0, "&angrt;"], [0, { v: "&ang;", n: 8402, o: "&nang;" }], [0, "&angmsd;"], [0, "&angsph;"], [0, "&mid;"], [0, "&nmid;"], [0, "&DoubleVerticalBar;"], [0, "&NotDoubleVerticalBar;"], [0, "&and;"], [0, "&or;"], [0, { v: "&cap;", n: 65024, o: "&caps;" }], [0, { v: "&cup;", n: 65024, o: "&cups;" }], [0, "&int;"], [0, "&Int;"], [0, "&iiint;"], [0, "&conint;"], [0, "&Conint;"], [0, "&Cconint;"], [0, "&cwint;"], [0, "&ClockwiseContourIntegral;"], [0, "&awconint;"], [0, "&there4;"], [0, "&becaus;"], [0, "&ratio;"], [0, "&Colon;"], [0, "&dotminus;"], [1, "&mDDot;"], [0, "&homtht;"], [0, { v: "&sim;", n: 8402, o: "&nvsim;" }], [0, { v: "&backsim;", n: 817, o: "&race;" }], [0, { v: "&ac;", n: 819, o: "&acE;" }], [0, "&acd;"], [0, "&VerticalTilde;"], [0, "&NotTilde;"], [0, { v: "&eqsim;", n: 824, o: "&nesim;" }], [0, "&sime;"], [0, "&NotTildeEqual;"], [0, "&cong;"], [0, "&simne;"], [0, "&ncong;"], [0, "&ap;"], [0, "&nap;"], [0, "&ape;"], [0, { v: "&apid;", n: 824, o: "&napid;" }], [0, "&backcong;"], [0, { v: "&asympeq;", n: 8402, o: "&nvap;" }], [0, { v: "&bump;", n: 824, o: "&nbump;" }], [0, { v: "&bumpe;", n: 824, o: "&nbumpe;" }], [0, { v: "&doteq;", n: 824, o: "&nedot;" }], [0, "&doteqdot;"], [0, "&efDot;"], [0, "&erDot;"], [0, "&Assign;"], [0, "&ecolon;"], [0, "&ecir;"], [0, "&circeq;"], [1, "&wedgeq;"], [0, "&veeeq;"], [1, "&triangleq;"], [2, "&equest;"], [0, "&ne;"], [0, { v: "&Congruent;", n: 8421, o: "&bnequiv;" }], [0, "&nequiv;"], [1, { v: "&le;", n: 8402, o: "&nvle;" }], [0, { v: "&ge;", n: 8402, o: "&nvge;" }], [0, { v: "&lE;", n: 824, o: "&nlE;" }], [0, { v: "&gE;", n: 824, o: "&ngE;" }], [0, { v: "&lnE;", n: 65024, o: "&lvertneqq;" }], [0, { v: "&gnE;", n: 65024, o: "&gvertneqq;" }], [0, { v: "&ll;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nLtv;"], [7577, "&nLt;"]])) }], [0, { v: "&gg;", n: new Map(/* @__PURE__ */ restoreDiff([[824, "&nGtv;"], [7577, "&nGt;"]])) }], [0, "&between;"], [0, "&NotCupCap;"], [0, "&nless;"], [0, "&ngt;"], [0, "&nle;"], [0, "&nge;"], [0, "&lesssim;"], [0, "&GreaterTilde;"], [0, "&nlsim;"], [0, "&ngsim;"], [0, "&LessGreater;"], [0, "&gl;"], [0, "&NotLessGreater;"], [0, "&NotGreaterLess;"], [0, "&pr;"], [0, "&sc;"], [0, "&prcue;"], [0, "&sccue;"], [0, "&PrecedesTilde;"], [0, { v: "&scsim;", n: 824, o: "&NotSucceedsTilde;" }], [0, "&NotPrecedes;"], [0, "&NotSucceeds;"], [0, { v: "&sub;", n: 8402, o: "&NotSubset;" }], [0, { v: "&sup;", n: 8402, o: "&NotSuperset;" }], [0, "&nsub;"], [0, "&nsup;"], [0, "&sube;"], [0, "&supe;"], [0, "&NotSubsetEqual;"], [0, "&NotSupersetEqual;"], [0, { v: "&subne;", n: 65024, o: "&varsubsetneq;" }], [0, { v: "&supne;", n: 65024, o: "&varsupsetneq;" }], [1, "&cupdot;"], [0, "&UnionPlus;"], [0, { v: "&sqsub;", n: 824, o: "&NotSquareSubset;" }], [0, { v: "&sqsup;", n: 824, o: "&NotSquareSuperset;" }], [0, "&sqsube;"], [0, "&sqsupe;"], [0, { v: "&sqcap;", n: 65024, o: "&sqcaps;" }], [0, { v: "&sqcup;", n: 65024, o: "&sqcups;" }], [0, "&CirclePlus;"], [0, "&CircleMinus;"], [0, "&CircleTimes;"], [0, "&osol;"], [0, "&CircleDot;"], [0, "&circledcirc;"], [0, "&circledast;"], [1, "&circleddash;"], [0, "&boxplus;"], [0, "&boxminus;"], [0, "&boxtimes;"], [0, "&dotsquare;"], [0, "&RightTee;"], [0, "&dashv;"], [0, "&DownTee;"], [0, "&bot;"], [1, "&models;"], [0, "&DoubleRightTee;"], [0, "&Vdash;"], [0, "&Vvdash;"], [0, "&VDash;"], [0, "&nvdash;"], [0, "&nvDash;"], [0, "&nVdash;"], [0, "&nVDash;"], [0, "&prurel;"], [1, "&LeftTriangle;"], [0, "&RightTriangle;"], [0, { v: "&LeftTriangleEqual;", n: 8402, o: "&nvltrie;" }], [0, { v: "&RightTriangleEqual;", n: 8402, o: "&nvrtrie;" }], [0, "&origof;"], [0, "&imof;"], [0, "&multimap;"], [0, "&hercon;"], [0, "&intcal;"], [0, "&veebar;"], [1, "&barvee;"], [0, "&angrtvb;"], [0, "&lrtri;"], [0, "&bigwedge;"], [0, "&bigvee;"], [0, "&bigcap;"], [0, "&bigcup;"], [0, "&diam;"], [0, "&sdot;"], [0, "&sstarf;"], [0, "&divideontimes;"], [0, "&bowtie;"], [0, "&ltimes;"], [0, "&rtimes;"], [0, "&leftthreetimes;"], [0, "&rightthreetimes;"], [0, "&backsimeq;"], [0, "&curlyvee;"], [0, "&curlywedge;"], [0, "&Sub;"], [0, "&Sup;"], [0, "&Cap;"], [0, "&Cup;"], [0, "&fork;"], [0, "&epar;"], [0, "&lessdot;"], [0, "&gtdot;"], [0, { v: "&Ll;", n: 824, o: "&nLl;" }], [0, { v: "&Gg;", n: 824, o: "&nGg;" }], [0, { v: "&leg;", n: 65024, o: "&lesg;" }], [0, { v: "&gel;", n: 65024, o: "&gesl;" }], [2, "&cuepr;"], [0, "&cuesc;"], [0, "&NotPrecedesSlantEqual;"], [0, "&NotSucceedsSlantEqual;"], [0, "&NotSquareSubsetEqual;"], [0, "&NotSquareSupersetEqual;"], [2, "&lnsim;"], [0, "&gnsim;"], [0, "&precnsim;"], [0, "&scnsim;"], [0, "&nltri;"], [0, "&NotRightTriangle;"], [0, "&nltrie;"], [0, "&NotRightTriangleEqual;"], [0, "&vellip;"], [0, "&ctdot;"], [0, "&utdot;"], [0, "&dtdot;"], [0, "&disin;"], [0, "&isinsv;"], [0, "&isins;"], [0, { v: "&isindot;", n: 824, o: "&notindot;" }], [0, "&notinvc;"], [0, "&notinvb;"], [1, { v: "&isinE;", n: 824, o: "&notinE;" }], [0, "&nisd;"], [0, "&xnis;"], [0, "&nis;"], [0, "&notnivc;"], [0, "&notnivb;"], [6, "&barwed;"], [0, "&Barwed;"], [1, "&lceil;"], [0, "&rceil;"], [0, "&LeftFloor;"], [0, "&rfloor;"], [0, "&drcrop;"], [0, "&dlcrop;"], [0, "&urcrop;"], [0, "&ulcrop;"], [0, "&bnot;"], [1, "&profline;"], [0, "&profsurf;"], [1, "&telrec;"], [0, "&target;"], [5, "&ulcorn;"], [0, "&urcorn;"], [0, "&dlcorn;"], [0, "&drcorn;"], [2, "&frown;"], [0, "&smile;"], [9, "&cylcty;"], [0, "&profalar;"], [7, "&topbot;"], [6, "&ovbar;"], [1, "&solbar;"], [60, "&angzarr;"], [51, "&lmoustache;"], [0, "&rmoustache;"], [2, "&OverBracket;"], [0, "&bbrk;"], [0, "&bbrktbrk;"], [37, "&OverParenthesis;"], [0, "&UnderParenthesis;"], [0, "&OverBrace;"], [0, "&UnderBrace;"], [2, "&trpezium;"], [4, "&elinters;"], [59, "&blank;"], [164, "&circledS;"], [55, "&boxh;"], [1, "&boxv;"], [9, "&boxdr;"], [3, "&boxdl;"], [3, "&boxur;"], [3, "&boxul;"], [3, "&boxvr;"], [7, "&boxvl;"], [7, "&boxhd;"], [7, "&boxhu;"], [7, "&boxvh;"], [19, "&boxH;"], [0, "&boxV;"], [0, "&boxdR;"], [0, "&boxDr;"], [0, "&boxDR;"], [0, "&boxdL;"], [0, "&boxDl;"], [0, "&boxDL;"], [0, "&boxuR;"], [0, "&boxUr;"], [0, "&boxUR;"], [0, "&boxuL;"], [0, "&boxUl;"], [0, "&boxUL;"], [0, "&boxvR;"], [0, "&boxVr;"], [0, "&boxVR;"], [0, "&boxvL;"], [0, "&boxVl;"], [0, "&boxVL;"], [0, "&boxHd;"], [0, "&boxhD;"], [0, "&boxHD;"], [0, "&boxHu;"], [0, "&boxhU;"], [0, "&boxHU;"], [0, "&boxvH;"], [0, "&boxVh;"], [0, "&boxVH;"], [19, "&uhblk;"], [3, "&lhblk;"], [3, "&block;"], [8, "&blk14;"], [0, "&blk12;"], [0, "&blk34;"], [13, "&square;"], [8, "&blacksquare;"], [0, "&EmptyVerySmallSquare;"], [1, "&rect;"], [0, "&marker;"], [2, "&fltns;"], [1, "&bigtriangleup;"], [0, "&blacktriangle;"], [0, "&triangle;"], [2, "&blacktriangleright;"], [0, "&rtri;"], [3, "&bigtriangledown;"], [0, "&blacktriangledown;"], [0, "&dtri;"], [2, "&blacktriangleleft;"], [0, "&ltri;"], [6, "&loz;"], [0, "&cir;"], [32, "&tridot;"], [2, "&bigcirc;"], [8, "&ultri;"], [0, "&urtri;"], [0, "&lltri;"], [0, "&EmptySmallSquare;"], [0, "&FilledSmallSquare;"], [8, "&bigstar;"], [0, "&star;"], [7, "&phone;"], [49, "&female;"], [1, "&male;"], [29, "&spades;"], [2, "&clubs;"], [1, "&hearts;"], [0, "&diamondsuit;"], [3, "&sung;"], [2, "&flat;"], [0, "&natural;"], [0, "&sharp;"], [163, "&check;"], [3, "&cross;"], [8, "&malt;"], [21, "&sext;"], [33, "&VerticalSeparator;"], [25, "&lbbrk;"], [0, "&rbbrk;"], [84, "&bsolhsub;"], [0, "&suphsol;"], [28, "&LeftDoubleBracket;"], [0, "&RightDoubleBracket;"], [0, "&lang;"], [0, "&rang;"], [0, "&Lang;"], [0, "&Rang;"], [0, "&loang;"], [0, "&roang;"], [7, "&longleftarrow;"], [0, "&longrightarrow;"], [0, "&longleftrightarrow;"], [0, "&DoubleLongLeftArrow;"], [0, "&DoubleLongRightArrow;"], [0, "&DoubleLongLeftRightArrow;"], [1, "&longmapsto;"], [2, "&dzigrarr;"], [258, "&nvlArr;"], [0, "&nvrArr;"], [0, "&nvHarr;"], [0, "&Map;"], [6, "&lbarr;"], [0, "&bkarow;"], [0, "&lBarr;"], [0, "&dbkarow;"], [0, "&drbkarow;"], [0, "&DDotrahd;"], [0, "&UpArrowBar;"], [0, "&DownArrowBar;"], [2, "&Rarrtl;"], [2, "&latail;"], [0, "&ratail;"], [0, "&lAtail;"], [0, "&rAtail;"], [0, "&larrfs;"], [0, "&rarrfs;"], [0, "&larrbfs;"], [0, "&rarrbfs;"], [2, "&nwarhk;"], [0, "&nearhk;"], [0, "&hksearow;"], [0, "&hkswarow;"], [0, "&nwnear;"], [0, "&nesear;"], [0, "&seswar;"], [0, "&swnwar;"], [8, { v: "&rarrc;", n: 824, o: "&nrarrc;" }], [1, "&cudarrr;"], [0, "&ldca;"], [0, "&rdca;"], [0, "&cudarrl;"], [0, "&larrpl;"], [2, "&curarrm;"], [0, "&cularrp;"], [7, "&rarrpl;"], [2, "&harrcir;"], [0, "&Uarrocir;"], [0, "&lurdshar;"], [0, "&ldrushar;"], [2, "&LeftRightVector;"], [0, "&RightUpDownVector;"], [0, "&DownLeftRightVector;"], [0, "&LeftUpDownVector;"], [0, "&LeftVectorBar;"], [0, "&RightVectorBar;"], [0, "&RightUpVectorBar;"], [0, "&RightDownVectorBar;"], [0, "&DownLeftVectorBar;"], [0, "&DownRightVectorBar;"], [0, "&LeftUpVectorBar;"], [0, "&LeftDownVectorBar;"], [0, "&LeftTeeVector;"], [0, "&RightTeeVector;"], [0, "&RightUpTeeVector;"], [0, "&RightDownTeeVector;"], [0, "&DownLeftTeeVector;"], [0, "&DownRightTeeVector;"], [0, "&LeftUpTeeVector;"], [0, "&LeftDownTeeVector;"], [0, "&lHar;"], [0, "&uHar;"], [0, "&rHar;"], [0, "&dHar;"], [0, "&luruhar;"], [0, "&ldrdhar;"], [0, "&ruluhar;"], [0, "&rdldhar;"], [0, "&lharul;"], [0, "&llhard;"], [0, "&rharul;"], [0, "&lrhard;"], [0, "&udhar;"], [0, "&duhar;"], [0, "&RoundImplies;"], [0, "&erarr;"], [0, "&simrarr;"], [0, "&larrsim;"], [0, "&rarrsim;"], [0, "&rarrap;"], [0, "&ltlarr;"], [1, "&gtrarr;"], [0, "&subrarr;"], [1, "&suplarr;"], [0, "&lfisht;"], [0, "&rfisht;"], [0, "&ufisht;"], [0, "&dfisht;"], [5, "&lopar;"], [0, "&ropar;"], [4, "&lbrke;"], [0, "&rbrke;"], [0, "&lbrkslu;"], [0, "&rbrksld;"], [0, "&lbrksld;"], [0, "&rbrkslu;"], [0, "&langd;"], [0, "&rangd;"], [0, "&lparlt;"], [0, "&rpargt;"], [0, "&gtlPar;"], [0, "&ltrPar;"], [3, "&vzigzag;"], [1, "&vangrt;"], [0, "&angrtvbd;"], [6, "&ange;"], [0, "&range;"], [0, "&dwangle;"], [0, "&uwangle;"], [0, "&angmsdaa;"], [0, "&angmsdab;"], [0, "&angmsdac;"], [0, "&angmsdad;"], [0, "&angmsdae;"], [0, "&angmsdaf;"], [0, "&angmsdag;"], [0, "&angmsdah;"], [0, "&bemptyv;"], [0, "&demptyv;"], [0, "&cemptyv;"], [0, "&raemptyv;"], [0, "&laemptyv;"], [0, "&ohbar;"], [0, "&omid;"], [0, "&opar;"], [1, "&operp;"], [1, "&olcross;"], [0, "&odsold;"], [1, "&olcir;"], [0, "&ofcir;"], [0, "&olt;"], [0, "&ogt;"], [0, "&cirscir;"], [0, "&cirE;"], [0, "&solb;"], [0, "&bsolb;"], [3, "&boxbox;"], [3, "&trisb;"], [0, "&rtriltri;"], [0, { v: "&LeftTriangleBar;", n: 824, o: "&NotLeftTriangleBar;" }], [0, { v: "&RightTriangleBar;", n: 824, o: "&NotRightTriangleBar;" }], [11, "&iinfin;"], [0, "&infintie;"], [0, "&nvinfin;"], [4, "&eparsl;"], [0, "&smeparsl;"], [0, "&eqvparsl;"], [5, "&blacklozenge;"], [8, "&RuleDelayed;"], [1, "&dsol;"], [9, "&bigodot;"], [0, "&bigoplus;"], [0, "&bigotimes;"], [1, "&biguplus;"], [1, "&bigsqcup;"], [5, "&iiiint;"], [0, "&fpartint;"], [2, "&cirfnint;"], [0, "&awint;"], [0, "&rppolint;"], [0, "&scpolint;"], [0, "&npolint;"], [0, "&pointint;"], [0, "&quatint;"], [0, "&intlarhk;"], [10, "&pluscir;"], [0, "&plusacir;"], [0, "&simplus;"], [0, "&plusdu;"], [0, "&plussim;"], [0, "&plustwo;"], [1, "&mcomma;"], [0, "&minusdu;"], [2, "&loplus;"], [0, "&roplus;"], [0, "&Cross;"], [0, "&timesd;"], [0, "&timesbar;"], [1, "&smashp;"], [0, "&lotimes;"], [0, "&rotimes;"], [0, "&otimesas;"], [0, "&Otimes;"], [0, "&odiv;"], [0, "&triplus;"], [0, "&triminus;"], [0, "&tritime;"], [0, "&intprod;"], [2, "&amalg;"], [0, "&capdot;"], [1, "&ncup;"], [0, "&ncap;"], [0, "&capand;"], [0, "&cupor;"], [0, "&cupcap;"], [0, "&capcup;"], [0, "&cupbrcap;"], [0, "&capbrcup;"], [0, "&cupcup;"], [0, "&capcap;"], [0, "&ccups;"], [0, "&ccaps;"], [2, "&ccupssm;"], [2, "&And;"], [0, "&Or;"], [0, "&andand;"], [0, "&oror;"], [0, "&orslope;"], [0, "&andslope;"], [1, "&andv;"], [0, "&orv;"], [0, "&andd;"], [0, "&ord;"], [1, "&wedbar;"], [6, "&sdote;"], [3, "&simdot;"], [2, { v: "&congdot;", n: 824, o: "&ncongdot;" }], [0, "&easter;"], [0, "&apacir;"], [0, { v: "&apE;", n: 824, o: "&napE;" }], [0, "&eplus;"], [0, "&pluse;"], [0, "&Esim;"], [0, "&Colone;"], [0, "&Equal;"], [1, "&ddotseq;"], [0, "&equivDD;"], [0, "&ltcir;"], [0, "&gtcir;"], [0, "&ltquest;"], [0, "&gtquest;"], [0, { v: "&leqslant;", n: 824, o: "&nleqslant;" }], [0, { v: "&geqslant;", n: 824, o: "&ngeqslant;" }], [0, "&lesdot;"], [0, "&gesdot;"], [0, "&lesdoto;"], [0, "&gesdoto;"], [0, "&lesdotor;"], [0, "&gesdotol;"], [0, "&lap;"], [0, "&gap;"], [0, "&lne;"], [0, "&gne;"], [0, "&lnap;"], [0, "&gnap;"], [0, "&lEg;"], [0, "&gEl;"], [0, "&lsime;"], [0, "&gsime;"], [0, "&lsimg;"], [0, "&gsiml;"], [0, "&lgE;"], [0, "&glE;"], [0, "&lesges;"], [0, "&gesles;"], [0, "&els;"], [0, "&egs;"], [0, "&elsdot;"], [0, "&egsdot;"], [0, "&el;"], [0, "&eg;"], [2, "&siml;"], [0, "&simg;"], [0, "&simlE;"], [0, "&simgE;"], [0, { v: "&LessLess;", n: 824, o: "&NotNestedLessLess;" }], [0, { v: "&GreaterGreater;", n: 824, o: "&NotNestedGreaterGreater;" }], [1, "&glj;"], [0, "&gla;"], [0, "&ltcc;"], [0, "&gtcc;"], [0, "&lescc;"], [0, "&gescc;"], [0, "&smt;"], [0, "&lat;"], [0, { v: "&smte;", n: 65024, o: "&smtes;" }], [0, { v: "&late;", n: 65024, o: "&lates;" }], [0, "&bumpE;"], [0, { v: "&PrecedesEqual;", n: 824, o: "&NotPrecedesEqual;" }], [0, { v: "&sce;", n: 824, o: "&NotSucceedsEqual;" }], [2, "&prE;"], [0, "&scE;"], [0, "&precneqq;"], [0, "&scnE;"], [0, "&prap;"], [0, "&scap;"], [0, "&precnapprox;"], [0, "&scnap;"], [0, "&Pr;"], [0, "&Sc;"], [0, "&subdot;"], [0, "&supdot;"], [0, "&subplus;"], [0, "&supplus;"], [0, "&submult;"], [0, "&supmult;"], [0, "&subedot;"], [0, "&supedot;"], [0, { v: "&subE;", n: 824, o: "&nsubE;" }], [0, { v: "&supE;", n: 824, o: "&nsupE;" }], [0, "&subsim;"], [0, "&supsim;"], [2, { v: "&subnE;", n: 65024, o: "&varsubsetneqq;" }], [0, { v: "&supnE;", n: 65024, o: "&varsupsetneqq;" }], [2, "&csub;"], [0, "&csup;"], [0, "&csube;"], [0, "&csupe;"], [0, "&subsup;"], [0, "&supsub;"], [0, "&subsub;"], [0, "&supsup;"], [0, "&suphsub;"], [0, "&supdsub;"], [0, "&forkv;"], [0, "&topfork;"], [0, "&mlcp;"], [8, "&Dashv;"], [1, "&Vdashl;"], [0, "&Barv;"], [0, "&vBar;"], [0, "&vBarv;"], [1, "&Vbar;"], [0, "&Not;"], [0, "&bNot;"], [0, "&rnmid;"], [0, "&cirmid;"], [0, "&midcir;"], [0, "&topcir;"], [0, "&nhpar;"], [0, "&parsim;"], [9, { v: "&parsl;", n: 8421, o: "&nparsl;" }], [44343, { n: new Map(/* @__PURE__ */ restoreDiff([[56476, "&Ascr;"], [1, "&Cscr;"], [0, "&Dscr;"], [2, "&Gscr;"], [2, "&Jscr;"], [0, "&Kscr;"], [2, "&Nscr;"], [0, "&Oscr;"], [0, "&Pscr;"], [0, "&Qscr;"], [1, "&Sscr;"], [0, "&Tscr;"], [0, "&Uscr;"], [0, "&Vscr;"], [0, "&Wscr;"], [0, "&Xscr;"], [0, "&Yscr;"], [0, "&Zscr;"], [0, "&ascr;"], [0, "&bscr;"], [0, "&cscr;"], [0, "&dscr;"], [1, "&fscr;"], [1, "&hscr;"], [0, "&iscr;"], [0, "&jscr;"], [0, "&kscr;"], [0, "&lscr;"], [0, "&mscr;"], [0, "&nscr;"], [1, "&pscr;"], [0, "&qscr;"], [0, "&rscr;"], [0, "&sscr;"], [0, "&tscr;"], [0, "&uscr;"], [0, "&vscr;"], [0, "&wscr;"], [0, "&xscr;"], [0, "&yscr;"], [0, "&zscr;"], [52, "&Afr;"], [0, "&Bfr;"], [1, "&Dfr;"], [0, "&Efr;"], [0, "&Ffr;"], [0, "&Gfr;"], [2, "&Jfr;"], [0, "&Kfr;"], [0, "&Lfr;"], [0, "&Mfr;"], [0, "&Nfr;"], [0, "&Ofr;"], [0, "&Pfr;"], [0, "&Qfr;"], [1, "&Sfr;"], [0, "&Tfr;"], [0, "&Ufr;"], [0, "&Vfr;"], [0, "&Wfr;"], [0, "&Xfr;"], [0, "&Yfr;"], [1, "&afr;"], [0, "&bfr;"], [0, "&cfr;"], [0, "&dfr;"], [0, "&efr;"], [0, "&ffr;"], [0, "&gfr;"], [0, "&hfr;"], [0, "&ifr;"], [0, "&jfr;"], [0, "&kfr;"], [0, "&lfr;"], [0, "&mfr;"], [0, "&nfr;"], [0, "&ofr;"], [0, "&pfr;"], [0, "&qfr;"], [0, "&rfr;"], [0, "&sfr;"], [0, "&tfr;"], [0, "&ufr;"], [0, "&vfr;"], [0, "&wfr;"], [0, "&xfr;"], [0, "&yfr;"], [0, "&zfr;"], [0, "&Aopf;"], [0, "&Bopf;"], [1, "&Dopf;"], [0, "&Eopf;"], [0, "&Fopf;"], [0, "&Gopf;"], [1, "&Iopf;"], [0, "&Jopf;"], [0, "&Kopf;"], [0, "&Lopf;"], [0, "&Mopf;"], [1, "&Oopf;"], [3, "&Sopf;"], [0, "&Topf;"], [0, "&Uopf;"], [0, "&Vopf;"], [0, "&Wopf;"], [0, "&Xopf;"], [0, "&Yopf;"], [1, "&aopf;"], [0, "&bopf;"], [0, "&copf;"], [0, "&dopf;"], [0, "&eopf;"], [0, "&fopf;"], [0, "&gopf;"], [0, "&hopf;"], [0, "&iopf;"], [0, "&jopf;"], [0, "&kopf;"], [0, "&lopf;"], [0, "&mopf;"], [0, "&nopf;"], [0, "&oopf;"], [0, "&popf;"], [0, "&qopf;"], [0, "&ropf;"], [0, "&sopf;"], [0, "&topf;"], [0, "&uopf;"], [0, "&vopf;"], [0, "&wopf;"], [0, "&xopf;"], [0, "&yopf;"], [0, "&zopf;"]])) }], [8906, "&fflig;"], [0, "&filig;"], [0, "&fllig;"], [0, "&ffilig;"], [0, "&ffllig;"]]));

// ../../node_modules/entities/lib/esm/index.js
var EntityLevel;
(function(EntityLevel2) {
  EntityLevel2[EntityLevel2["XML"] = 0] = "XML";
  EntityLevel2[EntityLevel2["HTML"] = 1] = "HTML";
})(EntityLevel || (EntityLevel = {}));
var EncodingMode;
(function(EncodingMode2) {
  EncodingMode2[EncodingMode2["UTF8"] = 0] = "UTF8";
  EncodingMode2[EncodingMode2["ASCII"] = 1] = "ASCII";
  EncodingMode2[EncodingMode2["Extensive"] = 2] = "Extensive";
  EncodingMode2[EncodingMode2["Attribute"] = 3] = "Attribute";
  EncodingMode2[EncodingMode2["Text"] = 4] = "Text";
})(EncodingMode || (EncodingMode = {}));

// ../../node_modules/markdown-it/lib/common/utils.mjs
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function isString(obj) {
  return _class(obj) === "[object String]";
}
var _hasOwnProperty = Object.prototype.hasOwnProperty;
function has(object, key) {
  return _hasOwnProperty.call(object, key);
}
function assign(obj) {
  const sources = Array.prototype.slice.call(arguments, 1);
  sources.forEach(function(source) {
    if (!source) {
      return;
    }
    if (typeof source !== "object") {
      throw new TypeError(source + "must be object");
    }
    Object.keys(source).forEach(function(key) {
      obj[key] = source[key];
    });
  });
  return obj;
}
function arrayReplaceAt(src, pos, newElements) {
  return [].concat(src.slice(0, pos), newElements, src.slice(pos + 1));
}
function isValidEntityCode(c) {
  if (c >= 55296 && c <= 57343) {
    return false;
  }
  if (c >= 64976 && c <= 65007) {
    return false;
  }
  if ((c & 65535) === 65535 || (c & 65535) === 65534) {
    return false;
  }
  if (c >= 0 && c <= 8) {
    return false;
  }
  if (c === 11) {
    return false;
  }
  if (c >= 14 && c <= 31) {
    return false;
  }
  if (c >= 127 && c <= 159) {
    return false;
  }
  if (c > 1114111) {
    return false;
  }
  return true;
}
function fromCodePoint2(c) {
  if (c > 65535) {
    c -= 65536;
    const surrogate1 = 55296 + (c >> 10);
    const surrogate2 = 56320 + (c & 1023);
    return String.fromCharCode(surrogate1, surrogate2);
  }
  return String.fromCharCode(c);
}
var UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;
var ENTITY_RE = /&([a-z#][a-z0-9]{1,31});/gi;
var UNESCAPE_ALL_RE = new RegExp(UNESCAPE_MD_RE.source + "|" + ENTITY_RE.source, "gi");
var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;
function replaceEntityPattern(match2, name) {
  if (name.charCodeAt(0) === 35 && DIGITAL_ENTITY_TEST_RE.test(name)) {
    const code2 = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (isValidEntityCode(code2)) {
      return fromCodePoint2(code2);
    }
    return match2;
  }
  const decoded = decodeHTML(match2);
  if (decoded !== match2) {
    return decoded;
  }
  return match2;
}
function unescapeMd(str) {
  if (str.indexOf("\\") < 0) {
    return str;
  }
  return str.replace(UNESCAPE_MD_RE, "$1");
}
function unescapeAll(str) {
  if (str.indexOf("\\") < 0 && str.indexOf("&") < 0) {
    return str;
  }
  return str.replace(UNESCAPE_ALL_RE, function(match2, escaped, entity2) {
    if (escaped) {
      return escaped;
    }
    return replaceEntityPattern(match2, entity2);
  });
}
var HTML_ESCAPE_TEST_RE = /[&<>"]/;
var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
var HTML_REPLACEMENTS = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
};
function replaceUnsafeChar(ch) {
  return HTML_REPLACEMENTS[ch];
}
function escapeHtml(str) {
  if (HTML_ESCAPE_TEST_RE.test(str)) {
    return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
  }
  return str;
}
var REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;
function escapeRE(str) {
  return str.replace(REGEXP_ESCAPE_RE, "\\$&");
}
function isSpace(code2) {
  switch (code2) {
    case 9:
    case 32:
      return true;
  }
  return false;
}
function isWhiteSpace(code2) {
  if (code2 >= 8192 && code2 <= 8202) {
    return true;
  }
  switch (code2) {
    case 9:
    // \t
    case 10:
    // \n
    case 11:
    // \v
    case 12:
    // \f
    case 13:
    // \r
    case 32:
    case 160:
    case 5760:
    case 8239:
    case 8287:
    case 12288:
      return true;
  }
  return false;
}
function isPunctChar(ch) {
  return regex_default4.test(ch) || regex_default5.test(ch);
}
function isMdAsciiPunct(ch) {
  switch (ch) {
    case 33:
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
    case 45:
    case 46:
    case 47:
    case 58:
    case 59:
    case 60:
    case 61:
    case 62:
    case 63:
    case 64:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 123:
    case 124:
    case 125:
    case 126:
      return true;
    default:
      return false;
  }
}
function normalizeReference(str) {
  str = str.trim().replace(/\s+/g, " ");
  if ("\u1E9E".toLowerCase() === "\u1E7E") {
    str = str.replace(/ẞ/g, "\xDF");
  }
  return str.toLowerCase().toUpperCase();
}
var lib = { mdurl: mdurl_exports, ucmicro: uc_exports };

// ../../node_modules/markdown-it/lib/helpers/index.mjs
var helpers_exports = {};
__export(helpers_exports, {
  parseLinkDestination: () => parseLinkDestination,
  parseLinkLabel: () => parseLinkLabel,
  parseLinkTitle: () => parseLinkTitle
});

// ../../node_modules/markdown-it/lib/helpers/parse_link_label.mjs
function parseLinkLabel(state, start, disableNested) {
  let level, found, marker, prevPos;
  const max = state.posMax;
  const oldPos = state.pos;
  state.pos = start + 1;
  level = 1;
  while (state.pos < max) {
    marker = state.src.charCodeAt(state.pos);
    if (marker === 93) {
      level--;
      if (level === 0) {
        found = true;
        break;
      }
    }
    prevPos = state.pos;
    state.md.inline.skipToken(state);
    if (marker === 91) {
      if (prevPos === state.pos - 1) {
        level++;
      } else if (disableNested) {
        state.pos = oldPos;
        return -1;
      }
    }
  }
  let labelEnd = -1;
  if (found) {
    labelEnd = state.pos;
  }
  state.pos = oldPos;
  return labelEnd;
}

// ../../node_modules/markdown-it/lib/helpers/parse_link_destination.mjs
function parseLinkDestination(str, start, max) {
  let code2;
  let pos = start;
  const result = {
    ok: false,
    pos: 0,
    str: ""
  };
  if (str.charCodeAt(pos) === 60) {
    pos++;
    while (pos < max) {
      code2 = str.charCodeAt(pos);
      if (code2 === 10) {
        return result;
      }
      if (code2 === 60) {
        return result;
      }
      if (code2 === 62) {
        result.pos = pos + 1;
        result.str = unescapeAll(str.slice(start + 1, pos));
        result.ok = true;
        return result;
      }
      if (code2 === 92 && pos + 1 < max) {
        pos += 2;
        continue;
      }
      pos++;
    }
    return result;
  }
  let level = 0;
  while (pos < max) {
    code2 = str.charCodeAt(pos);
    if (code2 === 32) {
      break;
    }
    if (code2 < 32 || code2 === 127) {
      break;
    }
    if (code2 === 92 && pos + 1 < max) {
      if (str.charCodeAt(pos + 1) === 32) {
        break;
      }
      pos += 2;
      continue;
    }
    if (code2 === 40) {
      level++;
      if (level > 32) {
        return result;
      }
    }
    if (code2 === 41) {
      if (level === 0) {
        break;
      }
      level--;
    }
    pos++;
  }
  if (start === pos) {
    return result;
  }
  if (level !== 0) {
    return result;
  }
  result.str = unescapeAll(str.slice(start, pos));
  result.pos = pos;
  result.ok = true;
  return result;
}

// ../../node_modules/markdown-it/lib/helpers/parse_link_title.mjs
function parseLinkTitle(str, start, max, prev_state) {
  let code2;
  let pos = start;
  const state = {
    // if `true`, this is a valid link title
    ok: false,
    // if `true`, this link can be continued on the next line
    can_continue: false,
    // if `ok`, it's the position of the first character after the closing marker
    pos: 0,
    // if `ok`, it's the unescaped title
    str: "",
    // expected closing marker character code
    marker: 0
  };
  if (prev_state) {
    state.str = prev_state.str;
    state.marker = prev_state.marker;
  } else {
    if (pos >= max) {
      return state;
    }
    let marker = str.charCodeAt(pos);
    if (marker !== 34 && marker !== 39 && marker !== 40) {
      return state;
    }
    start++;
    pos++;
    if (marker === 40) {
      marker = 41;
    }
    state.marker = marker;
  }
  while (pos < max) {
    code2 = str.charCodeAt(pos);
    if (code2 === state.marker) {
      state.pos = pos + 1;
      state.str += unescapeAll(str.slice(start, pos));
      state.ok = true;
      return state;
    } else if (code2 === 40 && state.marker === 41) {
      return state;
    } else if (code2 === 92 && pos + 1 < max) {
      pos++;
    }
    pos++;
  }
  state.can_continue = true;
  state.str += unescapeAll(str.slice(start, pos));
  return state;
}

// ../../node_modules/markdown-it/lib/renderer.mjs
var default_rules = {};
default_rules.code_inline = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  return "<code" + slf.renderAttrs(token) + ">" + escapeHtml(token.content) + "</code>";
};
default_rules.code_block = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  return "<pre" + slf.renderAttrs(token) + "><code>" + escapeHtml(tokens[idx].content) + "</code></pre>\n";
};
default_rules.fence = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  const info = token.info ? unescapeAll(token.info).trim() : "";
  let langName = "";
  let langAttrs = "";
  if (info) {
    const arr = info.split(/(\s+)/g);
    langName = arr[0];
    langAttrs = arr.slice(2).join("");
  }
  let highlighted;
  if (options.highlight) {
    highlighted = options.highlight(token.content, langName, langAttrs) || escapeHtml(token.content);
  } else {
    highlighted = escapeHtml(token.content);
  }
  if (highlighted.indexOf("<pre") === 0) {
    return highlighted + "\n";
  }
  if (info) {
    const i = token.attrIndex("class");
    const tmpAttrs = token.attrs ? token.attrs.slice() : [];
    if (i < 0) {
      tmpAttrs.push(["class", options.langPrefix + langName]);
    } else {
      tmpAttrs[i] = tmpAttrs[i].slice();
      tmpAttrs[i][1] += " " + options.langPrefix + langName;
    }
    const tmpToken = {
      attrs: tmpAttrs
    };
    return `<pre><code${slf.renderAttrs(tmpToken)}>${highlighted}</code></pre>
`;
  }
  return `<pre><code${slf.renderAttrs(token)}>${highlighted}</code></pre>
`;
};
default_rules.image = function(tokens, idx, options, env, slf) {
  const token = tokens[idx];
  token.attrs[token.attrIndex("alt")][1] = slf.renderInlineAsText(token.children, options, env);
  return slf.renderToken(tokens, idx, options);
};
default_rules.hardbreak = function(tokens, idx, options) {
  return options.xhtmlOut ? "<br />\n" : "<br>\n";
};
default_rules.softbreak = function(tokens, idx, options) {
  return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
};
default_rules.text = function(tokens, idx) {
  return escapeHtml(tokens[idx].content);
};
default_rules.html_block = function(tokens, idx) {
  return tokens[idx].content;
};
default_rules.html_inline = function(tokens, idx) {
  return tokens[idx].content;
};
function Renderer() {
  this.rules = assign({}, default_rules);
}
Renderer.prototype.renderAttrs = function renderAttrs(token) {
  let i, l, result;
  if (!token.attrs) {
    return "";
  }
  result = "";
  for (i = 0, l = token.attrs.length; i < l; i++) {
    result += " " + escapeHtml(token.attrs[i][0]) + '="' + escapeHtml(token.attrs[i][1]) + '"';
  }
  return result;
};
Renderer.prototype.renderToken = function renderToken(tokens, idx, options) {
  const token = tokens[idx];
  let result = "";
  if (token.hidden) {
    return "";
  }
  if (token.block && token.nesting !== -1 && idx && tokens[idx - 1].hidden) {
    result += "\n";
  }
  result += (token.nesting === -1 ? "</" : "<") + token.tag;
  result += this.renderAttrs(token);
  if (token.nesting === 0 && options.xhtmlOut) {
    result += " /";
  }
  let needLf = false;
  if (token.block) {
    needLf = true;
    if (token.nesting === 1) {
      if (idx + 1 < tokens.length) {
        const nextToken = tokens[idx + 1];
        if (nextToken.type === "inline" || nextToken.hidden) {
          needLf = false;
        } else if (nextToken.nesting === -1 && nextToken.tag === token.tag) {
          needLf = false;
        }
      }
    }
  }
  result += needLf ? ">\n" : ">";
  return result;
};
Renderer.prototype.renderInline = function(tokens, options, env) {
  let result = "";
  const rules = this.rules;
  for (let i = 0, len = tokens.length; i < len; i++) {
    const type = tokens[i].type;
    if (typeof rules[type] !== "undefined") {
      result += rules[type](tokens, i, options, env, this);
    } else {
      result += this.renderToken(tokens, i, options);
    }
  }
  return result;
};
Renderer.prototype.renderInlineAsText = function(tokens, options, env) {
  let result = "";
  for (let i = 0, len = tokens.length; i < len; i++) {
    switch (tokens[i].type) {
      case "text":
        result += tokens[i].content;
        break;
      case "image":
        result += this.renderInlineAsText(tokens[i].children, options, env);
        break;
      case "html_inline":
      case "html_block":
        result += tokens[i].content;
        break;
      case "softbreak":
      case "hardbreak":
        result += "\n";
        break;
    }
  }
  return result;
};
Renderer.prototype.render = function(tokens, options, env) {
  let result = "";
  const rules = this.rules;
  for (let i = 0, len = tokens.length; i < len; i++) {
    const type = tokens[i].type;
    if (type === "inline") {
      result += this.renderInline(tokens[i].children, options, env);
    } else if (typeof rules[type] !== "undefined") {
      result += rules[type](tokens, i, options, env, this);
    } else {
      result += this.renderToken(tokens, i, options, env);
    }
  }
  return result;
};
var renderer_default = Renderer;

// ../../node_modules/markdown-it/lib/ruler.mjs
function Ruler() {
  this.__rules__ = [];
  this.__cache__ = null;
}
Ruler.prototype.__find__ = function(name) {
  for (let i = 0; i < this.__rules__.length; i++) {
    if (this.__rules__[i].name === name) {
      return i;
    }
  }
  return -1;
};
Ruler.prototype.__compile__ = function() {
  const self = this;
  const chains = [""];
  self.__rules__.forEach(function(rule) {
    if (!rule.enabled) {
      return;
    }
    rule.alt.forEach(function(altName) {
      if (chains.indexOf(altName) < 0) {
        chains.push(altName);
      }
    });
  });
  self.__cache__ = {};
  chains.forEach(function(chain) {
    self.__cache__[chain] = [];
    self.__rules__.forEach(function(rule) {
      if (!rule.enabled) {
        return;
      }
      if (chain && rule.alt.indexOf(chain) < 0) {
        return;
      }
      self.__cache__[chain].push(rule.fn);
    });
  });
};
Ruler.prototype.at = function(name, fn, options) {
  const index = this.__find__(name);
  const opt = options || {};
  if (index === -1) {
    throw new Error("Parser rule not found: " + name);
  }
  this.__rules__[index].fn = fn;
  this.__rules__[index].alt = opt.alt || [];
  this.__cache__ = null;
};
Ruler.prototype.before = function(beforeName, ruleName, fn, options) {
  const index = this.__find__(beforeName);
  const opt = options || {};
  if (index === -1) {
    throw new Error("Parser rule not found: " + beforeName);
  }
  this.__rules__.splice(index, 0, {
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.after = function(afterName, ruleName, fn, options) {
  const index = this.__find__(afterName);
  const opt = options || {};
  if (index === -1) {
    throw new Error("Parser rule not found: " + afterName);
  }
  this.__rules__.splice(index + 1, 0, {
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.push = function(ruleName, fn, options) {
  const opt = options || {};
  this.__rules__.push({
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.enable = function(list2, ignoreInvalid) {
  if (!Array.isArray(list2)) {
    list2 = [list2];
  }
  const result = [];
  list2.forEach(function(name) {
    const idx = this.__find__(name);
    if (idx < 0) {
      if (ignoreInvalid) {
        return;
      }
      throw new Error("Rules manager: invalid rule name " + name);
    }
    this.__rules__[idx].enabled = true;
    result.push(name);
  }, this);
  this.__cache__ = null;
  return result;
};
Ruler.prototype.enableOnly = function(list2, ignoreInvalid) {
  if (!Array.isArray(list2)) {
    list2 = [list2];
  }
  this.__rules__.forEach(function(rule) {
    rule.enabled = false;
  });
  this.enable(list2, ignoreInvalid);
};
Ruler.prototype.disable = function(list2, ignoreInvalid) {
  if (!Array.isArray(list2)) {
    list2 = [list2];
  }
  const result = [];
  list2.forEach(function(name) {
    const idx = this.__find__(name);
    if (idx < 0) {
      if (ignoreInvalid) {
        return;
      }
      throw new Error("Rules manager: invalid rule name " + name);
    }
    this.__rules__[idx].enabled = false;
    result.push(name);
  }, this);
  this.__cache__ = null;
  return result;
};
Ruler.prototype.getRules = function(chainName) {
  if (this.__cache__ === null) {
    this.__compile__();
  }
  return this.__cache__[chainName] || [];
};
var ruler_default = Ruler;

// ../../node_modules/markdown-it/lib/token.mjs
function Token(type, tag, nesting) {
  this.type = type;
  this.tag = tag;
  this.attrs = null;
  this.map = null;
  this.nesting = nesting;
  this.level = 0;
  this.children = null;
  this.content = "";
  this.markup = "";
  this.info = "";
  this.meta = null;
  this.block = false;
  this.hidden = false;
}
Token.prototype.attrIndex = function attrIndex(name) {
  if (!this.attrs) {
    return -1;
  }
  const attrs = this.attrs;
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i][0] === name) {
      return i;
    }
  }
  return -1;
};
Token.prototype.attrPush = function attrPush(attrData) {
  if (this.attrs) {
    this.attrs.push(attrData);
  } else {
    this.attrs = [attrData];
  }
};
Token.prototype.attrSet = function attrSet(name, value) {
  const idx = this.attrIndex(name);
  const attrData = [name, value];
  if (idx < 0) {
    this.attrPush(attrData);
  } else {
    this.attrs[idx] = attrData;
  }
};
Token.prototype.attrGet = function attrGet(name) {
  const idx = this.attrIndex(name);
  let value = null;
  if (idx >= 0) {
    value = this.attrs[idx][1];
  }
  return value;
};
Token.prototype.attrJoin = function attrJoin(name, value) {
  const idx = this.attrIndex(name);
  if (idx < 0) {
    this.attrPush([name, value]);
  } else {
    this.attrs[idx][1] = this.attrs[idx][1] + " " + value;
  }
};
var token_default = Token;

// ../../node_modules/markdown-it/lib/rules_core/state_core.mjs
function StateCore(src, md, env) {
  this.src = src;
  this.env = env;
  this.tokens = [];
  this.inlineMode = false;
  this.md = md;
}
StateCore.prototype.Token = token_default;
var state_core_default = StateCore;

// ../../node_modules/markdown-it/lib/rules_core/normalize.mjs
var NEWLINES_RE = /\r\n?|\n/g;
var NULL_RE = /\0/g;
function normalize(state) {
  let str;
  str = state.src.replace(NEWLINES_RE, "\n");
  str = str.replace(NULL_RE, "\uFFFD");
  state.src = str;
}

// ../../node_modules/markdown-it/lib/rules_core/block.mjs
function block(state) {
  let token;
  if (state.inlineMode) {
    token = new state.Token("inline", "", 0);
    token.content = state.src;
    token.map = [0, 1];
    token.children = [];
    state.tokens.push(token);
  } else {
    state.md.block.parse(state.src, state.md, state.env, state.tokens);
  }
}

// ../../node_modules/markdown-it/lib/rules_core/inline.mjs
function inline(state) {
  const tokens = state.tokens;
  for (let i = 0, l = tokens.length; i < l; i++) {
    const tok = tokens[i];
    if (tok.type === "inline") {
      state.md.inline.parse(tok.content, state.md, state.env, tok.children);
    }
  }
}

// ../../node_modules/markdown-it/lib/rules_core/linkify.mjs
function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}
function linkify(state) {
  const blockTokens = state.tokens;
  if (!state.md.options.linkify) {
    return;
  }
  for (let j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== "inline" || !state.md.linkify.pretest(blockTokens[j].content)) {
      continue;
    }
    let tokens = blockTokens[j].children;
    let htmlLinkLevel = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const currentToken = tokens[i];
      if (currentToken.type === "link_close") {
        i--;
        while (tokens[i].level !== currentToken.level && tokens[i].type !== "link_open") {
          i--;
        }
        continue;
      }
      if (currentToken.type === "html_inline") {
        if (isLinkOpen(currentToken.content) && htmlLinkLevel > 0) {
          htmlLinkLevel--;
        }
        if (isLinkClose(currentToken.content)) {
          htmlLinkLevel++;
        }
      }
      if (htmlLinkLevel > 0) {
        continue;
      }
      if (currentToken.type === "text" && state.md.linkify.test(currentToken.content)) {
        const text3 = currentToken.content;
        let links = state.md.linkify.match(text3);
        const nodes = [];
        let level = currentToken.level;
        let lastPos = 0;
        if (links.length > 0 && links[0].index === 0 && i > 0 && tokens[i - 1].type === "text_special") {
          links = links.slice(1);
        }
        for (let ln = 0; ln < links.length; ln++) {
          const url = links[ln].url;
          const fullUrl = state.md.normalizeLink(url);
          if (!state.md.validateLink(fullUrl)) {
            continue;
          }
          let urlText = links[ln].text;
          if (!links[ln].schema) {
            urlText = state.md.normalizeLinkText("http://" + urlText).replace(/^http:\/\//, "");
          } else if (links[ln].schema === "mailto:" && !/^mailto:/i.test(urlText)) {
            urlText = state.md.normalizeLinkText("mailto:" + urlText).replace(/^mailto:/, "");
          } else {
            urlText = state.md.normalizeLinkText(urlText);
          }
          const pos = links[ln].index;
          if (pos > lastPos) {
            const token = new state.Token("text", "", 0);
            token.content = text3.slice(lastPos, pos);
            token.level = level;
            nodes.push(token);
          }
          const token_o = new state.Token("link_open", "a", 1);
          token_o.attrs = [["href", fullUrl]];
          token_o.level = level++;
          token_o.markup = "linkify";
          token_o.info = "auto";
          nodes.push(token_o);
          const token_t = new state.Token("text", "", 0);
          token_t.content = urlText;
          token_t.level = level;
          nodes.push(token_t);
          const token_c = new state.Token("link_close", "a", -1);
          token_c.level = --level;
          token_c.markup = "linkify";
          token_c.info = "auto";
          nodes.push(token_c);
          lastPos = links[ln].lastIndex;
        }
        if (lastPos < text3.length) {
          const token = new state.Token("text", "", 0);
          token.content = text3.slice(lastPos);
          token.level = level;
          nodes.push(token);
        }
        blockTokens[j].children = tokens = arrayReplaceAt(tokens, i, nodes);
      }
    }
  }
}

// ../../node_modules/markdown-it/lib/rules_core/replacements.mjs
var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
var SCOPED_ABBR_TEST_RE = /\((c|tm|r)\)/i;
var SCOPED_ABBR_RE = /\((c|tm|r)\)/ig;
var SCOPED_ABBR = {
  c: "\xA9",
  r: "\xAE",
  tm: "\u2122"
};
function replaceFn(match2, name) {
  return SCOPED_ABBR[name.toLowerCase()];
}
function replace_scoped(inlineTokens) {
  let inside_autolink = 0;
  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];
    if (token.type === "text" && !inside_autolink) {
      token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
    }
    if (token.type === "link_open" && token.info === "auto") {
      inside_autolink--;
    }
    if (token.type === "link_close" && token.info === "auto") {
      inside_autolink++;
    }
  }
}
function replace_rare(inlineTokens) {
  let inside_autolink = 0;
  for (let i = inlineTokens.length - 1; i >= 0; i--) {
    const token = inlineTokens[i];
    if (token.type === "text" && !inside_autolink) {
      if (RARE_RE.test(token.content)) {
        token.content = token.content.replace(/\+-/g, "\xB1").replace(/\.{2,}/g, "\u2026").replace(/([?!])…/g, "$1..").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^-])---(?=[^-]|$)/mg, "$1\u2014").replace(/(^|\s)--(?=\s|$)/mg, "$1\u2013").replace(/(^|[^-\s])--(?=[^-\s]|$)/mg, "$1\u2013");
      }
    }
    if (token.type === "link_open" && token.info === "auto") {
      inside_autolink--;
    }
    if (token.type === "link_close" && token.info === "auto") {
      inside_autolink++;
    }
  }
}
function replace(state) {
  let blkIdx;
  if (!state.md.options.typographer) {
    return;
  }
  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline") {
      continue;
    }
    if (SCOPED_ABBR_TEST_RE.test(state.tokens[blkIdx].content)) {
      replace_scoped(state.tokens[blkIdx].children);
    }
    if (RARE_RE.test(state.tokens[blkIdx].content)) {
      replace_rare(state.tokens[blkIdx].children);
    }
  }
}

// ../../node_modules/markdown-it/lib/rules_core/smartquotes.mjs
var QUOTE_TEST_RE = /['"]/;
var QUOTE_RE = /['"]/g;
var APOSTROPHE = "\u2019";
function replaceAt(str, index, ch) {
  return str.slice(0, index) + ch + str.slice(index + 1);
}
function process_inlines(tokens, state) {
  let j;
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const thisLevel = tokens[i].level;
    for (j = stack.length - 1; j >= 0; j--) {
      if (stack[j].level <= thisLevel) {
        break;
      }
    }
    stack.length = j + 1;
    if (token.type !== "text") {
      continue;
    }
    let text3 = token.content;
    let pos = 0;
    let max = text3.length;
    OUTER:
      while (pos < max) {
        QUOTE_RE.lastIndex = pos;
        const t = QUOTE_RE.exec(text3);
        if (!t) {
          break;
        }
        let canOpen = true;
        let canClose = true;
        pos = t.index + 1;
        const isSingle = t[0] === "'";
        let lastChar = 32;
        if (t.index - 1 >= 0) {
          lastChar = text3.charCodeAt(t.index - 1);
        } else {
          for (j = i - 1; j >= 0; j--) {
            if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
            if (!tokens[j].content) continue;
            lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
            break;
          }
        }
        let nextChar = 32;
        if (pos < max) {
          nextChar = text3.charCodeAt(pos);
        } else {
          for (j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
            if (!tokens[j].content) continue;
            nextChar = tokens[j].content.charCodeAt(0);
            break;
          }
        }
        const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
        const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));
        const isLastWhiteSpace = isWhiteSpace(lastChar);
        const isNextWhiteSpace = isWhiteSpace(nextChar);
        if (isNextWhiteSpace) {
          canOpen = false;
        } else if (isNextPunctChar) {
          if (!(isLastWhiteSpace || isLastPunctChar)) {
            canOpen = false;
          }
        }
        if (isLastWhiteSpace) {
          canClose = false;
        } else if (isLastPunctChar) {
          if (!(isNextWhiteSpace || isNextPunctChar)) {
            canClose = false;
          }
        }
        if (nextChar === 34 && t[0] === '"') {
          if (lastChar >= 48 && lastChar <= 57) {
            canClose = canOpen = false;
          }
        }
        if (canOpen && canClose) {
          canOpen = isLastPunctChar;
          canClose = isNextPunctChar;
        }
        if (!canOpen && !canClose) {
          if (isSingle) {
            token.content = replaceAt(token.content, t.index, APOSTROPHE);
          }
          continue;
        }
        if (canClose) {
          for (j = stack.length - 1; j >= 0; j--) {
            let item = stack[j];
            if (stack[j].level < thisLevel) {
              break;
            }
            if (item.single === isSingle && stack[j].level === thisLevel) {
              item = stack[j];
              let openQuote;
              let closeQuote;
              if (isSingle) {
                openQuote = state.md.options.quotes[2];
                closeQuote = state.md.options.quotes[3];
              } else {
                openQuote = state.md.options.quotes[0];
                closeQuote = state.md.options.quotes[1];
              }
              token.content = replaceAt(token.content, t.index, closeQuote);
              tokens[item.token].content = replaceAt(
                tokens[item.token].content,
                item.pos,
                openQuote
              );
              pos += closeQuote.length - 1;
              if (item.token === i) {
                pos += openQuote.length - 1;
              }
              text3 = token.content;
              max = text3.length;
              stack.length = j;
              continue OUTER;
            }
          }
        }
        if (canOpen) {
          stack.push({
            token: i,
            pos: t.index,
            single: isSingle,
            level: thisLevel
          });
        } else if (canClose && isSingle) {
          token.content = replaceAt(token.content, t.index, APOSTROPHE);
        }
      }
  }
}
function smartquotes(state) {
  if (!state.md.options.typographer) {
    return;
  }
  for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline" || !QUOTE_TEST_RE.test(state.tokens[blkIdx].content)) {
      continue;
    }
    process_inlines(state.tokens[blkIdx].children, state);
  }
}

// ../../node_modules/markdown-it/lib/rules_core/text_join.mjs
function text_join(state) {
  let curr, last;
  const blockTokens = state.tokens;
  const l = blockTokens.length;
  for (let j = 0; j < l; j++) {
    if (blockTokens[j].type !== "inline") continue;
    const tokens = blockTokens[j].children;
    const max = tokens.length;
    for (curr = 0; curr < max; curr++) {
      if (tokens[curr].type === "text_special") {
        tokens[curr].type = "text";
      }
    }
    for (curr = last = 0; curr < max; curr++) {
      if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
        tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
      } else {
        if (curr !== last) {
          tokens[last] = tokens[curr];
        }
        last++;
      }
    }
    if (curr !== last) {
      tokens.length = last;
    }
  }
}

// ../../node_modules/markdown-it/lib/parser_core.mjs
var _rules = [
  ["normalize", normalize],
  ["block", block],
  ["inline", inline],
  ["linkify", linkify],
  ["replacements", replace],
  ["smartquotes", smartquotes],
  // `text_join` finds `text_special` tokens (for escape sequences)
  // and joins them with the rest of the text
  ["text_join", text_join]
];
function Core() {
  this.ruler = new ruler_default();
  for (let i = 0; i < _rules.length; i++) {
    this.ruler.push(_rules[i][0], _rules[i][1]);
  }
}
Core.prototype.process = function(state) {
  const rules = this.ruler.getRules("");
  for (let i = 0, l = rules.length; i < l; i++) {
    rules[i](state);
  }
};
Core.prototype.State = state_core_default;
var parser_core_default = Core;

// ../../node_modules/markdown-it/lib/rules_block/state_block.mjs
function StateBlock(src, md, env, tokens) {
  this.src = src;
  this.md = md;
  this.env = env;
  this.tokens = tokens;
  this.bMarks = [];
  this.eMarks = [];
  this.tShift = [];
  this.sCount = [];
  this.bsCount = [];
  this.blkIndent = 0;
  this.line = 0;
  this.lineMax = 0;
  this.tight = false;
  this.ddIndent = -1;
  this.listIndent = -1;
  this.parentType = "root";
  this.level = 0;
  const s = this.src;
  for (let start = 0, pos = 0, indent = 0, offset = 0, len = s.length, indent_found = false; pos < len; pos++) {
    const ch = s.charCodeAt(pos);
    if (!indent_found) {
      if (isSpace(ch)) {
        indent++;
        if (ch === 9) {
          offset += 4 - offset % 4;
        } else {
          offset++;
        }
        continue;
      } else {
        indent_found = true;
      }
    }
    if (ch === 10 || pos === len - 1) {
      if (ch !== 10) {
        pos++;
      }
      this.bMarks.push(start);
      this.eMarks.push(pos);
      this.tShift.push(indent);
      this.sCount.push(offset);
      this.bsCount.push(0);
      indent_found = false;
      indent = 0;
      offset = 0;
      start = pos + 1;
    }
  }
  this.bMarks.push(s.length);
  this.eMarks.push(s.length);
  this.tShift.push(0);
  this.sCount.push(0);
  this.bsCount.push(0);
  this.lineMax = this.bMarks.length - 1;
}
StateBlock.prototype.push = function(type, tag, nesting) {
  const token = new token_default(type, tag, nesting);
  token.block = true;
  if (nesting < 0) this.level--;
  token.level = this.level;
  if (nesting > 0) this.level++;
  this.tokens.push(token);
  return token;
};
StateBlock.prototype.isEmpty = function isEmpty(line) {
  return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
};
StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
  for (let max = this.lineMax; from < max; from++) {
    if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
      break;
    }
  }
  return from;
};
StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
  for (let max = this.src.length; pos < max; pos++) {
    const ch = this.src.charCodeAt(pos);
    if (!isSpace(ch)) {
      break;
    }
  }
  return pos;
};
StateBlock.prototype.skipSpacesBack = function skipSpacesBack(pos, min) {
  if (pos <= min) {
    return pos;
  }
  while (pos > min) {
    if (!isSpace(this.src.charCodeAt(--pos))) {
      return pos + 1;
    }
  }
  return pos;
};
StateBlock.prototype.skipChars = function skipChars(pos, code2) {
  for (let max = this.src.length; pos < max; pos++) {
    if (this.src.charCodeAt(pos) !== code2) {
      break;
    }
  }
  return pos;
};
StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code2, min) {
  if (pos <= min) {
    return pos;
  }
  while (pos > min) {
    if (code2 !== this.src.charCodeAt(--pos)) {
      return pos + 1;
    }
  }
  return pos;
};
StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
  if (begin >= end) {
    return "";
  }
  const queue = new Array(end - begin);
  for (let i = 0, line = begin; line < end; line++, i++) {
    let lineIndent = 0;
    const lineStart = this.bMarks[line];
    let first = lineStart;
    let last;
    if (line + 1 < end || keepLastLF) {
      last = this.eMarks[line] + 1;
    } else {
      last = this.eMarks[line];
    }
    while (first < last && lineIndent < indent) {
      const ch = this.src.charCodeAt(first);
      if (isSpace(ch)) {
        if (ch === 9) {
          lineIndent += 4 - (lineIndent + this.bsCount[line]) % 4;
        } else {
          lineIndent++;
        }
      } else if (first - lineStart < this.tShift[line]) {
        lineIndent++;
      } else {
        break;
      }
      first++;
    }
    if (lineIndent > indent) {
      queue[i] = new Array(lineIndent - indent + 1).join(" ") + this.src.slice(first, last);
    } else {
      queue[i] = this.src.slice(first, last);
    }
  }
  return queue.join("");
};
StateBlock.prototype.Token = token_default;
var state_block_default = StateBlock;

// ../../node_modules/markdown-it/lib/rules_block/table.mjs
var MAX_AUTOCOMPLETED_CELLS = 65536;
function getLine(state, line) {
  const pos = state.bMarks[line] + state.tShift[line];
  const max = state.eMarks[line];
  return state.src.slice(pos, max);
}
function escapedSplit(str) {
  const result = [];
  const max = str.length;
  let pos = 0;
  let ch = str.charCodeAt(pos);
  let isEscaped = false;
  let lastPos = 0;
  let current = "";
  while (pos < max) {
    if (ch === 124) {
      if (!isEscaped) {
        result.push(current + str.substring(lastPos, pos));
        current = "";
        lastPos = pos + 1;
      } else {
        current += str.substring(lastPos, pos - 1);
        lastPos = pos;
      }
    }
    isEscaped = ch === 92;
    pos++;
    ch = str.charCodeAt(pos);
  }
  result.push(current + str.substring(lastPos));
  return result;
}
function table(state, startLine, endLine, silent) {
  if (startLine + 2 > endLine) {
    return false;
  }
  let nextLine = startLine + 1;
  if (state.sCount[nextLine] < state.blkIndent) {
    return false;
  }
  if (state.sCount[nextLine] - state.blkIndent >= 4) {
    return false;
  }
  let pos = state.bMarks[nextLine] + state.tShift[nextLine];
  if (pos >= state.eMarks[nextLine]) {
    return false;
  }
  const firstCh = state.src.charCodeAt(pos++);
  if (firstCh !== 124 && firstCh !== 45 && firstCh !== 58) {
    return false;
  }
  if (pos >= state.eMarks[nextLine]) {
    return false;
  }
  const secondCh = state.src.charCodeAt(pos++);
  if (secondCh !== 124 && secondCh !== 45 && secondCh !== 58 && !isSpace(secondCh)) {
    return false;
  }
  if (firstCh === 45 && isSpace(secondCh)) {
    return false;
  }
  while (pos < state.eMarks[nextLine]) {
    const ch = state.src.charCodeAt(pos);
    if (ch !== 124 && ch !== 45 && ch !== 58 && !isSpace(ch)) {
      return false;
    }
    pos++;
  }
  let lineText = getLine(state, startLine + 1);
  let columns = lineText.split("|");
  const aligns = [];
  for (let i = 0; i < columns.length; i++) {
    const t = columns[i].trim();
    if (!t) {
      if (i === 0 || i === columns.length - 1) {
        continue;
      } else {
        return false;
      }
    }
    if (!/^:?-+:?$/.test(t)) {
      return false;
    }
    if (t.charCodeAt(t.length - 1) === 58) {
      aligns.push(t.charCodeAt(0) === 58 ? "center" : "right");
    } else if (t.charCodeAt(0) === 58) {
      aligns.push("left");
    } else {
      aligns.push("");
    }
  }
  lineText = getLine(state, startLine).trim();
  if (lineText.indexOf("|") === -1) {
    return false;
  }
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  columns = escapedSplit(lineText);
  if (columns.length && columns[0] === "") columns.shift();
  if (columns.length && columns[columns.length - 1] === "") columns.pop();
  const columnCount = columns.length;
  if (columnCount === 0 || columnCount !== aligns.length) {
    return false;
  }
  if (silent) {
    return true;
  }
  const oldParentType = state.parentType;
  state.parentType = "table";
  const terminatorRules = state.md.block.ruler.getRules("blockquote");
  const token_to = state.push("table_open", "table", 1);
  const tableLines = [startLine, 0];
  token_to.map = tableLines;
  const token_tho = state.push("thead_open", "thead", 1);
  token_tho.map = [startLine, startLine + 1];
  const token_htro = state.push("tr_open", "tr", 1);
  token_htro.map = [startLine, startLine + 1];
  for (let i = 0; i < columns.length; i++) {
    const token_ho = state.push("th_open", "th", 1);
    if (aligns[i]) {
      token_ho.attrs = [["style", "text-align:" + aligns[i]]];
    }
    const token_il = state.push("inline", "", 0);
    token_il.content = columns[i].trim();
    token_il.children = [];
    state.push("th_close", "th", -1);
  }
  state.push("tr_close", "tr", -1);
  state.push("thead_close", "thead", -1);
  let tbodyLines;
  let autocompletedCells = 0;
  for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
    if (state.sCount[nextLine] < state.blkIndent) {
      break;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
    lineText = getLine(state, nextLine).trim();
    if (!lineText) {
      break;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      break;
    }
    columns = escapedSplit(lineText);
    if (columns.length && columns[0] === "") columns.shift();
    if (columns.length && columns[columns.length - 1] === "") columns.pop();
    autocompletedCells += columnCount - columns.length;
    if (autocompletedCells > MAX_AUTOCOMPLETED_CELLS) {
      break;
    }
    if (nextLine === startLine + 2) {
      const token_tbo = state.push("tbody_open", "tbody", 1);
      token_tbo.map = tbodyLines = [startLine + 2, 0];
    }
    const token_tro = state.push("tr_open", "tr", 1);
    token_tro.map = [nextLine, nextLine + 1];
    for (let i = 0; i < columnCount; i++) {
      const token_tdo = state.push("td_open", "td", 1);
      if (aligns[i]) {
        token_tdo.attrs = [["style", "text-align:" + aligns[i]]];
      }
      const token_il = state.push("inline", "", 0);
      token_il.content = columns[i] ? columns[i].trim() : "";
      token_il.children = [];
      state.push("td_close", "td", -1);
    }
    state.push("tr_close", "tr", -1);
  }
  if (tbodyLines) {
    state.push("tbody_close", "tbody", -1);
    tbodyLines[1] = nextLine;
  }
  state.push("table_close", "table", -1);
  tableLines[1] = nextLine;
  state.parentType = oldParentType;
  state.line = nextLine;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/code.mjs
function code(state, startLine, endLine) {
  if (state.sCount[startLine] - state.blkIndent < 4) {
    return false;
  }
  let nextLine = startLine + 1;
  let last = nextLine;
  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      nextLine++;
      continue;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      nextLine++;
      last = nextLine;
      continue;
    }
    break;
  }
  state.line = last;
  const token = state.push("code_block", "code", 0);
  token.content = state.getLines(startLine, last, 4 + state.blkIndent, false) + "\n";
  token.map = [startLine, state.line];
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/fence.mjs
function fence(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  if (pos + 3 > max) {
    return false;
  }
  const marker = state.src.charCodeAt(pos);
  if (marker !== 126 && marker !== 96) {
    return false;
  }
  let mem = pos;
  pos = state.skipChars(pos, marker);
  let len = pos - mem;
  if (len < 3) {
    return false;
  }
  const markup = state.src.slice(mem, pos);
  const params = state.src.slice(pos, max);
  if (marker === 96) {
    if (params.indexOf(String.fromCharCode(marker)) >= 0) {
      return false;
    }
  }
  if (silent) {
    return true;
  }
  let nextLine = startLine;
  let haveEndMarker = false;
  for (; ; ) {
    nextLine++;
    if (nextLine >= endLine) {
      break;
    }
    pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos < max && state.sCount[nextLine] < state.blkIndent) {
      break;
    }
    if (state.src.charCodeAt(pos) !== marker) {
      continue;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      continue;
    }
    pos = state.skipChars(pos, marker);
    if (pos - mem < len) {
      continue;
    }
    pos = state.skipSpaces(pos);
    if (pos < max) {
      continue;
    }
    haveEndMarker = true;
    break;
  }
  len = state.sCount[startLine];
  state.line = nextLine + (haveEndMarker ? 1 : 0);
  const token = state.push("fence", "code", 0);
  token.info = params;
  token.content = state.getLines(startLine + 1, nextLine, len, true);
  token.markup = markup;
  token.map = [startLine, state.line];
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/blockquote.mjs
function blockquote(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  const oldLineMax = state.lineMax;
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  if (state.src.charCodeAt(pos) !== 62) {
    return false;
  }
  if (silent) {
    return true;
  }
  const oldBMarks = [];
  const oldBSCount = [];
  const oldSCount = [];
  const oldTShift = [];
  const terminatorRules = state.md.block.ruler.getRules("blockquote");
  const oldParentType = state.parentType;
  state.parentType = "blockquote";
  let lastLineEmpty = false;
  let nextLine;
  for (nextLine = startLine; nextLine < endLine; nextLine++) {
    const isOutdented = state.sCount[nextLine] < state.blkIndent;
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos >= max) {
      break;
    }
    if (state.src.charCodeAt(pos++) === 62 && !isOutdented) {
      let initial = state.sCount[nextLine] + 1;
      let spaceAfterMarker;
      let adjustTab;
      if (state.src.charCodeAt(pos) === 32) {
        pos++;
        initial++;
        adjustTab = false;
        spaceAfterMarker = true;
      } else if (state.src.charCodeAt(pos) === 9) {
        spaceAfterMarker = true;
        if ((state.bsCount[nextLine] + initial) % 4 === 3) {
          pos++;
          initial++;
          adjustTab = false;
        } else {
          adjustTab = true;
        }
      } else {
        spaceAfterMarker = false;
      }
      let offset = initial;
      oldBMarks.push(state.bMarks[nextLine]);
      state.bMarks[nextLine] = pos;
      while (pos < max) {
        const ch = state.src.charCodeAt(pos);
        if (isSpace(ch)) {
          if (ch === 9) {
            offset += 4 - (offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
          } else {
            offset++;
          }
        } else {
          break;
        }
        pos++;
      }
      lastLineEmpty = pos >= max;
      oldBSCount.push(state.bsCount[nextLine]);
      state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
      oldSCount.push(state.sCount[nextLine]);
      state.sCount[nextLine] = offset - initial;
      oldTShift.push(state.tShift[nextLine]);
      state.tShift[nextLine] = pos - state.bMarks[nextLine];
      continue;
    }
    if (lastLineEmpty) {
      break;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      state.lineMax = nextLine;
      if (state.blkIndent !== 0) {
        oldBMarks.push(state.bMarks[nextLine]);
        oldBSCount.push(state.bsCount[nextLine]);
        oldTShift.push(state.tShift[nextLine]);
        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] -= state.blkIndent;
      }
      break;
    }
    oldBMarks.push(state.bMarks[nextLine]);
    oldBSCount.push(state.bsCount[nextLine]);
    oldTShift.push(state.tShift[nextLine]);
    oldSCount.push(state.sCount[nextLine]);
    state.sCount[nextLine] = -1;
  }
  const oldIndent = state.blkIndent;
  state.blkIndent = 0;
  const token_o = state.push("blockquote_open", "blockquote", 1);
  token_o.markup = ">";
  const lines = [startLine, 0];
  token_o.map = lines;
  state.md.block.tokenize(state, startLine, nextLine);
  const token_c = state.push("blockquote_close", "blockquote", -1);
  token_c.markup = ">";
  state.lineMax = oldLineMax;
  state.parentType = oldParentType;
  lines[1] = state.line;
  for (let i = 0; i < oldTShift.length; i++) {
    state.bMarks[i + startLine] = oldBMarks[i];
    state.tShift[i + startLine] = oldTShift[i];
    state.sCount[i + startLine] = oldSCount[i];
    state.bsCount[i + startLine] = oldBSCount[i];
  }
  state.blkIndent = oldIndent;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/hr.mjs
function hr(state, startLine, endLine, silent) {
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 95) {
    return false;
  }
  let cnt = 1;
  while (pos < max) {
    const ch = state.src.charCodeAt(pos++);
    if (ch !== marker && !isSpace(ch)) {
      return false;
    }
    if (ch === marker) {
      cnt++;
    }
  }
  if (cnt < 3) {
    return false;
  }
  if (silent) {
    return true;
  }
  state.line = startLine + 1;
  const token = state.push("hr", "hr", 0);
  token.map = [startLine, state.line];
  token.markup = Array(cnt + 1).join(String.fromCharCode(marker));
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/list.mjs
function skipBulletListMarker(state, startLine) {
  const max = state.eMarks[startLine];
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  const marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 43) {
    return -1;
  }
  if (pos < max) {
    const ch = state.src.charCodeAt(pos);
    if (!isSpace(ch)) {
      return -1;
    }
  }
  return pos;
}
function skipOrderedListMarker(state, startLine) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  let pos = start;
  if (pos + 1 >= max) {
    return -1;
  }
  let ch = state.src.charCodeAt(pos++);
  if (ch < 48 || ch > 57) {
    return -1;
  }
  for (; ; ) {
    if (pos >= max) {
      return -1;
    }
    ch = state.src.charCodeAt(pos++);
    if (ch >= 48 && ch <= 57) {
      if (pos - start >= 10) {
        return -1;
      }
      continue;
    }
    if (ch === 41 || ch === 46) {
      break;
    }
    return -1;
  }
  if (pos < max) {
    ch = state.src.charCodeAt(pos);
    if (!isSpace(ch)) {
      return -1;
    }
  }
  return pos;
}
function markTightParagraphs(state, idx) {
  const level = state.level + 2;
  for (let i = idx + 2, l = state.tokens.length - 2; i < l; i++) {
    if (state.tokens[i].level === level && state.tokens[i].type === "paragraph_open") {
      state.tokens[i + 2].hidden = true;
      state.tokens[i].hidden = true;
      i += 2;
    }
  }
}
function list(state, startLine, endLine, silent) {
  let max, pos, start, token;
  let nextLine = startLine;
  let tight = true;
  if (state.sCount[nextLine] - state.blkIndent >= 4) {
    return false;
  }
  if (state.listIndent >= 0 && state.sCount[nextLine] - state.listIndent >= 4 && state.sCount[nextLine] < state.blkIndent) {
    return false;
  }
  let isTerminatingParagraph = false;
  if (silent && state.parentType === "paragraph") {
    if (state.sCount[nextLine] >= state.blkIndent) {
      isTerminatingParagraph = true;
    }
  }
  let isOrdered;
  let markerValue;
  let posAfterMarker;
  if ((posAfterMarker = skipOrderedListMarker(state, nextLine)) >= 0) {
    isOrdered = true;
    start = state.bMarks[nextLine] + state.tShift[nextLine];
    markerValue = Number(state.src.slice(start, posAfterMarker - 1));
    if (isTerminatingParagraph && markerValue !== 1) return false;
  } else if ((posAfterMarker = skipBulletListMarker(state, nextLine)) >= 0) {
    isOrdered = false;
  } else {
    return false;
  }
  if (isTerminatingParagraph) {
    if (state.skipSpaces(posAfterMarker) >= state.eMarks[nextLine]) return false;
  }
  if (silent) {
    return true;
  }
  const markerCharCode = state.src.charCodeAt(posAfterMarker - 1);
  const listTokIdx = state.tokens.length;
  if (isOrdered) {
    token = state.push("ordered_list_open", "ol", 1);
    if (markerValue !== 1) {
      token.attrs = [["start", markerValue]];
    }
  } else {
    token = state.push("bullet_list_open", "ul", 1);
  }
  const listLines = [nextLine, 0];
  token.map = listLines;
  token.markup = String.fromCharCode(markerCharCode);
  let prevEmptyEnd = false;
  const terminatorRules = state.md.block.ruler.getRules("list");
  const oldParentType = state.parentType;
  state.parentType = "list";
  while (nextLine < endLine) {
    pos = posAfterMarker;
    max = state.eMarks[nextLine];
    const initial = state.sCount[nextLine] + posAfterMarker - (state.bMarks[nextLine] + state.tShift[nextLine]);
    let offset = initial;
    while (pos < max) {
      const ch = state.src.charCodeAt(pos);
      if (ch === 9) {
        offset += 4 - (offset + state.bsCount[nextLine]) % 4;
      } else if (ch === 32) {
        offset++;
      } else {
        break;
      }
      pos++;
    }
    const contentStart = pos;
    let indentAfterMarker;
    if (contentStart >= max) {
      indentAfterMarker = 1;
    } else {
      indentAfterMarker = offset - initial;
    }
    if (indentAfterMarker > 4) {
      indentAfterMarker = 1;
    }
    const indent = initial + indentAfterMarker;
    token = state.push("list_item_open", "li", 1);
    token.markup = String.fromCharCode(markerCharCode);
    const itemLines = [nextLine, 0];
    token.map = itemLines;
    if (isOrdered) {
      token.info = state.src.slice(start, posAfterMarker - 1);
    }
    const oldTight = state.tight;
    const oldTShift = state.tShift[nextLine];
    const oldSCount = state.sCount[nextLine];
    const oldListIndent = state.listIndent;
    state.listIndent = state.blkIndent;
    state.blkIndent = indent;
    state.tight = true;
    state.tShift[nextLine] = contentStart - state.bMarks[nextLine];
    state.sCount[nextLine] = offset;
    if (contentStart >= max && state.isEmpty(nextLine + 1)) {
      state.line = Math.min(state.line + 2, endLine);
    } else {
      state.md.block.tokenize(state, nextLine, endLine, true);
    }
    if (!state.tight || prevEmptyEnd) {
      tight = false;
    }
    prevEmptyEnd = state.line - nextLine > 1 && state.isEmpty(state.line - 1);
    state.blkIndent = state.listIndent;
    state.listIndent = oldListIndent;
    state.tShift[nextLine] = oldTShift;
    state.sCount[nextLine] = oldSCount;
    state.tight = oldTight;
    token = state.push("list_item_close", "li", -1);
    token.markup = String.fromCharCode(markerCharCode);
    nextLine = state.line;
    itemLines[1] = nextLine;
    if (nextLine >= endLine) {
      break;
    }
    if (state.sCount[nextLine] < state.blkIndent) {
      break;
    }
    if (state.sCount[nextLine] - state.blkIndent >= 4) {
      break;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) {
        break;
      }
      start = state.bMarks[nextLine] + state.tShift[nextLine];
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) {
        break;
      }
    }
    if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) {
      break;
    }
  }
  if (isOrdered) {
    token = state.push("ordered_list_close", "ol", -1);
  } else {
    token = state.push("bullet_list_close", "ul", -1);
  }
  token.markup = String.fromCharCode(markerCharCode);
  listLines[1] = nextLine;
  state.line = nextLine;
  state.parentType = oldParentType;
  if (tight) {
    markTightParagraphs(state, listTokIdx);
  }
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/reference.mjs
function reference(state, startLine, _endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  let nextLine = startLine + 1;
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  if (state.src.charCodeAt(pos) !== 91) {
    return false;
  }
  function getNextLine(nextLine2) {
    const endLine = state.lineMax;
    if (nextLine2 >= endLine || state.isEmpty(nextLine2)) {
      return null;
    }
    let isContinuation = false;
    if (state.sCount[nextLine2] - state.blkIndent > 3) {
      isContinuation = true;
    }
    if (state.sCount[nextLine2] < 0) {
      isContinuation = true;
    }
    if (!isContinuation) {
      const terminatorRules = state.md.block.ruler.getRules("reference");
      const oldParentType = state.parentType;
      state.parentType = "reference";
      let terminate = false;
      for (let i = 0, l = terminatorRules.length; i < l; i++) {
        if (terminatorRules[i](state, nextLine2, endLine, true)) {
          terminate = true;
          break;
        }
      }
      state.parentType = oldParentType;
      if (terminate) {
        return null;
      }
    }
    const pos2 = state.bMarks[nextLine2] + state.tShift[nextLine2];
    const max2 = state.eMarks[nextLine2];
    return state.src.slice(pos2, max2 + 1);
  }
  let str = state.src.slice(pos, max + 1);
  max = str.length;
  let labelEnd = -1;
  for (pos = 1; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 91) {
      return false;
    } else if (ch === 93) {
      labelEnd = pos;
      break;
    } else if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (ch === 92) {
      pos++;
      if (pos < max && str.charCodeAt(pos) === 10) {
        const lineContent = getNextLine(nextLine);
        if (lineContent !== null) {
          str += lineContent;
          max = str.length;
          nextLine++;
        }
      }
    }
  }
  if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) {
    return false;
  }
  for (pos = labelEnd + 2; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (isSpace(ch)) ; else {
      break;
    }
  }
  const destRes = state.md.helpers.parseLinkDestination(str, pos, max);
  if (!destRes.ok) {
    return false;
  }
  const href2 = state.md.normalizeLink(destRes.str);
  if (!state.md.validateLink(href2)) {
    return false;
  }
  pos = destRes.pos;
  const destEndPos = pos;
  const destEndLineNo = nextLine;
  const start = pos;
  for (; pos < max; pos++) {
    const ch = str.charCodeAt(pos);
    if (ch === 10) {
      const lineContent = getNextLine(nextLine);
      if (lineContent !== null) {
        str += lineContent;
        max = str.length;
        nextLine++;
      }
    } else if (isSpace(ch)) ; else {
      break;
    }
  }
  let titleRes = state.md.helpers.parseLinkTitle(str, pos, max);
  while (titleRes.can_continue) {
    const lineContent = getNextLine(nextLine);
    if (lineContent === null) break;
    str += lineContent;
    pos = max;
    max = str.length;
    nextLine++;
    titleRes = state.md.helpers.parseLinkTitle(str, pos, max, titleRes);
  }
  let title;
  if (pos < max && start !== pos && titleRes.ok) {
    title = titleRes.str;
    pos = titleRes.pos;
  } else {
    title = "";
    pos = destEndPos;
    nextLine = destEndLineNo;
  }
  while (pos < max) {
    const ch = str.charCodeAt(pos);
    if (!isSpace(ch)) {
      break;
    }
    pos++;
  }
  if (pos < max && str.charCodeAt(pos) !== 10) {
    if (title) {
      title = "";
      pos = destEndPos;
      nextLine = destEndLineNo;
      while (pos < max) {
        const ch = str.charCodeAt(pos);
        if (!isSpace(ch)) {
          break;
        }
        pos++;
      }
    }
  }
  if (pos < max && str.charCodeAt(pos) !== 10) {
    return false;
  }
  const label3 = normalizeReference(str.slice(1, labelEnd));
  if (!label3) {
    return false;
  }
  if (silent) {
    return true;
  }
  if (typeof state.env.references === "undefined") {
    state.env.references = {};
  }
  if (typeof state.env.references[label3] === "undefined") {
    state.env.references[label3] = { title, href: href2 };
  }
  state.line = nextLine;
  return true;
}

// ../../node_modules/markdown-it/lib/common/html_blocks.mjs
var html_blocks_default = [
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul"
];

// ../../node_modules/markdown-it/lib/common/html_re.mjs
var attr_name = "[a-zA-Z_:][a-zA-Z0-9:._-]*";
var unquoted = "[^\"'=<>`\\x00-\\x20]+";
var single_quoted = "'[^']*'";
var double_quoted = '"[^"]*"';
var attr_value = "(?:" + unquoted + "|" + single_quoted + "|" + double_quoted + ")";
var attribute = "(?:\\s+" + attr_name + "(?:\\s*=\\s*" + attr_value + ")?)";
var open_tag = "<[A-Za-z][A-Za-z0-9\\-]*" + attribute + "*\\s*\\/?>";
var close_tag = "<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>";
var comment = "<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->";
var processing = "<[?][\\s\\S]*?[?]>";
var declaration = "<![A-Za-z][^>]*>";
var cdata = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>";
var HTML_TAG_RE = new RegExp("^(?:" + open_tag + "|" + close_tag + "|" + comment + "|" + processing + "|" + declaration + "|" + cdata + ")");
var HTML_OPEN_CLOSE_TAG_RE = new RegExp("^(?:" + open_tag + "|" + close_tag + ")");

// ../../node_modules/markdown-it/lib/rules_block/html_block.mjs
var HTML_SEQUENCES = [
  [/^<(script|pre|style|textarea)(?=(\s|>|$))/i, /<\/(script|pre|style|textarea)>/i, true],
  [/^<!--/, /-->/, true],
  [/^<\?/, /\?>/, true],
  [/^<![A-Z]/, />/, true],
  [/^<!\[CDATA\[/, /\]\]>/, true],
  [new RegExp("^</?(" + html_blocks_default.join("|") + ")(?=(\\s|/?>|$))", "i"), /^$/, true],
  [new RegExp(HTML_OPEN_CLOSE_TAG_RE.source + "\\s*$"), /^$/, false]
];
function html_block(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  if (!state.md.options.html) {
    return false;
  }
  if (state.src.charCodeAt(pos) !== 60) {
    return false;
  }
  let lineText = state.src.slice(pos, max);
  let i = 0;
  for (; i < HTML_SEQUENCES.length; i++) {
    if (HTML_SEQUENCES[i][0].test(lineText)) {
      break;
    }
  }
  if (i === HTML_SEQUENCES.length) {
    return false;
  }
  if (silent) {
    return HTML_SEQUENCES[i][2];
  }
  let nextLine = startLine + 1;
  if (!HTML_SEQUENCES[i][1].test(lineText)) {
    for (; nextLine < endLine; nextLine++) {
      if (state.sCount[nextLine] < state.blkIndent) {
        break;
      }
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      lineText = state.src.slice(pos, max);
      if (HTML_SEQUENCES[i][1].test(lineText)) {
        if (lineText.length !== 0) {
          nextLine++;
        }
        break;
      }
    }
  }
  state.line = nextLine;
  const token = state.push("html_block", "", 0);
  token.map = [startLine, nextLine];
  token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/heading.mjs
function heading(state, startLine, endLine, silent) {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  let ch = state.src.charCodeAt(pos);
  if (ch !== 35 || pos >= max) {
    return false;
  }
  let level = 1;
  ch = state.src.charCodeAt(++pos);
  while (ch === 35 && pos < max && level <= 6) {
    level++;
    ch = state.src.charCodeAt(++pos);
  }
  if (level > 6 || pos < max && !isSpace(ch)) {
    return false;
  }
  if (silent) {
    return true;
  }
  max = state.skipSpacesBack(max, pos);
  const tmp = state.skipCharsBack(max, 35, pos);
  if (tmp > pos && isSpace(state.src.charCodeAt(tmp - 1))) {
    max = tmp;
  }
  state.line = startLine + 1;
  const token_o = state.push("heading_open", "h" + String(level), 1);
  token_o.markup = "########".slice(0, level);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = state.src.slice(pos, max).trim();
  token_i.map = [startLine, state.line];
  token_i.children = [];
  const token_c = state.push("heading_close", "h" + String(level), -1);
  token_c.markup = "########".slice(0, level);
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/lheading.mjs
function lheading(state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules("paragraph");
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }
  const oldParentType = state.parentType;
  state.parentType = "paragraph";
  let level = 0;
  let marker;
  let nextLine = startLine + 1;
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    if (state.sCount[nextLine] - state.blkIndent > 3) {
      continue;
    }
    if (state.sCount[nextLine] >= state.blkIndent) {
      let pos = state.bMarks[nextLine] + state.tShift[nextLine];
      const max = state.eMarks[nextLine];
      if (pos < max) {
        marker = state.src.charCodeAt(pos);
        if (marker === 45 || marker === 61) {
          pos = state.skipChars(pos, marker);
          pos = state.skipSpaces(pos);
          if (pos >= max) {
            level = marker === 61 ? 1 : 2;
            break;
          }
        }
      }
    }
    if (state.sCount[nextLine] < 0) {
      continue;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
  }
  if (!level) {
    return false;
  }
  const content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
  state.line = nextLine + 1;
  const token_o = state.push("heading_open", "h" + String(level), 1);
  token_o.markup = String.fromCharCode(marker);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = content;
  token_i.map = [startLine, state.line - 1];
  token_i.children = [];
  const token_c = state.push("heading_close", "h" + String(level), -1);
  token_c.markup = String.fromCharCode(marker);
  state.parentType = oldParentType;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_block/paragraph.mjs
function paragraph(state, startLine, endLine) {
  const terminatorRules = state.md.block.ruler.getRules("paragraph");
  const oldParentType = state.parentType;
  let nextLine = startLine + 1;
  state.parentType = "paragraph";
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
    if (state.sCount[nextLine] - state.blkIndent > 3) {
      continue;
    }
    if (state.sCount[nextLine] < 0) {
      continue;
    }
    let terminate = false;
    for (let i = 0, l = terminatorRules.length; i < l; i++) {
      if (terminatorRules[i](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
  }
  const content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
  state.line = nextLine;
  const token_o = state.push("paragraph_open", "p", 1);
  token_o.map = [startLine, state.line];
  const token_i = state.push("inline", "", 0);
  token_i.content = content;
  token_i.map = [startLine, state.line];
  token_i.children = [];
  state.push("paragraph_close", "p", -1);
  state.parentType = oldParentType;
  return true;
}

// ../../node_modules/markdown-it/lib/parser_block.mjs
var _rules2 = [
  // First 2 params - rule name & source. Secondary array - list of rules,
  // which can be terminated by this one.
  ["table", table, ["paragraph", "reference"]],
  ["code", code],
  ["fence", fence, ["paragraph", "reference", "blockquote", "list"]],
  ["blockquote", blockquote, ["paragraph", "reference", "blockquote", "list"]],
  ["hr", hr, ["paragraph", "reference", "blockquote", "list"]],
  ["list", list, ["paragraph", "reference", "blockquote"]],
  ["reference", reference],
  ["html_block", html_block, ["paragraph", "reference", "blockquote"]],
  ["heading", heading, ["paragraph", "reference", "blockquote"]],
  ["lheading", lheading],
  ["paragraph", paragraph]
];
function ParserBlock() {
  this.ruler = new ruler_default();
  for (let i = 0; i < _rules2.length; i++) {
    this.ruler.push(_rules2[i][0], _rules2[i][1], { alt: (_rules2[i][2] || []).slice() });
  }
}
ParserBlock.prototype.tokenize = function(state, startLine, endLine) {
  const rules = this.ruler.getRules("");
  const len = rules.length;
  const maxNesting = state.md.options.maxNesting;
  let line = startLine;
  let hasEmptyLines = false;
  while (line < endLine) {
    state.line = line = state.skipEmptyLines(line);
    if (line >= endLine) {
      break;
    }
    if (state.sCount[line] < state.blkIndent) {
      break;
    }
    if (state.level >= maxNesting) {
      state.line = endLine;
      break;
    }
    const prevLine = state.line;
    let ok = false;
    for (let i = 0; i < len; i++) {
      ok = rules[i](state, line, endLine, false);
      if (ok) {
        if (prevLine >= state.line) {
          throw new Error("block rule didn't increment state.line");
        }
        break;
      }
    }
    if (!ok) throw new Error("none of the block rules matched");
    state.tight = !hasEmptyLines;
    if (state.isEmpty(state.line - 1)) {
      hasEmptyLines = true;
    }
    line = state.line;
    if (line < endLine && state.isEmpty(line)) {
      hasEmptyLines = true;
      line++;
      state.line = line;
    }
  }
};
ParserBlock.prototype.parse = function(src, md, env, outTokens) {
  if (!src) {
    return;
  }
  const state = new this.State(src, md, env, outTokens);
  this.tokenize(state, state.line, state.lineMax);
};
ParserBlock.prototype.State = state_block_default;
var parser_block_default = ParserBlock;

// ../../node_modules/markdown-it/lib/rules_inline/state_inline.mjs
function StateInline(src, md, env, outTokens) {
  this.src = src;
  this.env = env;
  this.md = md;
  this.tokens = outTokens;
  this.tokens_meta = Array(outTokens.length);
  this.pos = 0;
  this.posMax = this.src.length;
  this.level = 0;
  this.pending = "";
  this.pendingLevel = 0;
  this.cache = {};
  this.delimiters = [];
  this._prev_delimiters = [];
  this.backticks = {};
  this.backticksScanned = false;
  this.linkLevel = 0;
}
StateInline.prototype.pushPending = function() {
  const token = new token_default("text", "", 0);
  token.content = this.pending;
  token.level = this.pendingLevel;
  this.tokens.push(token);
  this.pending = "";
  return token;
};
StateInline.prototype.push = function(type, tag, nesting) {
  if (this.pending) {
    this.pushPending();
  }
  const token = new token_default(type, tag, nesting);
  let token_meta = null;
  if (nesting < 0) {
    this.level--;
    this.delimiters = this._prev_delimiters.pop();
  }
  token.level = this.level;
  if (nesting > 0) {
    this.level++;
    this._prev_delimiters.push(this.delimiters);
    this.delimiters = [];
    token_meta = { delimiters: this.delimiters };
  }
  this.pendingLevel = this.level;
  this.tokens.push(token);
  this.tokens_meta.push(token_meta);
  return token;
};
StateInline.prototype.scanDelims = function(start, canSplitWord) {
  const max = this.posMax;
  const marker = this.src.charCodeAt(start);
  const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 32;
  let pos = start;
  while (pos < max && this.src.charCodeAt(pos) === marker) {
    pos++;
  }
  const count = pos - start;
  const nextChar = pos < max ? this.src.charCodeAt(pos) : 32;
  const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
  const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));
  const isLastWhiteSpace = isWhiteSpace(lastChar);
  const isNextWhiteSpace = isWhiteSpace(nextChar);
  const left_flanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
  const right_flanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
  const can_open = left_flanking && (canSplitWord || !right_flanking || isLastPunctChar);
  const can_close = right_flanking && (canSplitWord || !left_flanking || isNextPunctChar);
  return { can_open, can_close, length: count };
};
StateInline.prototype.Token = token_default;
var state_inline_default = StateInline;

// ../../node_modules/markdown-it/lib/rules_inline/text.mjs
function isTerminatorChar(ch) {
  switch (ch) {
    case 10:
    case 33:
    case 35:
    case 36:
    case 37:
    case 38:
    case 42:
    case 43:
    case 45:
    case 58:
    case 60:
    case 61:
    case 62:
    case 64:
    case 91:
    case 92:
    case 93:
    case 94:
    case 95:
    case 96:
    case 123:
    case 125:
    case 126:
      return true;
    default:
      return false;
  }
}
function text(state, silent) {
  let pos = state.pos;
  while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
    pos++;
  }
  if (pos === state.pos) {
    return false;
  }
  if (!silent) {
    state.pending += state.src.slice(state.pos, pos);
  }
  state.pos = pos;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_inline/linkify.mjs
var SCHEME_RE = /(?:^|[^a-z0-9.+-])([a-z][a-z0-9.+-]*)$/i;
function linkify2(state, silent) {
  if (!state.md.options.linkify) return false;
  if (state.linkLevel > 0) return false;
  const pos = state.pos;
  const max = state.posMax;
  if (pos + 3 > max) return false;
  if (state.src.charCodeAt(pos) !== 58) return false;
  if (state.src.charCodeAt(pos + 1) !== 47) return false;
  if (state.src.charCodeAt(pos + 2) !== 47) return false;
  const match2 = state.pending.match(SCHEME_RE);
  if (!match2) return false;
  const proto = match2[1];
  const link2 = state.md.linkify.matchAtStart(state.src.slice(pos - proto.length));
  if (!link2) return false;
  let url = link2.url;
  if (url.length <= proto.length) return false;
  url = url.replace(/\*+$/, "");
  const fullUrl = state.md.normalizeLink(url);
  if (!state.md.validateLink(fullUrl)) return false;
  if (!silent) {
    state.pending = state.pending.slice(0, -proto.length);
    const token_o = state.push("link_open", "a", 1);
    token_o.attrs = [["href", fullUrl]];
    token_o.markup = "linkify";
    token_o.info = "auto";
    const token_t = state.push("text", "", 0);
    token_t.content = state.md.normalizeLinkText(url);
    const token_c = state.push("link_close", "a", -1);
    token_c.markup = "linkify";
    token_c.info = "auto";
  }
  state.pos += url.length - proto.length;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_inline/newline.mjs
function newline(state, silent) {
  let pos = state.pos;
  if (state.src.charCodeAt(pos) !== 10) {
    return false;
  }
  const pmax = state.pending.length - 1;
  const max = state.posMax;
  if (!silent) {
    if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) {
      if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
        let ws = pmax - 1;
        while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 32) ws--;
        state.pending = state.pending.slice(0, ws);
        state.push("hardbreak", "br", 0);
      } else {
        state.pending = state.pending.slice(0, -1);
        state.push("softbreak", "br", 0);
      }
    } else {
      state.push("softbreak", "br", 0);
    }
  }
  pos++;
  while (pos < max && isSpace(state.src.charCodeAt(pos))) {
    pos++;
  }
  state.pos = pos;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_inline/escape.mjs
var ESCAPED = [];
for (let i = 0; i < 256; i++) {
  ESCAPED.push(0);
}
"\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".split("").forEach(function(ch) {
  ESCAPED[ch.charCodeAt(0)] = 1;
});
function escape2(state, silent) {
  let pos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(pos) !== 92) return false;
  pos++;
  if (pos >= max) return false;
  let ch1 = state.src.charCodeAt(pos);
  if (ch1 === 10) {
    if (!silent) {
      state.push("hardbreak", "br", 0);
    }
    pos++;
    while (pos < max) {
      ch1 = state.src.charCodeAt(pos);
      if (!isSpace(ch1)) break;
      pos++;
    }
    state.pos = pos;
    return true;
  }
  let escapedStr = state.src[pos];
  if (ch1 >= 55296 && ch1 <= 56319 && pos + 1 < max) {
    const ch2 = state.src.charCodeAt(pos + 1);
    if (ch2 >= 56320 && ch2 <= 57343) {
      escapedStr += state.src[pos + 1];
      pos++;
    }
  }
  const origStr = "\\" + escapedStr;
  if (!silent) {
    const token = state.push("text_special", "", 0);
    if (ch1 < 256 && ESCAPED[ch1] !== 0) {
      token.content = escapedStr;
    } else {
      token.content = origStr;
    }
    token.markup = origStr;
    token.info = "escape";
  }
  state.pos = pos + 1;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_inline/backticks.mjs
function backtick(state, silent) {
  let pos = state.pos;
  const ch = state.src.charCodeAt(pos);
  if (ch !== 96) {
    return false;
  }
  const start = pos;
  pos++;
  const max = state.posMax;
  while (pos < max && state.src.charCodeAt(pos) === 96) {
    pos++;
  }
  const marker = state.src.slice(start, pos);
  const openerLength = marker.length;
  if (state.backticksScanned && (state.backticks[openerLength] || 0) <= start) {
    if (!silent) state.pending += marker;
    state.pos += openerLength;
    return true;
  }
  let matchEnd = pos;
  let matchStart;
  while ((matchStart = state.src.indexOf("`", matchEnd)) !== -1) {
    matchEnd = matchStart + 1;
    while (matchEnd < max && state.src.charCodeAt(matchEnd) === 96) {
      matchEnd++;
    }
    const closerLength = matchEnd - matchStart;
    if (closerLength === openerLength) {
      if (!silent) {
        const token = state.push("code_inline", "code", 0);
        token.markup = marker;
        token.content = state.src.slice(pos, matchStart).replace(/\n/g, " ").replace(/^ (.+) $/, "$1");
      }
      state.pos = matchEnd;
      return true;
    }
    state.backticks[closerLength] = matchStart;
  }
  state.backticksScanned = true;
  if (!silent) state.pending += marker;
  state.pos += openerLength;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_inline/strikethrough.mjs
function strikethrough_tokenize(state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  if (silent) {
    return false;
  }
  if (marker !== 126) {
    return false;
  }
  const scanned = state.scanDelims(state.pos, true);
  let len = scanned.length;
  const ch = String.fromCharCode(marker);
  if (len < 2) {
    return false;
  }
  let token;
  if (len % 2) {
    token = state.push("text", "", 0);
    token.content = ch;
    len--;
  }
  for (let i = 0; i < len; i += 2) {
    token = state.push("text", "", 0);
    token.content = ch + ch;
    state.delimiters.push({
      marker,
      length: 0,
      // disable "rule of 3" length checks meant for emphasis
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close
    });
  }
  state.pos += scanned.length;
  return true;
}
function postProcess(state, delimiters) {
  let token;
  const loneMarkers = [];
  const max = delimiters.length;
  for (let i = 0; i < max; i++) {
    const startDelim = delimiters[i];
    if (startDelim.marker !== 126) {
      continue;
    }
    if (startDelim.end === -1) {
      continue;
    }
    const endDelim = delimiters[startDelim.end];
    token = state.tokens[startDelim.token];
    token.type = "s_open";
    token.tag = "s";
    token.nesting = 1;
    token.markup = "~~";
    token.content = "";
    token = state.tokens[endDelim.token];
    token.type = "s_close";
    token.tag = "s";
    token.nesting = -1;
    token.markup = "~~";
    token.content = "";
    if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "~") {
      loneMarkers.push(endDelim.token - 1);
    }
  }
  while (loneMarkers.length) {
    const i = loneMarkers.pop();
    let j = i + 1;
    while (j < state.tokens.length && state.tokens[j].type === "s_close") {
      j++;
    }
    j--;
    if (i !== j) {
      token = state.tokens[j];
      state.tokens[j] = state.tokens[i];
      state.tokens[i] = token;
    }
  }
}
function strikethrough_postProcess(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  postProcess(state, state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      postProcess(state, tokens_meta[curr].delimiters);
    }
  }
}
var strikethrough_default = {
  tokenize: strikethrough_tokenize,
  postProcess: strikethrough_postProcess
};

// ../../node_modules/markdown-it/lib/rules_inline/emphasis.mjs
function emphasis_tokenize(state, silent) {
  const start = state.pos;
  const marker = state.src.charCodeAt(start);
  if (silent) {
    return false;
  }
  if (marker !== 95 && marker !== 42) {
    return false;
  }
  const scanned = state.scanDelims(state.pos, marker === 42);
  for (let i = 0; i < scanned.length; i++) {
    const token = state.push("text", "", 0);
    token.content = String.fromCharCode(marker);
    state.delimiters.push({
      // Char code of the starting marker (number).
      //
      marker,
      // Total length of these series of delimiters.
      //
      length: scanned.length,
      // A position of the token this delimiter corresponds to.
      //
      token: state.tokens.length - 1,
      // If this delimiter is matched as a valid opener, `end` will be
      // equal to its position, otherwise it's `-1`.
      //
      end: -1,
      // Boolean flags that determine if this delimiter could open or close
      // an emphasis.
      //
      open: scanned.can_open,
      close: scanned.can_close
    });
  }
  state.pos += scanned.length;
  return true;
}
function postProcess2(state, delimiters) {
  const max = delimiters.length;
  for (let i = max - 1; i >= 0; i--) {
    const startDelim = delimiters[i];
    if (startDelim.marker !== 95 && startDelim.marker !== 42) {
      continue;
    }
    if (startDelim.end === -1) {
      continue;
    }
    const endDelim = delimiters[startDelim.end];
    const isStrong = i > 0 && delimiters[i - 1].end === startDelim.end + 1 && // check that first two markers match and adjacent
    delimiters[i - 1].marker === startDelim.marker && delimiters[i - 1].token === startDelim.token - 1 && // check that last two markers are adjacent (we can safely assume they match)
    delimiters[startDelim.end + 1].token === endDelim.token + 1;
    const ch = String.fromCharCode(startDelim.marker);
    const token_o = state.tokens[startDelim.token];
    token_o.type = isStrong ? "strong_open" : "em_open";
    token_o.tag = isStrong ? "strong" : "em";
    token_o.nesting = 1;
    token_o.markup = isStrong ? ch + ch : ch;
    token_o.content = "";
    const token_c = state.tokens[endDelim.token];
    token_c.type = isStrong ? "strong_close" : "em_close";
    token_c.tag = isStrong ? "strong" : "em";
    token_c.nesting = -1;
    token_c.markup = isStrong ? ch + ch : ch;
    token_c.content = "";
    if (isStrong) {
      state.tokens[delimiters[i - 1].token].content = "";
      state.tokens[delimiters[startDelim.end + 1].token].content = "";
      i--;
    }
  }
}
function emphasis_post_process(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  postProcess2(state, state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      postProcess2(state, tokens_meta[curr].delimiters);
    }
  }
}
var emphasis_default = {
  tokenize: emphasis_tokenize,
  postProcess: emphasis_post_process
};

// ../../node_modules/markdown-it/lib/rules_inline/link.mjs
function link(state, silent) {
  let code2, label3, res, ref;
  let href2 = "";
  let title = "";
  let start = state.pos;
  let parseReference = true;
  if (state.src.charCodeAt(state.pos) !== 91) {
    return false;
  }
  const oldPos = state.pos;
  const max = state.posMax;
  const labelStart = state.pos + 1;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
  if (labelEnd < 0) {
    return false;
  }
  let pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    parseReference = false;
    pos++;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) {
        break;
      }
    }
    if (pos >= max) {
      return false;
    }
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href2 = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href2)) {
        pos = res.pos;
      } else {
        href2 = "";
      }
      start = pos;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) {
          break;
        }
      }
      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        for (; pos < max; pos++) {
          code2 = state.src.charCodeAt(pos);
          if (!isSpace(code2) && code2 !== 10) {
            break;
          }
        }
      }
    }
    if (pos >= max || state.src.charCodeAt(pos) !== 41) {
      parseReference = true;
    }
    pos++;
  }
  if (parseReference) {
    if (typeof state.env.references === "undefined") {
      return false;
    }
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label3 = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }
    if (!label3) {
      label3 = state.src.slice(labelStart, labelEnd);
    }
    ref = state.env.references[normalizeReference(label3)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href2 = ref.href;
    title = ref.title;
  }
  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;
    const token_o = state.push("link_open", "a", 1);
    const attrs = [["href", href2]];
    token_o.attrs = attrs;
    if (title) {
      attrs.push(["title", title]);
    }
    state.linkLevel++;
    state.md.inline.tokenize(state);
    state.linkLevel--;
    state.push("link_close", "a", -1);
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_inline/image.mjs
function image(state, silent) {
  let code2, content, label3, pos, ref, res, title, start;
  let href2 = "";
  const oldPos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(state.pos) !== 33) {
    return false;
  }
  if (state.src.charCodeAt(state.pos + 1) !== 91) {
    return false;
  }
  const labelStart = state.pos + 2;
  const labelEnd = state.md.helpers.parseLinkLabel(state, state.pos + 1, false);
  if (labelEnd < 0) {
    return false;
  }
  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    pos++;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) {
        break;
      }
    }
    if (pos >= max) {
      return false;
    }
    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href2 = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href2)) {
        pos = res.pos;
      } else {
        href2 = "";
      }
    }
    start = pos;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (!isSpace(code2) && code2 !== 10) {
        break;
      }
    }
    res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
    if (pos < max && start !== pos && res.ok) {
      title = res.str;
      pos = res.pos;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (!isSpace(code2) && code2 !== 10) {
          break;
        }
      }
    } else {
      title = "";
    }
    if (pos >= max || state.src.charCodeAt(pos) !== 41) {
      state.pos = oldPos;
      return false;
    }
    pos++;
  } else {
    if (typeof state.env.references === "undefined") {
      return false;
    }
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label3 = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }
    if (!label3) {
      label3 = state.src.slice(labelStart, labelEnd);
    }
    ref = state.env.references[normalizeReference(label3)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href2 = ref.href;
    title = ref.title;
  }
  if (!silent) {
    content = state.src.slice(labelStart, labelEnd);
    const tokens = [];
    state.md.inline.parse(
      content,
      state.md,
      state.env,
      tokens
    );
    const token = state.push("image", "img", 0);
    const attrs = [["src", href2], ["alt", ""]];
    token.attrs = attrs;
    token.children = tokens;
    token.content = content;
    if (title) {
      attrs.push(["title", title]);
    }
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_inline/autolink.mjs
var EMAIL_RE = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
var AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;
function autolink(state, silent) {
  let pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60) {
    return false;
  }
  const start = state.pos;
  const max = state.posMax;
  for (; ; ) {
    if (++pos >= max) return false;
    const ch = state.src.charCodeAt(pos);
    if (ch === 60) return false;
    if (ch === 62) break;
  }
  const url = state.src.slice(start + 1, pos);
  if (AUTOLINK_RE.test(url)) {
    const fullUrl = state.md.normalizeLink(url);
    if (!state.md.validateLink(fullUrl)) {
      return false;
    }
    if (!silent) {
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "autolink";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "autolink";
      token_c.info = "auto";
    }
    state.pos += url.length + 2;
    return true;
  }
  if (EMAIL_RE.test(url)) {
    const fullUrl = state.md.normalizeLink("mailto:" + url);
    if (!state.md.validateLink(fullUrl)) {
      return false;
    }
    if (!silent) {
      const token_o = state.push("link_open", "a", 1);
      token_o.attrs = [["href", fullUrl]];
      token_o.markup = "autolink";
      token_o.info = "auto";
      const token_t = state.push("text", "", 0);
      token_t.content = state.md.normalizeLinkText(url);
      const token_c = state.push("link_close", "a", -1);
      token_c.markup = "autolink";
      token_c.info = "auto";
    }
    state.pos += url.length + 2;
    return true;
  }
  return false;
}

// ../../node_modules/markdown-it/lib/rules_inline/html_inline.mjs
function isLinkOpen2(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose2(str) {
  return /^<\/a\s*>/i.test(str);
}
function isLetter(ch) {
  const lc = ch | 32;
  return lc >= 97 && lc <= 122;
}
function html_inline(state, silent) {
  if (!state.md.options.html) {
    return false;
  }
  const max = state.posMax;
  const pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60 || pos + 2 >= max) {
    return false;
  }
  const ch = state.src.charCodeAt(pos + 1);
  if (ch !== 33 && ch !== 63 && ch !== 47 && !isLetter(ch)) {
    return false;
  }
  const match2 = state.src.slice(pos).match(HTML_TAG_RE);
  if (!match2) {
    return false;
  }
  if (!silent) {
    const token = state.push("html_inline", "", 0);
    token.content = match2[0];
    if (isLinkOpen2(token.content)) state.linkLevel++;
    if (isLinkClose2(token.content)) state.linkLevel--;
  }
  state.pos += match2[0].length;
  return true;
}

// ../../node_modules/markdown-it/lib/rules_inline/entity.mjs
var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i;
var NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;
function entity(state, silent) {
  const pos = state.pos;
  const max = state.posMax;
  if (state.src.charCodeAt(pos) !== 38) return false;
  if (pos + 1 >= max) return false;
  const ch = state.src.charCodeAt(pos + 1);
  if (ch === 35) {
    const match2 = state.src.slice(pos).match(DIGITAL_RE);
    if (match2) {
      if (!silent) {
        const code2 = match2[1][0].toLowerCase() === "x" ? parseInt(match2[1].slice(1), 16) : parseInt(match2[1], 10);
        const token = state.push("text_special", "", 0);
        token.content = isValidEntityCode(code2) ? fromCodePoint2(code2) : fromCodePoint2(65533);
        token.markup = match2[0];
        token.info = "entity";
      }
      state.pos += match2[0].length;
      return true;
    }
  } else {
    const match2 = state.src.slice(pos).match(NAMED_RE);
    if (match2) {
      const decoded = decodeHTML(match2[0]);
      if (decoded !== match2[0]) {
        if (!silent) {
          const token = state.push("text_special", "", 0);
          token.content = decoded;
          token.markup = match2[0];
          token.info = "entity";
        }
        state.pos += match2[0].length;
        return true;
      }
    }
  }
  return false;
}

// ../../node_modules/markdown-it/lib/rules_inline/balance_pairs.mjs
function processDelimiters(delimiters) {
  const openersBottom = {};
  const max = delimiters.length;
  if (!max) return;
  let headerIdx = 0;
  let lastTokenIdx = -2;
  const jumps = [];
  for (let closerIdx = 0; closerIdx < max; closerIdx++) {
    const closer = delimiters[closerIdx];
    jumps.push(0);
    if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) {
      headerIdx = closerIdx;
    }
    lastTokenIdx = closer.token;
    closer.length = closer.length || 0;
    if (!closer.close) continue;
    if (!openersBottom.hasOwnProperty(closer.marker)) {
      openersBottom[closer.marker] = [-1, -1, -1, -1, -1, -1];
    }
    const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + closer.length % 3];
    let openerIdx = headerIdx - jumps[headerIdx] - 1;
    let newMinOpenerIdx = openerIdx;
    for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
      const opener = delimiters[openerIdx];
      if (opener.marker !== closer.marker) continue;
      if (opener.open && opener.end < 0) {
        let isOddMatch = false;
        if (opener.close || closer.open) {
          if ((opener.length + closer.length) % 3 === 0) {
            if (opener.length % 3 !== 0 || closer.length % 3 !== 0) {
              isOddMatch = true;
            }
          }
        }
        if (!isOddMatch) {
          const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
          jumps[closerIdx] = closerIdx - openerIdx + lastJump;
          jumps[openerIdx] = lastJump;
          closer.open = false;
          opener.end = closerIdx;
          opener.close = false;
          newMinOpenerIdx = -1;
          lastTokenIdx = -2;
          break;
        }
      }
    }
    if (newMinOpenerIdx !== -1) {
      openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length || 0) % 3] = newMinOpenerIdx;
    }
  }
}
function link_pairs(state) {
  const tokens_meta = state.tokens_meta;
  const max = state.tokens_meta.length;
  processDelimiters(state.delimiters);
  for (let curr = 0; curr < max; curr++) {
    if (tokens_meta[curr] && tokens_meta[curr].delimiters) {
      processDelimiters(tokens_meta[curr].delimiters);
    }
  }
}

// ../../node_modules/markdown-it/lib/rules_inline/fragments_join.mjs
function fragments_join(state) {
  let curr, last;
  let level = 0;
  const tokens = state.tokens;
  const max = state.tokens.length;
  for (curr = last = 0; curr < max; curr++) {
    if (tokens[curr].nesting < 0) level--;
    tokens[curr].level = level;
    if (tokens[curr].nesting > 0) level++;
    if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") {
      tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
    } else {
      if (curr !== last) {
        tokens[last] = tokens[curr];
      }
      last++;
    }
  }
  if (curr !== last) {
    tokens.length = last;
  }
}

// ../../node_modules/markdown-it/lib/parser_inline.mjs
var _rules3 = [
  ["text", text],
  ["linkify", linkify2],
  ["newline", newline],
  ["escape", escape2],
  ["backticks", backtick],
  ["strikethrough", strikethrough_default.tokenize],
  ["emphasis", emphasis_default.tokenize],
  ["link", link],
  ["image", image],
  ["autolink", autolink],
  ["html_inline", html_inline],
  ["entity", entity]
];
var _rules22 = [
  ["balance_pairs", link_pairs],
  ["strikethrough", strikethrough_default.postProcess],
  ["emphasis", emphasis_default.postProcess],
  // rules for pairs separate '**' into its own text tokens, which may be left unused,
  // rule below merges unused segments back with the rest of the text
  ["fragments_join", fragments_join]
];
function ParserInline() {
  this.ruler = new ruler_default();
  for (let i = 0; i < _rules3.length; i++) {
    this.ruler.push(_rules3[i][0], _rules3[i][1]);
  }
  this.ruler2 = new ruler_default();
  for (let i = 0; i < _rules22.length; i++) {
    this.ruler2.push(_rules22[i][0], _rules22[i][1]);
  }
}
ParserInline.prototype.skipToken = function(state) {
  const pos = state.pos;
  const rules = this.ruler.getRules("");
  const len = rules.length;
  const maxNesting = state.md.options.maxNesting;
  const cache = state.cache;
  if (typeof cache[pos] !== "undefined") {
    state.pos = cache[pos];
    return;
  }
  let ok = false;
  if (state.level < maxNesting) {
    for (let i = 0; i < len; i++) {
      state.level++;
      ok = rules[i](state, true);
      state.level--;
      if (ok) {
        if (pos >= state.pos) {
          throw new Error("inline rule didn't increment state.pos");
        }
        break;
      }
    }
  } else {
    state.pos = state.posMax;
  }
  if (!ok) {
    state.pos++;
  }
  cache[pos] = state.pos;
};
ParserInline.prototype.tokenize = function(state) {
  const rules = this.ruler.getRules("");
  const len = rules.length;
  const end = state.posMax;
  const maxNesting = state.md.options.maxNesting;
  while (state.pos < end) {
    const prevPos = state.pos;
    let ok = false;
    if (state.level < maxNesting) {
      for (let i = 0; i < len; i++) {
        ok = rules[i](state, false);
        if (ok) {
          if (prevPos >= state.pos) {
            throw new Error("inline rule didn't increment state.pos");
          }
          break;
        }
      }
    }
    if (ok) {
      if (state.pos >= end) {
        break;
      }
      continue;
    }
    state.pending += state.src[state.pos++];
  }
  if (state.pending) {
    state.pushPending();
  }
};
ParserInline.prototype.parse = function(str, md, env, outTokens) {
  const state = new this.State(str, md, env, outTokens);
  this.tokenize(state);
  const rules = this.ruler2.getRules("");
  const len = rules.length;
  for (let i = 0; i < len; i++) {
    rules[i](state);
  }
};
ParserInline.prototype.State = state_inline_default;
var parser_inline_default = ParserInline;

// ../../node_modules/linkify-it/lib/re.mjs
function re_default(opts) {
  const re = {};
  opts = opts || {};
  re.src_Any = regex_default.source;
  re.src_Cc = regex_default2.source;
  re.src_Z = regex_default6.source;
  re.src_P = regex_default4.source;
  re.src_ZPCc = [re.src_Z, re.src_P, re.src_Cc].join("|");
  re.src_ZCc = [re.src_Z, re.src_Cc].join("|");
  const text_separators = "[><\uFF5C]";
  re.src_pseudo_letter = `(?:(?!${text_separators}|${re.src_ZPCc})${re.src_Any})`;
  re.src_ip4 = "(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)";
  re.src_auth = `(?:(?:(?!${re.src_ZCc}|[@/\\[\\]()]).){1,50}@)?`;
  re.src_port = "(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?";
  re.src_host_terminator = `(?=$|${text_separators}|${re.src_ZPCc})(?!${opts["---"] ? "-(?!--)|" : "-|"}_|:\\d|\\.-|\\.(?!$|${re.src_ZPCc}))`;
  re.src_path = `(?:[/?#](?:(?!${re.src_ZCc}|${text_separators}|[()[\\]{}.,"'?!\\-;]).|\\[(?:(?!${re.src_ZCc}|\\]).)*\\]|\\((?:(?!${re.src_ZCc}|[)]).)*\\)|\\{(?:(?!${re.src_ZCc}|[}]).)*\\}|\\"(?:(?!${re.src_ZCc}|["]).)+\\"|\\'(?:(?!${re.src_ZCc}|[']).)+\\'|\\'(?=${re.src_pseudo_letter}|[-])|\\.{2,}[a-zA-Z0-9%/&]|\\.(?!${re.src_ZCc}|[.]|$)|` + (opts["---"] ? "\\-(?!--(?:[^-]|$))(?:-*)|" : "\\-+|") + // allow `,,,` in paths
  `,(?!${re.src_ZCc}|$)|;(?!${re.src_ZCc}|$)|\\!+(?!${re.src_ZCc}|[!]|$)|\\?(?!${re.src_ZCc}|[?]|$))+|\\/)?`;
  re.src_email_name = '[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\"\\.a-zA-Z0-9_]{0,63}';
  re.src_xn = "xn--[a-z0-9\\-]{1,59}";
  re.src_domain_root = // Allow letters & digits (http://test1)
  "(?:" + re.src_xn + `|${re.src_pseudo_letter}{1,63})`;
  re.src_domain = "(?:" + re.src_xn + `|(?:${re.src_pseudo_letter})|(?:${re.src_pseudo_letter}(?:-|${re.src_pseudo_letter}){0,61}${re.src_pseudo_letter}))`;
  re.src_host = `(?:(?:(?:(?:${re.src_domain})\\.)*${re.src_domain}))`;
  re.tpl_host_fuzzy = "(?:" + re.src_ip4 + `|(?:(?:(?:${re.src_domain})\\.)+(?:%TLDS%)))`;
  re.tpl_host_no_ip_fuzzy = `(?:(?:(?:${re.src_domain})\\.)+(?:%TLDS%))`;
  re.src_host_strict = re.src_host + re.src_host_terminator;
  re.tpl_host_fuzzy_strict = re.tpl_host_fuzzy + re.src_host_terminator;
  re.src_host_port_strict = re.src_host + re.src_port + re.src_host_terminator;
  re.tpl_host_port_fuzzy_strict = re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;
  re.tpl_host_port_no_ip_fuzzy_strict = re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator;
  re.tpl_host_fuzzy_test = `localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:${re.src_ZPCc}|>|$))`;
  re.tpl_email_fuzzy = `(^|${text_separators}|"|\\(|${re.src_ZCc})(${re.src_email_name}@${re.tpl_host_fuzzy_strict})`;
  re.tpl_link_fuzzy = // Fuzzy link can't be prepended with .:/\- and non punctuation.
  // but can start with > (markdown blockquote)
  `(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uFF5C]|${re.src_ZPCc}))((?![$+<=>^\`|\uFF5C])${re.tpl_host_port_fuzzy_strict}${re.src_path})`;
  re.tpl_link_no_ip_fuzzy = // Fuzzy link can't be prepended with .:/\- and non punctuation.
  // but can start with > (markdown blockquote)
  `(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uFF5C]|${re.src_ZPCc}))((?![$+<=>^\`|\uFF5C])${re.tpl_host_port_no_ip_fuzzy_strict}${re.src_path})`;
  return re;
}

// ../../node_modules/linkify-it/index.mjs
function assign2(obj) {
  const sources = Array.prototype.slice.call(arguments, 1);
  sources.forEach(function(source) {
    if (!source) {
      return;
    }
    Object.keys(source).forEach(function(key) {
      obj[key] = source[key];
    });
  });
  return obj;
}
function _class2(obj) {
  return Object.prototype.toString.call(obj);
}
function isString2(obj) {
  return _class2(obj) === "[object String]";
}
function isObject(obj) {
  return _class2(obj) === "[object Object]";
}
function isRegExp(obj) {
  return _class2(obj) === "[object RegExp]";
}
function isFunction(obj) {
  return _class2(obj) === "[object Function]";
}
function escapeRE2(str) {
  return str.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
}
var defaultOptions = {
  fuzzyLink: true,
  fuzzyEmail: true,
  fuzzyIP: false
};
function isOptionsObj(obj) {
  return Object.keys(obj || {}).reduce(function(acc, k) {
    return acc || defaultOptions.hasOwnProperty(k);
  }, false);
}
var defaultSchemas = {
  "http:": {
    validate: function(text3, pos, self) {
      const tail = text3.slice(pos);
      if (!self.re.http) {
        self.re.http = new RegExp(
          `^\\/\\/${self.re.src_auth}${self.re.src_host_port_strict}${self.re.src_path}`,
          "i"
        );
      }
      if (self.re.http.test(tail)) {
        return tail.match(self.re.http)[0].length;
      }
      return 0;
    }
  },
  "https:": "http:",
  "ftp:": "http:",
  "//": {
    validate: function(text3, pos, self) {
      const tail = text3.slice(pos);
      if (!self.re.no_http) {
        self.re.no_http = new RegExp(
          "^" + self.re.src_auth + // Don't allow single-level domains, because of false positives like '//test'
          // with code comments
          `(?:localhost|(?:(?:${self.re.src_domain})\\.)+${self.re.src_domain_root})` + self.re.src_port + self.re.src_host_terminator + self.re.src_path,
          "i"
        );
      }
      if (self.re.no_http.test(tail)) {
        if (pos >= 3 && text3[pos - 3] === ":") {
          return 0;
        }
        if (pos >= 3 && text3[pos - 3] === "/") {
          return 0;
        }
        return tail.match(self.re.no_http)[0].length;
      }
      return 0;
    }
  },
  "mailto:": {
    validate: function(text3, pos, self) {
      const tail = text3.slice(pos);
      if (!self.re.mailto) {
        self.re.mailto = new RegExp(
          `^${self.re.src_email_name}@${self.re.src_host_strict}`,
          "i"
        );
      }
      if (self.re.mailto.test(tail)) {
        return tail.match(self.re.mailto)[0].length;
      }
      return 0;
    }
  }
};
var tlds_2ch_src_re = "a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]";
var tlds_default = "biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|\u0440\u0444".split("|");
function createValidator(re) {
  return function(text3, pos) {
    const tail = text3.slice(pos);
    if (re.test(tail)) {
      return tail.match(re)[0].length;
    }
    return 0;
  };
}
function createNormalizer() {
  return function(match2, self) {
    self.normalize(match2);
  };
}
function compile(self) {
  const re = self.re = re_default(self.__opts__);
  const tlds2 = self.__tlds__.slice();
  self.onCompile();
  if (!self.__tlds_replaced__) {
    tlds2.push(tlds_2ch_src_re);
  }
  tlds2.push(re.src_xn);
  re.src_tlds = tlds2.join("|");
  function untpl(tpl) {
    return tpl.replace("%TLDS%", re.src_tlds);
  }
  re.email_fuzzy = RegExp(untpl(re.tpl_email_fuzzy), "i");
  re.email_fuzzy_global = RegExp(untpl(re.tpl_email_fuzzy), "ig");
  re.link_fuzzy = RegExp(untpl(re.tpl_link_fuzzy), "i");
  re.link_fuzzy_global = RegExp(untpl(re.tpl_link_fuzzy), "ig");
  re.link_no_ip_fuzzy = RegExp(untpl(re.tpl_link_no_ip_fuzzy), "i");
  re.link_no_ip_fuzzy_global = RegExp(untpl(re.tpl_link_no_ip_fuzzy), "ig");
  re.host_fuzzy_test = RegExp(untpl(re.tpl_host_fuzzy_test), "i");
  const aliases = [];
  self.__compiled__ = {};
  function schemaError(name, val) {
    throw new Error(`(LinkifyIt) Invalid schema "${name}": ${val}`);
  }
  Object.keys(self.__schemas__).forEach(function(name) {
    const val = self.__schemas__[name];
    if (val === null) {
      return;
    }
    const compiled = { validate: null, link: null };
    self.__compiled__[name] = compiled;
    if (isObject(val)) {
      if (isRegExp(val.validate)) {
        compiled.validate = createValidator(val.validate);
      } else if (isFunction(val.validate)) {
        compiled.validate = val.validate;
      } else {
        schemaError(name, val);
      }
      if (isFunction(val.normalize)) {
        compiled.normalize = val.normalize;
      } else if (!val.normalize) {
        compiled.normalize = createNormalizer();
      } else {
        schemaError(name, val);
      }
      return;
    }
    if (isString2(val)) {
      aliases.push(name);
      return;
    }
    schemaError(name, val);
  });
  aliases.forEach(function(alias) {
    if (!self.__compiled__[self.__schemas__[alias]]) {
      return;
    }
    self.__compiled__[alias].validate = self.__compiled__[self.__schemas__[alias]].validate;
    self.__compiled__[alias].normalize = self.__compiled__[self.__schemas__[alias]].normalize;
  });
  self.__compiled__[""] = { validate: null, normalize: createNormalizer() };
  const slist = Object.keys(self.__compiled__).filter(function(name) {
    return name.length > 0 && self.__compiled__[name];
  }).map(escapeRE2).join("|");
  self.re.schema_test = RegExp(`(^|(?!_)(?:[><\uFF5C]|${re.src_ZPCc}))(${slist})`, "i");
  self.re.schema_search = RegExp(`(^|(?!_)(?:[><\uFF5C]|${re.src_ZPCc}))(${slist})`, "ig");
  self.re.schema_at_start = RegExp(`^${self.re.schema_search.source}`, "i");
  self.re.pretest = RegExp(
    `(${self.re.schema_test.source})|(${self.re.host_fuzzy_test.source})|@`,
    "i"
  );
}
function Match(text3, schema, index, lastIndex) {
  const raw = text3.slice(index, lastIndex);
  this.schema = schema.toLowerCase();
  this.index = index;
  this.lastIndex = lastIndex;
  this.raw = raw;
  this.text = raw;
  this.url = raw;
}
function LinkifyIt(schemas, options) {
  if (!(this instanceof LinkifyIt)) {
    return new LinkifyIt(schemas, options);
  }
  if (!options) {
    if (isOptionsObj(schemas)) {
      options = schemas;
      schemas = {};
    }
  }
  this.__opts__ = assign2({}, defaultOptions, options);
  this.__schemas__ = assign2({}, defaultSchemas, schemas);
  this.__compiled__ = {};
  this.__tlds__ = tlds_default;
  this.__tlds_replaced__ = false;
  this.re = {};
  compile(this);
}
LinkifyIt.prototype.add = function add(schema, definition) {
  this.__schemas__[schema] = definition;
  compile(this);
  return this;
};
LinkifyIt.prototype.set = function set(options) {
  this.__opts__ = assign2(this.__opts__, options);
  return this;
};
LinkifyIt.prototype.test = function test(text3) {
  if (!text3.length) {
    return false;
  }
  let m, re;
  if (this.re.schema_test.test(text3)) {
    re = this.re.schema_search;
    re.lastIndex = 0;
    while ((m = re.exec(text3)) !== null) {
      if (this.testSchemaAt(text3, m[2], re.lastIndex)) {
        return true;
      }
    }
  }
  if (this.__opts__.fuzzyLink && this.__compiled__["http:"]) {
    if (text3.search(this.re.host_fuzzy_test) >= 0) {
      if (text3.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy) !== null) {
        return true;
      }
    }
  }
  if (this.__opts__.fuzzyEmail && this.__compiled__["mailto:"]) {
    if (text3.indexOf("@") >= 0) {
      if (text3.match(this.re.email_fuzzy) !== null) {
        return true;
      }
    }
  }
  return false;
};
LinkifyIt.prototype.pretest = function pretest(text3) {
  return this.re.pretest.test(text3);
};
LinkifyIt.prototype.testSchemaAt = function testSchemaAt(text3, schema, pos) {
  if (!this.__compiled__[schema.toLowerCase()]) {
    return 0;
  }
  return this.__compiled__[schema.toLowerCase()].validate(text3, pos, this);
};
LinkifyIt.prototype.match = function match(text3) {
  const result = [];
  const type_schemed = [];
  const type_fuzzy_link = [];
  const type_fuzzy_email = [];
  let m, len, re;
  function choose(a, b) {
    if (!a) {
      return b;
    }
    if (!b) {
      return a;
    }
    if (a.index !== b.index) {
      return a.index < b.index ? a : b;
    }
    return a.lastIndex >= b.lastIndex ? a : b;
  }
  if (!text3.length) {
    return null;
  }
  if (this.re.schema_test.test(text3)) {
    re = this.re.schema_search;
    re.lastIndex = 0;
    while ((m = re.exec(text3)) !== null) {
      len = this.testSchemaAt(text3, m[2], re.lastIndex);
      if (len) {
        type_schemed.push({
          schema: m[2],
          index: m.index + m[1].length,
          lastIndex: m.index + m[0].length + len
        });
      }
    }
  }
  if (this.__opts__.fuzzyLink && this.__compiled__["http:"]) {
    re = this.__opts__.fuzzyIP ? this.re.link_fuzzy_global : this.re.link_no_ip_fuzzy_global;
    re.lastIndex = 0;
    while ((m = re.exec(text3)) !== null) {
      type_fuzzy_link.push({
        schema: "",
        index: m.index + m[1].length,
        lastIndex: m.index + m[0].length
      });
    }
  }
  if (this.__opts__.fuzzyEmail && this.__compiled__["mailto:"]) {
    re = this.re.email_fuzzy_global;
    re.lastIndex = 0;
    while ((m = re.exec(text3)) !== null) {
      type_fuzzy_email.push({
        schema: "mailto:",
        index: m.index + m[1].length,
        lastIndex: m.index + m[0].length
      });
    }
  }
  const indexes = [0, 0, 0];
  let lastIndex = 0;
  for (; ; ) {
    const candidates = [
      type_schemed[indexes[0]],
      type_fuzzy_email[indexes[1]],
      type_fuzzy_link[indexes[2]]
    ];
    const candidate = choose(choose(candidates[0], candidates[1]), candidates[2]);
    if (!candidate) {
      break;
    }
    if (candidate === candidates[0]) {
      indexes[0]++;
    } else if (candidate === candidates[1]) {
      indexes[1]++;
    } else {
      indexes[2]++;
    }
    if (candidate.index < lastIndex) {
      continue;
    }
    const match2 = new Match(text3, candidate.schema, candidate.index, candidate.lastIndex);
    this.__compiled__[match2.schema].normalize(match2, this);
    result.push(match2);
    lastIndex = candidate.lastIndex;
  }
  if (result.length) {
    return result;
  }
  return null;
};
LinkifyIt.prototype.matchAtStart = function matchAtStart(text3) {
  if (!text3.length) return null;
  const m = this.re.schema_at_start.exec(text3);
  if (!m) return null;
  const len = this.testSchemaAt(text3, m[2], m[0].length);
  if (!len) return null;
  const match2 = new Match(text3, m[2], m.index + m[1].length, m.index + m[0].length + len);
  this.__compiled__[match2.schema].normalize(match2, this);
  return match2;
};
LinkifyIt.prototype.tlds = function tlds(list2, keepOld) {
  list2 = Array.isArray(list2) ? list2 : [list2];
  if (!keepOld) {
    this.__tlds__ = list2.slice();
    this.__tlds_replaced__ = true;
    compile(this);
    return this;
  }
  this.__tlds__ = this.__tlds__.concat(list2).sort().filter(function(el, idx, arr) {
    return el !== arr[idx - 1];
  }).reverse();
  compile(this);
  return this;
};
LinkifyIt.prototype.normalize = function normalize2(match2) {
  if (!match2.schema) {
    match2.url = `http://${match2.url}`;
  }
  if (match2.schema === "mailto:" && !/^mailto:/i.test(match2.url)) {
    match2.url = `mailto:${match2.url}`;
  }
};
LinkifyIt.prototype.onCompile = function onCompile() {
};
var linkify_it_default = LinkifyIt;

// ../../node_modules/punycode.js/punycode.es6.js
var maxInt = 2147483647;
var base = 36;
var tMin = 1;
var tMax = 26;
var skew = 38;
var damp = 700;
var initialBias = 72;
var initialN = 128;
var delimiter = "-";
var regexPunycode = /^xn--/;
var regexNonASCII = /[^\0-\x7F]/;
var regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
var errors = {
  "overflow": "Overflow: input needs wider integers to process",
  "not-basic": "Illegal input >= 0x80 (not a basic code point)",
  "invalid-input": "Invalid input"
};
var baseMinusTMin = base - tMin;
var floor = Math.floor;
var stringFromCharCode = String.fromCharCode;
function error(type) {
  throw new RangeError(errors[type]);
}
function map(array, callback) {
  const result = [];
  let length = array.length;
  while (length--) {
    result[length] = callback(array[length]);
  }
  return result;
}
function mapDomain(domain, callback) {
  const parts = domain.split("@");
  let result = "";
  if (parts.length > 1) {
    result = parts[0] + "@";
    domain = parts[1];
  }
  domain = domain.replace(regexSeparators, ".");
  const labels = domain.split(".");
  const encoded = map(labels, callback).join(".");
  return result + encoded;
}
function ucs2decode(string) {
  const output2 = [];
  let counter = 0;
  const length = string.length;
  while (counter < length) {
    const value = string.charCodeAt(counter++);
    if (value >= 55296 && value <= 56319 && counter < length) {
      const extra = string.charCodeAt(counter++);
      if ((extra & 64512) == 56320) {
        output2.push(((value & 1023) << 10) + (extra & 1023) + 65536);
      } else {
        output2.push(value);
        counter--;
      }
    } else {
      output2.push(value);
    }
  }
  return output2;
}
var ucs2encode = (codePoints) => String.fromCodePoint(...codePoints);
var basicToDigit = function(codePoint) {
  if (codePoint >= 48 && codePoint < 58) {
    return 26 + (codePoint - 48);
  }
  if (codePoint >= 65 && codePoint < 91) {
    return codePoint - 65;
  }
  if (codePoint >= 97 && codePoint < 123) {
    return codePoint - 97;
  }
  return base;
};
var digitToBasic = function(digit, flag) {
  return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
};
var adapt = function(delta, numPoints, firstTime) {
  let k = 0;
  delta = firstTime ? floor(delta / damp) : delta >> 1;
  delta += floor(delta / numPoints);
  for (; delta > baseMinusTMin * tMax >> 1; k += base) {
    delta = floor(delta / baseMinusTMin);
  }
  return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
};
var decode2 = function(input) {
  const output2 = [];
  const inputLength = input.length;
  let i = 0;
  let n = initialN;
  let bias = initialBias;
  let basic = input.lastIndexOf(delimiter);
  if (basic < 0) {
    basic = 0;
  }
  for (let j = 0; j < basic; ++j) {
    if (input.charCodeAt(j) >= 128) {
      error("not-basic");
    }
    output2.push(input.charCodeAt(j));
  }
  for (let index = basic > 0 ? basic + 1 : 0; index < inputLength; ) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (index >= inputLength) {
        error("invalid-input");
      }
      const digit = basicToDigit(input.charCodeAt(index++));
      if (digit >= base) {
        error("invalid-input");
      }
      if (digit > floor((maxInt - i) / w)) {
        error("overflow");
      }
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) {
        break;
      }
      const baseMinusT = base - t;
      if (w > floor(maxInt / baseMinusT)) {
        error("overflow");
      }
      w *= baseMinusT;
    }
    const out = output2.length + 1;
    bias = adapt(i - oldi, out, oldi == 0);
    if (floor(i / out) > maxInt - n) {
      error("overflow");
    }
    n += floor(i / out);
    i %= out;
    output2.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output2);
};
var encode2 = function(input) {
  const output2 = [];
  input = ucs2decode(input);
  const inputLength = input.length;
  let n = initialN;
  let delta = 0;
  let bias = initialBias;
  for (const currentValue of input) {
    if (currentValue < 128) {
      output2.push(stringFromCharCode(currentValue));
    }
  }
  const basicLength = output2.length;
  let handledCPCount = basicLength;
  if (basicLength) {
    output2.push(delimiter);
  }
  while (handledCPCount < inputLength) {
    let m = maxInt;
    for (const currentValue of input) {
      if (currentValue >= n && currentValue < m) {
        m = currentValue;
      }
    }
    const handledCPCountPlusOne = handledCPCount + 1;
    if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
      error("overflow");
    }
    delta += (m - n) * handledCPCountPlusOne;
    n = m;
    for (const currentValue of input) {
      if (currentValue < n && ++delta > maxInt) {
        error("overflow");
      }
      if (currentValue === n) {
        let q = delta;
        for (let k = base; ; k += base) {
          const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
          if (q < t) {
            break;
          }
          const qMinusT = q - t;
          const baseMinusT = base - t;
          output2.push(
            stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
          );
          q = floor(qMinusT / baseMinusT);
        }
        output2.push(stringFromCharCode(digitToBasic(q, 0)));
        bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
        delta = 0;
        ++handledCPCount;
      }
    }
    ++delta;
    ++n;
  }
  return output2.join("");
};
var toUnicode = function(input) {
  return mapDomain(input, function(string) {
    return regexPunycode.test(string) ? decode2(string.slice(4).toLowerCase()) : string;
  });
};
var toASCII = function(input) {
  return mapDomain(input, function(string) {
    return regexNonASCII.test(string) ? "xn--" + encode2(string) : string;
  });
};
var punycode = {
  /**
   * A string representing the current Punycode.js version number.
   * @memberOf punycode
   * @type String
   */
  "version": "2.3.1",
  /**
   * An object of methods to convert from JavaScript's internal character
   * representation (UCS-2) to Unicode code points, and back.
   * @see <https://mathiasbynens.be/notes/javascript-encoding>
   * @memberOf punycode
   * @type Object
   */
  "ucs2": {
    "decode": ucs2decode,
    "encode": ucs2encode
  },
  "decode": decode2,
  "encode": encode2,
  "toASCII": toASCII,
  "toUnicode": toUnicode
};
var punycode_es6_default = punycode;

// ../../node_modules/markdown-it/lib/presets/default.mjs
var default_default = {
  options: {
    // Enable HTML tags in source
    html: false,
    // Use '/' to close single tags (<br />)
    xhtmlOut: false,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks
    langPrefix: "language-",
    // autoconvert URL-like texts to links
    linkify: false,
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: "\u201C\u201D\u2018\u2019",
    /* “”‘’ */
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    // Internal protection, recursion limit
    maxNesting: 100
  },
  components: {
    core: {},
    block: {},
    inline: {}
  }
};

// ../../node_modules/markdown-it/lib/presets/zero.mjs
var zero_default = {
  options: {
    // Enable HTML tags in source
    html: false,
    // Use '/' to close single tags (<br />)
    xhtmlOut: false,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks
    langPrefix: "language-",
    // autoconvert URL-like texts to links
    linkify: false,
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: "\u201C\u201D\u2018\u2019",
    /* “”‘’ */
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    // Internal protection, recursion limit
    maxNesting: 20
  },
  components: {
    core: {
      rules: [
        "normalize",
        "block",
        "inline",
        "text_join"
      ]
    },
    block: {
      rules: [
        "paragraph"
      ]
    },
    inline: {
      rules: [
        "text"
      ],
      rules2: [
        "balance_pairs",
        "fragments_join"
      ]
    }
  }
};

// ../../node_modules/markdown-it/lib/presets/commonmark.mjs
var commonmark_default = {
  options: {
    // Enable HTML tags in source
    html: true,
    // Use '/' to close single tags (<br />)
    xhtmlOut: true,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks
    langPrefix: "language-",
    // autoconvert URL-like texts to links
    linkify: false,
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: "\u201C\u201D\u2018\u2019",
    /* “”‘’ */
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externaly.
    // If result starts with <pre... internal wrapper is skipped.
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    // Internal protection, recursion limit
    maxNesting: 20
  },
  components: {
    core: {
      rules: [
        "normalize",
        "block",
        "inline",
        "text_join"
      ]
    },
    block: {
      rules: [
        "blockquote",
        "code",
        "fence",
        "heading",
        "hr",
        "html_block",
        "lheading",
        "list",
        "reference",
        "paragraph"
      ]
    },
    inline: {
      rules: [
        "autolink",
        "backticks",
        "emphasis",
        "entity",
        "escape",
        "html_inline",
        "image",
        "link",
        "newline",
        "text"
      ],
      rules2: [
        "balance_pairs",
        "emphasis",
        "fragments_join"
      ]
    }
  }
};

// ../../node_modules/markdown-it/lib/index.mjs
var config = {
  default: default_default,
  zero: zero_default,
  commonmark: commonmark_default
};
var BAD_PROTO_RE = /^(vbscript|javascript|file|data):/;
var GOOD_DATA_RE = /^data:image\/(gif|png|jpeg|webp);/;
function validateLink(url) {
  const str = url.trim().toLowerCase();
  return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
}
var RECODE_HOSTNAME_FOR = ["http:", "https:", "mailto:"];
function normalizeLink(url) {
  const parsed = parse_default(url, true);
  if (parsed.hostname) {
    if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
      try {
        parsed.hostname = punycode_es6_default.toASCII(parsed.hostname);
      } catch (er) {
      }
    }
  }
  return encode_default(format(parsed));
}
function normalizeLinkText(url) {
  const parsed = parse_default(url, true);
  if (parsed.hostname) {
    if (!parsed.protocol || RECODE_HOSTNAME_FOR.indexOf(parsed.protocol) >= 0) {
      try {
        parsed.hostname = punycode_es6_default.toUnicode(parsed.hostname);
      } catch (er) {
      }
    }
  }
  return decode_default(format(parsed), decode_default.defaultChars + "%");
}
function MarkdownIt(presetName, options) {
  if (!(this instanceof MarkdownIt)) {
    return new MarkdownIt(presetName, options);
  }
  if (!options) {
    if (!isString(presetName)) {
      options = presetName || {};
      presetName = "default";
    }
  }
  this.inline = new parser_inline_default();
  this.block = new parser_block_default();
  this.core = new parser_core_default();
  this.renderer = new renderer_default();
  this.linkify = new linkify_it_default();
  this.validateLink = validateLink;
  this.normalizeLink = normalizeLink;
  this.normalizeLinkText = normalizeLinkText;
  this.utils = utils_exports;
  this.helpers = assign({}, helpers_exports);
  this.options = {};
  this.configure(presetName);
  if (options) {
    this.set(options);
  }
}
MarkdownIt.prototype.set = function(options) {
  assign(this.options, options);
  return this;
};
MarkdownIt.prototype.configure = function(presets) {
  const self = this;
  if (isString(presets)) {
    const presetName = presets;
    presets = config[presetName];
    if (!presets) {
      throw new Error('Wrong `markdown-it` preset "' + presetName + '", check name');
    }
  }
  if (!presets) {
    throw new Error("Wrong `markdown-it` preset, can't be empty");
  }
  if (presets.options) {
    self.set(presets.options);
  }
  if (presets.components) {
    Object.keys(presets.components).forEach(function(name) {
      if (presets.components[name].rules) {
        self[name].ruler.enableOnly(presets.components[name].rules);
      }
      if (presets.components[name].rules2) {
        self[name].ruler2.enableOnly(presets.components[name].rules2);
      }
    });
  }
  return this;
};
MarkdownIt.prototype.enable = function(list2, ignoreInvalid) {
  let result = [];
  if (!Array.isArray(list2)) {
    list2 = [list2];
  }
  ["core", "block", "inline"].forEach(function(chain) {
    result = result.concat(this[chain].ruler.enable(list2, true));
  }, this);
  result = result.concat(this.inline.ruler2.enable(list2, true));
  const missed = list2.filter(function(name) {
    return result.indexOf(name) < 0;
  });
  if (missed.length && !ignoreInvalid) {
    throw new Error("MarkdownIt. Failed to enable unknown rule(s): " + missed);
  }
  return this;
};
MarkdownIt.prototype.disable = function(list2, ignoreInvalid) {
  let result = [];
  if (!Array.isArray(list2)) {
    list2 = [list2];
  }
  ["core", "block", "inline"].forEach(function(chain) {
    result = result.concat(this[chain].ruler.disable(list2, true));
  }, this);
  result = result.concat(this.inline.ruler2.disable(list2, true));
  const missed = list2.filter(function(name) {
    return result.indexOf(name) < 0;
  });
  if (missed.length && !ignoreInvalid) {
    throw new Error("MarkdownIt. Failed to disable unknown rule(s): " + missed);
  }
  return this;
};
MarkdownIt.prototype.use = function(plugin) {
  const args = [this].concat(Array.prototype.slice.call(arguments, 1));
  plugin.apply(plugin, args);
  return this;
};
MarkdownIt.prototype.parse = function(src, env) {
  if (typeof src !== "string") {
    throw new Error("Input data should be a String");
  }
  const state = new this.core.State(src, this, env);
  this.core.process(state);
  return state.tokens;
};
MarkdownIt.prototype.render = function(src, env) {
  env = env || {};
  return this.renderer.render(this.parse(src, env), this.options, env);
};
MarkdownIt.prototype.parseInline = function(src, env) {
  const state = new this.core.State(src, this, env);
  state.inlineMode = true;
  this.core.process(state);
  return state.tokens;
};
MarkdownIt.prototype.renderInline = function(src, env) {
  env = env || {};
  return this.renderer.render(this.parseInline(src, env), this.options, env);
};
var lib_default = MarkdownIt;

// src/docs/markdown.ts
function escapeHtml2(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
function hasUnsafeRelativeSegments(candidate) {
  if (!candidate || /[\u0000-\u001F\u007F]/.test(candidate)) return true;
  if (candidate.startsWith("/") || candidate.includes("\\")) return true;
  return candidate.split("/").some((part) => part === "..");
}
function safeUrl(value, resolvedByCatalog = false) {
  const target = value.trim();
  if (!target || /[\u0000-\u001F\u007F]/.test(target)) return null;
  if (/^(?:javascript|vbscript|file|data|blob):/i.test(target))
    return null;
  if (/^\/\//.test(target)) return null;
  if (/^(?:https?:|mailto:|tel:|#)/i.test(target)) return target;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return null;
  if (!resolvedByCatalog) {
    const clean = target.split(/[?#]/, 1)[0] ?? "";
    if (hasUnsafeRelativeSegments(clean)) return null;
    let current = clean;
    for (let depth = 0; depth < 3; depth += 1) {
      let decoded;
      try {
        decoded = decodeURIComponent(current);
      } catch {
        return null;
      }
      if (hasUnsafeRelativeSegments(decoded)) return null;
      if (decoded === current) break;
      current = decoded;
    }
  }
  return target;
}
function lookupResolvedLink(rawTarget, resolveLink) {
  if (!resolveLink) return void 0;
  for (const candidate of [rawTarget, rawTarget.normalize("NFC")]) {
    const direct = resolveLink(candidate);
    if (direct !== void 0) return direct;
  }
  try {
    const decoded = decodeURIComponent(rawTarget);
    for (const candidate of [decoded, decoded.normalize("NFC")]) {
      if (candidate !== rawTarget) {
        const resolved = resolveLink(candidate);
        if (resolved !== void 0) return resolved;
      }
    }
  } catch {
  }
  return void 0;
}
function inline2(value, options) {
  const tokens = [];
  const stash = (html) => {
    const marker = `\0${tokens.length}\0`;
    tokens.push(html);
    return marker;
  };
  let text3 = value.replace(
    /`([^`\n]+)`/g,
    (_, code2) => stash(`<code>${escapeHtml2(code2)}</code>`)
  );
  text3 = text3.replace(
    /!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["']([^"']*)["'])?\)/g,
    (_, alt, wrapped, raw, title) => {
      const target = wrapped ?? raw;
      const resolved = lookupResolvedLink(target, options.resolveLink);
      const url = safeUrl(resolved ?? target, resolved !== void 0);
      if (!url) return escapeHtml2(alt);
      const titleAttr = title ? ` title="${escapeHtml2(title)}"` : "";
      return stash(
        `<img src="${escapeHtml2(url)}" alt="${escapeHtml2(alt)}"${titleAttr} loading="lazy">`
      );
    }
  );
  text3 = text3.replace(
    /\[([^\]]+)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["']([^"']*)["'])?\)/g,
    (_, label3, wrapped, raw, title) => {
      const target = wrapped ?? raw;
      const resolved = lookupResolvedLink(target, options.resolveLink);
      const url = safeUrl(resolved ?? target, resolved !== void 0);
      if (!url) return escapeHtml2(label3);
      const titleAttr = title ? ` title="${escapeHtml2(title)}"` : "";
      const external = /^(?:https?:|mailto:|tel:)/i.test(url) ? ` rel="noreferrer"${/^https?:/i.test(url) ? ` target="_blank"` : ""}` : "";
      return stash(
        `<a href="${escapeHtml2(url)}"${titleAttr}${external}>${inline2(label3, options)}</a>`
      );
    }
  );
  text3 = escapeHtml2(text3).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_\n]+)__/g, "<strong>$1</strong>").replace(/\*([^*\n]+)\*/g, "<em>$1</em>").replace(/_([^_\n]+)_/g, "<em>$1</em>").replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return text3.replace(
    /\u0000(\d+)\u0000/g,
    (_, index) => tokens[Number(index)] ?? ""
  );
}
function slug(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}
function isTableSeparator(line) {
  const cells = line.trim().replace(/^\||\|$/g, "").split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}
function tableRow(line, options) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => inline2(cell.trim(), options));
}
function renderMarkdownDocumentLegacy(markdown, options = {}) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output2 = [];
  const headings = [];
  let index = 0;
  let paragraph2 = [];
  let listType = null;
  let inFence = false;
  let fenceLanguage = "";
  let fenceLines = [];
  let tableHeader = null;
  let diagramIndex = 0;
  const flushParagraph = () => {
    if (paragraph2.length) {
      output2.push(`<p>${inline2(paragraph2.join(" ").trim(), options)}</p>`);
      paragraph2 = [];
    }
  };
  const closeList = () => {
    if (listType) output2.push(`</${listType}>`);
    listType = null;
  };
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (inFence) {
      if (/^```/.test(trimmed)) {
        const source = fenceLines.join("\n");
        if (fenceLanguage.toLowerCase() === "mermaid") {
          const diagram = options.diagrams?.[diagramIndex];
          diagramIndex += 1;
          output2.push(renderDiagram(diagram, source));
        } else {
          const code2 = escapeHtml2(source);
          output2.push(
            `<pre class="code-block"><code class="language-${escapeHtml2(fenceLanguage || "text")}">${code2}</code></pre>`
          );
        }
        inFence = false;
        fenceLines = [];
      } else fenceLines.push(line);
      index += 1;
      continue;
    }
    const fence2 = trimmed.match(/^```\s*([\w-]*)\s*$/);
    if (fence2) {
      flushParagraph();
      closeList();
      inFence = true;
      fenceLanguage = fence2[1] ?? "";
      index += 1;
      continue;
    }
    const heading2 = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading2) {
      flushParagraph();
      closeList();
      const text3 = heading2[2].replace(/[`*_~]/g, "").trim();
      const base2 = slug(text3);
      const same = headings.filter((item) => item.slug === base2).length;
      const headingSlug = same ? `${base2}-${same}` : base2;
      headings.push({
        level: heading2[1].length,
        text: text3,
        slug: headingSlug,
        line: index + 1
      });
      output2.push(
        `<h${heading2[1].length} id="${escapeHtml2(headingSlug)}">${inline2(text3, options)}</h${heading2[1].length}>`
      );
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flushParagraph();
      closeList();
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output2.push(
        `<blockquote>${inline2(quote.join(" "), options)}</blockquote>`
      );
      continue;
    }
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) {
      flushParagraph();
      const match2 = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
      if (!match2) {
        index += 1;
        continue;
      }
      const type = match2[2] ? "ol" : "ul";
      if (listType !== type) {
        closeList();
        listType = type;
        output2.push(`<${type}>`);
      }
      output2.push(`<li>${inline2(match2[3], options)}</li>`);
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushParagraph();
      closeList();
      tableHeader = tableRow(line, options);
      output2.push(
        `<div class="table-scroll"><table><thead><tr>${tableHeader.map((cell) => `<th scope="col">${cell}</th>`).join("")}</tr></thead><tbody>`
      );
      index += 2;
      continue;
    }
    if (tableHeader && line.includes("|")) {
      output2.push(
        `<tr>${tableRow(line, options).map((cell) => `<td>${cell}</td>`).join("")}</tr>`
      );
      index += 1;
      continue;
    }
    if (tableHeader && !trimmed) {
      output2.push("</tbody></table>");
      tableHeader = null;
      index += 1;
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      if (output2.at(-1) === "</tbody></table>") output2.pop();
      index += 1;
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
      flushParagraph();
      closeList();
      output2.push("<hr>");
      index += 1;
      continue;
    }
    paragraph2.push(trimmed);
    index += 1;
  }
  if (inFence)
    output2.push(
      `<pre class="code-block"><code>${escapeHtml2(fenceLines.join("\n"))}</code></pre>`
    );
  flushParagraph();
  closeList();
  if (tableHeader) output2.push("</tbody></table>");
  return { html: output2.join("\n"), headings };
}
function renderMarkdownDocument(markdown, options = {}) {
  const engine = options.engine ?? (process.env.FORGEWRIGHT_DOCS_MARKDOWN_ENGINE === "legacy" ? "legacy" : "markdown-it");
  if (engine === "legacy") {
    return renderMarkdownDocumentLegacy(markdown, options);
  }
  const headings = [];
  const slugCounts = /* @__PURE__ */ new Map();
  let diagramIndex = 0;
  const md = new lib_default({
    html: false,
    xhtmlOut: false,
    breaks: false,
    linkify: false,
    typographer: false
  });
  md.validateLink = () => true;
  md.core.ruler.push("forgewright_headings_and_links", (state) => {
    for (let i = 0; i < state.tokens.length; i += 1) {
      const token = state.tokens[i];
      if (token.type === "heading_open") {
        const inlineToken = state.tokens[i + 1];
        const rawText = inlineToken && inlineToken.type === "inline" ? inlineToken.content : "";
        const cleanText = rawText.replace(/[`*_~]/g, "").trim();
        const base2 = slug(cleanText);
        const seen = slugCounts.get(base2) ?? 0;
        slugCounts.set(base2, seen + 1);
        const headingSlug = seen ? `${base2}-${seen}` : base2;
        const level = Number(token.tag.slice(1)) || 1;
        const line = token.map ? token.map[0] + 1 : 1;
        headings.push({ level, text: cleanText, slug: headingSlug, line });
        token.attrSet("id", headingSlug);
      }
      if (token.type === "inline" && token.children) {
        const nextChildren = [];
        for (let j = 0; j < token.children.length; j += 1) {
          const child = token.children[j];
          if (child.type === "link_open") {
            const rawHref = child.attrGet("href") ?? "";
            const resolved = lookupResolvedLink(rawHref, options.resolveLink);
            const url = safeUrl(resolved ?? rawHref, resolved !== void 0);
            if (!url) {
              let depth = 1;
              j += 1;
              while (j < token.children.length && depth > 0) {
                const inner = token.children[j];
                if (inner.type === "link_open") depth += 1;
                else if (inner.type === "link_close") {
                  depth -= 1;
                  if (depth === 0) break;
                }
                if (depth > 0) nextChildren.push(inner);
                j += 1;
              }
              continue;
            }
            child.attrSet("href", url);
            if (/^(?:https?:|mailto:|tel:)/i.test(url)) {
              child.attrSet("rel", "noreferrer");
              if (/^https?:/i.test(url)) {
                child.attrSet("target", "_blank");
              }
            }
            nextChildren.push(child);
          } else if (child.type === "image") {
            const rawSrc = child.attrGet("src") ?? "";
            const resolved = lookupResolvedLink(rawSrc, options.resolveLink);
            const url = safeUrl(resolved ?? rawSrc, resolved !== void 0);
            const altText = child.content || (child.children?.map((c) => c.content).join("") ?? "");
            if (!url) {
              const textToken = new state.Token("text", "", 0);
              textToken.content = altText;
              nextChildren.push(textToken);
              continue;
            }
            child.attrSet("src", url);
            child.attrSet("alt", altText);
            child.attrSet("loading", "lazy");
            nextChildren.push(child);
          } else {
            nextChildren.push(child);
          }
        }
        token.children = nextChildren;
      }
    }
  });
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = (token.info || "").trim().split(/\s+/)[0] ?? "";
    const source = token.content.replace(/\n$/, "");
    if (info.toLowerCase() === "mermaid") {
      const diagram = options.diagrams?.[diagramIndex];
      diagramIndex += 1;
      return renderDiagram(diagram, source) + "\n";
    }
    const lang = escapeHtml2(info || "text");
    return `<pre class="code-block"><code class="language-${lang}">${escapeHtml2(source)}</code></pre>
`;
  };
  md.renderer.rules.code_block = (tokens, idx) => {
    const source = tokens[idx].content.replace(/\n$/, "");
    return `<pre class="code-block"><code class="language-text">${escapeHtml2(source)}</code></pre>
`;
  };
  md.renderer.rules.table_open = () => '<div class="table-scroll"><table>';
  md.renderer.rules.table_close = () => "</table></div>\n";
  md.renderer.rules.th_open = (tokens, idx) => {
    const align = tokens[idx].attrGet("style");
    return align ? `<th scope="col" style="${escapeHtml2(align)}">` : '<th scope="col">';
  };
  const html = md.render(markdown.replace(/\r\n?/g, "\n")).trim();
  return { html, headings };
}
function renderDiagram(diagram, source) {
  const valid = diagram?.valid === true;
  const label3 = valid ? "Mermaid diagram" : "Invalid Mermaid diagram";
  const svg = valid ? renderDiagramSvg(diagram, diagram.type) : "";
  const fallbackLabels = diagram?.labels && diagram.labels.length > 0 ? `<p>${escapeHtml2(diagram.labels.join(" \u2192 "))}</p>` : "";
  return `<figure class="diagram" aria-label="${label3}">
${svg}
<details class="diagram-fallback"${valid ? "" : " open"}>
<summary>Diagram source and text fallback</summary>
<pre><code class="language-mermaid">${escapeHtml2(source)}</code></pre>
${fallbackLabels}
</details>
</figure>`;
}
function renderMarkdown(markdown, options = {}) {
  return renderMarkdownDocument(markdown, options).html;
}
function plainText(document) {
  return document.content.replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`\[\]()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 2e4);
}
function snippet(text3) {
  const compact = text3.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}\u2026` : compact;
}
function buildSearchIndex(catalogs) {
  return {
    schema_version: 1,
    sourceFingerprint: catalogs.map((catalog) => catalog.sourceFingerprint).sort().join(":") || "static",
    documents: catalogs.flatMap(
      (catalog) => catalog.documents.map((document) => {
        const text3 = plainText(document);
        return {
          id: document.id,
          projectId: catalog.project.id,
          projectTitle: catalog.project.title,
          title: document.title,
          route: document.route,
          sourcePath: document.sourcePath,
          type: document.type,
          status: document.status,
          sourceOfTruth: document.sourceOfTruth,
          snippet: snippet(text3),
          tags: document.tags,
          headings: document.headings.map((heading2) => heading2.text),
          text: text3
        };
      })
    ).sort(
      (a, b) => `${a.projectTitle}/${a.title}/${a.projectId}/${a.sourcePath}/${a.id}`.localeCompare(
        `${b.projectTitle}/${b.title}/${b.projectId}/${b.sourcePath}/${b.id}`
      )
    )
  };
}

// src/docs/render.ts
var CSS = `:root {
  color-scheme: light dark;
  --bg: #f8f9fa;
  --surface: #ffffff;
  --surface-alt: #f1f3f5;
  --text: #212529;
  --muted: #68727d;
  --border: #d9dee3;
  --accent: #4f46e5;
  --accent-strong: #3730a3;
  --accent-soft: rgba(99, 102, 241, 0.1);
  --code: #eef1f4;
  --focus: #d97706;
  --success: #15803d;
  --success-soft: #dcfce7;
  --warning: #a16207;
  --warning-soft: #fef3c7;
  --error: #b91c1c;
  --error-soft: #fee2e2;
  --radius: 12px;
  --measure: 78ch;
  --shadow: 0 12px 32px rgba(17, 24, 39, 0.08);
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; overflow-wrap: anywhere; }
html, body { max-width: 100%; }
body { margin: 0; min-width: 0; overflow-x: clip; }
a { color: var(--accent-strong); text-underline-offset: .18em; }
a:hover { color: var(--accent); }
a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; border-radius: 4px; }
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 1rem; top: 1rem; background: var(--surface); padding: .65rem 1rem; z-index: 10; }
.shell { display: grid; grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr); min-height: 100vh; }
.sidebar { padding: 1.5rem; border-right: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; height: 100vh; overflow: auto; }
.sidebar strong { display: block; color: var(--accent-strong); letter-spacing: -.02em; margin-bottom: 1.25rem; }
.sidebar nav a { display: block; padding: .45rem .65rem; border-radius: 8px; text-decoration: none; }
.sidebar nav a:hover { background: var(--accent-soft); }
.main { min-width: 0; padding: clamp(1.25rem, 4vw, 4rem); }
.content { max-width: 88rem; margin-inline: auto; }
.shell, .main, .content, .card, .section-card, .state-grid, .field-list, .item-grid { min-width: 0; max-width: 100%; }
h1, h2, h3 { line-height: 1.2; letter-spacing: -.025em; }
h1 { font-size: clamp(2rem, 5vw, 3.5rem); margin-top: .35rem; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr)); gap: 1rem; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.15rem; box-shadow: var(--shadow); }
.card h2, .card h3 { margin-top: 0; }
.meta { color: var(--muted); font-size: .92rem; }
.eyebrow { color: var(--accent-strong); font-size: .78rem; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
.metric { font-size: 1.65rem; font-weight: 760; line-height: 1; }
.section-card { scroll-margin-top: 1rem; }
.section-card + .section-card { margin-top: 1.25rem; }
.section-nav { display: flex; flex-wrap: wrap; gap: .45rem; margin: 1.25rem 0; }
.section-nav a { border: 1px solid var(--border); border-radius: 999px; padding: .25rem .65rem; }
.project-header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.project-header h1 { margin-bottom: 0; }
.project-nav { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0 0 1.25rem; padding: .55rem; position: sticky; top: 0; z-index: 5; border: 1px solid var(--border); border-radius: var(--radius); background: color-mix(in srgb, var(--surface) 94%, transparent); box-shadow: var(--shadow); backdrop-filter: blur(12px); }
.project-nav a { border-radius: 8px; padding: .45rem .7rem; text-decoration: none; white-space: nowrap; }
.project-nav a:hover { background: var(--accent-soft); }
.project-nav a[aria-current="page"] { background: var(--accent); color: #fff; font-weight: 700; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr)); gap: .75rem; margin: 1rem 0; }
.summary-card { min-width: 0; padding: .9rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-alt); }
.summary-card strong { display: block; font-size: 1.5rem; line-height: 1.15; }
.summary-card span { color: var(--muted); font-size: .82rem; }
.signal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); gap: 1rem; }
.section-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr)); gap: .9rem; }
.section-link { display: block; height: 100%; color: inherit; text-decoration: none; }
.section-link:hover { border-color: var(--accent); background: var(--accent-soft); }
.section-link h2, .section-link h3 { color: var(--accent-strong); margin-top: 0; }
.status-badge { display: inline-flex; align-items: center; width: fit-content; border: 1px solid var(--border); border-radius: 999px; padding: .12rem .55rem; font-size: .78rem; font-weight: 700; }
.status-badge[data-tone="success"] { color: var(--success); background: var(--success-soft); border-color: color-mix(in srgb, var(--success) 35%, transparent); }
.status-badge[data-tone="warning"] { color: var(--warning); background: var(--warning-soft); border-color: color-mix(in srgb, var(--warning) 35%, transparent); }
.status-badge[data-tone="error"] { color: var(--error); background: var(--error-soft); border-color: color-mix(in srgb, var(--error) 35%, transparent); }
.status-badge[data-tone="neutral"] { color: var(--muted); background: var(--surface-alt); }
.document-groups { display: grid; gap: 1rem; }
.document-card { display: grid; gap: .45rem; }
.document-card h3 { margin: 0; }
.search-controls { display: grid; grid-template-columns: minmax(14rem, 2fr) repeat(3, minmax(9rem, 1fr)); gap: .75rem; align-items: end; margin: 1rem 0; }
.control-field { display: grid; gap: .3rem; }
.control-field label { color: var(--muted); font-size: .82rem; font-weight: 700; }
.search-results { display: grid; gap: .75rem; padding: 0; list-style: none; }
.search-result { border: 1px solid var(--border); border-radius: 10px; padding: .9rem; background: var(--surface); }
.search-result a { font-weight: 750; }
.search-result p { margin: .45rem 0 0; }
.state-grid, .field-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr)); gap: .8rem 1rem; margin: 0; }
.field-list > div { min-width: 0; }
.field-list dt { color: var(--muted); font-size: .82rem; font-weight: 700; }
.field-list dd { margin: 0; min-width: 0; }
.item-grid { display: grid; gap: .9rem; }
.item-card { min-width: 0; border: 1px solid var(--border); border-radius: 9px; padding: .9rem; background: var(--surface-alt); }
.item-card h3, .item-card h4 { overflow-wrap: anywhere; }
.item-card h3 { margin: 0 0 .55rem; }
.item-card h4 { margin-bottom: .35rem; }
.item-card + .item-card { margin-top: .75rem; }
.empty-state { border-left: 4px solid var(--border); color: var(--muted); margin: .7rem 0; padding: .45rem .75rem; }
.empty-value { color: var(--muted); font-style: italic; }
.compact-list { margin: .35rem 0 0; padding-left: 1.25rem; }
.ref-list { display: grid; gap: .25rem; margin: .35rem 0 0; padding-left: 1.25rem; }
.flow-steps { display: grid; gap: .8rem; margin: .75rem 0 0; padding-left: 1.4rem; }
.flow-diagram { margin-block: 1rem; }
.flow-diagram figcaption { color: var(--muted); font-size: .86rem; margin-top: .65rem; text-align: center; }
.flow-details { border-top: 1px solid var(--border); margin-top: 1rem; padding-top: .75rem; }
.flow-details > summary { color: var(--accent-strong); cursor: pointer; font-weight: 750; }
.compact-list, .ref-list, .flow-steps { min-width: 0; max-width: 100%; }
.flow-steps > li { padding-left: .25rem; }
.diagnostic-list code, .item-card code { overflow-wrap: anywhere; }
.code-block, pre { overflow: auto; background: var(--code); padding: 1rem; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
code { background: var(--code); padding: .1em .3em; border-radius: 4px; }
pre code { background: transparent; padding: 0; }
.table-scroll { max-width: 100%; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 0; table-layout: fixed; }
th, td { border: 1px solid var(--border); padding: .6rem .75rem; text-align: left; vertical-align: top; }
th { background: var(--surface-alt); }
blockquote { border-left: .25rem solid var(--accent); margin: 1rem 0; padding: .25rem 1rem; color: var(--muted); }
img { display: block; max-width: 100%; height: auto; border-radius: 8px; }
.diagram { border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; background: var(--surface); margin: 1.25rem 0; overflow: hidden; }
.diagram-svg { display: block; max-width: 100%; height: auto; margin-inline: auto; }
.diagram-node { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2; }
.diagram-edge { fill: none; stroke: var(--muted); stroke-width: 2; }
.diagram-arrow { fill: var(--muted); }
.diagram-label { fill: var(--text); font: 600 15px system-ui, sans-serif; }
.diagram-fallback { margin-top: .75rem; }
.breadcrumbs { color: var(--muted); font-size: .9rem; }
.status { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: .1rem .55rem; }
.document-layout { display: grid; grid-template-columns: minmax(0, var(--measure)) minmax(12rem, 16rem); gap: 2rem; align-items: start; }
.outline { position: sticky; top: 1rem; }
.outline ol { padding-left: 1.25rem; }
.diagnostic-list { display: grid; gap: .75rem; padding: 0; list-style: none; }
.warning { border-left: 4px solid var(--warning); padding-left: .75rem; }
.error { border-left: 4px solid var(--error); padding-left: .75rem; }
.info { border-left: 4px solid var(--accent); padding-left: .75rem; }
input[type="search"], select { width: 100%; min-height: 2.75rem; padding: .65rem .8rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0a0a0f; --surface: #15151e; --surface-alt: #1d1d29; --text: #f8fafc; --muted: #a4adba; --border: #333442; --accent: #818cf8; --accent-strong: #a5b4fc; --accent-soft: rgba(129, 140, 248, .14); --code: #20212d; --focus: #fbbf24; --success-soft: rgba(21, 128, 61, .2); --warning-soft: rgba(161, 98, 7, .2); --error-soft: rgba(185, 28, 28, .2); --shadow: 0 12px 32px rgba(0, 0, 0, .28); }
}
@media (max-width: 1023px) { .document-layout { grid-template-columns: 1fr; } .outline { position: static; order: -1; } .search-controls { grid-template-columns: 1fr 1fr; } }
@media (max-width: 767px) { .shell { display: block; } .sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--border); } .sidebar nav { display: flex; flex-wrap: wrap; gap: .25rem; } .sidebar nav p { margin: 0; } .main { padding: 1rem; } .project-header { align-items: start; flex-direction: column; } .project-nav { flex-wrap: nowrap; margin-inline: -1rem; padding-inline: 1rem; top: 0; border-inline: 0; border-radius: 0; overflow-x: auto; } .search-controls { grid-template-columns: 1fr; } .flow-diagram .diagram-label { font-size: 20px; } }
@media (max-width: 360px) { .main { padding: .75rem; } .project-nav { margin-inline: -.75rem; } .card { padding: .85rem; } .state-grid, .field-list { grid-template-columns: 1fr; } th, td { padding: .45rem; word-break: break-word; } }
@media print { .sidebar, .no-print, .outline { display: none !important; } .shell, .document-layout { display: block; } .main { padding: 0; } a { color: inherit; text-decoration: none; } .card { break-inside: avoid; box-shadow: none; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
`;
var JS = `(()=>{const q=document.querySelector('[data-search]');const project=document.querySelector('[data-project-filter]');const type=document.querySelector('[data-type-filter]');const truth=document.querySelector('[data-truth-filter]');const out=document.querySelector('[data-results]');const count=document.querySelector('[data-result-count]');if(!q||!project||!type||!truth||!out)return;fetch('search-index.json').then(r=>r.json()).then(index=>{const draw=()=>{const terms=q.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);const rows=index.documents.filter(d=>(!project.value||d.projectId===project.value)&&(!type.value||d.type===type.value)&&(truth.value==='all'||(truth.value==='truth'?d.sourceOfTruth:!d.sourceOfTruth))&&terms.every(t=>[d.projectTitle,d.title,d.sourcePath,d.text,...d.tags,...d.headings].join(' ').toLowerCase().includes(t)));if(count)count.textContent=rows.length+' result'+(rows.length===1?'':'s');out.innerHTML=rows.map(d=>'<li class="search-result"><a href="'+escapeHtml(safeHref(d.route))+'">'+escapeHtml(d.title)+'</a><span class="meta"> \u2014 '+escapeHtml(d.projectTitle)+' / '+escapeHtml(d.sourcePath)+(d.status?' \xB7 '+escapeHtml(d.status):'')+(d.sourceOfTruth?' \xB7 source of truth':'')+'</span><p>'+escapeHtml(d.snippet||d.text.slice(0,240))+'</p></li>').join('')||'<li class="meta">No matching documents.</li>'};[q,project,type,truth].forEach(control=>control.addEventListener('input',draw));[project,type,truth].forEach(control=>control.addEventListener('change',draw));draw()}).catch(()=>{const notice=document.createElement('li');notice.className='warning';notice.textContent='Search index unavailable; showing the complete static list.';out.prepend(notice)});function safeHref(value){if(typeof value!=='string'||!/^projects\\/(?:[A-Za-z0-9._~!$&'()*+,;=@%-]+\\/)*[A-Za-z0-9._~!$&'()*+,;=@%-]+\\.html$/.test(value))return '#';try{const decoded=decodeURIComponent(value);if(decoded.split('/').some(part=>part==='.'||part==='..'||part.includes('\\\\')||/[\\u0000-\\u001f<>"']/.test(part)))return '#'}catch{return '#'}return value}function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}})();`;
var ROUTE_PATTERN = /^projects\/(?:[A-Za-z0-9._~!$&'()*+,;=@%-]+\/)*[A-Za-z0-9._~!$&'()*+,;=@%-]+\.html$/;
function safeRoute(route) {
  if (!ROUTE_PATTERN.test(route)) return "#";
  try {
    const decoded = decodeURIComponent(route);
    if (decoded.split("/").some(
      (part) => part === "." || part === ".." || part.includes("\\") || /[\u0000-\u001f<>"']/.test(part)
    )) {
      return "#";
    }
  } catch {
    return "#";
  }
  return route;
}
function href(fromRoute, targetRoute) {
  const value = relative(dirname(fromRoute), targetRoute).replace(/\\/g, "/");
  return value || "./";
}
function page(title, body, currentRoute = "index.html") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape3(title)} \xB7 Forgewright Docs Hub</title><link rel="stylesheet" href="${escape3(href(currentRoute, "style.css"))}"></head><body><a class="skip-link" href="#main">Skip to content</a><div class="shell"><aside class="sidebar"><strong>Forgewright Docs Hub</strong><nav aria-label="Primary"><p><a href="${escape3(href(currentRoute, "index.html"))}">All projects</a></p><p><a href="${escape3(href(currentRoute, "search.html"))}">Search</a></p><p><a href="${escape3(href(currentRoute, "traceability.html"))}">Traceability</a></p><p><a href="${escape3(href(currentRoute, "diagnostics.html"))}">Diagnostics</a></p></nav></aside><main class="main" id="main"><div class="content">${body}</div></main></div></body></html>`;
}
function escape3(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
function label(value) {
  if (!value) return "Unavailable";
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function emptyState(message) {
  return `<p class="empty-state">${escape3(message)}</p>`;
}
function listItems(items, render, message) {
  return items.length ? `<div class="item-grid">${items.map(render).join("")}</div>` : emptyState(message);
}
function valuesList(values, message) {
  return values.length ? `<ul class="compact-list">${values.map((value) => `<li>${escape3(value)}</li>`).join("")}</ul>` : emptyState(message);
}
function renderRef(ref, catalog, fromRoute) {
  const document = catalog.documents.find(
    (candidate) => candidate.sourcePath === ref.path
  );
  const text3 = `${ref.path}${ref.anchor ? `#${ref.anchor}` : ""}`;
  if (!document) return `<code>${escape3(text3)}</code>`;
  const fragment = ref.anchor ? `#${slugifyHeading(ref.anchor)}` : "";
  return `<a href="${escape3(`${href(fromRoute, document.route)}${fragment}`)}">${escape3(text3)}</a>`;
}
function renderRefs(refs, catalog, fromRoute, message = "No references recorded.") {
  return refs.length ? `<ul class="ref-list">${refs.map((ref) => `<li>${renderRef(ref, catalog, fromRoute)}</li>`).join("")}</ul>` : emptyState(message);
}
function fieldList(fields) {
  return `<dl class="field-list">${fields.map(([name, value]) => `<div><dt>${escape3(name)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}
function stateUnavailable() {
  return emptyState("Project state unavailable.");
}
function stateFreshness(catalog) {
  if (!catalog.project.state) return "Unavailable";
  if (catalog.diagnostics.some(
    (diagnostic2) => diagnostic2.code === "PROJECT_STATE_FUTURE_TIMESTAMP"
  )) {
    return "Future timestamp";
  }
  return catalog.diagnostics.some(
    (diagnostic2) => diagnostic2.code === "PROJECT_STATE_STALE"
  ) ? "Stale" : "Current";
}
function stateUpdated(catalog) {
  return catalog.project.state?.status.updated_at ?? "Unavailable";
}
function stateSource(catalog) {
  return catalog.project.statePath ?? "Unavailable";
}
function renderStateStatus(state, catalog) {
  const status = state.status;
  return `<p>${escape3(status.summary)}</p>${fieldList([
    ["Project health", escape3(label(status.health))],
    ["Lifecycle", escape3(label(status.lifecycle))],
    ["Phase", escape3(status.phase)],
    ["State freshness", escape3(stateFreshness(catalog))],
    ["Last updated", escape3(status.updated_at)],
    ["Next update", escape3(status.next_update_at ?? "Not scheduled")]
  ])}<h3>Blockers</h3>${listItems(
    status.blockers,
    (blocker) => `<article class="item-card"><h4>${escape3(blocker.title)}</h4>${fieldList([
      ["ID", `<code>${escape3(blocker.id)}</code>`],
      ["Owner", escape3(blocker.owner)]
    ])}</article>`,
    "No blockers recorded."
  )}<h3>Risks</h3>${listItems(
    status.risks,
    (risk) => `<article class="item-card"><h4>${escape3(risk.title)}</h4>${fieldList([
      ["ID", `<code>${escape3(risk.id)}</code>`],
      ["Owner", escape3(risk.owner)],
      ["Mitigation", escape3(risk.mitigation)]
    ])}</article>`,
    "No risks recorded."
  )}<h3>Next actions</h3>${listItems(
    status.next_actions,
    (action) => `<article class="item-card"><h4>${escape3(action.title)}</h4>${fieldList([
      ["ID", `<code>${escape3(action.id)}</code>`],
      ["Owner", escape3(action.owner)],
      ["Due date", escape3(action.due_date ?? "Not scheduled")]
    ])}</article>`,
    "No next actions recorded."
  )}`;
}
function renderStructureSection(state) {
  return `<section id="structure" class="card section-card"><h2>Structure</h2><h3>Roots</h3>${listItems(
    state.structure.roots,
    (root) => `<article class="item-card"><h4>${escape3(root.path)}</h4>${fieldList([
      ["ID", `<code>${escape3(root.id)}</code>`],
      ["Kind", escape3(root.kind)],
      ["Purpose", escape3(root.purpose)],
      ["Owner", escape3(root.owner)]
    ])}</article>`,
    "No structure roots recorded."
  )}<h3>Dependencies</h3>${state.structure.dependencies.length ? `<ul class="compact-list">${state.structure.dependencies.map((dependency) => `<li><code>${escape3(dependency.from)}</code> depends on <code>${escape3(dependency.to)}</code> <span class="meta">(${escape3(dependency.type)})</span></li>`).join("")}</ul>` : emptyState("No dependencies recorded.")}</section>`;
}
function renderRoadmapSection(state, catalog, projectRoute) {
  return `<section id="roadmap" class="card section-card"><h2>Roadmap</h2>${listItems(
    state.roadmap,
    (item) => `<article class="item-card"><h3>${escape3(item.title)}</h3>${fieldList([
      ["ID", `<code>${escape3(item.id)}</code>`],
      ["Status", escape3(label(item.status))],
      ["Priority", escape3(label(item.priority))],
      ["Owner", escape3(item.owner)],
      ["Target date", escape3(item.target_date ?? "Not scheduled")],
      [
        "Depends on",
        item.depends_on.length ? item.depends_on.map((dependency) => `<code>${escape3(dependency)}</code>`).join(", ") : `<span class="empty-value">None</span>`
      ],
      ["References", renderRefs(item.references, catalog, projectRoute)]
    ])}</article>`,
    "No roadmap items recorded."
  )}</section>`;
}
function renderFlowsSection(state, catalog, projectRoute) {
  return `<section id="flows" class="card section-card"><h2>Flows</h2>${listItems(
    state.flows,
    (flow) => `<article class="item-card"><h3>${escape3(flow.title)}</h3>${fieldList([
      ["ID", `<code>${escape3(flow.id)}</code>`],
      ["Status", escape3(label(flow.status))],
      ["Trigger", escape3(flow.trigger)]
    ])}${flow.steps.length ? `${renderFlowDiagram(flow)}<details class="flow-details"><summary>Step details</summary><ol class="flow-steps">${flow.steps.map(
      (step) => `<li><h4>${escape3(step.name)}</h4>${fieldList([
        ["ID", `<code>${escape3(step.id)}</code>`],
        ["Actor", escape3(step.actor)],
        ["Inputs", valuesList(step.inputs, "No inputs recorded.")],
        [
          "Outputs",
          valuesList(step.outputs, "No outputs recorded.")
        ],
        [
          "References",
          renderRefs(step.references, catalog, projectRoute)
        ]
      ])}</li>`
    ).join("")}</ol></details>` : emptyState("No ordered steps recorded.")}</article>`,
    "No flows recorded."
  )}</section>`;
}
function mermaidFlowText(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;").replace(/\(/g, "&#40;").replace(/\)/g, "&#41;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;").replace(/\s+/g, " ").trim();
}
function renderFlowDiagram(flow) {
  const lines = [
    "flowchart TD",
    `  trigger["Trigger: ${mermaidFlowText(flow.trigger)}"]`
  ];
  flow.steps.forEach((step, index) => {
    const node = `step_${index + 1}`;
    const previous = index === 0 ? "trigger" : `step_${index}`;
    lines.push(
      `  ${node}["${index + 1}. ${mermaidFlowText(step.name)} \xB7 ${mermaidFlowText(step.actor)}"]`,
      `  ${previous} --> ${node}`
    );
  });
  const source = lines.join("\n");
  const diagram = parseDiagram(source, 0);
  const textFallback = diagram.labels.map(escape3).join(" \u2192 ");
  return `<figure class="diagram flow-diagram" aria-label="Mermaid flow diagram: ${escape3(flow.title)}">
${renderDiagramSvg(diagram, `${flow.title} Mermaid flowchart`)}
<figcaption>Mermaid flowchart generated from the canonical ordered steps.</figcaption>
<details class="diagram-fallback"><summary>Mermaid source and text fallback</summary><pre><code class="language-mermaid">${escape3(source)}</code></pre><p>${textFallback}</p></details>
</figure>`;
}
function renderBacklogSection(state, catalog, projectRoute) {
  return `<section id="backlog" class="card section-card"><h2>Backlog</h2>${listItems(
    state.backlog,
    (item) => `<article class="item-card"><h3>${escape3(item.title)}</h3>${fieldList([
      ["ID", `<code>${escape3(item.id)}</code>`],
      ["Type", escape3(label(item.type))],
      ["Status", escape3(label(item.status))],
      ["Priority", escape3(label(item.priority))],
      ["Owner", escape3(item.owner)],
      [
        "Acceptance",
        valuesList(item.acceptance, "No acceptance criteria recorded.")
      ],
      ["References", renderRefs(item.references, catalog, projectRoute)]
    ])}</article>`,
    "No backlog items recorded."
  )}</section>`;
}
function renderDiagnostics(catalog) {
  const diagnostics = catalog.diagnostics.map(
    (diagnostic2) => `<li class="${diagnostic2.severity}"><strong>${escape3(diagnostic2.severity)} \xB7 ${escape3(diagnostic2.code)}</strong> <span>${escape3(diagnostic2.projectId)}${diagnostic2.path ? ` / ${escape3(diagnostic2.path)}` : ""}: ${escape3(diagnostic2.message)}</span>${diagnostic2.suggestion ? `<p class="meta">Suggestion: ${escape3(diagnostic2.suggestion)}</p>` : ""}</li>`
  ).join("");
  return `<ul class="diagnostic-list">${diagnostics || '<li class="meta">No diagnostics recorded.</li>'}</ul>`;
}
var PROJECT_SECTION_ROUTES = [
  ["Overview", "index.html"],
  ["Structure", "structure.html"],
  ["Roadmap", "roadmap.html"],
  ["Flows", "flows.html"],
  ["Backlog", "backlog.html"],
  ["Documents", "documents.html"],
  ["Health", "health.html"]
];
function projectNav(projectId, currentRoute, currentPage) {
  const projectRoot = `projects/${encodeURIComponent(projectId)}`;
  return `<nav class="project-nav" aria-label="Project control">${PROJECT_SECTION_ROUTES.map(
    ([title, file]) => {
      const target = `${projectRoot}/${file}`;
      const current = title === currentPage ? ' aria-current="page"' : "";
      return `<a href="${escape3(href(currentRoute, target))}"${current}>${escape3(title)}</a>`;
    }
  ).join("")}</nav>`;
}
function projectHeader(catalog, currentRoute, currentPage) {
  const state = catalog.project.state;
  const health = state?.status.health ?? null;
  return `<p class="breadcrumbs"><a href="${escape3(href(currentRoute, "index.html"))}">All projects</a></p><div class="project-header"><div><p class="eyebrow">Documentation scan: ${escape3(label(catalog.project.scanStatus))}</p><h1>${escape3(catalog.project.title)}</h1></div>${health ? `<span class="status-badge" data-tone="${health === "on_track" ? "success" : health === "unknown" ? "neutral" : "warning"}">${escape3(label(health))}</span>` : ""}</div>${projectNav(catalog.project.id, currentRoute, currentPage)}`;
}
function projectSectionLink(title, description, count, projectRoute, file) {
  const id2 = file === "health.html" ? "docs-health" : file.replace(/\.html$/, "");
  return `<section id="${escape3(id2)}" class="card section-link"><h2><a href="${escape3(href(projectRoute, `${projectRoute.replace(/index\.html$/, "")}${file}`))}">${escape3(title)}</a></h2><p>${escape3(description)}</p><p class="meta">${escape3(count)}</p></section>`;
}
function renderHealthSection(catalog, projectRoute) {
  const facts = catalog.project.facts;
  return `<section id="docs-health" class="card section-card"><h2>Documentation health</h2><div class="card-grid"><section class="card"><h3>Documentation</h3><p><span class="metric">${catalog.documents.length}</span> documents</p><p class="meta">${catalog.assets.length} assets \xB7 ${catalog.project.truthDocuments.length} truth documents</p></section><section class="card"><h3>Git</h3><p>${facts.git.available ? escape3(facts.git.branch ?? "detached") : "Unavailable"}</p><p class="meta">${facts.git.commit ? escape3(facts.git.commit.slice(0, 12)) : "No commit"}${facts.git.dirty ? " \xB7 dirty" : ""}</p></section><section class="card"><h3>GitNexus</h3><p>${escape3(facts.gitnexus.status)}</p><p class="meta">${facts.gitnexus.symbols ?? 0} symbols \xB7 ${facts.gitnexus.processes ?? 0} processes</p></section></div><h3>Project state source</h3>${fieldList(
    [
      ["Source path", `<code>${escape3(stateSource(catalog))}</code>`],
      [
        "Content fingerprint",
        `<code>${escape3(catalog.project.stateHash ?? "Unavailable")}</code>`
      ],
      ["Last updated", escape3(stateUpdated(catalog))],
      ["Freshness", escape3(stateFreshness(catalog))]
    ]
  )}<h3>Diagnostics</h3>${renderDiagnostics(catalog)}<h3>Documents</h3>${renderDocumentsSection(catalog, projectRoute)}</section>`;
}
function renderDocumentsSection(catalog, fromRoute) {
  const documents = catalog.documents.map(
    (document) => `<article class="card document-card"><h3><a href="${escape3(href(fromRoute, document.route))}">${escape3(document.title)}</a></h3><p class="meta">${escape3(document.sourcePath)} \xB7 ${escape3(document.type)}${document.status ? ` \xB7 ${escape3(document.status)}` : ""}${document.sourceOfTruth ? " \xB7 Source of truth" : ""}</p></article>`
  ).join("");
  return `<div class="document-groups">${documents || '<p class="empty-state">No approved documents were found.</p>'}</div>`;
}
function renderOverview(catalog, projectRoute) {
  const state = catalog.project.state;
  const overview = state ? `<section id="project-status" class="card section-card"><h2>Project status</h2><p>${escape3(state.project.summary)}</p>${fieldList(
    [
      ["Product type", escape3(label(state.project.product_type))],
      ["Declared lifecycle", escape3(label(state.project.lifecycle))],
      ["State schema version", escape3(String(state.schema_version))],
      ["State source", `<code>${escape3(stateSource(catalog))}</code>`],
      ["State freshness", escape3(stateFreshness(catalog))],
      ["Last updated", escape3(stateUpdated(catalog))]
    ]
  )}${renderStateStatus(state, catalog)}</section>` : `<section id="project-status" class="card section-card"><h2>Project status</h2>${stateUnavailable()}${renderDiagnostics(catalog)}</section>`;
  const sections = [
    projectSectionLink(
      "Structure",
      "Roots and dependencies that shape the project.",
      `${state?.structure.roots.length ?? 0} roots \xB7 ${state?.structure.dependencies.length ?? 0} dependencies`,
      projectRoute,
      "structure.html"
    ),
    projectSectionLink(
      "Roadmap",
      "Priorities, owners, dates and dependencies.",
      `${state?.roadmap.length ?? 0} roadmap items`,
      projectRoute,
      "roadmap.html"
    ),
    projectSectionLink(
      "Flows",
      "Ordered product and operational flows.",
      `${state?.flows.length ?? 0} flows`,
      projectRoute,
      "flows.html"
    ),
    projectSectionLink(
      "Backlog",
      "Work items and acceptance criteria.",
      `${state?.backlog.length ?? 0} backlog items`,
      projectRoute,
      "backlog.html"
    ),
    projectSectionLink(
      "Documents",
      "Approved source documents for this project.",
      `${catalog.documents.length} documents`,
      projectRoute,
      "documents.html"
    ),
    projectSectionLink(
      "Health",
      "Freshness, diagnostics and repository facts.",
      `${catalog.diagnostics.length} diagnostics`,
      projectRoute,
      "health.html"
    )
  ].join("");
  return `${overview}<div class="section-links">${sections}</div>`;
}
function containedPath(outputDir, child) {
  const root = resolve(outputDir);
  const target = resolve(child);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Static output path escapes output directory: ${child}`);
  }
  return target;
}
function safeDestination(outputDir, child) {
  const root = resolve(outputDir);
  const target = containedPath(root, child);
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of ["", ...segments]) {
    current = segment ? join(current, segment) : current;
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(
          `Refusing docs output destination because it contains a symlink: ${current}`
        );
      }
    } catch (error2) {
      if (error2.code === "ENOENT") break;
      if (error2 instanceof Error && error2.message.startsWith("Refusing ")) {
        throw error2;
      }
      throw new Error(`Unable to inspect docs output destination: ${current}`, {
        cause: error2
      });
    }
  }
  return target;
}
function documentBody(document, catalogs) {
  const catalog = catalogs.find(
    (item) => item.project.id === document.projectId
  );
  const allDocuments = catalogs.flatMap((item) => item.documents);
  const links = /* @__PURE__ */ new Map();
  for (const link2 of document.links ?? []) {
    if (link2.resolvedRoute) {
      links.set(link2.target, link2.resolvedRoute);
      links.set(link2.target.normalize("NFC"), link2.resolvedRoute);
      try {
        const decoded = decodeURIComponent(link2.target);
        links.set(decoded, link2.resolvedRoute);
        links.set(decoded.normalize("NFC"), link2.resolvedRoute);
      } catch {
      }
    }
  }
  const firstHeading = document.headings[0];
  const normalizedTitle = document.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const firstHeadingMatchesTitle = firstHeading?.level === 1 && firstHeading.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() === normalizedTitle;
  const content = firstHeadingMatchesTitle ? document.content.replace(/^#\s+.+?(?:\r?\n)+(?:\r?\n)?/, "") : document.content;
  const outlineHeadings = firstHeadingMatchesTitle ? document.headings.slice(1) : document.headings;
  const rendered = renderMarkdown(content, {
    diagrams: document.diagrams,
    links: document.links,
    resolveLink: (target) => links.get(target)
  });
  const backlinkItems = document.backlinks.map((id2) => allDocuments.find((item) => item.id === id2)).filter((item) => item !== void 0).map(
    (item) => `<li><a href="${escape3(href(document.route, item.route))}">${escape3(item.title)}</a></li>`
  ).join("");
  const relatedItems = document.related.map((id2) => allDocuments.find((item) => item.id === id2)).filter((item) => item !== void 0).map(
    (item) => `<li><a href="${escape3(href(document.route, item.route))}">${escape3(item.title)}</a></li>`
  ).join("");
  const outline = outlineHeadings.length ? `<aside class="outline card" aria-label="On this page"><h2>On this page</h2><ol>${outlineHeadings.map((heading2) => `<li><a href="#${escape3(heading2.slug)}">${escape3(heading2.text)}</a></li>`).join("")}</ol></aside>` : "";
  const projectRoute = `projects/${encodeURIComponent(document.projectId)}/index.html`;
  return `${catalog ? projectNav(catalog.project.id, document.route, "Documents") : ""}<p class="breadcrumbs"><a href="${escape3(href(document.route, projectRoute))}">${escape3(catalog?.project.title ?? document.projectId)}</a> / ${escape3(document.sourcePath)}</p>
<h1${firstHeadingMatchesTitle ? ` id="${escape3(firstHeading.slug)}"` : ""}>${escape3(document.title)}</h1>
<p class="meta">${escape3(document.type)}${document.status ? ` \xB7 <span class="status">${escape3(document.status)}</span>` : ""}${document.sourceOfTruth ? " \xB7 source of truth" : ""}</p>
<div class="document-layout"><article>${rendered}${backlinkItems ? `<aside class="card"><h2>Backlinks</h2><ul>${backlinkItems}</ul></aside>` : ""}${relatedItems ? `<aside class="card"><h2>Related</h2><ul>${relatedItems}</ul></aside>` : ""}</article>${outline}</div>`;
}
function renderStaticSite(catalogs, options) {
  const orderedCatalogs = [...catalogs].sort(
    (left, right) => left.project.id.localeCompare(right.project.id)
  );
  const outputDir = resolve(options.outputDir);
  const safeOutputDir = safeDestination(outputDir, outputDir);
  mkdirSync(safeOutputDir, { recursive: true });
  const files = [];
  const write = (path, content) => {
    const safePath = safeDestination(outputDir, path);
    mkdirSync(dirname(safePath), { recursive: true });
    safeDestination(outputDir, safePath);
    writeFileSync(safePath, content, "utf8");
    files.push(safePath);
  };
  const ownershipMetadata = {
    schema: "forgewright-docs-hub",
    schema_version: 1,
    source_fingerprints: orderedCatalogs.map((catalog) => ({
      project_id: catalog.project.id,
      fingerprint: catalog.sourceFingerprint
    }))
  };
  write(
    join(outputDir, ".forgewright-docs-hub"),
    `${JSON.stringify(ownershipMetadata, null, 2)}
`
  );
  write(join(outputDir, "style.css"), CSS);
  write(join(outputDir, "app.js"), JS);
  const projectCards = orderedCatalogs.map((catalog) => {
    const state = catalog.project.state;
    const stateHealth = state?.status.health ?? null;
    return `<article class="card"><p class="eyebrow">Documentation scan: ${escape3(label(catalog.project.scanStatus))}</p><h2><a href="${escape3(`projects/${encodeURIComponent(catalog.project.id)}/index.html`)}">${escape3(catalog.project.title)}</a></h2><p><span class="metric">${catalog.documents.length}</span> documents</p>${fieldList(
      [
        ["Project health", escape3(label(stateHealth))],
        [
          "Lifecycle",
          escape3(state ? label(state.status.lifecycle) : "Unavailable")
        ],
        ["Phase", escape3(state?.status.phase ?? "Unavailable")],
        ["State freshness", escape3(stateFreshness(catalog))],
        ["Last updated", escape3(stateUpdated(catalog))],
        [
          "Documentation health",
          escape3(
            `${catalog.project.health.warnings} warnings, ${catalog.project.health.errors} errors, ${catalog.project.health.info} info`
          )
        ]
      ]
    )}</article>`;
  }).join("");
  write(
    join(outputDir, "index.html"),
    page(
      options.title ?? "Projects",
      `<p class="eyebrow">Local-first knowledge</p><h1>${escape3(options.title ?? "Documentation projects")}</h1><p class="meta">Static, offline-readable project documentation with privacy-safe collection and traceability.</p><div class="card-grid">${projectCards || '<p class="meta">No registered projects.</p>'}</div>`
    )
  );
  for (const catalog of orderedCatalogs) {
    const projectRoute = `projects/${encodeURIComponent(catalog.project.id)}/index.html`;
    const projectRoot = projectRoute.replace(/index\.html$/, "");
    const stateSections = catalog.project.state ? {
      structure: renderStructureSection(catalog.project.state),
      roadmap: renderRoadmapSection(
        catalog.project.state,
        catalog,
        `${projectRoot}roadmap.html`
      ),
      flows: renderFlowsSection(
        catalog.project.state,
        catalog,
        `${projectRoot}flows.html`
      ),
      backlog: renderBacklogSection(
        catalog.project.state,
        catalog,
        `${projectRoot}backlog.html`
      )
    } : null;
    const unavailableSections = {
      structure: `<section id="structure" class="card section-card"><h2>Structure</h2>${stateUnavailable()}</section>`,
      roadmap: `<section id="roadmap" class="card section-card"><h2>Roadmap</h2>${stateUnavailable()}</section>`,
      flows: `<section id="flows" class="card section-card"><h2>Flows</h2>${stateUnavailable()}</section>`,
      backlog: `<section id="backlog" class="card section-card"><h2>Backlog</h2>${stateUnavailable()}</section>`
    };
    write(
      join(outputDir, projectRoute),
      page(
        catalog.project.title,
        `${projectHeader(catalog, projectRoute, "Overview")}${renderOverview(catalog, projectRoute)}`,
        projectRoute
      )
    );
    for (const [name, title] of [
      ["structure", "Structure"],
      ["roadmap", "Roadmap"],
      ["flows", "Flows"],
      ["backlog", "Backlog"]
    ]) {
      const route = `${projectRoot}${name}.html`;
      write(
        join(outputDir, route),
        page(
          `${title} \xB7 ${catalog.project.title}`,
          `${projectHeader(catalog, route, title)}${stateSections?.[name] ?? unavailableSections[name]}`,
          route
        )
      );
    }
    const documentsRoute = `${projectRoot}documents.html`;
    write(
      join(outputDir, documentsRoute),
      page(
        `Documents \xB7 ${catalog.project.title}`,
        `${projectHeader(catalog, documentsRoute, "Documents")}<section id="documents" class="card section-card"><h2>Documents</h2>${renderDocumentsSection(catalog, documentsRoute)}</section>`,
        documentsRoute
      )
    );
    const healthRoute = `${projectRoot}health.html`;
    write(
      join(outputDir, healthRoute),
      page(
        `Health \xB7 ${catalog.project.title}`,
        `${projectHeader(catalog, healthRoute, "Health")}${renderHealthSection(catalog, healthRoute)}`,
        healthRoute
      )
    );
    for (const document of catalog.documents) {
      write(
        join(outputDir, document.route),
        page(
          document.title,
          documentBody(document, orderedCatalogs),
          document.route
        )
      );
    }
    for (const asset of catalog.assets) {
      const target = safeDestination(outputDir, join(outputDir, asset.route));
      mkdirSync(dirname(target), { recursive: true });
      safeDestination(outputDir, target);
      copyFileSync(join(catalog.project.root, asset.sourcePath), target);
      files.push(target);
    }
  }
  const index = buildSearchIndex(orderedCatalogs);
  write(
    join(outputDir, "search-index.json"),
    `${JSON.stringify(index, null, 2)}
`
  );
  const browseFallback = orderedCatalogs.flatMap(
    (catalog) => catalog.documents.map(
      (document) => `<li><a href="${escape3(safeRoute(document.route))}">${escape3(document.title)}</a> <span class="meta">\u2014 ${escape3(catalog.project.title)} / ${escape3(document.sourcePath)}</span></li>`
    )
  ).join("");
  const searchTypes = [
    ...new Set(
      orderedCatalogs.flatMap(
        (catalog) => catalog.documents.map((document) => document.type)
      )
    )
  ].sort((left, right) => left.localeCompare(right));
  const projectOptions = orderedCatalogs.map(
    (catalog) => `<option value="${escape3(catalog.project.id)}">${escape3(catalog.project.title)}</option>`
  ).join("");
  const typeOptions = searchTypes.map(
    (type) => `<option value="${escape3(type)}">${escape3(label(type))}</option>`
  ).join("");
  write(
    join(outputDir, "search.html"),
    page(
      "Search",
      `<p class="eyebrow">Offline index</p><h1>Search</h1><p class="meta">Search titles, paths, headings, tags and document text.</p><noscript><p>JavaScript is disabled. Browse the complete document list below.</p></noscript><div class="search-controls"><div class="control-field"><label for="search">Search documents</label><input id="search" data-search type="search" autocomplete="off"></div><div class="control-field"><label for="project-filter">Project</label><select id="project-filter" data-project-filter><option value="">All projects</option>${projectOptions}</select></div><div class="control-field"><label for="type-filter">Type</label><select id="type-filter" data-type-filter><option value="">All types</option>${typeOptions}</select></div><div class="control-field"><label for="truth-filter">Truth</label><select id="truth-filter" data-truth-filter><option value="all">All documents</option><option value="truth">Source of truth</option><option value="non-truth">Supporting documents</option></select></div></div><p class="meta" aria-live="polite" data-result-count>${orderedCatalogs.reduce((count, catalog) => count + catalog.documents.length, 0)} results</p><ul class="search-results" data-results>${browseFallback}</ul><script src="app.js" defer></script>`,
      "search.html"
    )
  );
  const relations = orderedCatalogs.flatMap(
    (catalog) => catalog.relations.map(
      (relation) => `<li><strong>${escape3(relation.type)}</strong> <code>${escape3(relation.from)}</code> \u2192 <code>${escape3(relation.to)}</code> <span class="meta">(${escape3(relation.source)})</span></li>`
    )
  ).join("");
  write(
    join(outputDir, "traceability.html"),
    page(
      "Traceability",
      `<p class="eyebrow">Relationships</p><h1>Traceability</h1><p class="meta">Document, code-reference, truth, and link relations.</p><ul>${relations || '<li class="meta">No relations found.</li>'}</ul>`,
      "traceability.html"
    )
  );
  const diagnostics = orderedCatalogs.flatMap(
    (catalog) => catalog.diagnostics.map(
      (diagnostic2) => `<li class="${diagnostic2.severity}"><strong>${escape3(diagnostic2.severity)} \xB7 ${escape3(diagnostic2.code)}</strong> <span>${escape3(diagnostic2.projectId)}${diagnostic2.path ? ` / ${escape3(diagnostic2.path)}` : ""}: ${escape3(diagnostic2.message)}</span>${diagnostic2.suggestion ? `<p class="meta">Suggestion: ${escape3(diagnostic2.suggestion)}</p>` : ""}</li>`
    )
  ).join("");
  write(
    join(outputDir, "diagnostics.html"),
    page(
      "Diagnostics",
      `<p class="eyebrow">Documentation health</p><h1>Diagnostics</h1><ul class="diagnostic-list">${diagnostics || '<li class="meta">No diagnostics.</li>'}</ul>`,
      "diagnostics.html"
    )
  );
  write(
    join(outputDir, "404.html"),
    page(
      "Not found",
      '<p class="eyebrow">404</p><h1>Page not found</h1><p>The requested generated document does not exist.</p><p><a href="index.html">Return to all projects</a></p>',
      "404.html"
    )
  );
  return {
    outputDir,
    files: [...new Set(files)].sort(),
    searchIndex: join(outputDir, "search-index.json")
  };
}
function buildDocsHub(catalogs, outputDir) {
  const finalOutput = resolve(outputDir);
  const stagingOutput = `${finalOutput}.staging-${process.pid}`;
  const ownershipMarker = join(finalOutput, ".forgewright-docs-hub");
  if (existsSync(finalOutput) && !existsSync(ownershipMarker)) {
    throw new Error(
      `Refusing to replace an unowned output directory: ${finalOutput}`
    );
  }
  rmSync(stagingOutput, { recursive: true, force: true });
  let staged;
  try {
    staged = renderStaticSite(catalogs, { outputDir: stagingOutput });
  } catch (error2) {
    rmSync(stagingOutput, { recursive: true, force: true });
    throw error2;
  }
  rmSync(finalOutput, { recursive: true, force: true });
  renameSync(stagingOutput, finalOutput);
  return {
    outputDir: finalOutput,
    projects: [...catalogs].sort((left, right) => left.project.id.localeCompare(right.project.id)).map((catalog) => ({
      id: catalog.project.id,
      title: catalog.project.title,
      documents: catalog.documents.length,
      diagnostics: catalog.diagnostics.length
    })),
    filesWritten: staged.files.length
  };
}

// src/docs/change-gate.ts
var DocsGateError = class extends Error {
  code;
  constructor(code2, message) {
    super(message);
    this.name = "DocsGateError";
    this.code = code2;
  }
};
var LOCKFILES2 = /* @__PURE__ */ new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pipfile.lock",
  "poetry.lock",
  "pnpm-lock.yaml",
  "yarn.lock"
]);
var DOCUMENT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".adoc",
  ".markdown",
  ".md",
  ".mdx",
  ".org",
  ".rst",
  ".tex",
  ".txt"
]);
var DOCUMENT_ASSET_EXTENSIONS = /* @__PURE__ */ new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".svg",
  ".webp"
]);
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".cjs",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".swift",
  ".ts",
  ".tsx",
  ".vue"
]);
var PROJECT_MANIFESTS = /* @__PURE__ */ new Set([
  "cargo.toml",
  "composer.json",
  "dockerfile",
  "gemfile",
  "go.mod",
  "makefile",
  "mix.exs",
  "package.json",
  "pipfile",
  "poetry.lock",
  "pyproject.toml",
  "requirements.txt",
  "setup.cfg",
  "setup.py"
]);
var GENERATED_DIRECTORIES = /* @__PURE__ */ new Set(["build", "coverage", "dist"]);
var TEST_DIRECTORIES = /* @__PURE__ */ new Set([
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs"
]);
var DOCUMENT_DIRECTORIES = /* @__PURE__ */ new Set([
  "adr",
  "doc",
  "docs",
  "documentation",
  "wiki"
]);
var MATERIAL_DIRECTORIES = /* @__PURE__ */ new Set([
  "app",
  "bin",
  "client",
  "config",
  "configs",
  ".agents",
  ".claude",
  ".codex",
  ".cursor",
  ".github",
  "kernel",
  "lib",
  "runtime",
  "prompt",
  "prompts",
  "rule",
  "rules",
  "schema",
  "schemas",
  "server",
  "script",
  "scripts",
  "skill",
  "skills",
  "source",
  "src",
  "template",
  "templates",
  "workflow",
  "workflows"
]);
var MATERIAL_FILENAMES = /* @__PURE__ */ new Set([
  "agents.md",
  "claude.md",
  "product-manifest.json"
]);
var BENIGN_JUNK_FILENAMES = /* @__PURE__ */ new Set([
  ".ds_store",
  ".gitkeep",
  ".keep",
  "desktop.ini",
  "thumbs.db"
]);
function sortPaths(paths) {
  return [...new Set(paths)].sort(
    (left, right) => left < right ? -1 : left > right ? 1 : 0
  );
}
function parseNulDelimitedPaths(output2) {
  const text3 = Buffer.isBuffer(output2) ? output2.toString("utf8") : output2;
  const paths = text3.split("\0").filter((path) => path.length > 0).map((path) => path.replace(/\\/g, "/"));
  for (const path of paths) {
    if (path.includes("\uFFFD") || path.startsWith("/") || path.split("/").some((segment) => segment === "..")) {
      throw new DocsGateError(
        "GIT_PATH_INVALID",
        `Git returned a non-relative path: ${path}`
      );
    }
  }
  return sortPaths(paths);
}
function parseNulDelimitedDiffPaths(output2) {
  const text3 = Buffer.isBuffer(output2) ? output2.toString("utf8") : output2;
  const tokens = text3.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  const paths = [];
  for (let index = 0; index < tokens.length; ) {
    const status = tokens[index++];
    if (!status || !/^[ACDMRTUXB][0-9]*$/.test(status)) {
      throw new DocsGateError(
        "GIT_CHANGE_DISCOVERY_FAILED",
        `Git returned an invalid name-status record: ${status ?? "<missing>"}`
      );
    }
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
      const path = tokens[index++];
      if (path === void 0) {
        throw new DocsGateError(
          "GIT_CHANGE_DISCOVERY_FAILED",
          `Git returned an incomplete name-status record for ${status}.`
        );
      }
      paths.push(path);
    }
  }
  return parseNulDelimitedPaths(`${paths.join("\0")}\0`);
}
function isTrackedPath(projectRoot, path) {
  const result = spawnSync(
    "git",
    ["-C", projectRoot, "ls-files", "--error-unmatch", "--", path],
    {
      stdio: "ignore",
      timeout: 1e4
    }
  );
  if (result.error) {
    throw new DocsGateError(
      "GIT_CHANGE_DISCOVERY_FAILED",
      `Unable to verify whether a generated path is tracked: ${result.error.message}`
    );
  }
  return result.status === 0;
}
function runGitOutput(projectRoot, args) {
  const result = spawnSync("git", ["-C", projectRoot, ...args], {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 1e4
  });
  if (result.error || result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8").trim() : String(result.stderr ?? "").trim();
    throw new DocsGateError(
      "GIT_CHANGE_DISCOVERY_FAILED",
      `Unable to read Git changes${stderr ? `: ${stderr}` : "."}`
    );
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
}
function runGit2(projectRoot, args) {
  return parseNulDelimitedPaths(runGitOutput(projectRoot, args));
}
function runGitDiff(projectRoot, args) {
  return parseNulDelimitedDiffPaths(runGitOutput(projectRoot, args));
}
function stagedPaths(projectRoot) {
  return runGitDiff(projectRoot, [
    "diff",
    "--relative",
    "-M",
    "--cached",
    "--name-status",
    "-z",
    "--diff-filter=ACMRD"
  ]);
}
function worktreePaths(projectRoot) {
  return sortPaths([
    ...runGitDiff(projectRoot, [
      "diff",
      "--relative",
      "-M",
      "--name-status",
      "-z",
      "--diff-filter=ACMRD"
    ]),
    ...stagedPaths(projectRoot),
    ...runGit2(projectRoot, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z"
    ])
  ]);
}
function baseRefPaths(projectRoot, baseRef) {
  if (!baseRef.trim() || baseRef.startsWith("-")) {
    throw new DocsGateError(
      "GIT_BASE_REF_INVALID",
      "--base-ref must be a non-empty Git revision."
    );
  }
  return runGitDiff(projectRoot, [
    "diff",
    "--relative",
    "-M",
    "--name-status",
    "-z",
    "--diff-filter=ACMRD",
    `${baseRef}...HEAD`
  ]);
}
function gitText(projectRoot, args) {
  const value = runGitOutput(projectRoot, args).toString("utf8").trim();
  if (!value || value.includes("\0")) {
    throw new DocsGateError(
      "GIT_SNAPSHOT_FAILED",
      "Git returned an invalid value while preparing the selected project view."
    );
  }
  return value;
}
function selectedProjectView(projectRoot, mode) {
  if (mode === "worktree") {
    return { projectRoot, temporaryParent: null };
  }
  const repositoryRoot = realpathSync(
    resolve(gitText(projectRoot, ["rev-parse", "--show-toplevel"]))
  );
  const projectPath = relative(repositoryRoot, projectRoot);
  if (projectPath === ".." || projectPath.startsWith(`..${sep}`) || resolve(repositoryRoot, projectPath) !== projectRoot) {
    throw new DocsGateError(
      "GIT_SNAPSHOT_FAILED",
      "Project root is outside the Git repository selected for the docs gate."
    );
  }
  const temporaryParent = mkdtempSync(join(tmpdir(), "forgewright-docs-view-"));
  try {
    const snapshotRoot = join(temporaryParent, "repository");
    runGitOutput(repositoryRoot, [
      "clone",
      "--quiet",
      "--no-checkout",
      "--local",
      "--no-hardlinks",
      "--",
      repositoryRoot,
      snapshotRoot
    ]);
    if (mode === "staged") {
      runGitOutput(repositoryRoot, [
        "checkout-index",
        "--all",
        "--force",
        `--prefix=${snapshotRoot}/`
      ]);
    } else {
      const head = gitText(projectRoot, ["rev-parse", "--verify", "HEAD"]);
      runGitOutput(snapshotRoot, ["checkout", "--quiet", "--detach", head]);
    }
    return {
      projectRoot: resolve(snapshotRoot, projectPath),
      temporaryParent
    };
  } catch (error2) {
    rmSync(temporaryParent, { recursive: true, force: true });
    throw error2;
  }
}
function selectedMode(options) {
  const selected = [
    options.staged ? "staged" : null,
    options.worktree ? "worktree" : null,
    options.baseRef !== void 0 ? "base-ref" : null
  ].filter((value) => value !== null);
  if (selected.length > 1) {
    throw new DocsGateError(
      "DOCS_GATE_OPTION_CONFLICT",
      "Choose only one of --staged, --worktree, or --base-ref."
    );
  }
  return selected[0] ?? "worktree";
}
function selectedPaths(projectRoot, mode, baseRef) {
  if (mode === "staged") return stagedPaths(projectRoot);
  if (mode === "base-ref") return baseRefPaths(projectRoot, baseRef ?? "");
  return worktreePaths(projectRoot);
}
function pathSegments(path) {
  return path.toLowerCase().split("/").filter(Boolean);
}
function isIgnoredGeneratedPath(path) {
  const lower = path.toLowerCase();
  const segments = pathSegments(path);
  return segments.includes(".git") || lower === ".forgewright/cache" || lower.startsWith(".forgewright/cache/") || isGeneratedDocsOutputPath(path) || segments.some((segment) => GENERATED_DIRECTORIES.has(segment));
}
function isGeneratedDocsOutputPath(path) {
  const lower = path.toLowerCase();
  return lower === ".forgewright/docs-hub" || lower.startsWith(".forgewright/docs-hub/");
}
function isLockfile(path) {
  const basename5 = path.split("/").at(-1)?.toLowerCase() ?? "";
  return LOCKFILES2.has(basename5);
}
function isTestOnlyPath(path) {
  const lower = path.toLowerCase();
  const basename5 = lower.split("/").at(-1) ?? "";
  return pathSegments(path).some((segment) => TEST_DIRECTORIES.has(segment)) || /(^|[._-])(test|spec)([._-]|$)/.test(basename5) || /(^|[._-])test_[^/]+\.(py|pyi)$/.test(basename5) || /_test\.(go|py|rs)$/.test(basename5) || basename5 === "conftest.py";
}
function isDocumentationOnlyPath(path) {
  const lower = path.toLowerCase();
  const basename5 = lower.split("/").at(-1) ?? "";
  const extension = basename5.includes(".") ? `.${basename5.split(".").at(-1)}` : "";
  return DOCUMENT_EXTENSIONS.has(extension) || /^(readme|changelog|changes|history|license)(\.|$)/.test(basename5);
}
function isProjectConfigPath(path) {
  const basename5 = path.split("/").at(-1)?.toLowerCase() ?? "";
  return path.toLowerCase() === ".forgewright/docs-manifest.json" || PROJECT_MANIFESTS.has(basename5) || /^(\.env|\.nvmrc|\.npmrc|\.tool-versions|tsconfig(?:\.|$)|jsconfig(?:\.|$)|vitest\.config\.|jest\.config\.|vite\.config\.|webpack\.config\.|rollup\.config\.|eslint\.config\.|\.eslintrc|\.prettierrc)/.test(
    basename5
  );
}
function isBenignJunkPath(path) {
  const basename5 = path.split("/").at(-1)?.toLowerCase() ?? "";
  return BENIGN_JUNK_FILENAMES.has(basename5) || basename5.endsWith(".swp") || basename5.endsWith(".swo") || basename5.endsWith("~");
}
function isMaterialDocsPath(path, canonicalStatePath) {
  const normalizedPath = path.replace(/\\/g, "/");
  let normalizedState = null;
  if (canonicalStatePath) {
    try {
      normalizedState = normalizeRelativePath(canonicalStatePath);
    } catch {
      normalizedState = canonicalStatePath.replace(/\\/g, "/");
    }
  }
  if (normalizedState === normalizedPath) return true;
  if (isIgnoredGeneratedPath(normalizedPath)) return false;
  if (isLockfile(normalizedPath)) return false;
  if (isTestOnlyPath(normalizedPath)) return false;
  const segments = pathSegments(normalizedPath);
  if (segments.some((segment) => MATERIAL_DIRECTORIES.has(segment))) {
    return true;
  }
  const basename5 = segments.at(-1) ?? "";
  const extension = basename5.includes(".") ? `.${basename5.split(".").at(-1)}` : "";
  if (MATERIAL_FILENAMES.has(basename5)) return true;
  if (isProjectConfigPath(normalizedPath)) return true;
  if (SOURCE_EXTENSIONS.has(extension)) return true;
  if (isDocumentationOnlyPath(normalizedPath)) return false;
  if (segments.some((segment) => DOCUMENT_DIRECTORIES.has(segment)) && DOCUMENT_ASSET_EXTENSIONS.has(extension)) {
    return false;
  }
  if (isBenignJunkPath(normalizedPath)) return false;
  return true;
}
function classifyMaterialPaths(changedPaths, canonicalStatePath, continuousDocsPaths = []) {
  const continuous = new Set(
    [...continuousDocsPaths].map((path) => path.replace(/\\/g, "/"))
  );
  return sortPaths(
    changedPaths.filter(
      (path) => continuous.has(path.replace(/\\/g, "/")) || isMaterialDocsPath(path, canonicalStatePath)
    )
  );
}
function continuousDocumentationPaths(catalog) {
  const references = catalog.project.state ? [
    ...catalog.project.state.roadmap.flatMap((item) => item.references),
    ...catalog.project.state.flows.flatMap(
      (flow) => flow.steps.flatMap((step) => step.references)
    ),
    ...catalog.project.state.backlog.flatMap((item) => item.references)
  ].map((reference2) => reference2.path) : [];
  return sortPaths([
    ...catalog.project.truthDocuments,
    ...references,
    ...catalog.project.statePath ? [catalog.project.statePath] : []
  ]);
}
function diagnostic(code2, message, path, projectId = "docs-gate") {
  return {
    severity: "error",
    code: code2,
    projectId,
    ...path ? { path } : {},
    message
  };
}
function addDiagnostic2(report, item) {
  report.diagnostics.push(item);
  report.summary.errors += 1;
  report.status = "fail";
}
function emptyResult(mode) {
  return {
    status: "fail",
    mode,
    changedPaths: [],
    materialPaths: [],
    statePath: null,
    stateUpdatedAt: null,
    doctor: { summary: null, diagnostics: [] },
    verifiedOutputPaths: []
  };
}
function outputRelativePath(outputDir, candidate) {
  const root = resolve(outputDir);
  const target = resolve(candidate);
  const relativePath = relative(root, target).replace(/\\/g, "/");
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("/")) {
    throw new DocsGateError(
      "DOCS_GATE_OUTPUT_ESCAPE",
      `Generated output path escapes the temporary output directory: ${candidate}`
    );
  }
  return relativePath;
}
function verifyOutput(outputDir, catalog) {
  const projectRoot = `projects/${encodeURIComponent(catalog.project.id)}`;
  const required = [
    ".forgewright-docs-hub",
    "index.html",
    "style.css",
    "app.js",
    "search-index.json",
    `${projectRoot}/index.html`,
    ...["structure", "roadmap", "flows", "backlog", "documents", "health"].map(
      (section) => `${projectRoot}/${section}.html`
    ),
    ...catalog.documents.map((document) => document.route)
  ];
  for (const path of required) {
    const absolutePath = resolve(outputDir, path);
    outputRelativePath(outputDir, absolutePath);
    let stat;
    try {
      stat = lstatSync(absolutePath);
    } catch {
      throw new DocsGateError(
        "DOCS_GATE_OUTPUT_MISSING",
        `Generated Docs Hub output is missing: ${path}`
      );
    }
    if (!stat.isFile()) {
      throw new DocsGateError(
        "DOCS_GATE_OUTPUT_NOT_REGULAR",
        `Generated Docs Hub output is not a regular file: ${path}`
      );
    }
  }
  let ownership;
  try {
    ownership = JSON.parse(
      readFileSync(resolve(outputDir, ".forgewright-docs-hub"), "utf8")
    );
  } catch (error2) {
    throw new DocsGateError(
      "DOCS_GATE_MARKER_INVALID",
      `Generated ownership marker is not valid JSON: ${error2 instanceof Error ? error2.message : String(error2)}`
    );
  }
  const fingerprints = ownership && typeof ownership === "object" && "source_fingerprints" in ownership ? ownership.source_fingerprints : null;
  const ownsCatalog = Array.isArray(fingerprints) && fingerprints.some(
    (item) => item && typeof item === "object" && item.project_id === catalog.project.id && item.fingerprint === catalog.sourceFingerprint
  );
  if (!ownership || typeof ownership !== "object" || ownership.schema !== "forgewright-docs-hub" || ownership.schema_version !== 1 || !ownsCatalog) {
    throw new DocsGateError(
      "DOCS_GATE_MARKER_INVALID",
      "Generated ownership marker does not match the current project catalog."
    );
  }
  return sortPaths(required);
}
function statePathFromCatalog(catalog) {
  if (!catalog.project.statePath) return null;
  try {
    return normalizeRelativePath(catalog.project.statePath);
  } catch {
    return catalog.project.statePath.replace(/\\/g, "/");
  }
}
function runDocsGate(projectRootInput, options = {}) {
  let mode = "worktree";
  const result = emptyResult(mode);
  let catalog = null;
  let doctorReport = null;
  let selectedView = null;
  try {
    mode = selectedMode(options);
    result.mode = mode;
    const projectRoot = realpathSync(resolve(projectRootInput));
    result.changedPaths = selectedPaths(projectRoot, mode, options.baseRef);
    selectedView = selectedProjectView(projectRoot, mode);
    catalog = scanProject(selectedView.projectRoot);
    result.statePath = statePathFromCatalog(catalog);
    result.stateUpdatedAt = catalog.project.state?.status.updated_at ?? null;
    doctorReport = doctorCatalog(catalog, null, { strict: true });
    result.doctor = {
      summary: doctorReport.summary,
      diagnostics: [...doctorReport.diagnostics]
    };
    for (const path of result.changedPaths.filter(
      (path2) => isGeneratedDocsOutputPath(path2) && isTrackedPath(projectRoot, path2)
    )) {
      addDiagnostic2(
        doctorReport,
        diagnostic(
          "GENERATED_DOCS_OUTPUT_CHANGED",
          "Generated Docs Hub output must not be edited or committed; update source documentation instead.",
          path,
          catalog.project.id
        )
      );
    }
    result.materialPaths = classifyMaterialPaths(
      result.changedPaths,
      result.statePath,
      continuousDocumentationPaths(catalog)
    );
    if (result.materialPaths.length > 0 && (!result.statePath || !result.changedPaths.includes(result.statePath))) {
      addDiagnostic2(
        doctorReport,
        diagnostic(
          "MATERIAL_CHANGE_MISSING_PROJECT_STATE",
          "Material changes require the canonical project state path in the same selected change set.",
          result.statePath ?? "project_docs.state",
          catalog.project.id
        )
      );
    }
    result.doctor = {
      summary: doctorReport.summary,
      diagnostics: [...doctorReport.diagnostics]
    };
    if (doctorReport.status === "fail") return result;
    const temporaryParent = mkdtempSync(
      join(tmpdir(), "forgewright-docs-gate-")
    );
    try {
      const outputDir = join(temporaryParent, "site");
      buildDocsHub([catalog], outputDir);
      result.verifiedOutputPaths = verifyOutput(outputDir, catalog);
    } finally {
      rmSync(temporaryParent, { recursive: true, force: true });
    }
    result.status = "pass";
    return result;
  } catch (error2) {
    const item = diagnostic(
      error2 instanceof DocsGateError ? error2.code : "DOCS_GATE_FAILED",
      error2 instanceof Error ? error2.message : String(error2),
      void 0,
      catalog?.project.id
    );
    if (doctorReport) {
      addDiagnostic2(doctorReport, item);
      result.doctor = {
        summary: doctorReport.summary,
        diagnostics: [...doctorReport.diagnostics]
      };
    } else {
      result.doctor.diagnostics.push(item);
    }
    return result;
  } finally {
    if (selectedView?.temporaryParent) {
      rmSync(selectedView.temporaryParent, { recursive: true, force: true });
    }
  }
}
function canonicalPotentialPath(input) {
  const absolute = resolve(input);
  let existing = absolute;
  const missingSegments = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    missingSegments.unshift(basename(existing));
    existing = parent;
  }
  const canonicalExisting = existsSync(existing) ? realpathSync(existing) : existing;
  return resolve(canonicalExisting, ...missingSegments);
}
function ensureOutside(outputDir, roots) {
  const output2 = canonicalPotentialPath(outputDir);
  for (const root of roots) {
    const canonicalRoot = realpathSync(root);
    if (isPathInside(canonicalRoot, output2)) {
      throw new Error(`Obsidian output must be outside project root: ${root}`);
    }
  }
}
function obsidianPath(projectId, sourcePath) {
  return join(projectId, sourcePath);
}
function safeDestination2(outputDir, child) {
  const root = resolve(outputDir);
  const target = resolve(child);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Obsidian output path escapes output directory: ${child}`);
  }
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of ["", ...segments]) {
    current = segment ? join(current, segment) : current;
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(
          `Refusing Obsidian output destination because it contains a symlink: ${current}`
        );
      }
    } catch (error2) {
      if (error2.code === "ENOENT") break;
      if (error2 instanceof Error && error2.message.startsWith("Refusing ")) {
        throw error2;
      }
      throw new Error(
        `Unable to inspect Obsidian output destination: ${current}`,
        { cause: error2 }
      );
    }
  }
  return target;
}
function exportObsidianVault(catalogs, outputDirInput) {
  const orderedCatalogs = [...catalogs].sort(
    (left, right) => left.project.id.localeCompare(right.project.id)
  );
  const outputDir = resolve(outputDirInput);
  ensureOutside(
    outputDir,
    orderedCatalogs.map((catalog) => catalog.project.root)
  );
  const safeOutputDir = safeDestination2(outputDir, outputDir);
  mkdirSync(safeOutputDir, { recursive: true });
  const files = [];
  const write = (path, content) => {
    const safePath = safeDestination2(outputDir, path);
    mkdirSync(dirname(safePath), { recursive: true });
    safeDestination2(outputDir, safePath);
    writeFileSync(safePath, content, "utf8");
    files.push(safePath);
  };
  write(
    join(outputDir, "README.md"),
    `# Forgewright Docs Hub

${orderedCatalogs.map((catalog) => `- [[${catalog.project.id}/index|${catalog.project.title}]]`).join("\n")}
`
  );
  for (const catalog of orderedCatalogs) {
    const byId = new Map(
      catalog.documents.map((document) => [document.id, document])
    );
    write(
      join(outputDir, catalog.project.id, "index.md"),
      `# ${catalog.project.title}

${catalog.documents.map((document) => `- [[${document.sourcePath.replace(/\.md$/i, "")}|${document.title}]]`).join("\n")}
`
    );
    for (const document of catalog.documents) {
      const destination2 = join(
        outputDir,
        obsidianPath(catalog.project.id, document.sourcePath)
      );
      let content = document.content;
      for (const link2 of document.links) {
        if (link2.resolvedDocumentId && link2.target.startsWith("forgewright://")) {
          const target = byId.get(link2.resolvedDocumentId) ?? orderedCatalogs.flatMap((item) => item.documents).find((item) => item.id === link2.resolvedDocumentId);
          if (target) {
            const original = `[${link2.label}](${link2.target})`;
            const obsidian = `[[${target.projectId}/${target.sourcePath.replace(/\.md$/i, "")}|${link2.label}]]`;
            content = content.split(original).join(obsidian);
          }
        }
      }
      const nav = `> [!info] Forgewright Docs Hub
> Project: [[${catalog.project.id}/index|${catalog.project.title}]] \xB7 Source: \`${document.sourcePath}\`

`;
      write(
        destination2,
        document.format === "markdown" ? nav + content : content
      );
    }
    for (const asset of catalog.assets) {
      const target = join(
        outputDir,
        asset.route.replace(
          /^projects\/[^/]+\/assets\//,
          `${catalog.project.id}/`
        )
      );
      const safeTarget = safeDestination2(outputDir, target);
      mkdirSync(dirname(safeTarget), { recursive: true });
      safeDestination2(outputDir, safeTarget);
      copyFileSync(join(catalog.project.root, asset.sourcePath), safeTarget);
      files.push(safeTarget);
    }
  }
  return {
    outputDir,
    projects: orderedCatalogs.length,
    filesWritten: files.length
  };
}
var registrySchema = z.object({
  schema_version: z.literal(DOCS_SCHEMA_VERSION),
  projects: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      root: z.string().min(1),
      manifest: z.string().nullable()
    }).strict()
  )
}).strict();
function getDocsHubHome() {
  const configured = process.env.FORGEWRIGHT_HOME?.trim();
  return configured ? resolve(configured) : join(homedir(), ".forgewright");
}
function getRegistryPath() {
  return join(getDocsHubHome(), "docs-hub", "projects.json");
}
function loadRegistry(path = getRegistryPath()) {
  if (!existsSync(path)) {
    return { schema_version: DOCS_SCHEMA_VERSION, projects: [] };
  }
  const parsed = registrySchema.safeParse(
    JSON.parse(readFileSync(path, "utf8"))
  );
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid docs registry at ${path}: ${details}`);
  }
  return {
    ...parsed.data,
    projects: [...parsed.data.projects].sort(
      (left, right) => left.id.localeCompare(right.id)
    )
  };
}
function saveRegistry(registry, path = getRegistryPath()) {
  mkdirSync(join(path, ".."), { recursive: true });
  const normalized = {
    schema_version: DOCS_SCHEMA_VERSION,
    projects: [...registry.projects].sort(
      (left, right) => left.id.localeCompare(right.id)
    )
  };
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
}
function addRegistryProject(projectRootInput, path = getRegistryPath()) {
  const root = canonicalProjectRoot(projectRootInput);
  const loaded = loadManifest(root);
  const project = {
    id: loaded.manifest.project.id,
    title: loaded.manifest.project.title,
    root,
    manifest: loaded.manifestPath ? realpathSync(loaded.manifestPath) : null
  };
  const registry = loadRegistry(path);
  const rootIndex = registry.projects.findIndex((entry) => entry.root === root);
  const idIndex = registry.projects.findIndex(
    (entry) => entry.id === project.id
  );
  if (idIndex >= 0 && registry.projects[idIndex].root !== root) {
    throw new Error(
      `Docs project id "${project.id}" is already registered for ${registry.projects[idIndex].root}. Choose a unique project.id in .forgewright/docs-manifest.json.`
    );
  }
  const status = rootIndex >= 0 ? "updated" : "added";
  if (rootIndex >= 0) {
    registry.projects[rootIndex] = project;
  } else {
    registry.projects.push(project);
  }
  saveRegistry(registry, path);
  return { project, status };
}
function removeRegistryProject(idOrPath, path = getRegistryPath()) {
  const registry = loadRegistry(path);
  let canonicalInput = null;
  if (existsSync(idOrPath)) {
    canonicalInput = realpathSync(idOrPath);
  }
  const index = registry.projects.findIndex(
    (entry) => entry.id === idOrPath || entry.root === canonicalInput
  );
  if (index < 0) {
    return null;
  }
  const [removed] = registry.projects.splice(index, 1);
  saveRegistry(registry, path);
  return removed;
}
function resolveRegistryProject(idOrPath, path = getRegistryPath()) {
  if (existsSync(idOrPath)) {
    const root = realpathSync(idOrPath);
    const manifest = loadManifest(root);
    return {
      id: manifest.manifest.project.id,
      title: manifest.manifest.project.title,
      root,
      manifest: manifest.manifestPath
    };
  }
  return loadRegistry(path).projects.find((entry) => entry.id === idOrPath) ?? null;
}

// src/commands/docs.ts
var PRIVACY_BLOCKING_CODES = /* @__PURE__ */ new Set([
  "EMPTY_PRIVACY_ALLOWLIST",
  "PATH_CONTAINMENT_FAILED",
  "SENSITIVE_SOURCE_REJECTED"
]);
function useJson(program, options) {
  return Boolean(options.json || program.opts().json || !process.stdout.isTTY);
}
function writeSuccess(tool, data, json, startedAt) {
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        buildEnvelope(tool, data, {
          ok: true,
          duration_ms: Date.now() - startedAt,
          version: VERSION
        })
      )}
`
    );
    return;
  }
  process.stdout.write(`${pc7.green("\u2713")} ${tool}
`);
  if (data && typeof data === "object") {
    process.stdout.write(`${JSON.stringify(data, null, 2)}
`);
  }
}
function writeFailure(tool, message, details, json, startedAt, exitCode = EXIT_CODES.CONFIG_ERROR) {
  const envelope = buildEnvelope(tool, details, {
    ok: false,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
    error: { code: exitCode, message, details }
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(envelope)}
`);
  } else {
    process.stderr.write(`${pc7.red("Error:")} ${message}
`);
  }
  process.exitCode = exitCode;
}
function writeGateSuccess(result, json, startedAt) {
  if (json) {
    writeSuccess("forge.docs.gate", result, true, startedAt);
    return;
  }
  process.stdout.write(
    `${pc7.green("\u2713")} forge.docs.gate (${result.mode}): ${result.changedPaths.length} changed, ${result.materialPaths.length} material, ${result.verifiedOutputPaths.length} outputs verified
`
  );
}
function resolveProjectRoots(target, all) {
  if (all) {
    return loadRegistry().projects.map((project) => project.root);
  }
  const input = target ?? process.cwd();
  if (existsSync(input)) {
    return [resolve(input)];
  }
  const registered = resolveRegistryProject(input);
  if (!registered) {
    throw new Error(
      `Unknown project "${input}". Pass a path or add it with \`forge docs registry add\`.`
    );
  }
  return [registered.root];
}
function scanRoots(roots) {
  const catalogs = [];
  const failures = [];
  for (const root of roots) {
    try {
      catalogs.push(scanProject(root));
    } catch (error2) {
      failures.push({
        root,
        message: error2 instanceof Error ? error2.message : String(error2)
      });
    }
  }
  resolveCatalogLinks(catalogs);
  for (const catalog of catalogs) refreshCatalogSummary(catalog);
  return { catalogs, failures };
}
function hasPrivacyBlock(catalog) {
  return catalog.diagnostics.some(
    (diagnostic2) => diagnostic2.severity === "error" && PRIVACY_BLOCKING_CODES.has(diagnostic2.code)
  );
}
function defaultBuildOutput(roots, all) {
  return all || roots.length !== 1 ? join(getDocsHubHome(), "docs-hub", "site") : join(roots[0], ".forgewright", "docs-hub", "site");
}
function executeDocsBuild(roots, output2, options = {}) {
  const scanned = scanRoots(roots);
  const blocked = scanned.catalogs.filter(hasPrivacyBlock);
  const strictFailures = options.strict ? scanned.catalogs.filter(
    (catalog) => catalog.diagnostics.some(
      (diagnostic2) => diagnostic2.severity === "warning" || diagnostic2.severity === "error"
    )
  ) : [];
  const rejectedIds = /* @__PURE__ */ new Set([
    ...blocked.map((catalog) => catalog.project.id),
    ...strictFailures.map((catalog) => catalog.project.id)
  ]);
  const buildable = scanned.catalogs.filter(
    (catalog) => !rejectedIds.has(catalog.project.id)
  );
  for (const catalog of buildable) writeCatalog(catalog);
  return {
    buildResult: buildable.length > 0 ? buildDocsHub(buildable, resolve(output2)) : null,
    failures: scanned.failures,
    blockedProjects: blocked.map((catalog) => catalog.project.id),
    strictProjects: strictFailures.map((catalog) => catalog.project.id)
  };
}
function registerDocsCommands(program) {
  const docs = program.command("docs").description(
    "Build a privacy-safe, local-first multi-project documentation hub"
  );
  docs.command("gate [target]").description("Require docs continuity for the selected Git change view").option("--staged", "Check staged Git changes").option("--worktree", "Check staged, unstaged, and untracked changes").option("--base-ref <ref>", "Check changes from <ref> to HEAD").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const result = runDocsGate(target ?? process.cwd(), {
        staged: options.staged,
        worktree: options.worktree,
        baseRef: options.baseRef
      });
      if (result.status === "fail") {
        const blockingDiagnostic = result.doctor.diagnostics.find(
          (diagnostic2) => diagnostic2.severity === "error"
        ) ?? result.doctor.diagnostics[0];
        writeFailure(
          "forge.docs.gate",
          blockingDiagnostic ? `Documentation continuity gate failed (${blockingDiagnostic.code}): ${blockingDiagnostic.message}` : "Documentation continuity gate failed.",
          result,
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      writeGateSuccess(result, json, startedAt);
    } catch (error2) {
      writeFailure(
        "forge.docs.gate",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt,
        EXIT_CODES.TOOL_ERROR
      );
    }
  });
  docs.command("init [target]").description("Create a project docs manifest without moving source files").option("-f, --force", "Overwrite an existing manifest").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const result = initManifest(target ?? process.cwd(), {
        force: options.force
      });
      writeSuccess("forge.docs.init", result, json, startedAt);
    } catch (error2) {
      writeFailure(
        "forge.docs.init",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt
      );
    }
  });
  const registry = docs.command("registry").description("Manage the global Docs Hub project registry");
  registry.command("add <path>").description("Register or update a project root").option("-j, --json", "Output as JSON").action((path, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      writeSuccess(
        "forge.docs.registry.add",
        addRegistryProject(path),
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure(
        "forge.docs.registry.add",
        error2 instanceof Error ? error2.message : String(error2),
        { path },
        json,
        startedAt
      );
    }
  });
  registry.command("list").description("List registered projects").option("-j, --json", "Output as JSON").action((options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      writeSuccess(
        "forge.docs.registry.list",
        loadRegistry(),
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure(
        "forge.docs.registry.list",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt
      );
    }
  });
  registry.command("remove <id-or-path>").description("Remove a project from the registry").option("-j, --json", "Output as JSON").action((idOrPath, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const removed = removeRegistryProject(idOrPath);
      if (!removed) {
        writeFailure(
          "forge.docs.registry.remove",
          `Project is not registered: ${idOrPath}`,
          { idOrPath },
          json,
          startedAt
        );
        return;
      }
      writeSuccess(
        "forge.docs.registry.remove",
        { removed },
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure(
        "forge.docs.registry.remove",
        error2 instanceof Error ? error2.message : String(error2),
        { idOrPath },
        json,
        startedAt
      );
    }
  });
  docs.command("scan [target]").description("Scan approved sources and write a normalized JSON catalog").option("--all", "Scan every registered project").option("--no-write", "Do not write project cache files").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const roots = resolveProjectRoots(target, options.all);
      const result = scanRoots(roots);
      const catalogs = result.catalogs.map((catalog) => ({
        project: catalog.project,
        documents: catalog.documents.length,
        assets: catalog.assets.length,
        diagnostics: catalog.diagnostics,
        sourceFingerprint: catalog.sourceFingerprint,
        catalogPath: options.write === false ? null : writeCatalog(catalog)
      }));
      if (result.failures.length > 0) {
        writeFailure(
          "forge.docs.scan",
          "One or more projects could not be scanned.",
          { catalogs, failures: result.failures },
          json,
          startedAt
        );
        return;
      }
      writeSuccess("forge.docs.scan", { catalogs }, json, startedAt);
    } catch (error2) {
      writeFailure(
        "forge.docs.scan",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt
      );
    }
  });
  docs.command("build [target]").description("Build the static HTML/CSS Docs Hub").option("--all", "Build every registered project").option("-o, --output <path>", "Override the generated site directory").option("--strict", "Fail before building when warnings or errors exist").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const roots = resolveProjectRoots(target, options.all);
      const output2 = resolve(
        options.output ?? defaultBuildOutput(roots, options.all)
      );
      const execution = executeDocsBuild(roots, output2, {
        strict: options.strict
      });
      if (!execution.buildResult) {
        writeFailure(
          "forge.docs.build",
          "No buildable projects were found.",
          {
            failures: execution.failures,
            blockedProjects: execution.blockedProjects,
            strictProjects: execution.strictProjects
          },
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      if (execution.failures.length > 0 || execution.blockedProjects.length > 0 || execution.strictProjects.length > 0) {
        writeFailure(
          "forge.docs.build",
          "Docs Hub built the valid projects, but one or more projects failed.",
          {
            partialBuild: execution.buildResult,
            failures: execution.failures,
            blockedProjects: execution.blockedProjects,
            strictProjects: execution.strictProjects
          },
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      writeSuccess(
        "forge.docs.build",
        execution.buildResult,
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure(
        "forge.docs.build",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt,
        EXIT_CODES.TOOL_ERROR
      );
    }
  });
  docs.command("doctor [target]").description(
    "Diagnose documentation links, privacy, diagrams and staleness"
  ).option("--all", "Diagnose every registered project").option("--strict", "Treat warnings as failures").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const roots = resolveProjectRoots(target, options.all);
      const scanned = scanRoots(roots);
      const reports = scanned.catalogs.map(
        (catalog) => doctorCatalog(catalog, readCatalog(catalog.project.root), {
          strict: options.strict
        })
      );
      const failed = scanned.failures.length > 0 || reports.some((report) => report.status === "fail");
      if (failed) {
        writeFailure(
          "forge.docs.doctor",
          "Documentation health checks failed.",
          { reports, failures: scanned.failures },
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      writeSuccess(
        "forge.docs.doctor",
        { reports, failures: scanned.failures },
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure(
        "forge.docs.doctor",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt,
        EXIT_CODES.TOOL_ERROR
      );
    }
  });
  const exportCommand = docs.command("export").description("Export approved documentation to optional formats");
  exportCommand.command("obsidian [target]").description("Export a source-preserving Obsidian vault").option("--all", "Export every registered project").option("-o, --output <path>", "Override the external vault directory").option("--strict", "Fail when warnings or errors exist").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const roots = resolveProjectRoots(target, options.all);
      const scanned = scanRoots(roots);
      const blocked = scanned.catalogs.filter(hasPrivacyBlock);
      const strictFailures = options.strict ? scanned.catalogs.filter(
        (catalog) => catalog.diagnostics.some(
          (diagnostic2) => diagnostic2.severity === "warning" || diagnostic2.severity === "error"
        )
      ) : [];
      if (scanned.failures.length > 0 || blocked.length > 0 || strictFailures.length > 0) {
        writeFailure(
          "forge.docs.export.obsidian",
          "Obsidian export was blocked by diagnostics.",
          {
            failures: scanned.failures,
            blockedProjects: blocked.map((catalog) => catalog.project.id),
            strictProjects: strictFailures.map(
              (catalog) => catalog.project.id
            )
          },
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      const output2 = resolve(
        options.output ?? join(getDocsHubHome(), "docs-hub", "obsidian")
      );
      writeSuccess(
        "forge.docs.export.obsidian",
        exportObsidianVault(scanned.catalogs, output2),
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure(
        "forge.docs.export.obsidian",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt,
        EXIT_CODES.TOOL_ERROR
      );
    }
  });
}
function runBootstrapProcess(command, args, options = {}) {
  const timeout = options.timeout ?? 26e4;
  const maximum = options.maximum ?? 8 * 1024 * 1024;
  return new Promise((resolve16, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      cwd: options.cwd,
      shell: false,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let failure = null;
    let killTimer;
    let closed = false;
    const signalGroup = (signal) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error2) {
        if (error2.code !== "ESRCH") failure ??= error2;
      }
    };
    const stop = (reason) => {
      if (closed || failure) return;
      failure = new Error(reason);
      signalGroup("SIGTERM");
      killTimer = setTimeout(() => signalGroup("SIGKILL"), 8e3);
    };
    const onTerm = () => stop("Bootstrap interrupted by SIGTERM");
    const onInt = () => stop("Bootstrap interrupted by SIGINT");
    process.on("SIGTERM", onTerm);
    process.on("SIGINT", onInt);
    const timer = setTimeout(
      () => stop("Bootstrap process timed out"),
      timeout
    );
    const collect = (chunk, isError) => {
      bytes += chunk.length;
      if (bytes > maximum) {
        stop("Bootstrap output exceeded safety bound");
        return;
      }
      if (isError) stderr += chunk.toString("utf8");
      else stdout += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => collect(chunk, false));
    child.stderr.on("data", (chunk) => collect(chunk, true));
    child.once("error", (error2) => {
      failure = error2;
    });
    child.once("close", async (status) => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      process.removeListener("SIGTERM", onTerm);
      process.removeListener("SIGINT", onInt);
      if (child.pid && process.platform !== "win32") {
        const alive = () => {
          try {
            process.kill(-child.pid, 0);
            return true;
          } catch (error2) {
            return error2.code !== "ESRCH";
          }
        };
        if (alive()) {
          failure ??= new Error(
            "Bootstrap adapter left an unsettled process group"
          );
          signalGroup("SIGTERM");
          const deadline = Date.now() + 2e3;
          while (alive() && Date.now() < deadline)
            await new Promise((r) => setTimeout(r, 25));
          if (alive()) {
            signalGroup("SIGKILL");
            const finalDeadline = Date.now() + 2e3;
            while (alive() && Date.now() < finalDeadline)
              await new Promise((r) => setTimeout(r, 25));
            if (alive())
              failure = new Error("Bootstrap process cleanup unconfirmed");
          }
        }
      }
      if (failure) reject(failure);
      else resolve16({ status, stdout, stderr });
    });
  });
}
var BOOTSTRAP_POLICY_SCHEMA = "forgewright-bootstrap-policy/v1";
var BOOTSTRAP_STATE_SCHEMA = "forgewright-project-bootstrap/v1";
var BOOTSTRAP_MODES = ["plugin", "automation", "full"];
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function normalizeRoot(input) {
  const absolute = resolve(input);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  return parent === absolute ? absolute : join(normalizeRoot(parent), basename(absolute));
}
function assertSafeBootstrapPath(path) {
  let current = path;
  while (true) {
    try {
      const info = lstatSync(current);
      if (info.isSymbolicLink() || current !== path && !info.isDirectory() || current === path && (!info.isFile() || info.nlink > 1)) {
        throw new Error(
          "Unsafe bootstrap state file or symlink ancestry: " + path
        );
      }
    } catch (error2) {
      if (error2.code !== "ENOENT") throw error2;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function isUnder(root, parent) {
  const normalizedRoot = normalizeRoot(root);
  const normalizedParent = normalizeRoot(parent);
  return normalizedRoot === normalizedParent || normalizedRoot.startsWith(
    normalizedParent + (process.platform === "win32" ? "\\" : "/")
  );
}
function getBootstrapHome() {
  const explicit = process.env.FORGEWRIGHT_BOOTSTRAP_HOME?.trim();
  if (explicit) return normalizeRoot(explicit);
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return xdg ? normalizeRoot(join(xdg, "forgewright")) : normalizeRoot(join(homedir(), ".config", "forgewright"));
}
function getBootstrapPolicyPath() {
  return join(getBootstrapHome(), "bootstrap-policy.json");
}
function getBootstrapLauncherPath() {
  return join(
    getBootstrapHome(),
    "bin",
    process.platform === "win32" ? "forge.cmd" : "forge"
  );
}
function shellSingleQuote(value) {
  return "'" + value.replaceAll("'", `'"'"'`) + "'";
}
function resolveBootstrapPython() {
  const configured = process.env.FORGEWRIGHT_BOOTSTRAP_PYTHON?.trim();
  const candidates = configured ? [configured] : ["python3", "python"];
  for (const candidate of candidates) {
    const probe = spawnSync(
      candidate,
      [
        "-I",
        "-c",
        "import json,sys; import tomllib; assert sys.version_info >= (3,11); print(json.dumps(sys.executable))"
      ],
      { encoding: "utf8", shell: false, timeout: 3e3 }
    );
    if (probe.error || probe.status !== 0) continue;
    try {
      const executable = JSON.parse(probe.stdout.trim());
      if (typeof executable === "string" && isAbsolute(executable) && existsSync(executable) && !/[\r\n\0]/.test(executable))
        return executable;
    } catch {
    }
  }
  throw new Error(
    "Python 3.11+ with tomllib is required. Re-run bootstrap policy set from the configured shared-runtime environment."
  );
}
function bootstrapGitDirectory() {
  if (process.platform !== "darwin") return null;
  const selected = (process.env.PATH ?? "").split(":").map((directory) => join(directory, "git")).find((candidate) => existsSync(candidate));
  if (!selected || realpathSync(selected) !== "/usr/bin/git") return null;
  const probe = spawnSync("/usr/bin/xcrun", ["--find", "git"], {
    encoding: "utf8",
    shell: false,
    timeout: 3e3
  });
  const executable = probe.status === 0 ? probe.stdout.trim() : "";
  return isAbsolute(executable) && !/[\r\n\0]/.test(executable) && existsSync(executable) ? dirname(executable) : null;
}
function installBootstrapLauncher(policy) {
  const cliEntry = join(
    policy.forgewright_root,
    "src",
    "cli",
    "dist",
    "index.js"
  );
  if (!existsSync(cliEntry)) {
    throw new Error(
      "Built Forge CLI is required at " + cliEntry + "; run npm run build:cli once in the shared Forgewright runtime."
    );
  }
  const lightEntry = join(dirname(cliEntry), "bootstrap-entry.js");
  const launcherEntry = existsSync(lightEntry) ? lightEntry : cliEntry;
  const python = policy.mode === "plugin" ? null : resolveBootstrapPython();
  const gitDirectory = bootstrapGitDirectory();
  const pinnedPath = [
    dirname(process.execPath),
    ...python ? [dirname(python)] : [],
    ...gitDirectory ? [gitDirectory] : []
  ].join(process.platform === "win32" ? ";" : ":");
  const launcher = getBootstrapLauncherPath();
  assertSafeBootstrapPath(launcher);
  mkdirSync(dirname(launcher), { recursive: true, mode: 448 });
  const content = process.platform === "win32" ? "@echo off\r\nsetlocal DisableDelayedExpansion\r\n" + (python ? 'set "FORGEWRIGHT_BOOTSTRAP_PYTHON=' + python.replaceAll("%", "%%") + '"\r\n' : "") + 'set "PATH=' + pinnedPath.replaceAll("%", "%%") + ';%PATH%"\r\n"' + process.execPath.replaceAll("%", "%%") + '" "' + launcherEntry.replaceAll("%", "%%") + '" %*\r\n' : "#!/bin/sh\n" + (python ? "export FORGEWRIGHT_BOOTSTRAP_PYTHON=" + shellSingleQuote(python) + "\n" : "") + "export PATH=" + shellSingleQuote(pinnedPath) + ':"${PATH:-/usr/bin:/bin}"\nexec ' + shellSingleQuote(process.execPath) + " " + shellSingleQuote(launcherEntry) + ' "$@"\n';
  assertSafeBootstrapPath(launcher);
  const temporary = launcher + "." + randomBytes(8).toString("hex") + ".tmp";
  writeFileSync(temporary, content, {
    encoding: "utf8",
    mode: 448,
    flag: "wx"
  });
  renameSync(temporary, launcher);
  if (process.platform !== "win32") chmodSync(launcher, 448);
  return launcher;
}
function getProjectBootstrapPath(projectRoot) {
  return join(normalizeRoot(projectRoot), ".forgewright", "bootstrap.json");
}
function ancestorForgewrightRoot(input) {
  let current = normalizeRoot(input);
  while (true) {
    if (existsSync(join(current, "package.json")) && existsSync(join(current, "skills")) && existsSync(join(current, "scripts"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
function resolveForgewrightRoot(input) {
  const candidates = [
    input,
    process.env.FORGEWRIGHT_ROOT,
    dirname(fileURLToPath(import.meta.url)),
    process.cwd()
  ].filter((value) => Boolean(value));
  for (const candidate of candidates) {
    const root = ancestorForgewrightRoot(candidate);
    if (root) return root;
  }
  throw new Error(
    "Forgewright root not found. Set FORGEWRIGHT_ROOT or run from a full Forgewright installation."
  );
}
function currentForgewrightCommit(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
    timeout: 1500,
    shell: false
  });
  const value = result.status === 0 ? result.stdout.trim() : "";
  return /^[0-9a-f]{40}$/.test(value) ? value : null;
}
function safeJsonRead(path, maximum = 1024 * 1024) {
  assertSafeBootstrapPath(path);
  if (!existsSync(path)) return null;
  const info = lstatSync(path);
  if (info.isSymbolicLink() || info.nlink > 1 || !info.isFile() || info.size > maximum) {
    throw new Error("Unsafe bootstrap state file: " + path);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}
function stringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(field + " must be an array of strings");
  }
  return value;
}
function parseMode(value) {
  if (typeof value !== "string" || !BOOTSTRAP_MODES.includes(value)) {
    throw new Error("Invalid bootstrap mode: " + String(value));
  }
  return value;
}
function loadBootstrapPolicy(path = getBootstrapPolicyPath()) {
  const raw = safeJsonRead(path, 128 * 1024);
  if (raw === null) return null;
  if (typeof raw !== "object" || raw === null)
    throw new Error("Bootstrap policy must be an object");
  const value = raw;
  if (value.schema !== BOOTSTRAP_POLICY_SCHEMA)
    throw new Error("Bootstrap policy schema mismatch");
  if (typeof value.enabled !== "boolean" || typeof value.auto !== "boolean") {
    throw new Error("Bootstrap policy enabled/auto must be booleans");
  }
  const clients = stringArray(value.mcp_clients, "mcp_clients");
  if (clients.some((item) => item !== "codex" && item !== "claude-code")) {
    throw new Error("Unsupported MCP client in bootstrap policy");
  }
  if (value.pi_policy !== "existing-subscription-only" && value.pi_policy !== "disabled") {
    throw new Error("Unsupported Pi policy");
  }
  if (typeof value.forgewright_root !== "string" || !isAbsolute(value.forgewright_root)) {
    throw new Error("forgewright_root must be absolute");
  }
  if (typeof value.created_at !== "string" || typeof value.updated_at !== "string" || typeof value.auto_update !== "boolean" || !(typeof value.pi_model === "string" || value.pi_model === null)) {
    throw new Error("Bootstrap policy fields are malformed");
  }
  return {
    schema: BOOTSTRAP_POLICY_SCHEMA,
    enabled: value.enabled,
    auto: value.auto,
    mode: parseMode(value.mode),
    forgewright_root: normalizeRoot(value.forgewright_root),
    allowed_roots: stringArray(value.allowed_roots, "allowed_roots").map(
      normalizeRoot
    ),
    deny_roots: stringArray(value.deny_roots, "deny_roots").map(normalizeRoot),
    auto_update: value.auto_update,
    mcp_clients: clients,
    pi_policy: value.pi_policy,
    pi_model: value.pi_model,
    created_at: value.created_at,
    updated_at: value.updated_at
  };
}
function loadProjectBootstrapState(projectRoot) {
  const path = getProjectBootstrapPath(projectRoot);
  const raw = safeJsonRead(path);
  if (raw === null) return null;
  if (typeof raw !== "object" || raw === null)
    throw new Error("Bootstrap state must be an object");
  const value = raw;
  if (value.schema !== BOOTSTRAP_STATE_SCHEMA)
    throw new Error("Bootstrap state schema mismatch");
  parseMode(value.mode);
  const statuses = [
    "unmanaged",
    "pending",
    "bootstrapping",
    "ready",
    "degraded",
    "blocked",
    "rolling_back"
  ];
  if (typeof value.status !== "string" || !statuses.includes(value.status)) {
    throw new Error("Invalid bootstrap project status");
  }
  if (typeof value.source_commit !== "string" || !/^[0-9a-f]{40}$/.test(value.source_commit) || typeof value.project_root_digest !== "string" || !/^[0-9a-f]{64}$/.test(value.project_root_digest) || !Array.isArray(value.owned_paths) || !Array.isArray(value.external_config_receipts) || typeof value.components !== "object" || value.components === null || !(typeof value.last_verified_at === "string" || value.last_verified_at === null) || !(typeof value.last_error === "string" || value.last_error === null)) {
    throw new Error("Malformed bootstrap project state");
  }
  if (value.project_root_digest !== projectRootDigest(projectRoot)) {
    throw new Error("Foreign bootstrap state: project root digest mismatch");
  }
  return value;
}
function atomicWriteJson(path, value) {
  assertSafeBootstrapPath(path);
  mkdirSync(dirname(path), { recursive: true, mode: 448 });
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || info.nlink > 1 || !info.isFile()) {
      throw new Error("Refusing unsafe bootstrap path: " + path);
    }
  }
  const temporary = join(
    dirname(path),
    "." + basename(path) + "." + process.pid + "." + randomBytes(6).toString("hex") + ".tmp"
  );
  const fd = openSync(temporary, "wx", 384);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n", "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  try {
    const directoryFd = openSync(dirname(path), "r");
    try {
      fsyncSync(directoryFd);
    } finally {
      closeSync(directoryFd);
    }
  } catch {
  }
}
function saveBootstrapPolicy(policy) {
  atomicWriteJson(getBootstrapPolicyPath(), policy);
}
function createBootstrapPolicy(input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const root = resolveForgewrightRoot(input.forgewrightRoot);
  const previous = input.previous ?? loadBootstrapPolicy();
  return {
    schema: BOOTSTRAP_POLICY_SCHEMA,
    enabled: true,
    auto: input.mode === "plugin" ? false : input.auto,
    mode: input.mode,
    forgewright_root: root,
    allowed_roots: (input.allowedRoots ?? previous?.allowed_roots ?? []).map(
      normalizeRoot
    ),
    deny_roots: (input.denyRoots ?? previous?.deny_roots ?? []).map(
      normalizeRoot
    ),
    auto_update: input.autoUpdate ?? previous?.auto_update ?? false,
    mcp_clients: input.mcpClients ?? previous?.mcp_clients ?? [],
    pi_policy: input.piPolicy ?? previous?.pi_policy ?? "existing-subscription-only",
    pi_model: input.piModel === void 0 ? previous?.pi_model ?? null : input.piModel,
    created_at: previous?.created_at ?? now,
    updated_at: now
  };
}
function setBootstrapPolicyOff() {
  const previous = loadBootstrapPolicy();
  if (!previous) return null;
  const next = {
    ...previous,
    enabled: false,
    auto: false,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveBootstrapPolicy(next);
  return next;
}
function findRepositoryRoot(start) {
  let current = normalizeRoot(start);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
function rank(mode) {
  return mode === "plugin" ? 0 : mode === "automation" ? 1 : 2;
}
function projectRootDigest(projectRoot) {
  return sha256(normalizeRoot(projectRoot));
}
function preflightBootstrap(target = process.cwd()) {
  const repository = findRepositoryRoot(target);
  if (!repository) {
    return {
      project_root: normalizeRoot(target),
      is_repository: false,
      policy_enabled: false,
      auto_enabled: false,
      desired_mode: null,
      current_mode: null,
      state: "unmanaged",
      action: "none",
      reason: "not_repository",
      source_commit: null,
      target_command: null
    };
  }
  const policy = loadBootstrapPolicy();
  const base2 = {
    project_root: repository,
    is_repository: true,
    policy_enabled: Boolean(policy?.enabled),
    auto_enabled: Boolean(policy?.auto),
    desired_mode: policy?.mode ?? null
  };
  if (!policy) {
    return {
      ...base2,
      current_mode: null,
      state: "unmanaged",
      action: "none",
      reason: "policy_missing",
      source_commit: null,
      target_command: null
    };
  }
  const state = loadProjectBootstrapState(repository);
  const sourceCommit = currentForgewrightCommit(policy.forgewright_root);
  if (!policy.enabled) {
    return {
      ...base2,
      current_mode: state?.mode ?? null,
      state: state?.status ?? "unmanaged",
      action: "none",
      reason: "policy_disabled",
      source_commit: sourceCommit,
      target_command: null
    };
  }
  if (policy.deny_roots.some((root) => isUnder(repository, root))) {
    return {
      ...base2,
      current_mode: state?.mode ?? null,
      state: "blocked",
      action: "blocked",
      reason: "root_denied",
      source_commit: sourceCommit,
      target_command: null
    };
  }
  if (policy.allowed_roots.length > 0 && !policy.allowed_roots.some((root) => isUnder(repository, root))) {
    return {
      ...base2,
      current_mode: state?.mode ?? null,
      state: "blocked",
      action: "blocked",
      reason: "root_not_allowed",
      source_commit: sourceCommit,
      target_command: null
    };
  }
  const targetCommand = "forge bootstrap ensure " + JSON.stringify(repository) + " --auto --json";
  if (policy.mode === "plugin") {
    return {
      ...base2,
      current_mode: state?.mode ?? null,
      state: state?.status ?? "unmanaged",
      action: "none",
      reason: "plugin_mode",
      source_commit: sourceCommit,
      target_command: null
    };
  }
  if (!policy.auto) {
    return {
      ...base2,
      current_mode: state?.mode ?? null,
      state: state?.status ?? "unmanaged",
      action: "none",
      reason: "auto_disabled",
      source_commit: sourceCommit,
      target_command: null
    };
  }
  const disabled = safeJsonRead(
    join(
      getBootstrapHome(),
      "disabled",
      projectRootDigest(repository) + ".json"
    )
  );
  if (disabled !== null) {
    if (typeof disabled !== "object" || !disabled || disabled.schema !== "forgewright-bootstrap-disabled/v1" || disabled.project_root_digest !== projectRootDigest(repository)) {
      throw new Error("Invalid project disable receipt");
    }
    return {
      ...base2,
      current_mode: state?.mode ?? null,
      state: state?.status ?? "unmanaged",
      action: "none",
      reason: "project_disabled",
      source_commit: sourceCommit,
      target_command: null
    };
  }
  if (!state) {
    return {
      ...base2,
      current_mode: null,
      state: "unmanaged",
      action: "ensure",
      reason: "project_unmanaged",
      source_commit: sourceCommit,
      target_command: targetCommand
    };
  }
  if (state.status === "degraded") {
    return {
      ...base2,
      current_mode: state.mode,
      state: state.status,
      action: "none",
      reason: "state_degraded",
      source_commit: sourceCommit,
      target_command: "forge bootstrap repair " + JSON.stringify(repository) + " --json"
    };
  }
  if (state.status === "blocked" || state.status === "rolling_back") {
    return {
      ...base2,
      current_mode: state.mode,
      state: state.status,
      action: "blocked",
      reason: "state_blocked",
      source_commit: sourceCommit,
      target_command: "forge bootstrap explain " + JSON.stringify(repository) + " --json"
    };
  }
  if (state.status === "bootstrapping") {
    return {
      ...base2,
      current_mode: state.mode,
      state: state.status,
      action: "blocked",
      reason: "state_busy",
      source_commit: sourceCommit,
      target_command: null
    };
  }
  if (state.status !== "ready") {
    return {
      ...base2,
      current_mode: state.mode,
      state: state.status,
      action: "ensure",
      reason: "state_not_ready",
      source_commit: sourceCommit,
      target_command: targetCommand
    };
  }
  if (rank(state.mode) < rank(policy.mode)) {
    return {
      ...base2,
      current_mode: state.mode,
      state: state.status,
      action: "ensure",
      reason: "mode_upgrade_required",
      source_commit: sourceCommit,
      target_command: targetCommand
    };
  }
  if (sourceCommit && state.source_commit !== sourceCommit) {
    return {
      ...base2,
      current_mode: state.mode,
      state: state.status,
      action: policy.auto_update ? "ensure" : "none",
      reason: policy.auto_update ? "source_changed" : "source_changed_manual",
      source_commit: sourceCommit,
      target_command: policy.auto_update ? targetCommand : null
    };
  }
  return {
    ...base2,
    current_mode: state.mode,
    state: state.status,
    action: "none",
    reason: "ready",
    source_commit: sourceCommit,
    target_command: null
  };
}

// src/commands/bootstrap.ts
function useJson2(program, options) {
  return Boolean(options.json || program.opts().json || !process.stdout.isTTY);
}
function writeSuccess2(tool, data, json, startedAt) {
  const envelope = buildEnvelope(tool, data, {
    ok: true,
    duration_ms: Date.now() - startedAt,
    version: VERSION
  });
  if (json) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    process.stdout.write(pc7.green("\u2713") + " " + tool + "\n");
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}
function writeFailure2(tool, message, data, json, startedAt, code2 = EXIT_CODES.TOOL_ERROR) {
  const envelope = buildEnvelope(tool, data, {
    ok: false,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
    error: { code: code2, message }
  });
  if (json) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    process.stderr.write(pc7.red("Error:") + " " + message + "\n");
  }
  process.exitCode = code2;
}
function parseCsv(value) {
  if (value === void 0) return void 0;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
function defaultMcpClients(mode) {
  if (mode !== "full") return [];
  const clients = [];
  if (checkCli("codex").available) clients.push("codex");
  if (checkCli("claude").available) clients.push("claude-code");
  return clients;
}
function managerPath() {
  const root = loadBootstrapPolicy()?.forgewright_root;
  if (!root) {
    throw new Error(
      "Global bootstrap policy is not configured; run forge bootstrap policy set first."
    );
  }
  const path = resolve(root, "scripts/runtime/bootstrap_manager.py");
  if (!existsSync(path)) {
    throw new Error(
      "Bootstrap manager is missing from the configured Forgewright root."
    );
  }
  return path;
}
async function runManager(command, target, options) {
  const args = [managerPath(), command, target];
  if (options.mode && (command === "ensure" || command === "repair" || command === "explain")) {
    args.push("--mode", options.mode);
  }
  if (command === "disable" && options.keepProfile) {
    args.push("--keep-profile");
  }
  if (command === "ensure" && options.auto) args.push("--auto");
  const result = await runBootstrapProcess(resolveBootstrapPython(), args, {
    timeout: 26e4,
    env: {
      ...process.env,
      FORGEWRIGHT_CLI_ENTRY: resolve(process.argv[1]),
      FORGEWRIGHT_NODE: process.execPath
    }
  });
  const output2 = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const last = output2.at(-1);
  if (!last) {
    throw new Error(
      result.stderr.trim() || "Bootstrap manager returned no JSON result."
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(last);
  } catch {
    throw new Error(
      "Bootstrap manager returned invalid JSON: " + (result.stderr.trim() || last.slice(-1e3))
    );
  }
  if (typeof parsed !== "object" || parsed === null || !("ok" in parsed) || !("data" in parsed) || !("error" in parsed)) {
    throw new Error("Bootstrap manager response contract mismatch.");
  }
  const response = parsed;
  if (result.status !== 0 || response.ok !== true) {
    return {
      ...response,
      ok: false,
      error: response.error ?? {
        code: "manager_failed",
        message: "Bootstrap manager failed"
      }
    };
  }
  if (command === "verify" && (typeof response.data !== "object" || response.data === null || response.data.ok !== true || response.data.status !== "ready")) {
    return {
      ...response,
      ok: false,
      error: {
        code: "verification_failed",
        message: "Bootstrap verification did not confirm readiness"
      }
    };
  }
  return response;
}
function registerBootstrapCommand(program) {
  const bootstrap = program.command("bootstrap").description(
    "Manage one-time global auto-bootstrap policy and project automation/full runtime state"
  );
  const policy = bootstrap.command("policy").description("Manage global project auto-bootstrap consent");
  const set2 = policy.command("set").description("Enable or update the one-time global bootstrap policy").addOption(
    new Option("--mode <mode>", "Desired default mode").choices(["plugin", "automation", "full"]).makeOptionMandatory()
  ).addOption(
    new Option("--auto <on|off>", "Automatic project bootstrap").choices(["on", "off"]).makeOptionMandatory()
  ).option(
    "--allow-root <path...>",
    "Only bootstrap projects under these roots"
  ).option(
    "--deny-root <path...>",
    "Never bootstrap projects under these roots"
  ).option("--auto-update", "Allow source-version migration during ensure").option(
    "--mcp-clients <csv>",
    "Full-mode clients to configure: codex,claude-code"
  ).addOption(
    new Option("--pi-policy <policy>", "Pi bootstrap policy").choices([
      "existing-subscription-only",
      "disabled"
    ])
  ).option("--pi-model <model>", "Optional exact OpenAI-Codex model for Pi").option("--forgewright-root <path>", "Full Forgewright runtime root").option("-j, --json", "Output as JSON");
  set2.action((options) => {
    const startedAt = Date.now();
    const json = useJson2(program, options);
    try {
      const requestedClients = parseCsv(options.mcpClients);
      const clients = requestedClients ?? defaultMcpClients(options.mode);
      if (clients.some((client) => client !== "codex" && client !== "claude-code")) {
        throw new Error("mcp-clients supports only codex,claude-code");
      }
      const next = createBootstrapPolicy({
        mode: options.mode,
        auto: options.auto === "on",
        forgewrightRoot: options.forgewrightRoot,
        allowedRoots: options.allowRoot,
        denyRoots: options.denyRoot,
        autoUpdate: options.autoUpdate,
        mcpClients: clients,
        piPolicy: options.piPolicy,
        piModel: options.piModel ?? void 0
      });
      const launcher = installBootstrapLauncher(next);
      saveBootstrapPolicy(next);
      writeSuccess2(
        "forge.bootstrap.policy.set",
        { path: getBootstrapPolicyPath(), launcher, policy: next },
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure2(
        "forge.bootstrap.policy.set",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt,
        EXIT_CODES.CONFIG_ERROR
      );
    }
  });
  policy.command("status").description("Show the global bootstrap policy").option("-j, --json", "Output as JSON").action((options) => {
    const startedAt = Date.now();
    const json = useJson2(program, options);
    try {
      const loaded = loadBootstrapPolicy();
      writeSuccess2(
        "forge.bootstrap.policy.status",
        {
          path: getBootstrapPolicyPath(),
          configured: loaded !== null,
          policy: loaded
        },
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure2(
        "forge.bootstrap.policy.status",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt,
        EXIT_CODES.CONFIG_ERROR
      );
    }
  });
  policy.command("off").description("Disable automatic bootstrap without deleting project state").option("-j, --json", "Output as JSON").action((options) => {
    const startedAt = Date.now();
    const json = useJson2(program, options);
    try {
      const next = setBootstrapPolicyOff();
      writeSuccess2(
        "forge.bootstrap.policy.off",
        {
          path: getBootstrapPolicyPath(),
          configured: next !== null,
          policy: next
        },
        json,
        startedAt
      );
    } catch (error2) {
      writeFailure2(
        "forge.bootstrap.policy.off",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt,
        EXIT_CODES.CONFIG_ERROR
      );
    }
  });
  bootstrap.command("preflight [target]").description("Run the cheap local auto-bootstrap decision without mutation").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson2(program, options);
    try {
      const data = preflightBootstrap(target ?? process.cwd());
      writeSuccess2("forge.bootstrap.preflight", data, json, startedAt);
    } catch (error2) {
      writeFailure2(
        "forge.bootstrap.preflight",
        error2 instanceof Error ? error2.message : String(error2),
        null,
        json,
        startedAt,
        EXIT_CODES.CONFIG_ERROR
      );
    }
  });
  for (const command of [
    "status",
    "verify",
    "explain",
    "ensure",
    "repair"
  ]) {
    const builder = bootstrap.command(command + " [target]").description(
      command === "status" ? "Show project bootstrap state" : command === "verify" ? "Verify owned project bootstrap state and source version" : command === "explain" ? "Show planned bootstrap actions without mutation" : command === "repair" ? "Re-run owned bootstrap stages to repair drift" : "Ensure a project reaches automation/full mode idempotently"
    ).option("-j, --json", "Output as JSON");
    if (command === "ensure" || command === "repair" || command === "explain") {
      builder.addOption(
        new Option("--mode <mode>", "Override policy mode").choices([
          "automation",
          "full"
        ])
      );
    }
    if (command === "ensure") {
      builder.option(
        "--auto",
        "Require global auto-bootstrap consent for this invocation"
      );
    }
    builder.action(
      async (target, options) => {
        const startedAt = Date.now();
        const json = useJson2(program, options);
        try {
          if (command === "ensure" && options.auto) {
            const decision = preflightBootstrap(target ?? process.cwd());
            if (!decision.policy_enabled || !decision.auto_enabled) {
              throw new Error(
                "Auto-bootstrap is not enabled by the global policy; explicit ensure without --auto is still available."
              );
            }
            if (decision.action === "blocked") {
              throw new Error(
                "Auto-bootstrap is blocked by root policy: " + decision.reason
              );
            }
            if (options.mode && options.mode !== decision.desired_mode) {
              throw new Error(
                "Automatic bootstrap cannot override the globally consented mode"
              );
            }
            if (decision.action === "none") {
              writeSuccess2(
                "forge.bootstrap.ensure",
                { status: decision.state, changed: false, preflight: decision },
                json,
                startedAt
              );
              return;
            }
          }
          const result = await runManager(
            command,
            resolve(target ?? process.cwd()),
            options
          );
          if (!result.ok) {
            writeFailure2(
              "forge.bootstrap." + command,
              result.error?.message ?? "Bootstrap operation failed",
              result.data,
              json,
              startedAt,
              EXIT_CODES.TOOL_ERROR
            );
            return;
          }
          writeSuccess2(
            "forge.bootstrap." + command,
            result.data,
            json,
            startedAt
          );
        } catch (error2) {
          writeFailure2(
            "forge.bootstrap." + command,
            error2 instanceof Error ? error2.message : String(error2),
            null,
            json,
            startedAt,
            EXIT_CODES.TOOL_ERROR
          );
        }
      }
    );
  }
  bootstrap.command("disable [target]").description(
    "Remove project-owned Forgewright integration while preserving shared runtime"
  ).option("--keep-profile", "Keep project manifest/profile facts").option("-j, --json", "Output as JSON").action(
    async (target, options) => {
      const startedAt = Date.now();
      const json = useJson2(program, options);
      try {
        const result = await runManager(
          "disable",
          resolve(target ?? process.cwd()),
          options
        );
        if (!result.ok) {
          writeFailure2(
            "forge.bootstrap.disable",
            result.error?.message ?? "Bootstrap disable failed",
            result.data,
            json,
            startedAt
          );
          return;
        }
        writeSuccess2("forge.bootstrap.disable", result.data, json, startedAt);
      } catch (error2) {
        writeFailure2(
          "forge.bootstrap.disable",
          error2 instanceof Error ? error2.message : String(error2),
          null,
          json,
          startedAt
        );
      }
    }
  );
}
var id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
var text2 = z.string().min(1).max(2e3);
var destination = z.enum([
  "google_play_internal_testing",
  "testflight_internal"
]);
var binding = z.object({
  resolver: z.literal("runtime_binding"),
  name: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/)
}).strict();
var product = z.object({
  id,
  kind: z.enum(["non_consumable", "consumable"]),
  benefit: text2,
  removes_ads: z.boolean(),
  store_ids: z.object({ google_play: id.nullable(), apple: id.nullable() }).strict()
}).strict();
var placement = z.object({
  id,
  format: z.enum(["rewarded", "interstitial"]),
  trigger: text2,
  value: text2,
  decline: text2
}).strict();
var StudioProfile = z.object({
  schema: z.literal("mobile-studio-profile/v1"),
  profile_id: id,
  revision: id,
  accounts: z.object({ google_play: id, apple_team: id, admob: id }).strict(),
  app_bindings: z.array(
    z.object({
      game_id: id,
      android_package: id,
      android_app_id: id,
      ios_bundle: id,
      ios_app_id: id
    }).strict()
  ).min(1),
  secret_refs: z.object({
    play_publisher: binding.optional(),
    apple_connect: binding.optional(),
    admob_provisioner: binding.optional()
  }).strict(),
  release_policy: z.object({
    allowed_destinations: z.array(destination).min(1),
    allowed_game_ids: z.array(id).min(1),
    production_enabled: z.literal(false)
  }).strict(),
  ads_policy: z.object({
    mediation_owner: z.literal("admob"),
    network_candidates: z.array(z.enum(["meta", "unity_ads"])),
    test_ads_required: z.literal(true)
  }).strict()
}).strict();
var GameDelta = z.object({
  schema: z.literal("mobile-game-delta/v1"),
  game_id: id,
  studio_profile_ref: z.object({ id, revision: id }).strict(),
  engine: z.enum(["phaser4", "threejs"]),
  wrapper: z.object({
    kind: z.enum(["capacitor", "cordova", "custom_webview", "unverified"]),
    evidence: z.enum(["hypothesis", "observed"])
  }).strict(),
  android: z.object({ package: id, app_id: id, track_id: id.nullable() }).strict(),
  ios: z.object({
    bundle: id,
    app_id: id,
    workflow_id: id.nullable(),
    group_id: id.nullable()
  }).strict(),
  catalog: z.object({ products: z.array(product), placements: z.array(placement) }).strict(),
  ads: z.object({
    android_app_id: text2.nullable(),
    ios_app_id: text2.nullable(),
    ad_units: z.array(
      z.object({
        platform: z.enum(["android", "ios"]),
        placement_id: id,
        ad_unit_id: text2,
        network_mappings: z.array(
          z.object({
            network: z.enum(["meta", "unity_ads"]),
            partner_app_id: text2,
            partner_placement_id: text2
          }).strict()
        )
      }).strict()
    )
  }).strict(),
  purchase_environment: z.enum(["sandbox", "production"])
}).strict();
var evidence = z.object({
  id,
  kind: z.enum([
    "primary_source",
    "observed",
    "estimate",
    "hypothesis",
    "synthetic"
  ]),
  claim: text2,
  source: z.string().url().optional(),
  observed_at: z.string().datetime().optional(),
  validation: text2
}).strict().superRefine((v, ctx) => {
  if (["primary_source", "observed", "estimate"].includes(v.kind) && (!v.source || !v.observed_at)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "source_and_time_required"
    });
  }
});
var StrategyBrief = z.object({
  schema: z.literal("mobile-strategy/v1"),
  game_id: id,
  evidence: z.array(evidence).min(1),
  player: z.object({
    audience: text2,
    motives: z.array(text2).min(1),
    session_context: text2,
    fairness_risks: z.array(text2).min(1)
  }).strict(),
  market: z.object({
    countries: z.array(id).min(1),
    competition: z.array(
      z.object({
        name: text2,
        relationship: text2,
        evidence_ids: z.array(id).min(1)
      }).strict()
    )
  }).strict(),
  monetization: z.object({
    model: z.enum(["ads", "iap", "hybrid", "premium"]),
    value_hypothesis: text2,
    free_path: text2,
    no_ads_scope: text2,
    evidence_ids: z.array(id).min(1)
  }).strict(),
  levels: z.array(
    z.object({
      id,
      learning_intent: text2,
      fail_recovery: text2,
      sources: z.array(text2),
      sinks: z.array(text2),
      evidence_ids: z.array(id).min(1)
    }).strict()
  ).min(1),
  measurement: z.object({
    baseline: z.enum(["unmeasured", "synthetic", "observed"]),
    primary_metric: text2,
    experience_guardrails: z.array(text2).min(1),
    revenue_guardrails: z.array(text2).min(1),
    decision_rule: text2
  }).strict()
}).strict();
function parse(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("invalid_mobile_contract");
  return parsed.data;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function digest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function resolveMobile(profileInput, gameInput, strategyInput) {
  const profile = parse(StudioProfile, profileInput);
  const game = parse(GameDelta, gameInput);
  const strategy = parse(StrategyBrief, strategyInput);
  if (profile.profile_id !== game.studio_profile_ref.id)
    throw new Error("profile_identity_mismatch");
  if (profile.revision !== game.studio_profile_ref.revision)
    throw new Error("profile_revision_mismatch");
  if (!profile.release_policy.allowed_game_ids.includes(game.game_id))
    throw new Error("game_outside_studio_scope");
  const bound = profile.app_bindings.filter((v) => v.game_id === game.game_id);
  if (bound.length !== 1 || bound[0].android_package !== game.android.package || bound[0].android_app_id !== game.android.app_id || bound[0].ios_bundle !== game.ios.bundle || bound[0].ios_app_id !== game.ios.app_id)
    throw new Error("app_binding_mismatch");
  for (const field of [
    "game_id",
    "android_package",
    "android_app_id",
    "ios_bundle",
    "ios_app_id"
  ]) {
    if (new Set(profile.app_bindings.map((v) => v[field])).size !== profile.app_bindings.length)
      throw new Error("duplicate_app_binding");
  }
  if (strategy.game_id !== game.game_id)
    throw new Error("strategy_game_mismatch");
  const placementIds = new Set(game.catalog.placements.map((v) => v.id));
  if (game.ads.ad_units.some(
    (v) => !placementIds.has(v.placement_id) || v.network_mappings.some(
      (n) => !profile.ads_policy.network_candidates.includes(n.network)
    )
  ))
    throw new Error("ad_mapping_outside_scope");
  if (new Set(game.ads.ad_units.map((v) => `${v.platform}:${v.placement_id}`)).size !== game.ads.ad_units.length)
    throw new Error("duplicate_ad_mapping");
  for (const values of [
    game.catalog.products,
    game.catalog.placements,
    strategy.evidence,
    strategy.levels
  ]) {
    if (new Set(values.map((v) => v.id)).size !== values.length)
      throw new Error("duplicate_semantic_identity");
  }
  const evidenceIds = new Set(strategy.evidence.map((v) => v.id));
  const refs = [
    ...strategy.market.competition,
    strategy.monetization,
    ...strategy.levels
  ];
  if (refs.some((v) => v.evidence_ids.some((ref) => !evidenceIds.has(ref))))
    throw new Error("missing_strategy_evidence");
  if (strategy.measurement.baseline === "observed" && !strategy.evidence.some((v) => v.kind === "observed"))
    throw new Error("observed_baseline_requires_evidence");
  return {
    profile,
    game,
    strategy,
    digest: digest({ profile, game, strategy })
  };
}
function doctorMobile(config2) {
  const { game, profile, strategy } = config2;
  const assumptions = strategy.evidence.filter((v) => ["hypothesis", "synthetic"].includes(v.kind)).map((v) => ({ id: v.id, kind: v.kind, validation: v.validation }));
  const live_blockers = [
    "native_host_unverified",
    "store_capabilities_unverified",
    "sdk_compatibility_unverified",
    "physical_device_unverified"
  ];
  if (game.wrapper.evidence !== "observed" || game.wrapper.kind === "unverified")
    live_blockers.push("wrapper_unverified");
  if (!game.android.track_id) live_blockers.push("play_track_unresolved");
  if (!game.ios.workflow_id || !game.ios.group_id)
    live_blockers.push("xcode_workflow_or_group_unresolved");
  if (!profile.secret_refs.play_publisher)
    live_blockers.push("play_binding_missing");
  if (!profile.secret_refs.apple_connect)
    live_blockers.push("apple_binding_missing");
  if (game.catalog.products.some(
    (p) => !p.store_ids.google_play || !p.store_ids.apple
  ))
    live_blockers.push("store_product_ids_unresolved");
  if (["ads", "hybrid"].includes(strategy.monetization.model) && (!game.ads.android_app_id || !game.ads.ios_app_id || game.ads.ad_units.length === 0))
    live_blockers.push("admob_app_units_unresolved");
  return {
    schema: "mobile-doctor/v1",
    game_id: game.game_id,
    engine: game.engine,
    simulation_ready: true,
    live_ready: false,
    config_digest: config2.digest,
    profile: { id: profile.profile_id, revision: profile.revision },
    provenance: {
      accounts: "studio_profile",
      catalog: "game_delta",
      strategy: "per_game_brief",
      runtime_authority: "unverified"
    },
    assumptions,
    live_blockers,
    baseline: strategy.measurement.baseline,
    allowed_destinations: profile.release_policy.allowed_destinations
  };
}
function readJson(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
    throw new Error("invalid_mobile_input_file");
  return JSON.parse(readFileSync(path, "utf8"));
}
function mobileTemplateRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const packaged = join(here, "mobile-template");
  if (existsSync(join(packaged, "examples/studio.json"))) return packaged;
  for (const base2 of [
    resolve(here, "../../.."),
    resolve(here, "../../../..")
  ]) {
    const path = join(base2, "templates/game/mobile-monetization");
    if (existsSync(join(path, "examples/studio.json"))) return path;
  }
  throw new Error("mobile_templates_missing");
}
function initMobile(target, engine) {
  if (!["phaser4", "threejs"].includes(engine))
    throw new Error("unsupported_mobile_engine");
  const root = resolve(target);
  let parent = root;
  while (!existsSync(parent)) parent = dirname(parent);
  if (realpathSync(parent) !== parent)
    throw new Error("symlinked_mobile_target");
  const dest = join(root, "mobile");
  if (existsSync(dest))
    throw new Error("mobile_setup_exists_preserve_customization");
  const source = mobileTemplateRoot();
  const game = readJson(join(source, `examples/${engine}-game.json`));
  const strategy = readJson(join(source, "examples/strategy.json"));
  const gameId = game.game_id;
  strategy.game_id = gameId;
  const entries = [
    ["game.json", JSON.stringify(game, null, 2) + "\n"],
    ["strategy.json", JSON.stringify(strategy, null, 2) + "\n"],
    [
      "studio.example.json",
      readFileSync(join(source, "examples/studio.json"), "utf8")
    ],
    ["runtime.mjs", readFileSync(join(source, "runtime.mjs"), "utf8")],
    ["runtime.d.mts", readFileSync(join(source, "runtime.d.mts"), "utf8")],
    ["server/delivery.mjs", readFileSync(join(source, "delivery.mjs"), "utf8")],
    [
      "server/sqlite-ledger.mjs",
      readFileSync(join(source, "sqlite-ledger.mjs"), "utf8")
    ]
  ];
  mkdirSync(root, { recursive: true });
  mkdirSync(dest, { mode: 448 });
  mkdirSync(join(dest, "server"), { mode: 448 });
  for (const [name, content] of entries) {
    const fd = openSync(
      join(dest, name),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      384
    );
    try {
      writeFileSync(fd, content);
    } finally {
      closeSync(fd);
    }
  }
  return {
    created: entries.map(([name]) => `mobile/${name}`),
    mode: "hypothetical_setup",
    live_ready: false,
    next: "Edit game/strategy; reuse one reviewed studio profile; run forge mobile doctor."
  };
}
var sha = z.string().regex(/^[a-f0-9]{64}$/);
var label2 = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
var Artifact = z.object({
  schema: z.literal("mobile-artifact/v1"),
  game_id: label2,
  platform: z.enum(["android", "ios"]),
  app_id: label2,
  source_revision: z.string().regex(/^[a-f0-9]{40}$/),
  config_digest: sha,
  artifact_sha256: sha,
  version: z.number().int().positive(),
  build_id: label2
}).strict();
function createBetaIntent(input, artifactInput) {
  const config2 = resolveMobile(input.profile, input.game, input.strategy);
  const artifact = parse(Artifact, artifactInput);
  const { game, profile } = config2;
  const android = artifact.platform === "android";
  const app_id = android ? game.android.app_id : game.ios.app_id;
  if (artifact.game_id !== game.game_id || artifact.app_id !== app_id || artifact.config_digest !== config2.digest)
    throw Error("artifact_binding_mismatch");
  const destination2 = android ? "google_play_internal_testing" : "testflight_internal";
  if (!profile.release_policy.allowed_destinations.includes(destination2))
    throw Error("beta_destination_outside_scope");
  const target = android ? game.android.track_id : game.ios.group_id;
  if (target && /^(production|default|external)$/i.test(target))
    throw Error("unsafe_beta_target");
  const binding2 = {
    ...artifact,
    account: android ? profile.accounts.google_play : profile.accounts.apple_team,
    destination: destination2,
    target,
    workflow_id: android ? null : game.ios.workflow_id
  };
  return Object.freeze({
    ...binding2,
    schema: "mobile-beta-intent/v1",
    intent_id: digest(binding2)
  });
}

// src/commands/mobile.ts
function output(tool, operation) {
  const start = Date.now();
  try {
    const data = operation();
    process.stdout.write(
      JSON.stringify(
        buildEnvelope(tool, data, {
          ok: true,
          duration_ms: Date.now() - start,
          version: VERSION
        })
      ) + "\n"
    );
  } catch (error2) {
    const known = error2 instanceof Error && /^[a-z_]+$/.test(error2.message) ? error2.message : "mobile_input_or_operation_failed";
    process.stdout.write(
      JSON.stringify(
        buildEnvelope(tool, null, {
          ok: false,
          duration_ms: Date.now() - start,
          version: VERSION,
          error: { code: EXIT_CODES.TOOL_ERROR, message: known }
        })
      ) + "\n"
    );
    process.exitCode = EXIT_CODES.TOOL_ERROR;
  }
}
function registerMobileCommands(program) {
  const mobile = program.command("mobile").description(
    "Evidence-led mobile studio setup and internal beta contracts"
  );
  mobile.command("profile <file>").description(
    "Validate a shared nonsecret studio profile without revealing bindings"
  ).action(
    (file) => output("forge.mobile.profile", () => {
      const profile = parse(StudioProfile, readJson(file));
      return {
        profile_id: profile.profile_id,
        revision: profile.revision,
        games: profile.release_policy.allowed_game_ids,
        destinations: profile.release_policy.allowed_destinations
      };
    })
  );
  mobile.command("init <target>").requiredOption("--engine <engine>", "phaser4 or threejs").description(
    "Create labelled hypothetical inputs; preserve existing customization"
  ).action(
    (target, options) => output("forge.mobile.init", () => initMobile(target, options.engine))
  );
  mobile.command("doctor <game>").requiredOption("--profile <file>", "shared nonsecret studio profile").requiredOption(
    "--strategy <file>",
    "per-game player/market/monetization brief"
  ).description(
    "Resolve shared config; report assumptions and real integration blockers"
  ).action(
    (game, options) => output(
      "forge.mobile.doctor",
      () => doctorMobile(
        resolveMobile(
          readJson(options.profile),
          readJson(game),
          readJson(options.strategy)
        )
      )
    )
  );
  mobile.command("plan <game>").requiredOption("--profile <file>", "shared nonsecret studio profile").requiredOption("--strategy <file>", "per-game strategy").requiredOption("--artifact <file>", "exact artifact identity manifest").description("Produce an internal-beta intent; never build or publish").action(
    (game, options) => output("forge.mobile.plan", () => {
      const config2 = resolveMobile(
        readJson(options.profile),
        readJson(game),
        readJson(options.strategy)
      );
      return {
        mode: "dry_run",
        mutation_allowed: false,
        intent: createBetaIntent(config2, readJson(options.artifact)),
        readiness: doctorMobile(config2)
      };
    })
  );
}
function buildProgram() {
  const program = new Command();
  program.name("forge").description("Forgewright CLI - Agent-First Command Line Interface").version(VERSION, "-V, --version");
  registerGlobalFlags(program);
  registerToolsCommands(program);
  registerSkillsCommands(program);
  registerToolsCallCommand(program);
  registerConfigCommands(program);
  registerDoctorCommand(program);
  registerValidateCommand(program);
  registerCompletionCommand(program);
  registerCoordsCommand(program);
  registerAutonomousTestCommand(program);
  registerExpertCommand(program);
  registerTokenCommand(program);
  registerDelegateCommand(program);
  registerBenchCommand(program);
  registerProjectCommands(program);
  registerDocsCommands(program);
  registerBootstrapCommand(program);
  registerMobileCommands(program);
  const config2 = getConfig();
  config2.loadUserConfig();
  config2.loadEnvFiles(process.cwd());
  config2.loadEnvVars();
  program.addHelpText(
    "after",
    `
Examples:
  $ forge tools list                  # List all tools
  $ forge tools list --json           # JSON output for agents
  $ forge tools list --category engineering  # Filter by category
  $ forge skills list                 # List all skills
  $ forge skills search api           # Search skills
  $ forge expert status               # Show optional Claude/Codex CLI expert mode
  $ forge expert use codex --track-tokens  # Switch expert mode to Codex CLI
  $ forge token on                    # Enable local token tracking
  $ forge token report --period week  # Show local token usage summary
  $ forge delegate status             # Show auto-detected controller/worker state
  $ forge delegate auto               # Auto-enable when Codex/Claude + Agy are available
  $ forge docs init .                 # Create a privacy-safe docs manifest
  $ forge docs build .                # Build the static documentation portal
  $ forge bootstrap policy status     # Show one-time global auto-bootstrap policy
  $ forge bootstrap preflight .        # Cheap local project bootstrap decision
  $ forge --version                   # Show version

Agent Mode:
  $ forge --json tools list | jq .    # Parse JSON output
  $ forge --json tools list | jq '.data.tools[].name'
  $ for tool in $(forge --json tools list | jq -r '.data.tools[].name'); do
      echo "Tool: $tool"
    done

Environment Variables:
  FORGE_DEBUG=1                       # Enable debug mode
  NO_COLOR=1                          # Disable colors
  FORGE_LEGACY_OUTPUT=1               # Force legacy output mode
`
  );
  return program;
}
async function main() {
  const program = buildProgram();
  maybeNotifyAutoDelegation();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!process.stdout.isTTY) {
      const envelope = {
        ok: false,
        tool: "cli",
        data: null,
        metadata: {
          duration_ms: 0,
          version: VERSION
        },
        error: {
          code: EXIT_CODES.INTERNAL_ERROR,
          message
        }
      };
      process.stdout.write(JSON.stringify(envelope) + "\n");
    } else {
      process.stderr.write(`${pc7.red("Error:")} ${message}
`);
    }
    process.exit(EXIT_CODES.INTERNAL_ERROR);
  }
}
main();

export { buildProgram, main };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map