<p align="center">
  <img src="assets/forgewright-banner.png" alt="Forgewright Banner" width="100%" />
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-7.7.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/skills-52-brightgreen.svg" alt="Skills" />
  <img src="https://img.shields.io/badge/modes-19-blueviolet.svg" alt="Modes" />
  <img src="https://img.shields.io/badge/protocols-15-00CED1.svg" alt="Protocols" />
  <a href="https://github.com/buiphucminhtam/forgewright/stargazers"><img src="https://img.shields.io/github/stars/buiphucminhtam/forgewright?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/🎮_Game_Dev-Unity_·_Unreal_·_Godot_·_Roblox-FF4500.svg" alt="Game Dev" />
  <img src="https://img.shields.io/badge/🔬_Research-NotebookLM_MCP-00A67E.svg" alt="Research" />
  <img src="https://img.shields.io/badge/🕷️_Scraping-Crawl4AI_Secure-2EA44F.svg" alt="Web Scraping" />
  <img src="https://img.shields.io/badge/🧪_Testing-Midscene_·_Page_Agent-FF6B35.svg" alt="Testing" />
  <img src="https://img.shields.io/badge/📈_Growth-Marketing_·_CRO-E91E63.svg" alt="Growth" />
  <img src="https://img.shields.io/badge/⚡_Parallel-Git_Worktrees-orange.svg" alt="Parallel" />
  <img src="https://img.shields.io/badge/🧠_Code_Intelligence-ForgeNexus-4B0082.svg" alt="Code Intelligence" />
</p>

---

## What is Forgewright?

Forgewright is an **adaptive AI orchestrator** — not just a tool, but a full-stack engineering team powered by 52 specialized skills that collaborate through a structured lifecycle pipeline.

**Core differentiators:**

- **End-to-end lifecycle** — from initial research and requirements analysis all the way through to SEO, A/B testing, and growth optimization. No handoff gaps.
- **Multi-engine game development** — Unity, Unreal Engine, Godot, and Roblox under one pipeline. Not just "code generation" — full GDD, shaders, multiplayer, spatial audio.
- **AI-powered quality gates** — every skill output is scored 0–100. Build fails before merge if quality drops below threshold. No cowboy coding.
- **Code Intelligence** — knowledge graph engine (ForgeNexus) maps your entire codebase. Ask *"what breaks if I change this function?"* and get blast-radius analysis instantly.
- **Parallel execution** — independent tasks run simultaneously in git worktrees. Anti-hallucination validator checks each worker before merge.
- **Research-grounded AI** — NotebookLM MCP integration eliminates hallucinations. Every claim backed by real sources with citations.
- **Brownfield safety** — for existing projects: auto git branch, baseline tests, change manifest, rollback. Safe to experiment.

> **You say what you want.** Forgewright figures out which skills to activate, in what order, with what guardrails, and delivers a production-ready result.

<h3 align="center">52 AI Skills · 19 Modes · 15 Protocols · Full Lifecycle Pipeline</h3>

<p align="center">
  <strong>Research → Design → Build → Test → Secure → Deploy → Market → Grow</strong><br />
  <em>The only AI pipeline that covers the complete lifecycle — from SaaS to AAA games.</em>
</p>

<p align="center">
  <sub>Built on <a href="https://github.com/nagisanzenin/claude-code-production-grade-plugin">claude-code-production-grade-plugin</a>, <a href="https://github.com/ComposioHQ/awesome-claude-skills">awesome-claude-skills</a>, and <a href="https://github.com/msitarzewski/agency-agents">agency-agents</a>. Iteratively tested and improved across real projects.</sub>
</p>

---

## ⚡ Quick Start (One-Command Setup)

### For Existing Projects (recommended)

```bash
git clone https://github.com/buiphucminhtam/forgewright.git &&
  cd forgewright &&
  curl -sO https://raw.githubusercontent.com/buiphucminhtam/forgewright/main/setup.sh &&
  chmod +x setup.sh &&
  ./setup.sh install
```

Then commit:

```bash
cd .. && git add . && git commit -m "feat: add forgewright v7.7"
```

### For New Projects

```bash
git init && git remote add origin https://github.com/YOUR_USER/your-project.git &&
  git clone https://github.com/buiphucminhtam/forgewright.git &&
  cd forgewright &&
  curl -sO https://raw.githubusercontent.com/buiphucminhtam/forgewright/main/setup.sh &&
  chmod +x setup.sh &&
  ./setup.sh install &&
  cd .. && git add . && git commit -m "feat: add forgewright v7.7"
```

### What Gets Installed

| Component | Path | Purpose |
|-----------|------|---------|
| **52 Skills** | `.antigravity/plugins/production-grade/skills/` | Full pipeline |
| **AGENTS.md** | `./AGENTS.md` | Auto-discovery for AI clients |
| **ForgeNexus** | `./forgenexus/` | Code intelligence (AST → knowledge graph) |
| **MCP Server** | `./.forgewright/mcp-server/` | AI tool integration |
| **Memory CLI** | `./scripts/mem0-cli.py` | Cross-session memory |
| **Shared Protocols** | `.antigravity/plugins/production-grade/skills/_shared/protocols/` | 15 protocols |

After setup, simply tell the AI:

> *"Build a production-grade SaaS for [your idea]"* — or — *"Build a Unity game with multiplayer"*

---

## 🤖 For AI Agents — Vibe Coding Setup

If you're an AI agent (Cursor, Claude Code, etc.) and want to onboard Forgewright into a project, follow these steps in order:

### Step 1: Read the Orchestrator

```
Read: skills/production-grade/SKILL.md
```
This is the router that classifies every request into 1 of 19 modes.

### Step 2: Read the Code Intelligence Rules

