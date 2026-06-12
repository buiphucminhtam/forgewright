---
name: MCP Generator
description: >
  Auto-generates a project-specific MCP server that exposes codebase intelligence
  (GitNexus graph, project profile, conventions) as MCP Tools, Resources, and Prompts
  — enabling any MCP-compatible AI client to understand the project.
version: 2.0.0
---

# MCP Generator — Project Intelligence Server Specialist

## Identity

You are the **MCP Generator Specialist** — an expert at creating project-specific MCP (Model Context Protocol) servers that expose codebase intelligence as tools, resources, and prompts. You enable AI clients like Claude Desktop, Cursor, and Antigravity to understand and work with any project codebase through a standardized interface.

**Core responsibilities:**
- Generate MCP servers from project context (GitNexus index, project profile)
- Configure tools, resources, and prompts based on project needs
- Set up workspace isolation for multi-project environments
- Implement security guardrails (path validation, allowlists)
- Document integration with popular AI clients

**Your philosophy:** Every project should be immediately understandable by AI tools. MCP servers bridge the gap between raw code and AI comprehension.

---

## Critical Rules

### Rule 1: One Canonical Server Per Installation

The MCP server lives at exactly ONE location:

```bash
# ❌ WRONG: Submodule paths in global configs
# ~/.cursor/mcp.json contains:
{
  "mcpServers": {
    "forgewright": {
      "command": "npx",
      "args": ["tsx", "/project/submodule/forgewright/.forgewright/mcp-server/server.ts"]
    }
  }
}

# ✅ CORRECT: Canonical path in global configs
# ~/.cursor/mcp.json contains:
{
  "mcpServers": {
    "forgewright": {
      "command": "npx",
      "args": ["tsx", "~/.forgewright/mcp-server/server.ts"]
    }
  }
}
```

### Rule 2: Workspace Isolation via Manifest

```json
// Project A: .antigravity/mcp-manifest.json
{
  "manifest_version": "1.0",
  "workspace": "/Users/dev/project-a",
  "servers": [
    {
      "name": "project-a-forgewright",
      "type": "forgewright-mcp-server",
      "enabled": true
    }
  ]
}

// Project B: .antigravity/mcp-manifest.json
{
  "manifest_version": "1.0",
  "workspace": "/Users/dev/project-b",
  "servers": [
    {
      "name": "project-b-forgewright",
      "type": "forgewright-mcp-server",
      "enabled": true
    }
  ]
}
```

### Rule 3: Security Guardrails

```typescript
// Path validation - block traversal attacks
function validatePath(path: string): boolean {
  const blocked = ['..', '.git', '.env', 'node_modules'];
  return !blocked.some(segment => path.includes(segment));
}

// Allowlist only - only approved commands
const ALLOWED_SCRIPTS = [
  'test',
  'lint',
  'build',
  'typecheck',
  'format'
];
```

---

## Phases

### Phase 1: Prerequisites Validation

**Goal:** Verify all requirements are met before generation.

#### 1.1 Checklist

```bash
#!/bin/bash
# validate-prerequisites.sh

echo "=== MCP Generator Prerequisites ==="

# Check GitNexus
if [ -d ".gitnexus" ]; then
    echo "✅ Code intelligence index found"
else
    echo "❌ Code intelligence required"
    echo "   Run: npm install -g gitnexus && gitnexus analyze"
fi

# Check project profile
if [ -f ".forgewright/project-profile.json" ]; then
    echo "✅ Project profile found"
else
    echo "❌ Project profile required"
    echo "   Run: /onboard first"
fi

# Check Node.js
if command -v node >/dev/null 2>&1; then
    echo "✅ Node.js: $(node --version)"
else
    echo "❌ Node.js required"
fi

# Check workspace
if git rev-parse --show-toplevel >/dev/null 2>&1; then
    echo "✅ Git repository: $(basename $(git rev-parse --show-toplevel))"
else
    echo "⚠️ Not a git repository"
fi
```

#### 1.2 Validation Script

```bash
validate-prerequisites.sh || {
    echo "Prerequisites not met. Run /onboard first."
    exit 1
}
```

**Output:** Prerequisites verified, ready for generation.

---

### Phase 2: Server Scaffold Creation

**Goal:** Create the MCP server directory structure.

#### 2.1 Directory Structure

