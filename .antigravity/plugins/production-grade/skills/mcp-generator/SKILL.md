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
├── server.ts              # Single-file entry — all tools, resources, prompts
├── package.json           # Dependencies: @modelcontextprotocol/sdk, gitnexus, zod
├── tsconfig.json          # TypeScript config
└── mcp-config.json        # Tool/resource registry (which are enabled)
```

> **Scope note:** The server is a single monolithic file. This is intentional — it avoids import resolution complexity in auto-generated code and keeps the attack surface small.

### Step 3 — Configure Based on Project

The generated server is **customized** per project:

```
ALWAYS enabled:
  → 4 GitNexus graph tools (query, context, impact, detect_changes)
  → 2 filesystem tools (navigate, search)
  → 3 action tools (write_file, git_status, run_script)
  → 3 resources (profile, architecture, conventions)
  → 3 prompts (debug, review, plan)

Scope guardrails:
  → project_write_file: max 512KB, path traversal blocked, .env/.git blocked
  → project_run_script: only scripts listed in package.json are allowed
  → project_navigate: path traversal and .env/.git access blocked
```

Write `mcp-config.json` documenting which tools/resources are active.

> **Explicitly out of scope:** Separate `project_run_tests`, `project_lint`, `project_build` tools are NOT generated — `project_run_script` subsumes them to avoid tool redundancy.

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
    "tools_count": 9,
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
| `project_write_file` | `{ path: string, content: string }` | Write files (max 512KB, path-validated) |
| `project_run_script` | `{ script: string }` | Run npm scripts (allowlisted from package.json) |
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
