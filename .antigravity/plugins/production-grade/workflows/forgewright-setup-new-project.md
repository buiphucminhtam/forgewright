# Forgewright Setup — New Project (Greenfield)

> Copy & paste this prompt to set up Forgewright in a brand-new project.

---

## Prompt

```
I want to set up Forgewright in a brand new project from scratch.
Please do the following in order:

## Step 1 — Initialize Git

Run:
bash
git init
git add .
git commit -m "chore: initial commit"

## Step 2 — Install Forgewright as git submodule

bash
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git forgewright
git submodule update --init --recursive

## Step 3 — Copy required files to project root

bash
cp forgewright/AGENTS.md AGENTS.md
cp forgewright/CLAUDE.md CLAUDE.md
cp forgewright/README.md FORGEWRIGHT.md

## Step 4 — Commit

bash
git add .gitmodules forgewright AGENTS.md CLAUDE.md FORGEWRIGHT.md
git commit -m "feat: add Forgewright — 56 skills, ForgeNexus, MCP"

## Step 5 — Power Level Setup

### Level 1 (already done above) — Basic
56 skills + full pipeline. Nothing extra needed.

### Level 2 — Smart (ForgeNexus code intelligence)
**What you get:** Ask "what breaks if I change this function?" — instant blast-radius analysis.
**Requires:** Node.js 18+

Run:
bash
cd forgewright
npm install && npm run build
cd ..

# Index your project
npx forgenexus analyze "$(pwd)"

# Verify
npx forgenexus status "$(pwd)"

### Level 3 — Persistent Memory (Cross-session context)
**What you get:** The orchestrator remembers decisions, architecture, blockers across sessions.
**Requires:** Python 3.8+

Run:
bash
bash forgewright/scripts/ensure-mem0.sh "$(pwd)"
ls .forgewright/memory.jsonl   # must exist
python3 forgewright/scripts/mem0-cli.py refresh

### Level 4 — MCP Tools (Full multi-project setup)
**What you get:** `query`, `context`, `impact`, `detect_changes`, `rename`, `cypher`, `route_map`, `tool_map`, `shape_check`, `api_impact`, `pr_review`, `list_repos`
**Requires:** Step 2

Run the ONE-COMMAND setup:
bash
cd forgewright
bash scripts/mcp-generate.sh

Then update your global MCP config with a SINGLE entry:

**For Cursor (`~/.cursor/mcp.json`):**
json
{
  "mcpServers": {
    "forgewright": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"]
    },
    "forgenexus": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgenexus-mcp-launcher.sh"]
    }
  }
}

**For Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):**
json
{
  "mcpServers": {
    "forgewright": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgewright-mcp-launcher.sh"]
    },
    "forgenexus": {
      "command": "bash",
      "args": ["/path/to/forgewright/scripts/forgenexus-mcp-launcher.sh"]
    }
  }
}

⚠️ Replace `/path/to/forgewright` with the actual path to your forgewright submodule.

Restart Cursor/Claude after adding the config.

## Step 6 — Verify Full Setup

bash
FW_ROOT="$(pwd)/forgewright"
echo "=== Forgewright Power Level Check ==="
echo "Skills: $(ls "$FW_ROOT/skills" -1 2>/dev/null | wc -l | tr -d ' ') / 56"
echo "ForgeNexus: $([ -f "$FW_ROOT/forgenexus/dist/cli/index.js" ] && echo '✓ built' || echo '✗ missing')"
echo "MCP server: $([ -d ".forgewright/mcp-server" ] && echo '✓ generated' || echo '✗ missing')"
echo "Memory: $([ -f ".forgewright/memory.jsonl" ] && echo '✓ initialized' || echo '✗ missing')"
echo "ForgeNexus indexed: $([ -d ".forgenexus" ] && echo '✓ yes' || echo '✗ run: npx forgenexus analyze')"
echo "======================================="

## Step 7 — Optional Enhancements

### AI Vision Testing (for mobile testing)
bash
npm install -g @anthropic-ai/midscene

### Web Scraping
bash
pip install "crawl4ai>=0.8.0"

## You're Ready!

Try these commands:
- "Build a production-grade SaaS for [your idea]"
- "Help me think about [your idea]"
- "Add [feature] to my project"
- "Review my code"

Or use workflow shortcuts:
- `/setup` — Re-run installation
- `/onboard` — Deep project analysis (creates `.forgewright/project-profile.json`)
- `/pipeline` — Show full pipeline reference
- `/mcp` — Regenerate MCP config
```

---

## What This Sets Up

| Component | Files Created |
|-----------|--------------|
| **56 Skills** | `forgewright/skills/` |
| **Orchestrator** | `CLAUDE.md`, `AGENTS.md`, `FORGEWRIGHT.md` |
| **ForgeNexus (Level 2)** | `.forgenexus/` — indexed code graph |
| **Memory (Level 3)** | `.forgewright/memory.jsonl` — persistent cross-session memory |
| **MCP Tools (Level 4)** | `~/.cursor/mcp.json` — 12 ForgeNexus tools in AI chat |

## Multi-Project Architecture

With the launcher setup, a **SINGLE global config** works across ALL projects:

```
~/.cursor/mcp.json (or Claude config)
├── forgewright → forgewright-mcp-launcher.sh
│   └── Auto-detects: FORGEWRIGHT_WORKSPACE → reads .antigravity/mcp-manifest.json
│       → Launches MCP server for THAT project
│
└── forgenexus → forgenexus-mcp-launcher.sh
    └── Auto-detects: workspace → reads .forgenexus/codebase.db
        → Launches MCP with correct code graph
```

**How it works:**

1. **Workspace Detection** — The launcher auto-detects the current workspace:
   - `FORGEWRIGHT_WORKSPACE` env var (set by Antigravity)
   - `MCP_WORKSPACE_ROOT` env var (MCP standard)
   - Git repository root (auto-detected)
   - Current working directory

2. **Project Isolation** — Each project has its own:
   - `.forgewright/mcp-server/` — MCP server
   - `.forgenexus/` — Code graph database
   - `.antigravity/mcp-manifest.json` — Workspace manifest

3. **No Config Switching** — One config entry per tool, works everywhere

## Power Levels Summary

| Level | What You Get |
|-------|-------------|
| **1** | 56 skills, full pipeline (BA→PM→Architect→BE→FE→QA→Security→DevOps→SRE) |
| **2** | + ForgeNexus code intelligence — blast-radius analysis, call chains, impact |
| **3** | + Persistent memory — cross-session context, remembers decisions |
| **4** | + 12 MCP tools — `query`, `context`, `impact`, `rename`, `cypher`, etc. |
