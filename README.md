# Forgewright — Adaptive AI Orchestrator

> **Version 7.7** · 52 Skills · 19 Modes · 15 Protocols · ForgeNexus Code Intelligence

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-7.7.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/skills-52-brightgreen.svg" alt="Skills" />
  <img src="https://img.shields.io/badge/modes-19-blueviolet.svg" alt="Modes" />
  <img src="https://img.shields.io/badge/protocols-15-00CED1.svg" alt="Protocols" />
  <img src="https://img.shields.io/badge/Game_Dev-Unity·Unreal·Godot·Roblox-FF4500.svg" alt="Game Dev" />
  <img src="https://img.shields.io/badge/Code_Intelligence-ForgeNexus·GitNexus-4B0082.svg" alt="Code Intelligence" />
  <img src="https://img.shields.io/badge/Memory-Persistent%20(mem0)-00CED1.svg" alt="Memory" />
  <img src="https://img.shields.io/badge/MCP-12%20Tools-orange.svg" alt="MCP" />
</p>

---

## TL;DR — What Is This?

Forgewright is an AI-powered orchestrator that routes your request through the right skills automatically.

```
You say: "Build a production-grade SaaS for X"
        ↓
Forgewright activates:
  BA → PM → Architect → Engineers → QA → Security → DevOps → SRE
        ↓
Output: production-ready code, reviewed, tested, scored 0–100
```

**Pipeline:** `DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW`
**Skills:** 52 specialized AI agents covering SaaS, game dev, XR, AI/ML, data engineering, and growth.

---

## Agent Setup — Executable Checklist

> Follow every step in order. Each block is **machine-executable** — copy, paste, run.

---

### Step 0 — Detect Context

```bash
CWD="$(pwd)"
IS_FORGEWRIGHT_REPO="$(echo "$CWD" | grep -q 'forgewright' && echo "yes" || echo "no")"
FW_PLUGINS="$(realpath "$CWD/.antigravity/plugins/production-grade" 2>/dev/null || echo "")"
echo "CWD: $CWD"
echo "IS_FORGEWRIGHT_REPO: $IS_FORGEWRIGHT_REPO"
echo "FW_PLUGINS: $FW_PLUGINS"
```

| Condition | Next step |
|-----------|-----------|
| `IS_FORGEWRIGHT_REPO=yes` | **Step 1A** — Forgewright self-setup |
| `$FW_PLUGINS` non-empty | **Step 1B** — Submodule already installed |
| Otherwise | **Step 1C** — Add as git submodule |

---

### Step 1 — Install Forgewright

#### (A) Inside the forgewright repo — self-setup

```bash
# Verify core files
ls skills/production-grade/SKILL.md  # orchestrator entry
ls CLAUDE.md                          # code intelligence rules
ls AGENTS.md                          # 52-skill catalog
echo "Forgewright self-setup OK."
```

#### (B) Forgewright is a git submodule

```bash
# Initialize submodule
git submodule update --init --recursive .antigravity/plugins/production-grade

# Verify
ls .antigravity/plugins/production-grade/skills/ | wc -l   # should be 52
ls .antigravity/plugins/production-grade/CLAUDE.md          # must exist
ls .antigravity/plugins/production-grade/AGENTS.md          # must exist
echo "Submodule initialized."
```

#### (C) Add Forgewright as a submodule to any project

```bash
# Run from project root (NOT inside forgewright)
PROJECT_ROOT="$(pwd)"
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git \
  "$PROJECT_ROOT/.antigravity/plugins/production-grade"

# Copy required files to project root
cp "$PROJECT_ROOT/.antigravity/plugins/production-grade/AGENTS.md" \
   "$PROJECT_ROOT/AGENTS.md"
cp "$PROJECT_ROOT/.antigravity/plugins/production-grade/CLAUDE.md" \
   "$PROJECT_ROOT/CLAUDE.md"

# Commit
git add .gitmodules .antigravity AGENTS.md CLAUDE.md
git commit -m "feat: add forgewright v7.7 — 52 skills, ForgeNexus, MCP"

# Initialize
git submodule update --init --recursive .antigravity/plugins/production-grade
```

---

### Step 2 — Power Level Setup

Run from project root. Each command is independent — run what you need.

#### ⚡ Level 1 — Basic (52 skills + pipeline)

> Installed by Step 1. Nothing extra needed.

#### ⚡⚡ Level 2 — Smart (ForgeNexus code intelligence)

> **What you get:** Ask *"what breaks if I change this function?"* — instant blast-radius analysis.
> **Requires:** Node.js 18+

