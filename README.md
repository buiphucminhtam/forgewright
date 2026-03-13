# 🔨 Forge17

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-6.1.0-blue.svg)]()
[![Skills](https://img.shields.io/badge/skills-46-green.svg)]()
[![Modes](https://img.shields.io/badge/modes-18-purple.svg)]()
[![Game Dev](https://img.shields.io/badge/game_dev-Unity_Unreal_Godot_Roblox-FF4500.svg)]()
[![Research](https://img.shields.io/badge/research-NotebookLM_MCP-00A67E.svg)]()
[![Testing](https://img.shields.io/badge/testing-Midscene_Vision-FF6B35.svg)]()
[![Growth](https://img.shields.io/badge/growth-Marketing_CRO-E91E63.svg)]()
[![Parallel](https://img.shields.io/badge/parallel-worktrees-orange.svg)]()
[![Vibe Coded](https://img.shields.io/badge/vibe-coded_%F0%9F%8E%B5-ff69b4.svg)]()

**46 AI Skills. Full Lifecycle. Research → Build → Test → Ship → Market → Game Dev → XR.**

> *"One prompt to research, design, build, test, secure, deploy, market, and grow — plus build complete games for Unity, Unreal, Godot, and Roblox."*

Forge17 is an AI pipeline that orchestrates **46 specialized skills** across **6 phases** and **18 execution modes** to take a product from idea to market. The only AI pipeline that covers the **complete lifecycle** — from SaaS to AAA games: DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → **GROW**.

> Built from [claude-code-production-grade-plugin](https://github.com/nagisanzenin/claude-code-production-grade-plugin), [awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills), and [agency-agents](https://github.com/msitarzewski/agency-agents). Entirely vibe coded — the skills evaluated and upgraded themselves. 🎵

---

## ☕ Support

If Forge17 helps you ship faster, you can support the project here:

<img src="assets/donate/give-me-a-coffee-international.png" width="240" />

---

## Release Timeline

```
2026-03-14  v6.1  ●━━━ Round 2 — AI Engineer, Performance, Accessibility, UX Research,
                  │     Data Engineer, Project Manager, Roblox, Godot Multiplayer
                  │     + 5 existing skill upgrades. 46 total skills.
                  │
2026-03-13  v6.0  ●━━━ Game Dev & XR — 13 skills: Unity, Unreal, Godot, Level Design,
                  │     Narrative, Technical Art, Audio, Shaders, Multiplayer, XR
                  │
2026-03-12  v5.6  ●━━━ Mobile Tester — plug-and-play AI testing on Android/iOS real devices
                  │
2026-03-12  v5.5  ●━━━ GROW Phase — Growth Marketer + Conversion Optimizer, 6-phase lifecycle
                  │
2026-03-12  v5.4  ●━━━ Vision Testing — Midscene.js AI testing, cross-platform (web+mobile)
                  │
2026-03-11  v5.3  ●━━━ Research Intelligence — NotebookLM MCP, deep research workflow
                  │
2026-03-10  v5.2  ●━━━ Parallel dispatch (git worktrees), scope analysis, anti-hallucination
                  │
2026-03-06  v5.0  ●━━━ Migrated to Antigravity, 17 skills, 12 execution modes
                  │
2026-03-04  v4.0  ●━━━ Two-wave parallelism, internal skill agents, dynamic task generation
                  │
2026-03-01  v3.0  ●━━━ Full rewrite — shared protocols, 7 parallel points
                  │
2026-02-28  v2.0  ●━━━ 13 bundled skills, unified workspace, prescriptive UX
                  │
2026-02-24  v1.0  ●━━━ Initial release — autonomous DEFINE>BUILD>HARDEN>SHIP>SUSTAIN
```

---

## Quick Start

### Option A: One-liner Setup (Recommended)

```bash
# macOS/Linux — download & install as git submodule
curl -sO https://raw.githubusercontent.com/buiphucminhtam/forge17/main/setup.sh
chmod +x setup.sh && ./setup.sh install

# Windows (PowerShell)
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/buiphucminhtam/forge17/main/setup.ps1" -OutFile "setup.ps1"
.\setup.ps1 install
```

### Option B: Manual Git Submodule

```bash
git submodule add -b main https://github.com/buiphucminhtam/forge17.git .antigravity/plugins/production-grade
git add .gitmodules .antigravity/ && git commit -m "feat: add production-grade plugin v6.1"
```

### Option C: Standalone Clone

```bash
git clone https://github.com/buiphucminhtam/forge17.git
```

Then say: *"Build a production-grade SaaS for [your idea]"* — or *"Build a game with Unity"* — or *"Help me think about [your idea]"* if you want the Polymath co-pilot first.

### Updating

```bash
./setup.sh update          # macOS/Linux
.\setup.ps1 update         # Windows

# Or: git submodule update --remote .antigravity/plugins/production-grade
```

---

## For Antigravity Users

Forge17 is self-discovering. Once installed, Antigravity reads `AGENTS.md` on every new chat and automatically routes your requests through the 46-skill pipeline.

**Available workflows:**

| Command | Description |
|---------|-------------|
| `/setup` | First-time install as git submodule |
| `/update` | Check for and install updates |
| `/pipeline` | Show full pipeline reference, modes, and skill list |
| `/setup-mobile-test` | Set up plug-and-play mobile testing (Android/iOS) |

---

## 18 Execution Modes

The orchestrator auto-classifies your request and routes to the right skills:

| User Says | Mode | Skills Activated |
|-----------|------|-----------------|
| "Build a SaaS for..." | **Full Build** | All skills, 6 phases, 3 gates |
| "Add [feature]..." | **Feature** | PM → Architect → BE/FE → QA |
| "Review my code" | **Review** | Code Reviewer only |
| "Write tests" | **Test** | QA Engineer only |
| "Deploy / CI/CD" | **Ship** | DevOps → SRE |
| "Design UI for..." | **Design** | UX Researcher → UI Designer |
| "Build mobile app" | **Mobile** | Mobile Engineer (+ PM, Architect) |
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

---

## 46 Skills — Organized by Division

### 🧠 Orchestrator & Meta (5)

| Skill | What It Does |
|-------|-------------|
| **production-grade** | Smart routing orchestrator — 18 modes, auto-classifies, dependency-based task graph |
| **polymath** | Creative partner + grounded researcher — 6 modes: research (+ NotebookLM MCP), ideate, advise, onboard, translate, synthesize |
| **parallel-dispatch** | Git worktree-based parallel execution with Task Contracts and anti-hallucination |
| **memory-manager** | Cross-session context persistence via mem0 |
| **skill-maker** | Self-extending system — generates 3-5 project-specific custom skills |

### ⚙️ Core Engineering (19)

| Skill | What It Does |
|-------|-------------|
| **product-manager** | CEO interview, domain research, BRD with user stories |
| **solution-architect** | ADRs, API contracts (OpenAPI 3.1), data models, architecture decisions |
| **software-engineer** | TDD-first, clean architecture — handlers → services → repositories |
| **frontend-engineer** | Design system, components, pages, a11y, RSC, PWA, animations |
| **qa-engineer** | Full pyramid: unit, integration, E2E, Playwright, Midscene vision, k6 performance |
| **security-engineer** | STRIDE, OWASP Top 10, auth audit, PII, supply chain, AI security, runtime threat detection |
| **code-reviewer** | Architecture conformance, code quality, performance, test quality, git workflow |
| **devops** | Docker, Terraform, CI/CD, monitoring, branch strategy |
| **sre** | SLOs, error budgets, chaos engineering, runbooks, capacity planning |
| **data-scientist** | LLM optimization, A/B testing, data pipelines, prompt engineering |
| **technical-writer** | API docs, dev guides, Docusaurus, changelog generation |
| **ui-designer** | Design tokens, wireframes, component inventory, a11y guidelines, brand system |
| **mobile-engineer** | React Native / Flutter, navigation, native integrations, app store prep |
| **mobile-tester** | Plug-and-play AI testing on Android/iOS real devices via Midscene.js |
| **api-designer** | REST/GraphQL API design, endpoints, error taxonomy |
| **database-engineer** | Schema design, migrations, query optimization |
| **debugger** | Bug investigation, root cause analysis, regression testing |
| **prompt-engineer** | Prompt design, evaluation harness, optimization, guardrails |
| **project-manager** | Sprint planning, velocity tracking, risk management, stakeholder comms |

### 🤖 AI/ML & Data (3)

| Skill | What It Does |
|-------|-------------|
| **ai-engineer** | MLOps, model serving, fine-tuning, RAG optimization, evaluation frameworks, cost tracking |
| **performance-engineer** | Load testing (k6), profiling, Core Web Vitals, bottleneck analysis, Lighthouse CI |
| **data-engineer** | ETL/ELT pipelines, medallion architecture, dbt, data quality, Airflow/Dagster |

### ♿ Accessibility & UX (2)

| Skill | What It Does |
|-------|-------------|
| **accessibility-engineer** | WCAG 2.2 AA/AAA audit, keyboard navigation, screen reader testing, ARIA patterns |
| **ux-researcher** | User interviews, usability testing, personas, journey maps, heuristic evaluation |

### 🎮 Game Development (15)

| Skill | What It Does |
|-------|-------------|
| **game-designer** | GDD, gameplay loops, economy, mechanic specs (engine-agnostic) |
| **unity-engineer** | C# game architecture, ScriptableObjects, Editor tools, platform optimization |
| **unreal-engineer** | C++/Blueprint, GAS, Nanite/Lumen, replication-ready code |
| **godot-engineer** | GDScript/C#, scene tree, signals, cross-platform export |
| **godot-multiplayer** | MultiplayerSpawner, ENet/WebSocket, client prediction, dedicated server |
| **roblox-engineer** | Luau, DataStore, server-authoritative architecture, monetization |
| **level-designer** | Spatial design, encounters, pacing, environmental storytelling |
| **narrative-designer** | Branching dialogue (Ink/Yarn), character voice, lore, narrative-gameplay integration |
| **technical-artist** | Shaders (HLSL), VFX, LOD optimization, performance budgets, art tools |
| **game-audio-engineer** | Spatial audio, adaptive music, SFX, Wwise/FMOD integration |
| **unity-shader-artist** | Shader Graph, HLSL, VFX Graph, URP/HDRP post-processing |
| **unity-multiplayer** | Netcode for GameObjects, Relay, Lobby, prediction |
| **unreal-technical-artist** | Niagara VFX, Material Editor, Lumen/Nanite optimization |
| **unreal-multiplayer** | Replication, dedicated server, GAS networking |
| **xr-engineer** | AR/VR/MR — spatial UI/UX, hand tracking, comfort, Quest/Vision Pro/WebXR |

### 📈 Growth (2)

| Skill | What It Does |
|-------|-------------|
| **growth-marketer** | Market analysis, SEO, AI search optimization, copywriting, launch campaigns |
| **conversion-optimizer** | Funnel CRO, A/B testing, growth loops, churn prevention, dunning |

---

## How It Works

```
DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW
```

You give a high-level vision. 46 specialized skills handle everything else.

### The Pipeline

```
Polymath (pre-flight: research, gap detection, context building)
    ↓
T1:   Product Manager (BRD) ─────────────── GATE 1: approve requirements
T1.5: UI Designer (design tokens, wireframes)
T2:   Solution Architect ────────────────── GATE 2: approve architecture
    ↓
T3a: Backend Engineer ──── implements services      ┐
T3b: Frontend Engineer ─── implements pages         ├ parallel (worktrees)
T3c: Mobile Engineer ───── mobile app (conditional) ┘
T4:  DevOps ────────────── Dockerfiles + CI skeleton
    ↓ (code written — validated & merged)
T5:  QA Engineer ─────────── tests (unit/e2e/perf)  ┐
T6a: Security Engineer ──── STRIDE + code audit     ├ parallel (worktrees)
T6b: Code Reviewer ──────── arch conformance review ┘
    ↓
T7:  DevOps (IaC + CI/CD + branch strategy)
T8:  Remediation
T9:  SRE (SLOs + chaos)
T10: Data Scientist (conditional — LLM/ML/AI projects)
    ↓ ─────────────────────────── GATE 3: approve production readiness
T11: Technical Writer (+ changelog generation)
T12: Skill Maker
T13: Growth Marketer ──────── go-to-market strategy, SEO, content
T14: Conversion Optimizer ── funnel CRO, A/B testing, growth loops
```

**3 approval gates. Parallel or sequential execution. Scope analysis with risk prediction.**

### Game Build Pipeline

```
Game Designer (GDD, mechanics, economy)
    ↓
Engine Engineer ──── Unity / Unreal / Godot / Roblox
    ↓
Level Designer ────── environments, encounters, pacing    ┐
Narrative Designer ── dialogue, lore, character voice     ├ parallel
Technical Artist ──── shaders, VFX, LOD, performance     │
Game Audio Engineer ─ spatial audio, adaptive music       ┘
    ↓
Engine Multiplayer ── networking (if multiplayer)
    ↓
QA Engineer ─────────── game testing
    ↓
Ship
```

### XR Build Pipeline

```
XR Engineer (spatial UI/UX, comfort, platform selection)
    ↓
Game Build pipeline (if game-like XR experience)
    ↓ or
Frontend/Software Engineer (if utility XR app)
```

### Parallel Dispatch (v5.2)

```
CEO Agent (Orchestrator)
    │
    ├── Scope Analysis → Complexity Score, Time Estimate, Risk Level
    │
    ├── Task Contract ──→ Worktree 1: Backend  (services/)
    ├── Task Contract ──→ Worktree 2: Frontend (frontend/)
    ├── Task Contract ──→ Worktree 3: Mobile   (mobile/)
    │
    ├── Validate each worker (7-step anti-hallucination)
    └── Merge Arbiter → Clean merge into main
```

### Research Intelligence (v5.3)

```
┌─────────────────────────────────────────────────────┐
│                 Research Pipeline                     │
│                                                       │
│  Phase 1: Web Search (search_web)       ← ALWAYS ON  │
│  Phase 2: NotebookLM MCP (optional)  ← GROUNDED AI   │
│  Phase 3: Synthesize → Citations + Recommendations    │
│                                                       │
│  ⚡ Fallback: Phase 2 fails? Phase 1 still works.     │
└─────────────────────────────────────────────────────┘
```

---

## By the Numbers

| Metric | Detail |
|--------|--------|
| **46 specialized skills** | Each with sole authority over its domain |
| **18 execution modes** | Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Research, Optimize, Design, Mobile, Mobile Test, Marketing, Grow, **Game Build**, **XR Build** |
| **6-phase pipeline** | DEFINE → BUILD → HARDEN → SHIP → SUSTAIN → GROW |
| **4 game engines** | Unity, Unreal Engine, Godot, Roblox |
| **XR platforms** | Quest, Vision Pro, WebXR, PCVR |
| **Research Intelligence** | NotebookLM MCP — zero-hallucination, citation-backed |
| **Vision Testing** | Midscene.js — AI-powered, cross-platform (web + Android + iOS) |
| **Go-to-Market** | SEO, AEO/GEO, copywriting, campaigns, funnel CRO, A/B testing |
| **Parallel dispatch** | Git worktree-based with anti-hallucination pipeline |
| **3 approval gates** | Everything between gates is fully autonomous |
| **7 shared protocols** | UX, input validation, tool efficiency, conflict resolution, task contracts |
| **4 engagement modes** | Express, Standard, Thorough, Meticulous |

---

## Integration Guide

### Setup Scripts

| Platform | Install | Update | Status | Uninstall |
|----------|---------|--------|--------|-----------|
| **macOS/Linux** | `./setup.sh install` | `./setup.sh update` | `./setup.sh status` | `./setup.sh uninstall` |
| **Windows** | `.\setup.ps1 install` | `.\setup.ps1 update` | `.\setup.ps1 status` | `.\setup.ps1 uninstall` |

**Requirements:** Antigravity or Gemini CLI, Docker & Docker Compose, Git.

### Custom Config (`.production-grade.yaml`)

```yaml
version: "6.1"

project:
  name: "my-project"
  language: "typescript"        # typescript | go | python | rust | java | c++ | c# | gdscript | luau
  framework: "nestjs"           # nestjs | express | fastapi | gin | spring | unity | unreal | godot | roblox
  cloud: "aws"                  # aws | gcp | azure

paths:
  services: "services/"
  frontend: "frontend/"
  mobile: "mobile/"
  tests: "tests/"

features:
  frontend: true
  mobile: false
  game_dev: false               # auto-detected from engine mentions
  xr: false                     # auto-detected from VR/AR mentions
  ai_ml: false                  # auto-detected from imports
```

### Partial Execution

| Command | What Runs |
|---------|-----------|
| `"Just define"` | PM + UI Designer + Architect |
| `"Just build"` | Backend + Frontend + Mobile |
| `"Just harden"` | QA + Security + Code Review |
| `"Just ship"` | IaC + CI/CD + SRE |
| `"Deep research on..."` | Polymath + NotebookLM MCP |
| `"Design UI for..."` | UX Researcher → UI Designer |
| `"Build a game with Godot"` | Game Designer → Godot Engineer → Level/Audio |
| `"Marketing strategy"` | Growth Marketer → Conversion Optimizer |
| `"Test on Android/iOS"` | Mobile Tester (AI vision) |

---

## Conflict Resolution

Each domain has one authority. No overlap, no contradictions.

| Domain | Authority | Others Must Not |
|--------|-----------|-----------------|
| OWASP, STRIDE, PII | **security-engineer** | code-reviewer skips security |
| SLOs, error budgets | **sre** | devops skips SLO definitions |
| Code quality, arch conformance | **code-reviewer** | produces findings only, no code changes |
| Design tokens, UX patterns | **ui-designer** | frontend/mobile consumes, doesn't replace |
| Game design, mechanics | **game-designer** | engine engineers implement, don't redesign |
| ML production systems | **ai-engineer** | data-scientist focuses on research/experiments |
| Accessibility auditing | **accessibility-engineer** | frontend implements, a11y engineer audits |
| Performance testing | **performance-engineer** | SRE focuses on reliability, not profiling |

---

## Examples

```bash
# Greenfield SaaS (full pipeline, 46 skills)
"Build a production-grade SaaS for multi-vendor e-commerce
 with seller dashboards, buyer marketplace, and payment processing."

# Unity Game (Game Build mode)
"Build a 3D platformer game with Unity — tight controls,
 level progression, collectibles, and multiplayer co-op."

# Roblox Experience
"Build a Roblox obby experience with leaderboards,
 in-game shop, and social features."

# Unreal Engine AAA
"Build an Unreal Engine 5 third-person shooter with
 GAS-based abilities, multiplayer, and Nanite environments."

# VR App (XR Build mode)
"Build a VR meditation app for Quest 3 with
 spatial audio, hand tracking, and guided sessions."

# AI/ML Feature (AI Build mode)
"Build a RAG-powered customer support chatbot with
 fine-tuned embeddings and evaluation framework."

# Deep Research (NotebookLM MCP)
"Deep research on real-time collaborative editing architectures.
 Compare CRDT vs OT with real-world case studies."

# Explore first, build later
"Help me think about building a restaurant management platform."

# Marketing & Growth
"Create a go-to-market strategy for my SaaS launch.
 Include SEO audit, email sequences, and launch plan."
```

---

## FAQ

**How many skills does Forge17 have?**
46 specialized skills covering software engineering, game development (Unity, Unreal, Godot, Roblox), XR (AR/VR/MR), AI/ML, data engineering, accessibility, UX research, and go-to-market.

**Can it build complete games?**
Yes. The Game Build mode orchestrates game-specific skills: Game Designer → Engine Engineer → Level Designer → Narrative → Technical Art → Audio → QA. Supports Unity, Unreal Engine, Godot, and Roblox.

**Does it write working code?**
Yes. Every skill: write, build, test, debug, fix. No stubs. No TODOs.

**Can I use it on existing projects?**
Yes. Create `.production-grade.yaml`, then run specific modes: `"harden"`, `"add feature"`, `"write tests"`.

**Is NotebookLM MCP required?**
No. Optional enhancement. When available, research quality gets zero hallucinations + citations.

**Is Midscene required?**
No. Playwright is the primary CI testing tool. Midscene is optional for visual QA and mobile testing.

**What languages are supported?**
TypeScript, Go, Python, Rust, Java, C++ (Unreal), C# (Unity), GDScript (Godot), Luau (Roblox).

**Do I need all 46 skills?**
No. The orchestrator only activates what you need. A backend API may use 8 skills. A full game may use 20+.

**How does parallel dispatch work?**
Independent tasks run in git worktrees. A 7-step anti-hallucination validator checks each worker before merging.

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

<p align="center">
  <strong>Forge17 — 46 AI skills. 18 modes. SaaS to AAA games. One prompt. Idea to market. ⭐</strong>
</p>
<p align="center">
  <em>Research with zero hallucinations. Build games with Unity/Unreal/Godot/Roblox. Ship with confidence. Grow with data.</em>
</p>
