# Forgewright — Adaptive AI Orchestrator

> **Self-contained setup guide.** Read top-to-bottom once. Run `/pipeline`, `/onboard`, or `/setup` as shortcuts.
>
> **Agent note:** Every bash block below is executable as-is. Use `$(pwd)` and `$(realpath ...)` for dynamic path resolution. Do not assume fixed paths.

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-7.7.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/skills-52-brightgreen.svg" alt="Skills" />
  <img src="https://img.shields.io/badge/modes-19-blueviolet.svg" alt="Modes" />
  <img src="https://img.shields.io/badge/protocols-15-00CED1.svg" alt="Protocols" />
  <img src="https://img.shields.io/badge/Game_Dev-Unity·Unreal·Godot·Roblox-FF4500.svg" alt="Game Dev" />
  <img src="https://img.shields.io/badge/Code_Intelligence-ForgeNexus-4B0082.svg" alt="Code Intelligence" />
  <img src="https://img.shields.io/badge/Parallel-Git_Worktrees-orange.svg" alt="Parallel" />
</p>

---

## TL;DR — What Is This?

**Forgewright** is an AI-powered orchestrator that routes your request through the right skills automatically.

- You say: *"Build a production-grade SaaS for X"* or *"Build a Unity multiplayer game"*
- Forgewright activates: Business Analyst → Product Manager → Architect → Engineers → QA → Security → DevOps → SRE
- Output: production-ready code, reviewed, tested, scored 0–100

**Pipeline:** `DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW`
**Skills:** 52 specialized AI agents covering SaaS, game dev, XR, AI/ML, data engineering, and growth.

---

## Agent Setup — Executable Checklist

> Follow every step in order. Each step is **machine-executable** — copy, paste, run.

---

### Step 0 — Self-Discovery

Run this once at the start of any session:

```bash
# 1. Determine your role
CWD="$(pwd)"
FW_PLUGINS="$(realpath "$CWD/.antigravity/plugins/production-grade" 2>/dev/null || echo "")"
IS_FORGEWRIGHT_REPO="$(echo "$CWD" | grep -q 'forgewright' && echo "yes" || echo "no")"
FORGEWRIGHT_ROOT="$(realpath "$(dirname "$(realpath "$0" 2>/dev/null || echo "$0")")/.." 2>/dev/null || echo ".")"
echo "CWD: $CWD"
echo "IS_FORGEWRIGHT_REPO: $IS_FORGEWRIGHT_REPO"
echo "FORGEWRIGHT_ROOT: $FORGEWRIGHT_ROOT"
```

| Condition | What this is | Next step |
|-----------|-------------|-----------|
| `IS_FORGEWRIGHT_REPO=yes` | This IS the forgewright repository | Step 1 (a) |
| `$FW_PLUGINS` is non-empty | Forgewright is installed as a submodule | Step 1 (b) |
| Otherwise | This is a project repo without forgewright | Step 1 (c) |

---

### Step 1 — Install Forgewright

#### (A) You are inside the forgewright repo

> Skip if you are in a project repo.

```bash
# Verify setup files exist
ls skills/production-grade/SKILL.md   # orchestrator entry point
ls setup.sh                           # root setup script
ls CLAUDE.md                          # code intelligence rules
echo "Forgewright repo verified."
```

#### (B) Forgewright is installed as a submodule

```bash
# Verify submodule is initialized
git submodule update --init --recursive .antigravity/plugins/production-grade

# Verify installation
ls .antigravity/plugins/production-grade/skills/ | wc -l   # should be 52
ls .antigravity/plugins/production-grade/CLAUDE.md          # should exist
ls .antigravity/plugins/production-grade/AGENTS.md          # should exist

# If submodule not initialized (empty output), run:
# git submodule update --init --recursive
```

#### (C) This is a project repo without forgewright

```bash
# Run from project root (NOT from inside forgewright)
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git .antigravity/plugins/production-grade

# Copy required files
cp .antigravity/plugins/production-grade/AGENTS.md ./AGENTS.md
cp .antigravity/plugins/production-grade/CLAUDE.md ./CLAUDE.md

# Commit
git add .gitmodules .antigravity AGENTS.md CLAUDE.md
git commit -m "feat: add forgewright v7.7 — 52 skills, ForgeNexus, MCP server"

# Verify
git submodule update --init --recursive .antigravity/plugins/production-grade
```

