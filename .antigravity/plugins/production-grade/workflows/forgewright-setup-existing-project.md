# Forgewright Setup — Existing Project (Brownfield)

> Copy & paste this prompt to set up Forgewright in a project that already has code.

---

## Prompt

```
I want to set up Forgewright in my existing project.
Please do the following in order:

## Step 1 — Verify Git

Make sure the project is a git repository:
bash
git status

If not, run:
bash
git init
git add .
git commit -m "chore: initial commit before adding Forgewright"

## Step 2 — Add Forgewright as git submodule

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

### Level 1 — Basic (already done)
56 skills + full pipeline. Nothing extra needed.

### Level 2 — Smart (ForgeNexus code intelligence) ⚡⚡
**What you get:** Ask "what breaks if I change this function?" — instant blast-radius analysis.
**Requires:** Node.js 18+

Run:
bash
cd forgewright
npm install && npm run build
cd ..

# Index your EXISTING project
npx forgenexus analyze "$(pwd)"

# Verify
npx forgenexus status "$(pwd)"

**⚠️ Important for existing projects:**
If you have an old SQLite index (`.forgenexus/*.db`), migrate it first:
bash
node forgewright/forgenexus/scripts/migrate-sqlite-to-kuzu.js "$(pwd)" --dry-run
If the dry run looks good, remove `--dry-run` to execute.
After migration, regenerate embeddings:
bash
npx forgenexus analyze "$(pwd)" --embeddings

### Level 3 — Persistent Memory (Cross-session context) ⚡⚡⚡
**What you get:** The orchestrator remembers decisions, architecture, blockers across sessions.
**Requires:** Python 3.8+

bash
bash forgewright/scripts/ensure-mem0.sh "$(pwd)"
ls .forgewright/memory.jsonl   # must exist
python3 forgewright/scripts/mem0-cli.py refresh

### Level 4 — MCP Tools (Full multi-project setup) ⚡⚡⚡⚡
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

## Step 6 — Run Deep Onboarding (recommended for existing projects)

bash
/onboard

This creates:
- `.forgewright/project-profile.json` — project fingerprint (tech stack, architecture, dependencies)
- `.forgewright/code-conventions.md` — coding style learned from existing codebase

The orchestrator uses these files to adapt all skill execution to your project's conventions.

## Step 7 — Verify Full Setup

bash
FW_ROOT="$(pwd)/forgewright"
echo "=== Forgewright Power Level Check ==="
echo "Skills: $(ls "$FW_ROOT/skills" -1 2>/dev/null | wc -l | tr -d ' ') / 56"
echo "ForgeNexus: $([ -f "$FW_ROOT/forgenexus/dist/cli/index.js" ] && echo '✓ built' || echo '✗ missing')"
echo "MCP server: $([ -d ".forgewright/mcp-server" ] && echo '✓ generated' || echo '✗ missing')"
echo "Memory: $([ -f ".forgewright/memory.jsonl" ] && echo '✓ initialized' || echo '✗ missing')"
echo "ForgeNexus indexed: $([ -d ".forgenexus" ] && echo '✓ yes' || echo '✗ run: npx forgenexus analyze')"
echo "Project profile: $([ -f ".forgewright/project-profile.json" ] && echo '✓ onboarded' || echo '✗ run: /onboard')"
echo "======================================="

## Step 8 — Optional Enhancements

### AI Vision Testing (for mobile testing)
bash
npm install -g @anthropic-ai/midscene

### Web Scraping
bash
pip install "crawl4ai>=0.8.0"

## You're Ready!

For existing projects, Forgewright automatically detects your tech stack and adapts.
Try these commands:
- "Add [feature] to my existing project" — Feature mode
- "Harden my project for production" — Harden mode
- "Deploy my project" — Ship mode
- "Review my code" — Review mode
- "Write tests for this project" — Test mode
- "Optimize my project's performance" — Optimize mode

Or use workflow shortcuts:
- `/setup` — Re-run installation
- `/onboard` — Deep project analysis (creates `.forgewright/project-profile.json`)
- `/pipeline` — Show full pipeline reference
- `/mcp` — Regenerate MCP config
```

---

## What This Sets Up

| Component | Files Created | Why It Matters for Existing Projects |
|-----------|--------------|--------------------------------------|
| **56 Skills** | `forgewright/skills/` | Auto-detects tech stack from your project |
| **ForgeNexus (Level 2)** | `.forgenexus/` | Indexes YOUR existing codebase for blast-radius analysis |
| **Onboarding** | `.forgewright/project-profile.json` | Learns your project's conventions, architecture, dependencies |
| **Memory (Level 3)** | `.forgewright/memory.jsonl` | Remembers your project decisions across sessions |
| **MCP Tools (Level 4)** | `~/.cursor/mcp.json` | 12 tools for deep code intelligence on YOUR code |

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

**Benefits:**
- One config entry per tool, works for ALL projects
- No need to update config when switching projects
- Each project has its own `.forgewright/` and `.forgenexus/`
- Antigravity auto-detects workspace from git root

## Brownfield Safety Net

Forgewright automatically activates **Brownfield Safety** for existing projects:
- Auto git branching before any changes
- Baseline snapshots
- Protected paths (node_modules, .git, vendor, etc.)
- Change manifest
- Regression checks after every skill
- Rollback on gate failure

This means Forgewright will NEVER break your existing codebase.

## Power Levels Summary

| Level | What You Get |
|-------|-------------|
| **1** | 56 skills, full pipeline |
| **2** | + ForgeNexus indexes YOUR existing code |
| **3** | + Persistent memory — remembers YOUR project decisions |
| **4** | + 12 MCP tools — deep code intelligence on YOUR codebase |
