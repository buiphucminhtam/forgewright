---
name: MCP Generator
description: Auto-generates a project-specific MCP server that exposes codebase intelligence (GitNexus graph, project profile, conventions) as MCP Tools, Resources, and Prompts — enabling any MCP-compatible AI client to understand the project.
---

# MCP Generator Skill

**Generates a project-specific MCP server powered by GitNexus code intelligence.**

When Forgewright is installed as a submodule and the project is onboarded, this skill auto-generates an MCP (Model Context Protocol) server at `.forgewright/mcp-server/`. Any MCP-compatible client (Claude Desktop, Cursor, VS Code, Antigravity) can connect and gain deep project understanding.

## When to Invoke

- **Automatically** during project onboarding (Phase 1.6) when `code_intelligence.indexed == true`
- **Explicitly** when user requests MCP server generation: "generate MCP server", "create MCP for this project"
- **Re-generation** when user runs `/onboard` again or requests MCP refresh

## Prerequisites

- GitNexus indexed (`.gitnexus/` exists with valid index)
- `project-profile.json` exists (from onboarding Phase 1–5)
- Node.js installed (for `@modelcontextprotocol/server` SDK)

## Execution Steps

### Step 1 — Validate Prerequisites

```
1. Check .gitnexus/ exists and has valid index
   → If missing: STOP — "Code Intelligence required. Run /onboard first."

2. Check project-profile.json exists
   → If missing: STOP — "Project profile required. Run /onboard first."

3. Check Node.js available
   → command -v node
   → If missing: notify user with install instructions

4. Read project-profile.json to determine:
   - Project language/framework
   - Available health commands (test, lint, build)
   - Detected patterns
```

### Step 2 — Scaffold MCP Server

Create `.forgewright/mcp-server/` directory with the following structure:

```
.forgewright/mcp-server/
├── server.ts              # Entry point
├── tools/
│   ├── query.ts           # GitNexus concept search
│   ├── context.ts         # Symbol 360° view
│   ├── impact.ts          # Blast radius analysis
│   ├── detect-changes.ts  # Pre-commit risk check
│   ├── navigate.ts        # File/function navigation
│   └── search.ts          # ripgrep text search
├── resources/
│   ├── profile.ts         # project-profile.json
│   ├── architecture.ts    # GitNexus cluster data
│   └── conventions.ts     # code-conventions.md
├── prompts/
│   ├── debug.ts           # Debugging template
│   ├── review.ts          # Code review template
│   └── plan.ts            # Feature planning template
├── utils/
│   └── gitnexus.ts        # GitNexus CLI wrapper
├── package.json
├── tsconfig.json
└── mcp-config.json        # Tool/resource registry
```

### Step 3 — Configure Based on Project

The generated server is **customized** per project:

```
IF project has test command → enable project_run_tests tool
IF project has lint command → enable project_lint tool
IF project has build command → enable project_build tool
IF GitNexus has processes → enable project://processes/{name} resources
IF code-conventions.md exists → enable project://conventions resource
```

Write `mcp-config.json` documenting which tools/resources are active.

### Step 4 — Install Dependencies

```bash
cd .forgewright/mcp-server/
npm install
```

### Step 5 — Generate Client Config Snippets

Output integration configs for popular clients:

```
📋 MCP Server Generated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tools:     6 active
Resources: 3 active
Prompts:   3 active
Transport: stdio

To connect, add to your MCP client config:

Antigravity / Claude Desktop:
  {
    "mcpServers": {
      "<project-name>": {
        "command": "npx",
        "args": ["tsx", "<project-root>/.forgewright/mcp-server/server.ts"]
      }
    }
  }

Cursor (.cursor/mcp.json):
  {
    "mcpServers": {
      "<project-name>": {
        "command": "npx",
        "args": ["tsx", "<project-root>/.forgewright/mcp-server/server.ts"]
      }
    }
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 6 — Update Project Profile

Add to `project-profile.json`:

```json
{
  "mcp_server": {
    "generated": true,
    "path": ".forgewright/mcp-server/",
    "tools_count": 6,
    "resources_count": 3,
    "prompts_count": 3,
    "transport": "stdio",
    "generated_at": "ISO-8601"
  }
}
```

## MCP Primitives Reference

### Tools

| Tool | Input Schema | Description |
|------|-------------|-------------|
| `project_query` | `{ query: string }` | Search codebase by concept via GitNexus |
| `project_context` | `{ name: string }` | 360° view: callers, callees, processes |
| `project_impact` | `{ target: string, direction: "upstream"\|"downstream" }` | Blast radius analysis |
| `project_detect_changes` | `{ scope?: string }` | Pre-commit risk assessment |
| `project_navigate` | `{ path: string, line?: number }` | Navigate to file/function |
| `project_search` | `{ pattern: string, includes?: string[] }` | ripgrep text search |
| `project_write_file` | `{ path: string, content: string }` | Write or overwrite files in the workspace |
| `project_run_script` | `{ script: string }` | Run arbitrary npm scripts |
| `project_git_status` | `{}` | Get current git status |

### Resources

| URI | Description |
|-----|-------------|
| `project://profile` | Full project fingerprint (JSON) |
| `project://architecture` | Architecture overview from GitNexus clusters |
| `project://conventions` | Coding conventions and patterns |

### Prompts

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `debug-issue` | `{ error: string, file?: string }` | Structured debugging using project context |
| `review-changes` | `{ scope?: string }` | Code review with conventions awareness |
| `plan-feature` | `{ feature: string }` | Feature planning with architecture context |

## Graceful Degradation

```
IF GitNexus tools fail:
  → Disable affected MCP tools
  → Keep resources and prompts working
  → Log: "⚠ GitNexus unavailable — MCP tools limited"

IF project-profile.json missing:
  → Return empty profile resource
  → Log: "⚠ Project profile not found"

IF code-conventions.md missing:
  → Return "No conventions documented" resource
  → Proceed normally
```

## Re-generation

When the project changes significantly (new onboarding, architecture changes):

```
1. Delete .forgewright/mcp-server/
2. Re-run Steps 1–6
3. Client configs remain the same (path unchanged)
```

## Integration Points

- **project-onboarding.md** — Phase 1.6 triggers this skill
- **session-lifecycle.md** — MCP server can re-index at session start/end
- **code-intelligence.md** — Shares GitNexus data source