---

### Step 2 — ForgeNexus Code Intelligence

> **What this does:** Indexes your codebase into a knowledge graph. Lets you ask *"what breaks if I change this function?"* with instant blast-radius analysis.
> **Prerequisite:** Node.js 18+
> **Time:** 10–60 seconds depending on project size.

#### 2a — Find forgewright root (dynamic, no hardcoded paths)

```bash
# OPTION 1: If forgewright is a submodule in this project
FW_ROOT="$(realpath .antigravity/plugins/production-grade)"   # from project root

# OPTION 2: If you are inside the forgewright repo
FW_ROOT="$(pwd)"                                               # already at forgewright root

# OPTION 3: If forgewright is a sibling directory
FW_ROOT="$(realpath "$(dirname "$(pwd)")/forgewright")"        # sibling clone

echo "Forgewright root: $FW_ROOT"
```

#### 2b — Detect existing ForgeNexus installation

```bash
# Check if forgenexus package exists
if [ -f "$FW_ROOT/forgenexus/package.json" ]; then
    echo "FORGENEXUS_PKG=found"
else
    echo "FORGENEXUS_PKG=missing"
fi

# Check if forgenexus is already built
if [ -f "$FW_ROOT/forgenexus/dist/cli/index.js" ]; then
    echo "FORGENEXUS_BUILD=found"
else
    echo "FORGENEXUS_BUILD=missing"
fi

# Check if project is already indexed
FORGENEXUS_DB="$FW_ROOT/forgenexus/data/$(basename "$(pwd)").db"
if [ -f "$FORGENEXUS_DB" ]; then
    echo "FORGENEXUS_INDEX=found ($FORGENEXUS_DB)"
else
    echo "FORGENEXUS_INDEX=missing"
fi
```

#### 2c — Install & Build if needed

```bash
FW_ROOT="$(realpath .antigravity/plugins/production-grade 2>/dev/null || pwd)"
PROJECT_ROOT="$(pwd)"

# Install forgenexus if package missing
if [ ! -f "$FW_ROOT/forgenexus/package.json" ]; then
    echo "Installing forgenexus..."
    mkdir -p "$FW_ROOT"
    git clone https://github.com/buiphucminhtam/forgewright.git "$FW_ROOT" --depth 1
fi

# Install npm dependencies
cd "$FW_ROOT/forgenexus" && npm install

# Build if dist missing
if [ ! -f "$FW_ROOT/forgenexus/dist/cli/index.js" ]; then
    npm run build 2>&1 || npm run compile 2>&1
fi
```

#### 2d — Analyze the codebase

```bash
FW_ROOT="$(realpath .antigravity/plugins/production-grade 2>/dev/null || pwd)"
PROJECT_ROOT="$(pwd)"

# Run index (auto-detects: new → analyze, existing → checks freshness)
cd "$FW_ROOT"
npx --yes forgenexus analyze "$PROJECT_ROOT"

# Verify
npx forgenexus status "$PROJECT_ROOT"
```

---

### Step 3 — Generate MCP Config

> **What this does:** Creates a ForgeNexus MCP configuration so your AI client has access to 12 tools (`query`, `context`, `impact`, `detect_changes`, `rename`, `cypher`, `route_map`, `tool_map`, `shape_check`, `api_impact`, `pr_review`, `list_repos`) and 3 resources.
> **Time:** ~30 seconds (Step 2 already built forgenexus, this just writes the config).

#### 3a — Detect ForgeNexus build location

```bash
FW_ROOT="$(realpath .antigravity/plugins/production-grade 2>/dev/null || pwd)"
PROJECT_ROOT="$(pwd)"

# Determine the forgenexus entry point
if [ -f "$FW_ROOT/forgenexus/dist/cli/index.js" ]; then
    FORGENEXUS_ENTRY="$FW_ROOT/forgenexus/dist/cli/index.js"
    echo "FORGENEXUS_ENTRY=$FORGENEXUS_ENTRY (pre-built)"
else
    FORGENEXUS_ENTRY="$FW_ROOT/forgenexus/src/cli/index.ts"
    echo "FORGENEXUS_ENTRY=$FORGENEXUS_ENTRY (TypeScript, use with tsx)"
fi

# Verify entry point exists
if [ ! -f "$FORGENEXUS_ENTRY" ] && [ ! -f "${FORGENEXUS_ENTRY%.ts}.js" ]; then
    echo "ERROR: forgenexus not found at $FORGENEXUS_ENTRY"
    echo "Fix: run Step 2 (ForgeNexus install + build) first."
    exit 1
fi

echo "OK: forgenexus ready"
```