```bash
FW_ROOT="$(realpath .antigravity/plugins/production-grade 2>/dev/null || pwd)"
PROJECT_ROOT="$(pwd)"

# Build ForgeNexus (if not built)
if [ ! -f "$FW_ROOT/forgenexus/dist/cli/index.js" ]; then
    cd "$FW_ROOT" && npm install && npm run build
fi

# Index your project
cd "$FW_ROOT"
npx --yes forgenexus analyze "$PROJECT_ROOT"

# Verify
npx forgenexus status "$PROJECT_ROOT"
```

#### ⚡⚡⚡ Level 3 — Persistent Memory (Turn-Start + Turn-Close)

> **What you get:** Cross-session memory. The orchestrator remembers decisions, architecture, blockers across requests.
> **Why:** Without this, project memory only grows at gates — conversation facts are lost between turns.
> **Requires:** Python 3.8+

```bash
PROJECT_ROOT="$(pwd)"
FORGEWRIGHT_ROOT="$(realpath .antigravity/plugins/production-grade 2>/dev/null || pwd)"

# Initialize memory store
bash "$FORGEWRIGHT_ROOT/scripts/ensure-mem0.sh" "$PROJECT_ROOT"

# Verify
ls "$PROJECT_ROOT/.forgewright/memory.jsonl"   # must exist
python3 "$FORGEWRIGHT_ROOT/scripts/mem0-cli.py" refresh

# Skip if CI/headless only:
# FORGEWRIGHT_SKIP_MEM0=1
```

**How it works:**
- **Turn-Start** (before each request): loads conversation summary + recent turns + BA scope
- **Turn-Close** (after each request): writes `REQ: | DONE: | OPEN: | SCOPE_UPDATE:` to mem0
- The orchestrator calls these automatically — no manual action needed

#### ⚡⚡⚡⚡ Level 4 — Full Power (MCP + ForgeNexus tools)

> **What you get:** 12 ForgeNexus tools in your AI chat (`query`, `context`, `impact`, `detect_changes`, `rename`, `cypher`, `route_map`, `tool_map`, `shape_check`, `api_impact`, `pr_review`, `list_repos`)
> **Requires:** Step 2 + Step 3

```bash
FW_ROOT="$(realpath .antigravity/plugins/production-grade 2>/dev/null || pwd)"
PROJECT_ROOT="$(pwd)"

# Generate MCP config
bash "$FW_ROOT/scripts/mcp-generate.sh"

# Verify
ls "$PROJECT_ROOT/.forgewright/mcp-server/"
cat "$PROJECT_ROOT/.forgewright/mcp-server/mcp-config.json"
```

Then add to your AI client:

**Cursor / VS Code** — already written by Step 3:

```bash
cat ~/.cursor/mcp.json          # verify
# Restart Cursor after any MCP config change
```

**Claude Desktop (macOS):**

```bash
FORGENEXUS_ENTRY="$(realpath .antigravity/plugins/production-grade/forgenexus/dist/cli/index.js 2>/dev/null)"
cat > "$HOME/Library/Application Support/Claude/claude_desktop_config.json" << EOF
{
  "mcpServers": {
    "forgenexus": {
      "command": "node",
      "args": ["$FORGENEXUS_ENTRY", "mcp", "$PROJECT_ROOT"]
    }
  }
}
EOF
```

**Verify MCP connection:**

```bash
# Quick smoke test
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
    node "$(realpath .antigravity/plugins/production-grade/forgenexus/dist/cli/index.js)" \
    mcp "$PROJECT_ROOT" 2>/dev/null | head -5

# Expected: {"jsonrpc":"2.0","id":1,"result":{"tools":[...
```

---

### Step 3 — Verify Full Setup

```bash
PROJECT_ROOT="$(pwd)"
FW_ROOT="$(realpath .antigravity/plugins/production-grade 2>/dev/null || pwd)"

echo "=== Forgewright Power Level Check ==="
echo "Skills: $(ls "$FW_ROOT/skills" -1 2>/dev/null | wc -l | tr -d ' ') / 52"
echo "ForgeNexus: $([ -f "$FW_ROOT/forgenexus/dist/cli/index.js" ] && echo '✓ built' || echo '✗ missing')"
echo "MCP server: $([ -d "$PROJECT_ROOT/.forgewright/mcp-server" ] && echo '✓ generated' || echo '✗ missing')"
echo "Memory: $([ -f "$PROJECT_ROOT/.forgewright/memory.jsonl" ] && echo '✓ initialized' || echo '✗ missing')"
echo "ForgeNexus indexed: $([ -d "$PROJECT_ROOT/.forgewright/mcp-server" ] && echo '✓ yes' || echo '✗ run: npx forgenexus analyze')"
echo "======================================="
```

---

## The Flow — How Forgewright Works

### Architecture Overview