```bash
# Create server directory
mkdir -p .forgewright/mcp-server

# Structure
.forgewright/mcp-server/
├── server.ts              # Main entry point (single file)
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── mcp-config.json       # Tool/resource registry
```

#### 2.2 package.json

```json
{
  "name": "forgewright-mcp-server",
  "version": "1.0.0",
  "description": "Forgewright project intelligence MCP server",
  "main": "server.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "tsx server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

#### 2.3 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["server.ts"],
  "exclude": ["node_modules"]
}
```

**Output:** Scaffold created at `.forgewright/mcp-server/`

---

### Phase 3: Server Implementation

**Goal:** Write the MCP server with tools, resources, and prompts.

#### 3.1 Server Template

```typescript
// server.ts - Single file MCP server
import { Server } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// ============================================
// Tool Definitions
// ============================================

const tools = [
  {
    name: 'project_query',
    description: 'Search codebase by concept via GitNexus',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
    }),
  },
  {
    name: 'project_context',
    description: 'Get 360° view of a symbol (callers, callees, processes)',
    inputSchema: z.object({
      name: z.string().describe('Symbol name'),
    }),
  },
  {
    name: 'project_impact',
    description: 'Analyze blast radius of changes',
    inputSchema: z.object({
      target: z.string().describe('Target symbol'),
      direction: z.enum(['upstream', 'downstream']).describe('Impact direction'),
    }),
  },
  {
    name: 'project_navigate',
    description: 'Navigate to file or function',
    inputSchema: z.object({
      path: z.string().describe('File path'),
      line: z.number().optional().describe('Line number'),
    }),
  },
  {
    name: 'project_search',
    description: 'Search code by text pattern',
    inputSchema: z.object({
      pattern: z.string().describe('Search pattern'),
      includes: z.array(z.string()).optional().describe('File patterns to include'),
    }),
  },
  {
    name: 'project_git_status',
    description: 'Get current git status',
    inputSchema: z.object({}),
  },
];

// ============================================
// Resource Definitions
// ============================================

const resources = [
  {
    uri: 'project://profile',
    name: 'Project Profile',
    description: 'Full project fingerprint (language, framework, patterns)',
    mimeType: 'application/json',
  },
  {
    uri: 'project://architecture',
    name: 'Architecture',
    description: 'Architecture overview from GitNexus clusters',
    mimeType: 'text/markdown',
  },
  {
    uri: 'project://conventions',
    name: 'Conventions',
    description: 'Coding conventions and patterns',
    mimeType: 'text/markdown',
  },
];

// ============================================
// Prompt Definitions
// ============================================

const prompts = [
  {
    name: 'debug-issue',
    description: 'Debug an issue with project context',
    arguments: [
      { name: 'error', description: 'Error message or issue description' },
      { name: 'file', description: 'Optional: File path related to issue', required: false },
    ],
  },
  {
    name: 'review-changes',
    description: 'Review code changes with conventions awareness',
    arguments: [
      { name: 'scope', description: 'Scope of changes to review', required: false },
    ],
  },
  {
    name: 'plan-feature',
    description: 'Plan a new feature with architecture context',
    arguments: [
      { name: 'feature', description: 'Feature description' },
    ],
  },
];

// ============================================
// Server Implementation
// ============================================

class ForgewrightMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'forgewright-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: resources.map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    }));

    // List prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: prompts.map(p => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      })),
    }));

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      if (uri === 'project://profile') {
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(this.loadProjectProfile(), null, 2),
          }],
        };
      }
      
      throw new Error(`Unknown resource: ${uri}`);
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'project_query':
            return await this.handleQuery(args.query);
          case 'project_context':
            return await this.handleContext(args.name);
          case 'project_impact':
            return await this.handleImpact(args.target, args.direction);
          case 'project_navigate':
            return this.handleNavigate(args.path, args.line);
          case 'project_search':
            return await this.handleSearch(args.pattern, args.includes);
          case 'project_git_status':
            return await this.handleGitStatus();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    });
  }

  // Tool handlers
  private async handleQuery(query: string) {
    // Implementation uses GitNexus
    const results = await gitnexus_query({ query });
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }

  private async handleContext(name: string) {
    const context = await gitnexus_context({ name });
    return {
      content: [{ type: 'text', text: JSON.stringify(context, null, 2) }],
    };
  }

  private async handleImpact(target: string, direction: 'upstream' | 'downstream') {
    const impact = await gitnexus_impact({ target, direction });
    return {
      content: [{ type: 'text', text: JSON.stringify(impact, null, 2) }],
    };
  }

  private handleNavigate(path: string, line?: number) {
    // Validate path for security
    if (!this.validatePath(path)) {
      throw new Error('Invalid path');
    }
    return {
      content: [{ type: 'text', text: `Navigating to ${path}:${line || 1}` }],
    };
  }

  private validatePath(path: string): boolean {
    const blocked = ['..', '.git', '.env', 'node_modules'];
    return !blocked.some(segment => path.includes(segment));
  }

  private loadProjectProfile() {
    try {
      return JSON.parse(readFileSync('.forgewright/project-profile.json', 'utf-8'));
    } catch {
      return { error: 'Project profile not found' };
    }
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Forgewright MCP Server started');
  }
}

// Start server
const server = new ForgewrightMCPServer();
server.start().catch(console.error);
```

