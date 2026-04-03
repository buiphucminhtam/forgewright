# Forgewright — Adaptive AI Orchestrator

> **Self-contained setup guide for AI agents (Cursor, Claude Code, Windsurf, etc.) and humans.**
> Read top-to-bottom once, then use `/pipeline`, `/onboard`, `/setup` as shortcuts.

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-7.7.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/skills-52-brightgreen.svg" alt="Skills" />
  <img src="https://img.shields.io/badge/modes-19-blueviolet.svg" alt="Modes" />
  <img src="https://img.shields.io/badge/protocols-15-00CED1.svg" alt="Protocols" />
  <img src="https://img.shields.io/badge/🎮_Game_Dev-Unity_·_Unreal_·_Godot_·_Roblox-FF4500.svg" alt="Game Dev" />
  <img src="https://img.shields.io/badge/🧠_Code_Intelligence-ForgeNexus-4B0082.svg" alt="Code Intelligence" />
  <img src="https://img.shields.io/badge/⚡_Parallel-Git_Worktrees-orange.svg" alt="Parallel" />
</p>

---

## TL;DR — What is this?

**Forgewright** is an AI-powered orchestrator that routes your request through the right skills automatically.

- You say: *"Build a production-grade SaaS for X"* or *"Build a Unity game with multiplayer"*
- Forgewright activates: Business Analyst → Product Manager → Architect → Engineers → QA → Security → DevOps → SRE
- Output: production-ready code, reviewed, tested, scored 0–100

**Pipeline:** `DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW`
**Skills:** 52 specialized AI agents covering SaaS, game dev, XR, AI/ML, data engineering, and growth.

---

## Agent Setup — Read First

If you are an AI agent reading this file, follow these steps in order. Each step is **executable** — run the commands exactly as shown.

### Step 1 — Determine Your Role

```bash
# Check: is this the forgewright repo itself, or a project using forgewright?
pwd
```

- **If this IS the forgewright repo** (`/forgewright$`) → Skip to Step 2.
- **If this is a project repo** → Run Step 1a then Step 1b.

#### Step 1a — Clone Forgewright into the project

```bash
# From your project root (NOT from inside forgewright repo)
cd /path/to/your/project
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git .antigravity/plugins/production-grade
```

#### Step 1b — Copy required files from forgewright

```bash
# Copy AGENTS.md to project root (required for AI auto-discovery)
cp .antigravity/plugins/production-grade/AGENTS.md ./AGENTS.md

# Copy CLAUDE.md to project root (required for ForgeNexus impact analysis rules)
cp .antigravity/plugins/production-grade/CLAUDE.md ./CLAUDE.md
```

#### Step 1c — Commit the setup

```bash
git add .gitmodules .antigravity AGENTS.md CLAUDE.md
git commit -m "feat: add forgewright v7.7 — 52 skills, ForgeNexus, MCP server"
```

#### Step 1d — Verify installation

```bash
# Check submodule is initialized
git submodule update --init --recursive

# Verify files exist
ls .antigravity/plugins/production-grade/skills/ | wc -l  # should show 52
ls .antigravity/plugins/production-grade/skills/production-grade/SKILL.md  # should exist
```

---

### Step 2 — Auto-Initialize Code Intelligence (ForgeNexus)

> **What this does:** Indexes your codebase into a knowledge graph. Lets you ask *"what breaks if I change this function?"* and get instant blast-radius analysis.
> **Prerequisite:** Node.js 18+
> **Time:** 10–60 seconds depending on project size.

```bash
# OPTION A — Project-level (recommended): index the current project
npx --yes forgenexus analyze "$(pwd)"

# OPTION B — If forgenexus not in PATH, run from forgewright directory
# (from forgewright repo root or submodule path)
cd .antigravity/plugins/production-grade
npx --yes forgenexus analyze /path/to/your/project

# OPTION C — If analyze fails, check why:
npx forgenexus analyze /path/to/your/project 2>&1 | head -20
```