```
Read: CLAUDE.md (root) — contains ForgeNexus impact analysis rules
```
**Mandatory rules before any edit:**
- `forgenexus_impact({target: "symbolName", direction: "upstream"})` — blast radius
- `forgenexus_detect_changes({scope: "staged"})` — pre-commit scope check

### Step 3: Auto-Initialize (if not done)

```bash
# Check if ForgeNexus is indexed
ls .forgewright/mcp-server/mcp-config.json 2>/dev/null || {
  echo "Auto-initializing ForgeNexus..."
  npx --yes forgenexus analyze 2>/dev/null || true
  bash .antigravity/plugins/production-grade/scripts/mcp-generate.sh 2>/dev/null || true
}
```

### Step 4: Run Project Onboarding (optional but recommended)

```
Say: "/onboard"
```
This creates `.forgewright/project-profile.json` with your tech stack, patterns, and risk profile.

### Step 5: Classify and Route

Based on the user's request, the orchestrator activates the right skills:

| Request Pattern | Mode | Entry Skill |
|----------------|------|-------------|
| "Build a SaaS for..." | Full Build | BA → PM → Architect → BE → FE → QA |
| "Add [feature]..." | Feature | PM → Architect → BE/FE → QA |
| "Build a game with Unity..." | Game Build | Game Designer → Unity Engineer |
| "Help me think about..." | Explore | Polymath |
| "Deep research on..." | Research | Polymath + NotebookLM MCP |
| "Review my code" | Review | Code Reviewer |
| "Deploy / CI/CD" | Ship | DevOps → SRE |
| "Design UI for..." | Design | UX Researcher → UI Designer |
| "Optimize performance" | Optimize | Performance Engineer |
| "Marketing strategy..." | Marketing | Growth Marketer |
| "Test on Android/iOS" | Mobile Test | Mobile Tester |

### Step 6: Follow the Pipeline

```
DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW
```

Every skill MUST follow the **Plan → Score → Check ≥ 8.0 → Execute** loop before writing code.

---

## 🔌 MCP Server Setup

ForgeNexus provides MCP tools for deep code intelligence. Add these to your AI client's MCP config.

### Cursor

**File:** `.cursor/mcp.json` (project-level) or global settings

```json
{
  "mcpServers": {
    "forgewright": {
      "command": "node",
      "args": ["{FORGEWRIGHT_PATH}/mcp/build/index.js"]
    },
    "forgenexus": {
      "command": "node",
      "args": ["{FORGEWRIGHT_PATH}/forgenexus/dist/cli/index.js", "mcp", "{PROJECT_PATH}"]
    }
  }
}
```

Replace:
- `{FORGEWRIGHT_PATH}` → `/Users/buiphucminhtam/Documents/GitHub/forgewright`
- `{PROJECT_PATH}` → absolute path to your project

### Claude Code (claude-code)

**File:** `~/.claude.json` or project-level `.claude.json`

```json
{
  "mcpServers": {
    "forgewright": {
      "command": "node",
      "args": ["/Users/buiphucminhtam/Documents/GitHub/forgewright/mcp/build/index.js"]
    },
    "forgenexus": {
      "command": "node",
      "args": ["/Users/buiphucminhtam/Documents/GitHub/forgewright/forgenexus/dist/cli/index.js", "mcp", "/Users/buiphucminhtam/Documents/GitHub/forgewright"]
    }
  }
}
```

### VS Code (with Copilot)

VS Code uses the same MCP config format as Cursor. Add to `.vscode/mcp.json`:

```json
{
  "ervers": {
    "forgenexus": {
      "command": "node",
      "args": ["/absolute/path/to/forgenexus/dist/cli/index.js", "mcp", "/absolute/path/to/project"]
    }
  }
}
```

### Verify MCP Connection

After adding the config, restart your AI client and run:

```
forgenexus_status
```

You should see symbol count and index freshness. If not, run:

```bash
npx forgenexus analyze /path/to/your/project
```

### ForgeNexus MCP Tools

| Tool | Purpose |
|------|---------|
| `forgenexus_query` | Find code by concept (semantic search) |
| `forgenexus_context` | 360° view of a symbol (callers + callees) |
| `forgenexus_impact` | Blast radius analysis before editing |
| `forgenexus_detect_changes` | Pre-commit scope check |
| `forgenexus_rename` | Safe multi-file rename (call graph-aware) |
| `forgenexus_cypher` | Custom Cypher graph queries |

---

## ☕ Support

If Forgewright helps you ship faster, you can support the project here:

<img src="assets/donate/give-me-a-coffee-international.png" width="240" />

---

## Release Timeline

