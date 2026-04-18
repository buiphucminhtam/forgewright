---
name: MCP Generator
description: Auto-generates a project-specific MCP server that exposes codebase intelligence (ForgeNexus graph, project profile, conventions) as MCP Tools, Resources, and Prompts — enabling any MCP-compatible AI client to understand the project.
---

# MCP Generator Skill

**Generates a project-specific MCP server powered by ForgeNexus code intelligence.**

When Forgewright is installed as a submodule and the project is onboarded, this skill auto-generates an MCP (Model Context Protocol) server at `.forgewright/mcp-server/`. Any MCP-compatible client (Claude Desktop, Cursor, VS Code, Antigravity) can connect and gain deep project understanding.

## When to Invoke

- **Automatically** during project onboarding (Phase 1.6) when `code_intelligence.indexed == true`
- **Explicitly** when user requests MCP server generation: "generate MCP server", "create MCP for this project"
- **Re-generation** when user runs `/onboard` again or requests MCP refresh

## Prerequisites

- ForgeNexus indexed (`.forgenexus/` exists with valid index)
- `project-profile.json` exists (from onboarding Phase 1–5)
- Node.js installed (for `@modelcontextprotocol/server` SDK)

## Execution Steps

### Step 1 — Validate Prerequisites

```
1. Check .forgenexus/ exists and has valid index
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
├── package.json           # Dependencies: @modelcontextprotocol/sdk, forgenexus, zod
├── tsconfig.json          # TypeScript config
└── mcp-config.json        # Tool/resource registry (which are enabled)
```

> **Scope note:** The server is a single monolithic file. This is intentional — it avoids import resolution complexity in auto-generated code and keeps the attack surface small.

### Step 3 — Configure Based on Project

The generated server is **customized** per project:

```
ALWAYS enabled:
  → 4 ForgeNexus graph tools (query, context, impact, detect_changes)
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

### Step 5 — Generate `.antigravity/mcp-manifest.json`

Create the manifest that enables Antigravity workspace isolation:

```bash
# Create .antigravity directory
mkdir -p "${PROJECT_ROOT}/.antigravity"

# Generate manifest
cat > "${PROJECT_ROOT}/.antigravity/mcp-manifest.json" << 'MANIFEST_EOF'
{
  "manifest_version": "1.0",
  "workspace": "${PROJECT_ROOT}",
  "generated_at": "${GENERATED_AT}",
  "generated_by": "forgewright/mcp-generator",
  "forgewright_version": "${FORGEWRIGHT_VERSION}",
  "servers": [
    {
      "name": "${PROJECT_SLUG}-forgewright",
      "type": "forgewright-mcp-server",
      "enabled": true,
      "description": "Forgewright project intelligence — code graph, project profile, filesystem tools"
    },
    {
      "name": "forgenexus",
      "type": "forgenexus",
      "enabled": true,
      "description": "Code intelligence — query, context, impact, blast-radius analysis",
      "config": {
        "forgenexus_path": "${FORGENEXUS_PATH}"
      }
    }
  ]
}
MANIFEST_EOF
```

> **Why `.antigravity/` instead of `.forgewright/`?**
> - Antigravity reads from `.antigravity/` for its MCP integration
> - `.forgewright/` remains project-internal (committed to repo)
> - `.antigravity/` can be gitignored separately

### Step 6 — Generate Client Config Snippets

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

### Step 7 — Update Project Profile

Add to `project-profile.json`:

```json
{
  "mcp_server": {
    "generated": true,
    "path": ".forgewright/mcp-server/",
    "manifest_path": ".antigravity/mcp-manifest.json",
    "tools_count": 9,
    "resources_count": 3,
    "prompts_count": 3,
    "transport": "stdio",
    "generated_at": "ISO-8601"
  }
}
```

### Step 8 — Workspace Isolation Summary

Print a summary explaining the workspace isolation:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✅ MCP Workspace Isolation Ready
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Manifest: .antigravity/mcp-manifest.json
 Servers:  2 active (forgewright + forgenexus)
 Transport: stdio

 🔒 How it works:
    Antigravity reads .antigravity/mcp-manifest.json
    from the current workspace automatically.
    No global config conflicts.

    Each workspace has its own MCP config
    committed to the project repository.

    Switch workspaces → MCP servers follow
    automatically.

 📋 Next steps:
    1. Commit .antigravity/mcp-manifest.json
    2. Update Antigravity global config:
       → See section "Antigravity Global Config"
    3. Restart Antigravity

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Also output the Antigravity global config update:

```
📋 Antigravity Global Config (replace claude_desktop_config.json):

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

> Replace `/path/to/forgewright/` with the absolute path to your
> forgewright submodule in the host project.