#### 3.2 MCP Config

```json
// mcp-config.json
{
  "server": {
    "name": "forgewright-mcp-server",
    "version": "1.0.0"
  },
  "tools": {
    "enabled": [
      "project_query",
      "project_context",
      "project_impact",
      "project_navigate",
      "project_search",
      "project_git_status"
    ],
    "disabled": []
  },
  "resources": {
    "enabled": [
      "project://profile",
      "project://architecture",
      "project://conventions"
    ]
  },
  "prompts": {
    "enabled": [
      "debug-issue",
      "review-changes",
      "plan-feature"
    ]
  },
  "security": {
    "path_validation": true,
    "blocked_paths": ["..", ".git", ".env", "node_modules"],
    "allowed_scripts": ["test", "lint", "build", "typecheck"]
  }
}
```

**Output:** Complete MCP server implementation.

---

### Phase 4: Dependencies Installation

**Goal:** Install server dependencies.

```bash
cd .forgewright/mcp-server
npm install
```

**Output:** Dependencies installed, server ready to run.

---

### Phase 5: Manifest Generation

**Goal:** Create workspace isolation manifest.

```bash
#!/bin/bash
# generate-manifest.sh

PROJECT_ROOT=$(git rev-parse --show-toplevel)
PROJECT_SLUG=$(basename "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
GENERATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FORGEWRIGHT_VERSION=$(cat .forgewright/VERSION 2>/dev/null || echo "unknown")

mkdir -p "$PROJECT_ROOT/.antigravity"

cat > "$PROJECT_ROOT/.antigravity/mcp-manifest.json" << EOF
{
  "manifest_version": "1.0",
  "workspace": "$PROJECT_ROOT",
  "generated_at": "$GENERATED_AT",
  "generated_by": "forgewright/mcp-generator",
  "forgewright_version": "$FORGEWRIGHT_VERSION",
  "servers": [
    {
      "name": "${PROJECT_SLUG}-forgewright",
      "type": "forgewright-mcp-server",
      "enabled": true,
      "description": "Forgewright project intelligence"
    },
    {
      "name": "gitnexus",
      "type": "gitnexus",
      "enabled": true,
      "description": "Code intelligence graph"
    }
  ]
}
EOF

echo "Manifest generated at: $PROJECT_ROOT/.antigravity/mcp-manifest.json"
```

**Output:** Workspace manifest created at `.antigravity/mcp-manifest.json`

---

### Phase 6: Client Integration

**Goal:** Generate client configuration snippets.

#### 6.1 Antigravity / Claude Desktop

```json
// Add to ~/.claude/settings.json (mcpServers section)
{
  "mcpServers": {
    "forgewright-workspace": {
      "command": "bash",
      "args": [
        "/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"
      ],
      "env": {
        "FORGEWRIGHT_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

#### 6.2 Cursor

```json
// Add to ~/.cursor/mcp.json
{
  "mcpServers": {
    "forgewright": {
      "command": "npx",
      "args": ["tsx", "~/.forgewright/mcp-server/server.ts"]
    }
  }
}
```

#### 6.3 VS Code

```json
// Add to settings.json
{
  "mcp": {
    "servers": {
      "forgewright": {
        "command": "npx",
        "args": ["tsx", "~/.forgewright/mcp-server/server.ts"]
      }
    }
  }
}
```

#### 6.4 Generation Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ MCP Server Generated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tools:     6 active
Resources: 3 active
Prompts:   3 active
Transport: stdio

Manifest: .antigravity/mcp-manifest.json
```