```
2026-04-01  v7.7  ●━━━ Cursor Subagent Workflow + MCP Server + Mermaid Docs —
                  │     5 Cursor subagents: chat-interpreter, spec-reviewer,
                  │     quality-reviewer, security-auditor, verifier.
                  │     Two-stage review protocol with cost-efficiency guidance.
                  │     Forgewright MCP Server: Node.js, 85 tests, TypeScript.
                  │     CI/CD: GitHub Actions (ESLint, Prettier, TS, Vitest).
                  │     7 Mermaid flowcharts in README replacing ASCII diagrams.
                  │     52 skills confirmed.
                  │
2026-03-26  v7.6  ●━━━ Global Dry Run & Auto-Evolution —
                  │     Zero-risk refactoring sandbox. Agent formulates .diff patch,
                  │     self-scores logic (Threshold >= 9.0). If < 9.0, enters Dark Loop
                  │     (Learn -> Research -> Self-Improve SKILL.md -> Re-plan).
                  │     Physical Guardrail catches all writes, mocked securely.
                  │
2026-03-17  v7.5  ●━━━ Web Scraper Skill (Crawl4AI) —
                  │     Security-first web scraping: 10 hard security rules,
                  │     URL validation (SSRF/LFI defense), output sanitization
                  │     (prompt injection defense), CSS/LLM extraction, deep crawling.
                  │     Integrated into Polymath Research + AI Build pipeline.
                  │
2026-03-16  v7.4  ●━━━ UI Design Database & Reasoning Engine —
                  │     85 visual styles, 161 WCAG-validated palettes,
                  │     74 font pairings, 162 contextual reasoning rules, 99 UX anti-patterns.
                  │     Style Proposal Protocol with reference websites.
                  │
2026-03-15  v7.3  ●━━━ Code Intelligence & Skill Quality —
                  │     ForgeNexus: AST → knowledge graph → MCP tools.
                  │     Skill Maker v2: eval loop, WHY-first philosophy, quality audit.
                  │     Full quality sweep: 27 fixes across 12 skills.
                  │
2026-03-15  v7.2  ●━━━ Page Agent Patterns & Test Intelligence —
                  │     Graceful Failure protocol, ReAct for Debugger,
                  │     QA Phase 0: auto test technique assessment.
                  │
2026-03-14  v7.1.1●━━━ Memory Manager Overhaul — TF-IDF search, value-weighted GC,
                  │     markdown-aware chunking, lifecycle hooks, zero external deps.
                  │
2026-03-14  v7.1  ●━━━ Business Analyst — 6W1H elicitation, Information Gate.
                  │
2026-03-14  v7.0  ●━━━ Project Onboarding, Quality Gates & Brownfield Safety.
                  │
2026-03-13  v6.0  ●━━━ Game Dev & XR — 13 skills for Unity, Unreal, Godot, Roblox.
                  │
2026-03-12  v5.6  ●━━━ Mobile Tester — AI vision testing on Android/iOS.
                  │
2026-03-12  v5.5  ●━━━ GROW Phase — Growth Marketer + Conversion Optimizer.
                  │
2026-03-11  v5.3  ●━━━ Research Intelligence — NotebookLM MCP deep research.
                  │
2026-03-10  v5.2  ●━━━ Parallel dispatch (git worktrees), anti-hallucination.
                  │
2026-03-06  v5.0  ●━━━ Migrated to Antigravity, 17 skills, 12 modes.
                  │
2026-03-04  v4.0  ●━━━ Two-wave parallelism, internal skill agents.
                  │
2026-03-01  v3.0  ●━━━ Full rewrite — shared protocols, 7 parallel points.
                  │
2026-02-28  v2.0  ●━━━ 13 bundled skills, unified workspace.
                  │
2026-02-24  v1.0  ●━━━ Initial release — DEFINE>BUILD>HARDEN>SHIP>SUSTAIN
```

---

## For Antigravity Users

Forgewright is self-discovering. Once installed, Antigravity reads `AGENTS.md` on every new chat and automatically routes your requests through the 52-skill pipeline.

**Available workflows:**

| Command | Description |
|---------|-------------|
| `/setup` | First-time install as git submodule |
| `/update` | Check for and install updates |
| `/pipeline` | Show full pipeline reference, modes, and skill list |
| `/setup-mobile-test` | Set up plug-and-play mobile testing (Android/iOS) |
| `/onboard` | Deep project analysis — creates `.forgewright/project-profile.json` |

---

## 19 Execution Modes

The orchestrator auto-classifies your request and routes to the right skills:

| User Says | Mode | Skills Activated |
|-----------|------|-----------------|
| "Build a SaaS for..." | **Full Build** | All skills, 6 phases, 3 gates |
| "Add [feature]..." | **Feature** | BA (if gaps) → PM → Architect → BE/FE → QA |
| "Review my code" | **Review** | Code Reviewer only |
| "Write tests" | **Test** | QA Engineer only |
| "Deploy / CI/CD" | **Ship** | DevOps → SRE |
| "Design UI for..." | **Design** | UX Researcher → UI Designer |
| "Build mobile app" | **Mobile** | BA (if gaps) → Mobile Engineer (+ PM, Architect) |
| "Help me think about..." | **Explore** | Polymath co-pilot |
| "Deep research on..." | **Research** | Polymath + NotebookLM MCP |
| "Optimize performance" | **Optimize** | Performance Engineer + SRE |
| "Marketing strategy for..." | **Marketing** | Growth Marketer → Conversion Optimizer |
| "Optimize conversions" | **Grow** | Conversion Optimizer → Growth Marketer |
| "Test on Android/iOS" | **Mobile Test** | Mobile Tester (AI vision on real devices) |
| "Build a game with Unity..." | **Game Build** | Game Designer → Unity Engineer → Level/Narrative/Audio |
| "Build a Roblox experience" | **Game Build** | Game Designer → Roblox Engineer |
| "Build a VR app..." | **XR Build** | XR Engineer (+ Game Build if game-like) |
| "Build AI feature / RAG..." | **AI Build** | AI Engineer + Prompt Engineer + Data Scientist |
| "Debug this / fix bug" | **Debug** | Debugger → Software/Frontend Engineer |
| "Analyze requirements..." | **Analyze** | Business Analyst (standalone) |

---

## 52 Skills — Organized by Division

### 🧠 Orchestrator & Meta (5)

| Skill | What It Does |
|-------|-------------|
| **production-grade** | Smart routing orchestrator — 19 modes, auto-classifies, dependency-based task graph |
| **polymath** | Creative partner + grounded researcher — 6 modes: research (+ NotebookLM MCP), ideate, advise, onboard, translate, synthesize |
| **parallel-dispatch** | Git worktree-based parallel execution with Task Contracts and anti-hallucination |
| **memory-manager** | Cross-session memory — TF-IDF search, value-weighted GC, lifecycle hooks |
| **skill-maker** | Self-extending system — generates custom skills with eval loop, WHY-first philosophy, quality audit |