```
User Request
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (production-grade/SKILL.md)               │
│  • Classifies request → 19 modes                       │
│  • Routes to correct skills                            │
│  • Manages 3 approval gates                            │
└────────────────────┬────────────────────────────────────┘
                     │
     ┌───────────────┼──────────────────────┐
     ▼               ▼                      ▼
┌─────────┐    ┌──────────┐          ┌──────────┐
│ DEFINE  │    │   BUILD  │          │  HARDEN   │
│ Phase   │    │  Phase   │          │  Phase    │
└────┬────┘    └────┬─────┘          └────┬─────┘
     │              │                     │
     ▼              ▼                     ▼
┌──────────┐   ┌──────────┐          ┌──────────┐
│ Gate 1   │   │ Gate 2   │          │ Gate 3   │
│ APPROVE? │   │ APPROVE? │          │ APPROVE? │
└────┬─────┘   └────┬─────┘          └────┬─────┘
     │              │                      │
     ▼              ▼                      ▼
┌──────────┐   ┌──────────┐          ┌──────────┐
│  SHIP    │   │ SUSTAIN  │          │   GROW   │
└────┬─────┘   └────┬─────┘          └──────────┘
     │              │
     ▼              ▼
   Deploy        Monitor
```

### Middleware Chain (per skill execution)

```
User Request
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│ PRE-SKILL (top → bottom)                                 │
│  ① SessionData      Load profile, session state          │
│  ② ContextLoader    Memory + conventions + KIs           │
│  ③ SkillRegistry    Progressive skill discovery           │
│  ④ Guardrail        Pre-tool authorization              │
│  ⑤ Summarization    Auto-compress if >70% budget       │
├──────────────────────────────────────────────────────────┤
│ ══════════════ SKILL EXECUTION ═══════════════════════ │
├──────────────────────────────────────────────────────────┤
│ POST-SKILL (bottom → top)                                │
│  ⑥ QualityGate      4-level validation, 0–100 score      │
│  ⑦ BrownfieldSafety Regression check, change manifest    │
│  ⑧ TaskTracking     Update task.md                       │
│  ⑨ Memory           Turn-Close: REQ/DONE/OPEN → mem0   │
│  ⑩ GracefulFailure Retry management, exit strategy      │
└──────────────────────────────────────────────────────────┘
    │
    ▼
Result / Next Skill
```

### Session Lifecycle (Turn-Start + Turn-Close)

```
Session Start
    │
    ▼
  Step 0.5  Load .forgewright/ project context
  Step 1    Load project-profile.json
  Step 2    Load session-log.json (detect manual changes)
  Step 3    Load memory (mem0 search + code-conventions)
  Step 3.5  Check ForgeNexus freshness
  Step 4    Auto-detect greenfield vs brownfield
    │
    ▼
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  FOR EACH USER REQUEST (within session):                │
│                                                          │
│  TURN-START:                                             │
│    T1  Load CONVERSATION_SUMMARY.md                      │
│    T2  mem0 search: recent turns + session items         │
│    T3  Load BA scope + pipeline context                  │
│    → Pass all to orchestrator                           │
│                                                          │
│  [Orchestrator processes request via skills]             │
│                                                          │
│  TURN-CLOSE (mandatory after every response):           │
│    TC1 Auto-generate CONVERSATION_SUMMARY.md            │
│    TC2 mem0 add: REQ: | DONE: | OPEN: | SCOPE_UPDATE:   │
│    TC3 Optional: mem0 add for decisions/architecture/     │
│                 blockers                                  │
│    → Log: "✓ Turn-Close memory saved"                   │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
    │
    ▼
Session End
```

### ForgeNexus Analyze Pipeline (Code Intelligence)

```
npx forgenexus analyze
│
├── ① Scanner     glob file discovery + language detection
│
├── ② Parse       tree-sitter AST → nodes + 17 edge types
│   ┌──────────────────────────────────────────────────────┐
│   │  Worker Pool (cpus-1 threads, 20MB byte-budget)       │
│   │  • Each worker owns its own tree-sitter parser       │
│   │  • Graceful fallback: sequential if <15 files         │
│   └──────────────────────────────────────────────────────┘
│
├── ③ Resolve     Suffix Trie O(1) import path resolution
│
├── ④ Propagate   Cross-file binding: Kahn topological sort
│                 Fast-path: skip if <3% gaps
│
├── ⑤ Community   Leiden Algorithm
│                 3-phase (move → refine → aggregate)
│                 60s timeout · large-graph mode · degree filter
│
├── ⑥ Process     BFS entry-point tracing → call chains
│                 Auto-detect: Next.js, FastAPI, NestJS,
│                 Express, Django, Rails, Gin, Spring, etc.
│
├── ⑦ FTS         Incremental FTS5 — only changed nodes
│
├── ⑧ Embeddings  Cache-first · 5 providers (local + API)
│
└── ⑨ Meta        Commit tracking + early-exit on unchanged git

Performance gains vs original:
  Parallel parsing: 3-5x on multi-core
  Suffix trie: O(1) vs O(n×m) LIKE
  Incremental FTS: O(changed) vs O(all)
  Leiden: well-connected vs greedy Louvain
  Early exit: skip all phases if git unchanged
```