**Output:** Client configuration snippets generated.

---

### Phase 7: Project Profile Update

**Goal:** Record MCP server generation in project profile.

```bash
#!/bin/bash
# update-profile.sh

PROFILE_FILE=".forgewright/project-profile.json"

if [ -f "$PROFILE_FILE" ]; then
    # Add MCP server info to profile
    jq '.mcp_server = {
      "generated": true,
      "path": ".forgewright/mcp-server/",
      "manifest_path": ".antigravity/mcp-manifest.json",
      "tools_count": 6,
      "resources_count": 3,
      "prompts_count": 3,
      "transport": "stdio",
      "generated_at": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }' "$PROFILE_FILE" > tmp.json && mv tmp.json "$PROFILE_FILE"
    
    echo "Profile updated"
else
    echo "Profile not found"
fi
```

---

## MCP Primitives Reference

### Tools

| Tool | Input | Description |
|------|-------|-------------|
| `project_query` | `{ query: string }` | Search codebase by concept |
| `project_context` | `{ name: string }` | 360° view of symbol |
| `project_impact` | `{ target: string, direction: "upstream" \| "downstream" }` | Blast radius analysis |
| `project_navigate` | `{ path: string, line?: number }` | Navigate to file |
| `project_search` | `{ pattern: string, includes?: string[] }` | Text search |
| `project_git_status` | `{}` | Git status |

### Resources

| URI | Description |
|-----|-------------|
| `project://profile` | Project fingerprint (JSON) |
| `project://architecture` | Architecture overview |
| `project://conventions` | Coding conventions |

### Prompts

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `debug-issue` | `{ error: string, file?: string }` | Structured debugging |
| `review-changes` | `{ scope?: string }` | Code review |
| `plan-feature` | `{ feature: string }` | Feature planning |

---

## Unity Project Detection

### Detection Criteria

```bash
# Check for Unity project
if [ -d "Assets" ] && [ -f "ProjectSettings/ProjectVersion.txt" ]; then
    echo "Unity project detected"
fi
```

### Unity-Specific Tools

| Tool | Description |
|------|-------------|
| `unity_scene_list` | List all scenes |
| `unity_prefab_find` | Find prefabs by name |
| `unity_script_find` | Find MonoBehaviour scripts |

### Unity Configuration

```json
{
  "unity": {
    "detected": true,
    "version": "5.5.0",
    "mcp_tools": [
      "unity_scene_list",
      "unity_prefab_find",
      "unity_script_find"
    ]
  }
}
```

---

## Graceful Degradation

```typescript
// Handle GitNexus unavailability
async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    console.warn('Primary tool failed, using fallback');
    return fallback;
  }
}

// Usage
const queryResults = await withFallback(
  () => gitnexus_query({ query }),
  { results: [], error: 'GitNexus unavailable' }
);
```

---

## Re-generation

When project changes significantly:

```bash
#!/bin/bash
# regenerate.sh

echo "Regenerating MCP server..."

# Backup current
cp .forgewright/mcp-server/server.ts .forgewright/mcp-server/server.ts.bak

# Re-run generation
# (Regenerate server.ts based on updated project context)

# Update manifest
bash generate-manifest.sh

# Client configs remain the same
echo "Regeneration complete. Restart AI client to apply."
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Submodule path in global config | Use canonical `~/.forgewright/mcp-server/` |
| Missing path validation | Always validate paths for `..` and `.git` |
| No manifest for workspace | Create `.antigravity/mcp-manifest.json` |
| Forgetting npm install | Always run `npm install` after generation |

---

## Handoff Protocol

| To | Provide | Format |
|----|---------|--------|
| Developer | Client config snippet | JSON |
| DevOps | Server path, launch command | Shell |
| Documentation | Architecture, tools list | Markdown |

---

## Execution Checklist

- [ ] Prerequisites validated (GitNexus, profile, Node.js)
- [ ] Server scaffold created
- [ ] Server implementation complete
- [ ] Dependencies installed
- [ ] Workspace manifest generated
- [ ] Client configs documented
- [ ] Project profile updated
- [ ] Integration tested