**If ForgeNexus is already installed (index exists):**
```bash
# Verify index is fresh
npx forgenexus status /path/to/your/project

# If stale, re-index
npx --yes forgenexus analyze /path/to/your/project
```

**If ForgeNexus is NOT installed:**
```bash
# Install it first (from forgewright repo or submodule)
npm install --prefix .antigravity/plugins/production-grade/forgenexus
```

**Verify ForgeNexus is working:**
```bash
npx forgenexus status /path/to/your/project
# Expected: shows symbol count, relationship count, index freshness
```

---

### Step 3 — Generate MCP Server Config

> **What this does:** Creates a project-specific MCP server so your AI client has access to ForgeNexus tools (`query`, `context`, `impact`, `detect_changes`, `rename`, `cypher`).
> **Time:** 5 seconds.

```bash
# From forgewright directory (repo root or submodule)
cd .antigravity/plugins/production-grade
bash scripts/mcp-generate.sh

# Or from project root if forgewright is a submodule:
bash .antigravity/plugins/production-grade/scripts/mcp-generate.sh
```

**What the script does:**
1. Reads `forgenexus/src/mcp/server.ts`
2. Compiles TypeScript → JavaScript
3. Writes MCP config to `.forgewright/mcp-server/mcp-config.json`
4. Outputs the exact JSON to add to your AI client's MCP settings

**If the script fails:**
```bash
# Manual fallback — compile MCP server manually
cd .antigravity/plugins/production-grade/forgenexus
npm run build 2>&1 || npm run compile 2>&1
```

**Verify MCP config was generated:**
```bash
cat .forgewright/mcp-server/mcp-config.json
# Should contain "mcpServers" with forgewright + forgenexus entries
```

---

### Step 4 — Add MCP Server to Your AI Client

#### Cursor

Add to `.cursor/mcp.json` (project-level) or global Cursor settings:

```json
{
  "mcpServers": {
    "forgenexus": {
      "command": "node",
      "args": [
        "ABSOLUTE_PATH_TO_FORGEWRIGHT/forgenexus/dist/cli/index.js",
        "mcp",
        "ABSOLUTE_PATH_TO_PROJECT"
      ]
    }
  }
}
```

**How to get the correct paths:**
```bash
# Get forgewright path
realpath .antigravity/plugins/production-grade

# Get project path
pwd

# Use sed to substitute into the config
FORGEWRIGHT_PATH="$(realpath .antigravity/plugins/production-grade)"
PROJECT_PATH="$(pwd)"
sed -e "s|ABSOLUTE_PATH_TO_FORGEWRIGHT|$FORGEWRIGHT_PATH|g" \
    -e "s|ABSOLUTE_PATH_TO_PROJECT|$PROJECT_PATH|g" \
    .forgewright/mcp-server/mcp-config.json > .cursor/mcp.json
```

#### Claude Code (claude-code)

Add to `~/.claude/settings.json` (global) or project-level `.claude.json`:

```json
{
  "mcpServers": {
    "forgenexus": {
      "command": "node",
      "args": [
        "ABSOLUTE_PATH_TO_FORGEWRIGHT/forgenexus/dist/cli/index.js",
        "mcp",
        "ABSOLUTE_PATH_TO_PROJECT"
      ]
    }
  }
}
```

#### VS Code

VS Code uses the same MCP config format as Cursor. Add to `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "forgenexus": {
      "command": "node",
      "args": [
        "ABSOLUTE_PATH_TO_FORGEWRIGHT/forgenexus/dist/cli/index.js",
        "mcp",
        "ABSOLUTE_PATH_TO_PROJECT"
      ]
    }
  }
}
```

**Verify MCP connection:**

After adding the config, restart your AI client and run:

```
forgenexus_status
```

You should see symbol count and index freshness. If not, check:

```bash
# 1. Verify node is accessible
node --version

# 2. Verify the forgenexus CLI exists
ls ABSOLUTE_PATH_TO_FORGEWRIGHT/forgenexus/dist/cli/index.js

# 3. Test CLI directly
node ABSOLUTE_PATH_TO_FORGEWRIGHT/forgenexus/dist/cli/index.js status ABSOLUTE_PATH_TO_PROJECT
```