#### 3b — Write MCP config

```bash
FW_ROOT="$(realpath .antigravity/plugins/production-grade 2>/dev/null || pwd)"
PROJECT_ROOT="$(pwd)"

mkdir -p "$PROJECT_ROOT/.forgewright/mcp-server"

# Detect entry point
if [ -f "$FW_ROOT/forgenexus/dist/cli/index.js" ]; then
    FORGENEXUS_ENTRY="$FW_ROOT/forgenexus/dist/cli/index.js"
    RUNNER="node"
else
    FORGENEXUS_ENTRY="$FW_ROOT/forgenexus/src/cli/index.ts"
    RUNNER="npx"
    RUNNER_ARGS="tsx"
fi

# Build the command args based on entry type
if [ "$RUNNER" = "node" ]; then
    MCP_ARGS="[\"node\",\"$FORGENEXUS_ENTRY\",\"mcp\",\"$PROJECT_ROOT\"]"
else
    MCP_ARGS="[\"npx\",\"tsx\",\"$FORGENEXUS_ENTRY\",\"mcp\",\"$PROJECT_ROOT\"]"
fi

# Write .cursor/mcp.json (Cursor and VS Code use the same format)
mkdir -p "$PROJECT_ROOT/.cursor"
cat > "$PROJECT_ROOT/.cursor/mcp.json" << EOF
{
  "mcpServers": {
    "forgenexus": {
      "command": "$RUNNER",
      "args": $MCP_ARGS
    }
  }
}
EOF

# Also write project-level forgenexus metadata
cat > "$PROJECT_ROOT/.forgewright/mcp-server/mcp-config.json" << EOF
{
  "forgewright_version": "7.7.0",
  "forgenexus_entry": "$FORGENEXUS_ENTRY",
  "runner": "$RUNNER",
  "project_root": "$PROJECT_ROOT",
  "tools": [
    "query", "context", "impact", "detect_changes", "rename",
    "cypher", "route_map", "tool_map", "shape_check", "api_impact",
    "pr_review", "list_repos"
  ],
  "resources": ["project://profile", "project://conventions"],
  "prompts": ["debug-issue", "review-changes", "plan-feature"]
}
EOF

echo "MCP config written:"
cat "$PROJECT_ROOT/.cursor/mcp.json"
```

---

### Step 4 — Enable MCP in Your AI Client

> **If you ran Step 3b, your `.cursor/mcp.json` is already written.** Just restart your AI client.

#### Cursor

```bash
PROJECT_ROOT="$(pwd)"
# Step 3b already wrote .cursor/mcp.json
# Just verify it:
cat "$PROJECT_ROOT/.cursor/mcp.json"

# If you need to install at a custom path:
# mkdir -p .cursor
# (paste the content from Step 3b output)
```

#### Claude Code (macOS)