### ⚙️ Core Engineering (20)

| Skill | What It Does |
|-------|-------------|
| **business-analyst** | 6W1H structured elicitation, Zero Assumption Doctrine, feasibility analysis, Information Gate |
| **product-manager** | CEO interview, domain research, BRD with user stories |
| **solution-architect** | ADRs, API contracts (OpenAPI 3.1), data models, architecture decisions |
| **software-engineer** | TDD-first, clean architecture — handlers → services → repositories |
| **frontend-engineer** | Design system, components, pages, a11y, RSC, PWA, animations |
| **qa-engineer** | Phase 0 technique assessment + full pyramid: unit, integration, E2E, Playwright, Midscene vision |
| **security-engineer** | STRIDE, OWASP Top 10, auth audit, PII, supply chain, AI security |
| **code-reviewer** | Architecture conformance, code quality, performance, test quality, git workflow |
| **devops** | Docker, Terraform, CI/CD, monitoring, branch strategy |
| **sre** | SLOs, error budgets, chaos engineering, runbooks, capacity planning |
| **data-scientist** | LLM optimization, A/B testing, data pipelines, prompt engineering |
| **technical-writer** | API docs, dev guides, Docusaurus, changelog generation |
| **ui-designer** | Design tokens, wireframes, component inventory. **Design DB:** 85 styles, 161 palettes, 74 font pairings |
| **mobile-engineer** | React Native / Flutter, navigation, native integrations, app store prep |
| **mobile-tester** | Plug-and-play AI testing on Android/iOS real devices via Midscene.js |
| **api-designer** | REST/GraphQL API design, endpoints, error taxonomy |
| **database-engineer** | Schema design, migrations, query optimization |
| **debugger** | Bug investigation, ReAct structured reasoning, root cause analysis |
| **prompt-engineer** | Prompt design, evaluation harness, optimization, guardrails |
| **project-manager** | Sprint planning, velocity tracking, risk management |

### 🤖 AI/ML & Data (3)

| Skill | What It Does |
|-------|-------------|
| **ai-engineer** | MLOps, model serving, fine-tuning, RAG optimization |
| **performance-engineer** | Load testing (k6), profiling, Core Web Vitals, Lighthouse CI |
| **data-engineer** | ETL/ELT pipelines, medallion architecture, dbt |
| **web-scraper** | Security-first crawling (crawl4ai), SSRF defense, CSS/LLM extraction |

### ♿ Accessibility & UX (2)

| Skill | What It Does |
|-------|-------------|
| **accessibility-engineer** | WCAG 2.2 AA/AAA audit, keyboard navigation, screen reader testing |
| **ux-researcher** | User interviews, usability testing, personas, journey maps |

### 🎮 Game Development (15)

| Skill | What It Does |
|-------|-------------|
| **game-designer** | GDD, gameplay loops, economy, mechanic specs |
| **unity-engineer** | C# game architecture, ScriptableObjects, Editor tools |
| **unreal-engineer** | C++/Blueprint, GAS, Nanite/Lumen, replication-ready |
| **godot-engineer** | GDScript/C#, scene tree, signals, cross-platform export |
| **godot-multiplayer** | ENet/WebSocket, client prediction, dedicated server |
| **roblox-engineer** | Luau, DataStore, server-authoritative architecture |
| **level-designer** | Spatial design, encounters, pacing, environmental storytelling |
| **narrative-designer** | Branching dialogue (Ink/Yarn), character voice, lore |
| **technical-artist** | Shaders (HLSL), VFX, LOD optimization, performance budgets |
| **game-audio-engineer** | Spatial audio, adaptive music, Wwise/FMOD integration |
| **unity-shader-artist** | Shader Graph, VFX Graph, URP/HDRP post-processing |
| **unity-multiplayer** | Netcode for GameObjects, Relay, Lobby, prediction |
| **unreal-technical-artist** | Niagara VFX, Material Editor, Lumen/Nanite |
| **unreal-multiplayer** | Replication, dedicated server, GAS networking |
| **xr-engineer** | AR/VR/MR — spatial UI/UX, hand tracking, Quest/Vision Pro/WebXR |

### 📈 Growth (2)

| Skill | What It Does |
|-------|-------------|
| **growth-marketer** | Market analysis, SEO, AI search optimization, launch campaigns |
| **conversion-optimizer** | Funnel CRO, A/B testing, growth loops, churn prevention |

---

## How It Works

```
DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW
```

### The Pipeline