---

### Step 5 — Mandatory Rules for Every Edit

> **These rules MUST be followed before any code modification.** They protect against breaking changes and hallucinations.

#### Before editing any function/class/method:

```bash
# Run blast-radius analysis
forgenexus_impact({target: "functionName", direction: "upstream"})
```

- **Risk d=1:** WILL BREAK — direct callers/importers. MUST update these.
- **Risk d=2:** LIKELY AFFECTED — indirect deps. Should test.
- **Risk d=3:** MAY NEED TESTING — transitive. Test if critical path.
- **If HIGH or CRITICAL risk:** ⚠️ **WARN THE USER before proceeding.**

#### Before committing any changes:

```bash
# Check affected scope
forgenexus_detect_changes({scope: "staged"})
```

Confirms changes only affect expected symbols and execution flows.

#### Before renaming any symbol:

```bash
# NEVER use find-and-replace for renaming
# ALWAYS use the call-graph-aware rename tool
forgenexus_rename({
  symbol_name: "oldFunctionName",
  new_name: "newFunctionName",
  dry_run: true
})
```

Review the preview. Graph edits are safe. Text-search edits need manual review. Then run with `dry_run: false`.

#### Self-check before finishing any task:

1. `forgenexus_impact` was run for all modified symbols
2. No HIGH or CRITICAL risk warnings were ignored
3. `forgenexus_detect_changes({scope: "staged"})` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

---

### Step 6 — How to Use (Agent Workflow)

After completing Steps 1–5, Forgewright is fully operational. Here's how requests flow:

#### Request → Mode Classification → Skill Routing

The orchestrator (`skills/production-grade/SKILL.md`) auto-classifies every request into one of 19 modes:

| You Say | Mode | Who Gets Activated |
|---------|------|--------------------|
| "Build a SaaS for X" | **Full Build** | BA → PM → Architect → BE → FE → QA → Security → DevOps → SRE |
| "Add [feature]" | **Feature** | PM → Architect → BE/FE → QA |
| "Build a Unity/Unreal/Godot/Roblox game" | **Game Build** | Game Designer → Engine Engineer → Level → Narrative → Technical Art → Audio → QA |
| "Build a VR/AR app" | **XR Build** | XR Engineer → Game Build Pipeline (if game-like) |
| "Review my code" | **Review** | Code Reviewer |
| "Write tests" | **Test** | QA Engineer |
| "Deploy / CI/CD" | **Ship** | DevOps → SRE |
| "Design UI for X" | **Design** | UX Researcher → UI Designer |
| "Build a mobile app" | **Mobile** | BA → Mobile Engineer (+ PM, Architect) |
| "Help me think about X" | **Explore** | Polymath co-pilot |
| "Deep research on X" | **Research** | Polymath + NotebookLM MCP |
| "Marketing strategy for X" | **Marketing** | Growth Marketer → Conversion Optimizer |
| "Optimize performance" | **Optimize** | Performance Engineer + SRE |
| "Test on Android/iOS" | **Mobile Test** | Mobile Tester (AI vision on real devices) |
| "Build AI feature / RAG" | **AI Build** | AI Engineer + Prompt Engineer + Data Scientist |
| "Debug / fix bug" | **Debug** | Debugger → Engineer |
| "Analyze requirements" | **Analyze** | Business Analyst |

#### Every Skill Follows the Plan Loop

Before any skill writes code, it MUST:

1. **PLAN** — Define scope, approach, deliverables
2. **SCORE** — Rate the plan against 8 criteria (threshold ≥ 8.0/10)
3. **META-EVALUATE** — Check: did we meet the quality bar?
4. **CHECK ≥ 8** — If yes, execute. If no → learn, research, improve, re-plan. Max 3 iterations.
5. **EXECUTE** — Write code, build, test, fix

---

## 52 Skills — Quick Reference