## MCP Primitives Reference

### Tools

| Tool | Input Schema | Description |
|------|-------------|-------------|
| `project_query` | `{ query: string }` | Search codebase by concept via ForgeNexus |
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
| `project://architecture` | Architecture overview from ForgeNexus clusters |
| `project://conventions` | Coding conventions and patterns |

### Prompts

| Prompt | Arguments | Description |
|--------|-----------|-------------|
| `debug-issue` | `{ error: string, file?: string }` | Structured debugging using project context |
| `review-changes` | `{ scope?: string }` | Code review with conventions awareness |
| `plan-feature` | `{ feature: string }` | Feature planning with architecture context |

## Graceful Degradation

```
IF ForgeNexus tools fail:
  → Disable affected MCP tools
  → Keep resources and prompts working
  → Log: "⚠ ForgeNexus unavailable — MCP tools limited"

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
- **code-intelligence.md** — Shares ForgeNexus data source

## Workspace Isolation (Zero-Friction)

> **Problem solved:** When forgewright is a submodule in multiple projects, each project needs its own MCP config. Previously, a global `claude_desktop_config.json` with hardcoded paths caused conflicts when switching workspaces.

### Architecture

```
Antigravity global config (SINGLE entry):
  forgewright-workspace → forgewright-mcp-launcher.sh

Per-workspace manifest:
  <project>/.antigravity/mcp-manifest.json
    → Lists allowed MCP servers
    → Workspace-relative paths

Launcher reads manifest:
  → Resolves absolute paths
  → Auto-installs deps if needed
  → Returns MCP config to Antigravity
```

### Manifest Format

```json
{
  "manifest_version": "1.0",
  "workspace": "/absolute/path/to/project",
  "generated_at": "2026-04-18T...",
  "generated_by": "forgewright/mcp-generator",
  "forgewright_version": "7.0.0",
  "servers": [
    {
      "name": "myproject-forgewright",
      "type": "forgewright-mcp-server",
      "enabled": true,
      "description": "..."
    },
    {
      "name": "forgenexus",
      "type": "forgenexus",
      "enabled": true,
      "config": {
        "forgenexus_path": "optional/override/path.js"
      }
    }
  ]
}
```

### Allowed Server Types (Allowlist)

Only these server types are permitted in manifests:

| Type | Description |
|------|-------------|
| `forgewright-mcp-server` | Auto-generated project MCP server |
| `forgenexus` | Code intelligence graph |
| `notebooklm-mcp` | NotebookLM integration |

### Security

- **Path validation:** All paths are validated for traversal (`..`) and blocked for `.git`, `.env`
- **Allowlist only:** Arbitrary commands cannot be added — only pre-approved server types
- **Repo-committed:** Manifest travels with the project, auditable by git

---

## Unity Project Detection

The MCP Generator can detect Unity projects and offer Unity-MCP integration.

### Detection Criteria

A project is identified as Unity if:
1. `Assets/` folder exists
2. `ProjectSettings/ProjectVersion.txt` exists
3. `Packages/manifest.json` exists with Unity registry

```bash
# Check for Unity project
if [ -d "Assets" ] && [ -f "ProjectSettings/ProjectVersion.txt" ]; then
  echo "Unity project detected"
fi
```

### Unity Project Options

When Unity project is detected, offer to generate:

1. **Unity-MCP Config Snippet** — Quick config for Unity-MCP connection
2. **Unity-Specific Tools** — Game-related ForgeNexus tools
3. **Documentation** — Link to `docs/unity-mcp-setup.md`

### Unity-MCP Config Generation

For Unity projects, generate a config snippet:

```json
{
  "mcpServers": {
    "unity-game-developer": {
      "command": "<unity-project>/Library/mcp-server/osx-arm64/unity-mcp-server",
      "args": ["--port=8080", "--client-transport=stdio"]
    }
  }
}
```

### Unity-Specific ForgeNexus Queries

Unity projects benefit from game-specific queries:

| Query | Use Case |
|-------|----------|
| "MonoBehaviour scripts" | Find gameplay scripts |
| "ScriptableObject" | Find data assets |
| "NetworkVariable" | Find networked state |
| "Shader Graph" | Find visual assets |

### Workflow for Unity Projects

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Detect Unity project via file structure                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Offer Unity-MCP integration                                 │
│    "Detected Unity project. Configure Unity-MCP?"              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. If yes: Generate Unity-MCP config + docs link               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. User installs Unity-MCP in Unity Editor                     │
│    → unity-mcp-cli install-plugin ./MyUnityProject             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Forgewright Unity skills can now leverage Unity-MCP tools    │
└─────────────────────────────────────────────────────────────────┘
```