```mermaid
flowchart TD
    U["User Input"] --> CI["Step -1: chat-interpreter<br/>9-dimension extraction<br/>mode detection"]
    CI --> MCP["Step 0.1: MCP & ForgeNexus Check"]
    MCP --> SS["Step 0.5: Session Start<br/>Load project-profile.json"]
    SS --> SC["Step 0.6: Subagent Context<br/>PIPELINE_SUMMARY + REVIEWER_CONTRACT<br/>SECURITY_STANDARDS (HARDEN)"]

    SC --> DEFINE

    subgraph DEFINE["DEFINE Phase"]
        T0["Business Analyst<br/>6W1H elicitation<br/>Information Gate"] --> G1{"GATE 1<br/>Approve BRD?"}
        G1 -->|Approve| PM["Product Manager<br/>BRD + User Stories"]
        PM --> G1
        G1 -->|Approve| T2["Solution Architect<br/>ADRs + API Contracts<br/>Data Models"]
        T2 --> G2{"GATE 2<br/>Approve Architecture?"}
        G2 -->|Approve| BUILD
    end

    G2 -->|Approve| BUILD

    subgraph BUILD["BUILD Phase - Parallel Group A (git worktrees)"]
        direction LR
        T3a["Software Engineer<br/>Backend Services<br/>Worktree: .worktrees/T3a"] -.->|"after delivery"| S1A["spec-reviewer<br/>PASS / FAIL"]
        S1A -.->|"if PASS"| S2A["quality-reviewer<br/>Score 0-10"]

        T3b["Frontend Engineer<br/>Pages<br/>Worktree: .worktrees/T3b"] -.->|"after delivery"| S1B["spec-reviewer<br/>PASS / FAIL"]
        S1B -.->|"if PASS"| S2B["quality-reviewer<br/>Score 0-10"]

        T3c["Mobile Engineer<br/>Mobile App (cond.)<br/>Worktree: .worktrees/T3c"] -.->|"after delivery"| S1C["spec-reviewer<br/>PASS / FAIL"]
        S1C -.->|"if PASS"| S2C["quality-reviewer<br/>Score 0-10"]

        S1A --> M1["CEO Merge Arbiter<br/>Clean merge<br/>Integration test"]
        S2A --> M1
        S1B --> M1
        S2B --> M1
        S1C --> M1
        S2C --> M1
    end

    BUILD --> T4["DevOps<br/>Dockerfiles + CI skeleton"]
    T4 --> CW["Code Written & Validated"]

    CW --> HARDEN

    subgraph HARDEN["HARDEN Phase - Parallel Group B (git worktrees)"]
        direction LR
        T5["QA Engineer<br/>Tests: unit/integration/e2e<br/>Playwright + Midscene"] -.->|"after delivery"| S1D["spec-reviewer<br/>PASS / FAIL"]
        S1D -.->|"if PASS"| S2D["quality-reviewer<br/>Score 0-10"]

        T6a["Security Engineer<br/>STRIDE + OWASP<br/>PII + Supply Chain"] -.->|"always"| S6B["security-auditor<br/>OWASP Top 10<br/>MITRE CWE · readonly"]

        T6b["Code Reviewer<br/>Arch conformance<br/>Quality review"] -.->|"after delivery"| S1E["spec-reviewer<br/>PASS / FAIL"]
        S1E -.->|"if PASS"| S2E["quality-reviewer<br/>Score 0-10"]

        S1D --> M2["CEO Merge Arbiter<br/>Prioritize fixes"]
        S2D --> M2
        S6B --> M2
        S1E --> M2
        S2E --> M2
    end

    M2 --> T7["DevOps IaC<br/>CI/CD + Branch Strategy"]
    T7 --> T8["Remediation<br/>Fix HARDEN findings"]
    T8 --> T9["SRE<br/>SLOs + Error Budgets<br/>Chaos Engineering"]

    T9 --> G3{"GATE 3<br/>verifier subagent<br/>CONFIRM all complete"}
    G3 -->|"verifier: PASS"| SHIP

    subgraph SHIP["SHIP Phase"]
        T10["Data Scientist (cond.)<br/>AI/ML projects only"]
    end

    subgraph SUSTAIN["SUSTAIN + GROW Phase"]
        T11["Technical Writer<br/>API docs + Dev guides"]
        T12["Skill Maker"]
        T13["Growth Marketer<br/>SEO + Go-to-market"]
        T14["Conversion Optimizer<br/>CRO + A/B Testing"]
    end

    SHIP --> SUSTAIN
    G3 -->|"user: Ship it?"| USER["Ship it?<br/>Production Ready"]
```

**3 approval gates. Parallel execution in git worktrees. Two-stage review per task via Cursor subagents.**

---

### Cursor Subagent Review Workflow

```mermaid
flowchart LR
    subgraph PREP["Subagent Context Preparation (Step 0.6)"]
        P1["PIPELINE_SUMMARY.md<br/>max 2000 tokens<br/>phase + architecture"] --> P2["REVIEWER_CONTRACT.md<br/>per-task<br/>scope + acceptance criteria"]
        P2 --> P3["SECURITY_STANDARDS.md<br/>OWASP checklist<br/>(HARDEN only)"]
    end

    PREP --> WAVE1

    subgraph WAVE1["Wave 1: BUILD - Parallel Workers"]
        W1a["T3a: Software Engineer<br/>DELIVERY.json"] --> R1A["spec-reviewer<br/>PASS / FAIL<br/>vs CONTRACT.json"]
        R1A -->|"PASS"| R2A["quality-reviewer<br/>Score 0-10<br/>Arch + Naming + Anti-hallucination"]

        W1b["T3b: Frontend Engineer<br/>DELIVERY.json"] --> R1B["spec-reviewer<br/>PASS / FAIL"]
        R1B -->|"PASS"| R2B["quality-reviewer<br/>Score 0-10"]

        W1c["T3c: Mobile Engineer<br/>DELIVERY.json"] --> R1C["spec-reviewer<br/>PASS / FAIL"]
        R1C -->|"PASS"| R2C["quality-reviewer<br/>Score 0-10"]

        R2A --> MA["CEO Merge Arbiter<br/>Clean merge"]
        R2B --> MA
        R2C --> MA
    end

    MA --> WAVE2

    subgraph WAVE2["Wave 2: HARDEN - Parallel Workers"]
        W5["T5: QA Engineer<br/>DELIVERY.json"] --> R1D["spec-reviewer<br/>PASS / FAIL"]
        R1D -->|"PASS"| R2D["quality-reviewer<br/>Score 0-10"]

        W6a["T6a: Security Engineer<br/>DELIVERY.json"] --> SA["security-auditor<br/>OWASP Top 10<br/>MITRE CWE Top 25<br/>readonly"]

        W6b["T6b: Code Reviewer<br/>DELIVERY.json"] --> R1E["spec-reviewer<br/>PASS / FAIL"]
        R1E -->|"PASS"| R2E["quality-reviewer<br/>Score 0-10"]

        R1D --> MB["CEO Merge Arbiter<br/>VALIDATION.json"]
        R2D --> MB
        SA --> MB
        R1E --> MB
        R2E --> MB
    end

    MB --> GATE3

    GATE3{"verifier subagent<br/>Confirms all complete<br/>Scans TODOs/secrets<br/>Runs tests"}

    R1A -->|"FAIL"| FIX1["Worker fixes<br/>Re-submit<br/>Max 3x"]
    R1B -->|"FAIL"| FIX1
    R1D -->|"FAIL"| FIX2["Worker fixes<br/>Re-submit<br/>Max 3x"]
    R1E -->|"FAIL"| FIX2
    SA -->|"CRITICAL"| ESC["Escalate immediately"]
```