```bash
PROJECT_ROOT="$(pwd)"

mkdir -p "$HOME/Library/Application Support/Claude"

# Read the config from Step 3b output and write to Claude's settings
# The forgenexus MCP works across all projects (uses registry to find repo by path)
cat > "$HOME/Library/Application Support/Claude/claude_desktop_config.json" << 'EOF'
{
  "mcpServers": {
    "forgenexus": {
      "command": "node",
      "args": ["PATH_TO_FORGENEXUS/dist/cli/index.js", "mcp", "PATH_TO_YOUR_PROJECT"]
    }
  }
}
EOF

# Substitute paths dynamically
FORGENEXUS_PATH="$(realpath .antigravity/plugins/production-grade/forgenexus 2>/dev/null || pwd)"
sed -i '' "s|PATH_TO_FORGENEXUS|$FORGENEXUS_PATH|g" "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
sed -i '' "s|PATH_TO_YOUR_PROJECT|$(pwd)|g" "$HOME/Library/Application Support/Claude/claude_desktop_config.json"

echo "Installed. Config:"
cat "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

#### VS Code (uses same format as Cursor)

```bash
PROJECT_ROOT="$(pwd)"
mkdir -p "$PROJECT_ROOT/.vscode"
# VS Code reads .vscode/mcp.json — copy from Step 3b output:
cp "$PROJECT_ROOT/.cursor/mcp.json" "$PROJECT_ROOT/.vscode/mcp.json"
echo "VS Code MCP config installed at: $PROJECT_ROOT/.vscode/mcp.json"
```

#### Windows (PowerShell)

```powershell
$projectRoot = (Get-Location).Path
$fwRoot = $null
if (Test-Path ".antigravity\plugins\production-grade") {
    $fwRoot = (Get-Item ".antigravity\plugins\production-grade").FullName
} else {
    $fwRoot = (Get-Item "forgewright").FullName
}
$forgenexusEntry = "$fwRoot\forgenexus\dist\cli\index.js"

# Claude Desktop config
$claudeDir = "$env:USERPROFILE\AppData\Roaming\Claude"
if (-not (Test-Path $claudeDir)) { New-Item -ItemType Directory -Path $claudeDir -Force }
$config = @{
    mcpServers = @{
        forgenexus = @{
            command = "node"
            args = @($forgenexusEntry, "mcp", $projectRoot)
        }
    }
}
$config | ConvertTo-Json -Depth 10 | Set-Content "$claudeDir\claude_desktop_config.json" -Encoding UTF8
Write-Host "Installed: $claudeDir\claude_desktop_config.json"
```

#### Verify MCP Connection

```bash
FORGENEXUS_ENTRY="$(realpath .antigravity/plugins/production-grade/forgenexus/dist/cli/index.js 2>/dev/null || echo 'NOT_BUILT')"
echo "ForgeNexus entry: $FORGENEXUS_ENTRY"

# Quick smoke test (JSON-RPC tools/list)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
    node "$FORGENEXUS_ENTRY" mcp . 2>/dev/null | \
    head -5 || echo "Server not responding (run: npm run build in forgenexus/)"

# Expected: {"jsonrpc":"2.0","id":1,"result":{"tools":[...

# Restart AI client, then test in chat:
# forgenexus_list_repos()
# forgenexus_query({query: "your query here"})
```

**If tools don't appear after restart, common causes:**
- `cwd` in config must point to your project root (not forgewright root)
- Run `npx --yes forgenexus analyze .` first to index the project
- Restart the AI client after any config changes

---

### Step 5 — Rules (Read Before Any Code Edit)

> These rules MUST be followed. They protect against breaking changes and hallucinations.

#### Before editing any function/class/method:

```bash
# Run blast-radius analysis
impact({target: "functionName", direction: "upstream"})
```

| Risk | Meaning | Action |
|------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |
| HIGH / CRITICAL | ⚠️ **WARN THE USER before proceeding.** |

#### Before committing any changes:

```bash
# Check affected scope
detect_changes({scope: "staged"})
```

#### Before renaming any symbol:

```bash
# NEVER use find-and-replace for renaming
# ALWAYS use the call-graph-aware rename tool
rename({
  symbol_name: "oldFunctionName",
  new_name: "newFunctionName",
  dry_run: true
})
```

#### Self-check before finishing any task:

1. `impact` was run for all modified symbols
2. No HIGH or CRITICAL risk warnings were ignored
3. `detect_changes({scope: "staged"})` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

---

### Step 6 — Agent Workflow

After completing Steps 1–5, Forgewright is fully operational.

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
| Index is stale | Run `npx forgenexus analyze "$(pwd)"` |
| Submodule not initialized | Run `git submodule update --init --recursive` |
| AGENTS.md not detected | Ensure it's in project root, not in submodule |
| `mcp-generate.sh` fails | Run `npm run build` in `forgenexus/` directory first |
| Windows: `bash` not found | Use PowerShell commands in Step 4 (Windows section) |
| `realpath` not found on macOS | Install with `brew install coreutils`, or use `pwd` and `dirname` as fallback |

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