### Request → Mode → Skills Routing

| You Say | Mode | Skills Activated |
|---------|------|-----------------|
| "Build a SaaS for X" | **Full Build** | BA → PM → Architect → BE → FE → QA → Security → DevOps → SRE |
| "Add [feature]" | **Feature** | PM → Architect → BE/FE → QA |
| "Build a Unity/Unreal/Godot/Roblox game" | **Game Build** | Game Designer → Engine Engineer → Level → Narrative → Technical Art → Audio |
| "Build a VR/AR app" | **XR Build** | XR Engineer → XR Game Pipeline |
| "Build a mobile app" | **Mobile** | BA → Mobile Engineer → PM → Architect |
| "Build AI feature / RAG" | **AI Build** | AI Engineer → Prompt Engineer → Data Scientist |
| "Review my code" | **Review** | Code Reviewer |
| "Write tests" | **Test** | QA Engineer |
| "Deploy / CI/CD" | **Ship** | DevOps → SRE |
| "Design UI for X" | **Design** | UX Researcher → UI Designer |
| "Optimize performance" | **Optimize** | Performance Engineer → SRE |
| "Test on Android/iOS" | **Mobile Test** | Mobile Tester (AI vision on real devices) |
| "Deep research on X" | **Research** | Polymath + NotebookLM MCP |
| "Marketing strategy for X" | **Marketing** | Growth Marketer → Conversion Optimizer |
| "Help me think about X" | **Explore** | Polymath co-pilot |
| "Debug / fix bug" | **Debug** | Debugger → Engineer |
| "Analyze requirements" | **Analyze** | Business Analyst |

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

## Optional Enhancements

### 🌐 Web Scraping (crawl4ai)

```bash
pip install "crawl4ai>=0.8.0"
# Then: "Scrape [URL]" or "Crawl [website]"
```

### 👁 AI Vision Testing (Midscene.js)

```bash
npm install -g @anthropic-ai/midscene
# Then: "Test on Android" or "Test on iOS"
```

### 🤖 Multi-Agent (Paperclip)

```bash
npx paperclipai onboard --yes
cd paperclip && pnpm dev
# Dashboard: http://localhost:3100
```

### 🔬 Research (NotebookLM MCP)

```bash
pip install notebooklm-mcp
# Add to MCP config for grounded AI with zero hallucinations
```

---

## Quality Gate — Automated Validation

Run anytime to score your project 0–100:

```bash
bash scripts/forge-validate.sh

# CI mode (exit code only)
bash scripts/forge-validate.sh --quiet

# JSON report
bash scripts/forge-validate.sh --json
```

| Score | Grade | Meaning |
|-------|-------|---------|
| 90–100 | A | Production ready |
| 80–89 | B | Minor issues |
| 70–79 | C | Review recommended |
| 60–69 | D | Fix issues before deploy |
| < 60 | F | Unacceptable — block deploy |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `forgenexus: command not found` | Run `npx forgenexus` instead |
| `npm install` fails in submodule | Check `node --version` (needs 18+) |
| MCP tools not showing up | Restart AI client after any config change |
| Index is stale | `npx forgenexus analyze "$(pwd)"` |
| Submodule not initialized | `git submodule update --init --recursive` |
| `realpath` not found on macOS | `brew install coreutils` |
| `python3` not found | Install Python 3.8+ for memory features |
| Windows: `bash` not found | Use PowerShell equivalent commands |

---

## Available Workflow Shortcuts

| Command | What It Does |
|---------|-------------|
| `/setup` | First-time install as git submodule |
| `/update` | Check + install Forgewright updates (safe, preserves project changes) |
| `/pipeline` | Show full pipeline reference, modes, and skill list |
| `/onboard` | Deep project analysis — creates `.forgewright/project-profile.json` |
| `/mcp` | Generate or regenerate MCP server config |
| `/setup-mobile-test` | Set up plug-and-play mobile testing (Android/iOS) |

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
  <strong>Forgewright — 52 AI skills. 19 modes. 15 protocols. Persistent Memory. Code Intelligence. SaaS to AAA games.</strong>
</p>
<p align="center">
  <em>Plan with precision. Build with confidence. Scale with intelligence.</em>
</p>