| Subagent | Model | Role |
|---|---|---|
| `chat-interpreter` | fast | Translates chat → structured request |
| `verifier` | fast | Confirm deliverables actually work |
| `spec-reviewer` | **fast** | PASS/FAIL against CONTRACT.json |
| `quality-reviewer` | **inherit** | Deep quality + architecture review |
| `security-auditor` | **inherit** | Read-only OWASP + MITRE CWE audit |

> Use `fast` for mechanical checklist tasks (2K tokens, <$0.01). Use `inherit` only for deep reasoning (15K tokens, ~$0.05).

### Game Build Pipeline

```mermaid
flowchart TD
    G1["Game Designer<br/>GDD + Gameplay loops<br/>Economy + Mechanics"] --> G2{"Gate 1<br/>Approve GDD?"}
    G2 -->|Approve| ENG["Engine Engineer<br/>Unity / Unreal / Godot / Roblox"]
    ENG --> PAR{"Multiplayer?"}
    PAR -->|Yes| MP["Engine Multiplayer<br/>Netcode + Replication"]
    PAR -->|No| LEVEL
    MP --> LEVEL
    LEVEL -->|"Parallel"| LD["Level Designer<br/>Encounters + Pacing"]
    LEVEL -->|"Parallel"| NAR["Narrative Designer<br/>Dialogue + Lore"]
    LEVEL -->|"Parallel"| TA["Technical Artist<br/>Shaders + VFX"]
    LEVEL -->|"Parallel"| GA["Game Audio Engineer<br/>Spatial audio"]
    LD --> QA["QA Engineer<br/>Game testing"]
    NAR --> QA
    TA --> QA
    GA --> QA
    QA --> G3{"Gate 2<br/>Production Ready?"}
    G3 -->|Approve| SHIP["Ship"]
```

### XR Build Pipeline

```mermaid
flowchart TD
    X1["XR Engineer<br/>Platform: Quest / Vision Pro / WebXR"] --> X2{"Game-like XR?"}
    X2 -->|Yes| GBP["Game Build Pipeline"]
    X2 -->|No| SW["Frontend / Software Engineer"]
    X1 --> X3["XR Comfort & Safety<br/>Hand tracking"]
    X3 --> GBP
    X3 --> SW
    GBP --> SHIP2["Ship"]
    SW --> SHIP2
```

### Parallel Dispatch

```mermaid
flowchart TD
    CEO["CEO Agent (Orchestrator)"] --> SA["Scope Analysis<br/>Complexity Score"]
    SA --> TC["Task Contract<br/>Per worker"]
    TC -->|"Wave 1"| WT1["Worktree 1<br/>Backend"]
    TC -->|"Wave 1"| WT2["Worktree 2<br/>Frontend"]
    TC -->|"Wave 1"| WT3["Worktree 3<br/>Mobile"]
    WT1 --> VAL["7-Step Anti-Hallucination<br/>Validation per worker"]
    WT2 --> VAL
    WT3 --> VAL
    VAL --> SR["spec-reviewer<br/>PASS / FAIL"]
    SR -->|"PASS"| QR["quality-reviewer<br/>Score 0-10"]
    QR --> MA["Merge Arbiter"]
    SR -->|"FAIL"| FIX["Worker fixes<br/>Max 3x"]
    MA --> VER["verifier"]
    VER --> G3{"Gate 3<br/>Approve production?"}
```

### Research Intelligence

```mermaid
flowchart LR
    P1["Phase 1<br/>Web Search<br/>Always ON"] --> P3["Phase 3<br/>Synthesize<br/>Citations + Recommendations"]
    P2["Phase 2<br/>NotebookLM MCP<br/>Optional - Grounded AI"] --> P3
    P1 --> P2
    P2 -.->|"Fails? Phase 1 still works"| P3
```

### Project Onboarding & Quality Gates

```mermaid
flowchart TD
    subgraph Onboard["Project Onboarding"]
        O1["Phase 1: Fingerprint<br/>Tech stack, framework, CI"] --> O15["Phase 1.5: Code Intelligence<br/>ForgeNexus knowledge graph"]
        O15 --> O2["Phase 2: Health Check<br/>Build + tests + lint + CVEs"]
        O2 --> O3["Phase 3: Pattern Analysis<br/>Naming + style + arch"]
        O3 --> O4["Phase 4: Risk Assessment<br/>Tech debt + protected paths"]
        O4 --> O5["Phase 5: Profile<br/>.forgewright/project-profile.json"]
    end

    subgraph QG["Quality Gate - After EVERY Skill Output"]
        Q1["Level 1: Build<br/>Compiles + no runtime errors"] --> Q2["Level 2: Regression<br/>Existing tests pass"]
        Q2 --> Q3["Level 3: Standards<br/>Conventions + patterns"]
        Q3 --> Q4["Level 4: Traceability<br/>Spec -> impl mapping"]
        Q1 -->|"Score 0-100"| SCORE["Grade A-F"]
    end

    subgraph BF["Brownfield Safety"]
        B1["Git Branch"] --> B2["Baseline Tests"] --> B3["Change Manifest"] --> B4["Rollback on failure"]
    end
```