| Division | Skills |
|----------|--------|
| **Orchestrator & Meta** | production-grade, polymath, parallel-dispatch, memory-manager, skill-maker, mcp-generator |
| **Core Engineering** | business-analyst, product-manager, solution-architect, software-engineer, frontend-engineer, qa-engineer, security-engineer, code-reviewer, devops, sre, data-scientist, technical-writer, ui-designer, mobile-engineer, mobile-tester, api-designer, database-engineer, debugger, prompt-engineer, project-manager |
| **AI/ML & Data** | ai-engineer, performance-engineer, data-engineer, web-scraper, xlsx-engineer |
| **Accessibility & UX** | accessibility-engineer, ux-researcher |
| **Game Development** | game-designer, unity-engineer, unreal-engineer, godot-engineer, godot-multiplayer, roblox-engineer, level-designer, narrative-designer, technical-artist, game-audio-engineer, unity-shader-artist, unity-multiplayer, unreal-technical-artist, unreal-multiplayer, xr-engineer |
| **Growth** | growth-marketer, conversion-optimizer |

---

## Available Workflows (Shortcuts)

| Command | What It Does |
|---------|-------------|
| `/setup` | First-time install as git submodule |
| `/update` | Check for and install updates |
| `/pipeline` | Show full pipeline reference, modes, and skill list |
| `/onboard` | Deep project analysis — creates `.forgewright/project-profile.json` with tech stack, patterns, risk profile |
| `/mcp` | Generate or regenerate MCP server config |

---

## Power Levels — Optional Enhancements

| Level | What You Get | How to Enable |
|-------|-------------|---------------|
| ⚡ **Basic** | 52 skills, full pipeline | Steps 1–3 |
| ⚡⚡ **Smart** | Blast radius analysis, safe refactoring | Step 2 (ForgeNexus) |
| ⚡⚡⚡ **Persistent** | Cross-session memory | `python3 scripts/mem0-cli.py setup` |
| ⚡⚡⚡⚡ **Research** | NotebookLM MCP — grounded AI, zero hallucinations | `pip install notebooklm-mcp`, add to MCP config |
| ⚡⚡⚡⚡⚡ **Full Power** | Web crawling, AI vision testing, multi-agent | Steps 5–7 (see below) |

### Optional: Web Scraping (crawl4ai)

```bash
pip install "crawl4ai>=0.8.0"
# Then: "Scrape [URL]" or "Crawl [website]"
```

### Optional: AI Vision Testing (Midscene.js)

```bash
npm install -g @anthropic-ai/midscene
# Then: "Test on Android" or "Test on iOS"
```

### Optional: Multi-Agent (Paperclip)

```bash
npx paperclipai onboard --yes
cd paperclip && pnpm dev
# Dashboard: http://localhost:3100
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `forgenexus: command not found` | Run `npx forgenexus` instead of `forgenexus` |
| `npm install` fails in submodule | Check Node.js version (`node --version`), needs 18+ |
| MCP tools not showing up | Restart AI client after adding MCP config |
| Index is stale | Run `npx forgenexus analyze /path/to/project` |
| submodule not initialized | Run `git submodule update --init --recursive` |
| AGENTS.md not detected | Ensure it's in project root, not in submodule |
| `mcp-generate.sh` fails | Run `npm run build` in `forgenexus/` directory first |
| Windows: `bash` not found | Use `setup.ps1` instead of `setup.sh` |

---

## Contributing

1. Fork the repo
2. Create branch: `git checkout -b feature/your-feature`
3. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat(skill): add new capability`
4. Open a Pull Request

**Adding a skill:** Create `skills/your-skill-name/SKILL.md`. See any existing skill as a reference.

---

## License

MIT

---

<p align="center">
  <strong>Forgewright — 52 AI skills. 19 modes. 15 protocols. Code Intelligence. SaaS to AAA games. One prompt.</strong>
</p>
<p align="center">
  <em>Understand relationships, not just files. Validate with zero assumptions. Research with zero hallucinations. Build games across 4 engines. Ship with quality scoring. Grow with data.</em>
</p>