---

## Full Power Setup

Forgewright works out of the box with just **Step 1**. Each additional step unlocks more capabilities.

### Power Levels

| Level | What You Get | Steps Needed |
|-------|-------------|-------------|
| ⚡ **Basic** (52 skills) | Full pipeline: DEFINE → BUILD → HARDEN → SHIP | Step 1 only |
| ⚡⚡ **Smart** (+code understanding) | Blast radius analysis, safe refactoring | + Step 2 |
| ⚡⚡⚡ **Persistent** (+memory) | Remembers decisions across sessions | + Step 3 |
| ⚡⚡⚡⚡ **Research** (+grounded AI) | NotebookLM podcasts, source analysis | + Step 4 |
| ⚡⚡⚡⚡⚡ **Full Power** | Web crawling, AI vision testing, multi-agent | + Steps 5-7 |

---

### Step 1 — Install Forgewright (Required)

> **Prerequisites:** Git, [Antigravity](https://antigravity.google) or Claude Code

```bash
# macOS/Linux — one-liner
curl -sO https://raw.githubusercontent.com/buiphucminhtam/forgewright/main/setup.sh
chmod +x setup.sh && ./setup.sh install

# Windows (PowerShell)
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/buiphucminhtam/forgewright/main/setup.ps1" -OutFile "setup.ps1"
.\setup.ps1 install

# Or: manual git submodule
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git .antigravity/plugins/production-grade
git add .gitmodules .antigravity/ && git commit -m "feat: add forgewright v7.7"
```

✅ **Verify:** Open Antigravity/Claude Code, type anything — Forgewright auto-routes through the orchestrator.

🔓 **Unlocks:** 52 skills, 19 modes, 15 protocols, full lifecycle pipeline.

---

### Step 2 — Code Intelligence via ForgeNexus (Recommended)

> **Prerequisites:** Node.js 18+

ForgeNexus builds a knowledge graph of your codebase — symbols, call chains, execution flows.

```bash
# Index your project (run from project root)
npx forgenexus analyze /path/to/your/project

# Or from within forgewright directory:
npx tsx src/cli/index.ts analyze /path/to/your/project
```

✅ **Verify:** `npx forgenexus analyze /path` — shows symbol count and index status.

🔓 **Unlocks:** `impact()` blast radius, `context()` 360° symbol view, `detect_changes()` pre-commit risk, `rename()` safe multi-file rename.

> **AI Agent rule:** Before editing any symbol, run `forgenexus_impact({target: "symbolName", direction: "upstream"})`. Warn the user if risk is HIGH or CRITICAL.

---

### Step 3 — Persistent Memory (Recommended)

> **Prerequisites:** Python 3.8+ (stdlib only, zero pip dependencies)

Cross-session memory so Forgewright remembers decisions, blockers, and progress.

```bash
# Initialize
python3 scripts/mem0-cli.py setup

# Ingest current project state
python3 scripts/mem0-cli.py refresh

# Search memory
python3 scripts/mem0-cli.py search "auth implementation decisions"
```

✅ **Verify:** `python3 scripts/mem0-cli.py stats` — shows memory count and categories.

🔓 **Unlocks:** Decision recall across sessions, blocker tracking, auto-resume interrupted pipelines.

---

### Step 4 — Research Intelligence via NotebookLM MCP (Optional)

> **Prerequisites:** Google account, Python 3.10+

Grounded analysis with real sources — zero hallucinations.

```bash
pip install notebooklm-mcp
nlm login

# Add to MCP config:
# "notebooklm": { "command": "nlm", "args": ["mcp"] }
```

✅ **Verify:** Say *"Deep research on [topic]"* — creates notebook, synthesizes findings.

🔓 **Unlocks:** Grounded research, podcast generation, study guides, mind maps.

---

### Step 5 — Web Scraping via crawl4ai (Optional)

> **Prerequisites:** Python 3.10+

Secure web crawling for JS-rendered sites.

```bash
pip install "crawl4ai>=0.8.0"
```

✅ **Verify:** Say *"Scrape [URL]"* or *"Crawl [website]"*.

🔓 **Unlocks:** JS-rendered page crawling, CSS/LLM extraction, deep crawling (50 pages, 3 levels).

---

### Step 6 — AI Vision Testing via Midscene.js (Optional)

> **Prerequisites:** Node.js 18+, Android device/emulator or iOS simulator

AI-powered visual testing on real devices.

```bash
npm install -g @anthropic-ai/midscene

# Android
adb devices

# iOS (macOS only)
xcrun simctl list
```

✅ **Verify:** Say *"Test on Android"* or *"Test on iOS"*.

🔓 **Unlocks:** AI vision testing on real devices, natural language test steps.

---

### Step 7 — Multi-Agent via Paperclip (Optional)

> **Prerequisites:** Node.js 20+, pnpm 9.15+

Multiple AI agents working as a company.

```bash
npx paperclipai onboard --yes
cd paperclip && pnpm dev
# Dashboard: http://localhost:3100
```

✅ **Verify:** Open `http://localhost:3100`.

🔓 **Unlocks:** Multi-agent coordination, automated ticket assignment, budget tracking.

---

### Quick Reference

| Platform | Install | Update | Status | Uninstall |
|----------|---------|--------|--------|-----------|
| **macOS/Linux** | `./setup.sh install` | `./setup.sh update` | `./setup.sh status` | `./setup.sh uninstall` |
| **Windows** | `.\setup.ps1 install` | `.\setup.ps1 update` | `.\setup.ps1 status` | `.\setup.ps1 uninstall` |

---

## Conflict Resolution

Each domain has one authority. No overlap, no contradictions.

| Domain | Authority | Others Must Not |
|--------|-----------|----------------|
| OWASP, STRIDE, PII | **security-engineer** | code-reviewer skips security |
| SLOs, error budgets | **sre** | devops skips SLO definitions |
| Code quality, arch conformance | **code-reviewer** | produces findings only, no code changes |
| Design tokens, UX patterns | **ui-designer** | frontend/mobile consumes, doesn't replace |
| Game design, mechanics | **game-designer** | engine engineers implement, don't redesign |
| ML production systems | **ai-engineer** | data-scientist focuses on research |
| Accessibility auditing | **accessibility-engineer** | frontend implements, a11y engineer audits |

---

## Examples

```bash
# Greenfield SaaS (full pipeline, 52 skills)
"Build a production-grade SaaS for multi-vendor e-commerce
 with seller dashboards, buyer marketplace, and payment processing."

# Unity Game
"Build a 3D platformer game with Unity — tight controls,
 level progression, collectibles, and multiplayer co-op."

# Roblox Experience
"Build a Roblox obby experience with leaderboards,
 in-game shop, and social features."

# Unreal Engine AAA
"Build an Unreal Engine 5 third-person shooter with
 GAS-based abilities, multiplayer, and Nanite environments."

# VR App
"Build a VR meditation app for Quest 3 with
 spatial audio, hand tracking, and guided sessions."

# AI/ML Feature
"Build a RAG-powered customer support chatbot with
 fine-tuned embeddings and evaluation framework."

# Deep Research
"Deep research on real-time collaborative editing architectures.
 Compare CRDT vs OT with real-world case studies."

# Explore first, build later
"Help me think about building a restaurant management platform."

# Marketing & Growth
"Create a go-to-market strategy for my SaaS launch.
 Include SEO audit, email sequences, and launch plan."
```

---

## By the Numbers

| Metric | Detail |
|--------|--------|
| **52 specialized skills** | Each with sole authority over its domain |
| **19 execution modes** | Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Research, Optimize, Design, Mobile, Mobile Test, Marketing, Grow, **Game Build**, **XR Build**, **Analyze** |
| **6-phase pipeline** | DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW |
| **4 game engines** | Unity, Unreal Engine, Godot, Roblox |
| **XR platforms** | Quest, Vision Pro, WebXR, PCVR |
| **Research Intelligence** | NotebookLM MCP — zero-hallucination, citation-backed |
| **Code Intelligence** | ForgeNexus knowledge graph — impact analysis, call chains |
| **Design Database** | 85 styles, 161 WCAG palettes, 74 font pairings, 162 reasoning rules |
| **Smart Test Selection** | Phase 0: auto-assess target → recommend Playwright / Midscene / Page Agent |
| **Vision Testing** | Midscene.js — AI-powered, cross-platform (web + Android + iOS) |
| **Go-to-Market** | SEO, AEO/GEO, copywriting, funnel CRO, A/B testing |
| **Parallel dispatch** | Git worktree-based with anti-hallucination pipeline |
| **3 approval gates** | Everything between gates is fully autonomous |
| **15 shared protocols** | UX, input validation, quality gate, brownfield safety, code intelligence |
| **Quality scoring** | 0-100 per-skill scoring with A-F grades |
| **Persistent memory** | TF-IDF search, auto-refresh — survives session resets |
| **4 engagement modes** | Express, Standard, Thorough, Meticulous |

---

## FAQ

**How many skills does Forgewright have?**
52 specialized skills covering requirements analysis, software engineering, game development (Unity, Unreal, Godot, Roblox), XR (AR/VR/MR), AI/ML, data engineering, web scraping, accessibility, UX research, and go-to-market.

**Can it build complete games?**
Yes. The Game Build mode orchestrates game-specific skills: Game Designer → Engine Engineer → Level Designer → Narrative → Technical Art → Audio → QA. Supports Unity, Unreal Engine, Godot, and Roblox.

**Does it write working code?**
Yes. Every skill: write, build, test, debug, fix. No stubs. No TODOs.

**Can I use it on existing projects?**
Yes. Run `/onboard` first — Forgewright will analyze your project, learn your coding patterns, and create a safety net (git branch + test baseline).

**What is Code Intelligence?**
Built-in knowledge graph engine (ForgeNexus) that indexes your codebase's AST, maps call chains, clusters functional areas, and provides impact analysis. Install via Step 2. Once indexed, all skills gain 360° awareness: know exactly which files break when you change a function.

**What MCP tools does ForgeNexus provide?**
`forgenexus_query` (semantic search), `forgenexus_context` (360° symbol view), `forgenexus_impact` (blast radius), `forgenexus_detect_changes` (pre-commit check), `forgenexus_rename` (safe rename), `forgenexus_cypher` (custom queries).

**What happened to forge17?**
Renamed to Forgewright in v7.2. The GitHub redirect ensures existing submodule references continue to work.

**Do I need all 52 skills?**
No. The orchestrator only activates what you need. A backend API may use 8 skills. A full game may use 20+.

---

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/): `feat(skill): add new capability`
4. Open a Pull Request

**Adding a skill:** Create `skills/your-skill-name/SKILL.md` with `---` frontmatter. See any existing skill as a reference.

---

## License

MIT

---

## Star History

<a href="https://www.star-history.com/?repos=buiphucminhtam%2Fforgewright&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=buiphucminhtam/forgewright&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=buiphucminhtam/forgewright&type=date&theme=light&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=buiphucminhtam/forgewright&type=date&legend=top-left" />
 </picture>
</a>

---

<p align="center">
  <strong>Forgewright — 52 AI skills. 19 modes. 15 protocols. Code Intelligence. SaaS to AAA games. One prompt. ⭐</strong>
</p>
<p align="center">
  <em>Understand relationships, not just files. Validate with zero assumptions. Research with zero hallucinations. Build games across 4 engines. Ship with quality scoring. Grow with data.</em>
</p>
