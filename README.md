# Forgewright — Adaptive AI Orchestrator

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-7.9.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/skills-55-brightgreen.svg" alt="Skills" />
  <img src="https://img.shields.io/badge/modes-23-blueviolet.svg" alt="Modes" />
  <img src="https://img.shields.io/badge/protocols-29-00CED1.svg" alt="Protocols" />
  <img src="https://img.shields.io/badge/Game_Dev-Unity·Unreal·Godot·Roblox-FF4500.svg" alt="Game Dev" />
  <img src="https://img.shields.io/badge/Code_Intelligence-ForgeNexus·GitNexus-4B0082.svg" alt="Code Intelligence" />
  <img src="https://img.shields.io/badge/Memory-Persistent%20(mem0)-00CED1.svg" alt="Memory" />
  <img src="https://img.shields.io/badge/MCP-12%20Tools-orange.svg" alt="MCP" />
</p>

---

## TL;DR — What is Forgewright?

**Imagine:** You have a team of 55 AI experts. Each one excels at a different task — writing code, security auditing, game design, performance optimization. Forgewright is the "manager" — when you say "I want to build an e-commerce app", it automatically knows which experts to call, in what order, and how to validate quality.

> **One sentence:** Forgewright automatically selects the right AI expert for the right job, from idea to production.

### Concrete Example

```
You say:  "Build me a t-shirt selling website"

    ↓

Forgewright automatically does:
    1. Market analysis (Business Analyst)
    2. Feature planning (Product Manager)
    3. Database & API architecture design (Solution Architect)
    4. Write backend + frontend code (Software Engineer)
    5. Write unit tests (QA Engineer)
    6. Security audit (Security Engineer)
    7. Deploy to server (DevOps)
    8. Monitor & optimize (SRE)

    ↓

Result: Production-ready website, reviewed, tested, score 0-100
```

### 4 Power Levels — Choose what fits you

```mermaid
flowchart LR
    subgraph L1["⚡ Level 1 — Basic"]
        direction TB
        L1A["✅ What's included"]
        L1B["• 55 AI skills"]
        L1C["• Automated pipeline"]
        L1D["• Default on install"]
    end

    subgraph L2["⚡⚡ Level 2 — Smart"]
        direction TB
        L2A["🔍 What's added"]
        L2B["• Ask 'what does this affect?' → instant answer"]
        L2C["• Automatic blast radius analysis"]
        L2D["• Requires: Node.js 18+"]
    end

    subgraph L3["⚡⚡⚡ Level 3 — Memory"]
        direction TB
        L3A["🧠 What's added"]
        L3B["• Remembers everything across chat sessions"]
        L3C["• Saves decisions, architecture, blockers"]
        L3D["• Requires: Python 3.8+"]
    end

    subgraph L4["⚡⚡⚡⚡ Level 4 — Full Power"]
        direction TB
        L4A["🚀 Everything"]
        L4B["• 12 ForgeNexus tools in chat"]
        L4C["• Instant code lookup"]
        L4D["• Requires: MCP server"]
    end

    L1 --> L2 --> L3 --> L4

    style L1 fill:#1a5276,stroke:#3498db,color:#fff
    style L2 fill:#1e8449,stroke:#2ecc71,color:#fff
    style L3 fill:#d35400,stroke:#e67e22,color:#fff
    style L4 fill:#c0392b,stroke:#e74c3c,color:#fff
    style L1A fill:#1a5276,stroke:#3498db,color:#fff
    style L2A fill:#1e8449,stroke:#2ecc71,color:#fff
    style L3A fill:#d35400,stroke:#e67e22,color:#fff
    style L4A fill:#c0392b,stroke:#e74c3c,color:#fff
```

---

## Getting Started — 3 Easiest Steps

```mermaid
flowchart TD
    START(["Hey, where do I start?"])

    START --> Q1{"Are you a developer?"}
    Q1 --> |"No / Just starting"| EASY["✅ Level 1 — Basic<br/>Just install and go<br/>52 skills ready"]
    Q1 --> |"Yes, want smarter"| SMART["✅ Level 2 — Smart<br/>Add code analysis<br/>Ask anything"]

    SMART --> Q2{"Need memory across chats?"}
    Q2 --> |"Yes, long project"| MEM["✅ Level 3 — Memory<br/>Save all decisions<br/>No need to repeat"]
    Q2 --> |"No / CI only"| MCP["✅ Level 4 — Full Power<br/>12 tools in chat<br/>Instant code lookup"]

    EASY --> DONE1["🎉 Done! Start using now"]
    SMART --> DONE2["🎉 Done! One extra step"]
    MEM --> DONE3["🎉 Done! Two extra steps"]
    MCP --> DONE4["🎉 Done! Two extra steps"]

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style EASY fill:#1a5276,stroke:#3498db,color:#fff
    style SMART fill:#1e8449,stroke:#2ecc71,color:#fff
    style MEM fill:#d35400,stroke:#e67e22,color:#fff
    style MCP fill:#c0392b,stroke:#e74c3c,color:#fff
    style DONE1 fill:#0f3460,stroke:#2ecc71,color:#fff
    style DONE2 fill:#0f3460,stroke:#2ecc71,color:#fff
    style DONE3 fill:#0f3460,stroke:#2ecc71,color:#fff
    style DONE4 fill:#0f3460,stroke:#2ecc71,color:#fff
    style Q1 fill:#533483,stroke:#9b59b6,color:#fff
    style Q2 fill:#533483,stroke:#9b59b6,color:#fff
```

### Quick Setup (no bash knowledge needed)

#### If you're using Cursor / VS Code

1. Open Cursor or VS Code
2. Type your question or request
3. **Done!** No additional installation needed — Level 1 is already working

#### If you want to get smarter (Level 2+)

Open **Terminal** (or Command Prompt) and run:

```bash
# Check Node.js
node --version

# If you see a version (e.g. v20.x.x) → you're good
# If you get "command not found" → install Node.js first
#   macOS: brew install node
#   Windows: download from nodejs.org
```

---

## The Flow — How Forgewright Works

> All diagrams below render well on GitHub, GitLab, and any mermaid viewer.
> If you don't see the diagrams — make sure your viewer uses **mermaid 10+**.

### Overview — Who Does What

```mermaid
flowchart TD
    START(["You say: 'Build an e-commerce app'"])
    CHAT_INT{{"Chat Interpreter<br/>(chat-interpreter)"}}
    ORCH(["Forgewright<br/>(the manager)"])

    START --> CHAT_INT
    CHAT_INT --> |"intent parsed"| ORCH

    ORCH --> MODE{{"Select the right<br/>mode"}}

    MODE --> |"Full build"| DEFINE["DEFINE<br/>Analyze → Plan"]
    MODE --> |"Add feature"| FEATURE["FEATURE<br/>PM → Code → Test"]
    MODE --> |"Build game"| GAME["GAME<br/>Designer → Code → Test"]
    MODE --> |"AI feature"| AI["AI<br/>AI Engineer → Prompt → Data"]
    MODE --> |"Other"| OTHER["Other<br/>Test · Review · Design · Debug"]

    DEFINE --> GATE1{{"OK?"}}
    FEATURE --> GATE1
    GATE1 --> |"✅ Yes"| BUILD["BUILD<br/>Code → Test → Security"]
    GATE1 --> |"❌ No"| REV1["Revise DEFINE"]
    BUILD --> GATE2{{"OK?"}}
    GATE2 --> |"✅ Yes"| SHIP["SHIP<br/>Deploy → Monitor"]
    GATE2 --> |"❌ No"| REV2["Revise BUILD"]
    SHIP --> END(["🎉 Production Ready"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style CHAT_INT fill:#8e44ad,stroke:#9b59b6,color:#fff
    style ORCH fill:#0f3460,stroke:#e94560,color:#fff
    style MODE fill:#533483,stroke:#9b59b6,color:#fff
    style GATE1 fill:#533483,stroke:#f39c12,color:#fff
    style GATE2 fill:#533483,stroke:#f39c12,color:#fff
    style END fill:#1e8449,stroke:#2ecc71,color:#fff
    style REV1 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REV2 fill:#c0392b,stroke:#e74c3c,color:#fff
    style DEFINE fill:#1a5276,stroke:#3498db,color:#fff
    style BUILD fill:#1a5276,stroke:#3498db,color:#fff
    style SHIP fill:#1a5276,stroke:#3498db,color:#fff
```

```mermaid
flowchart TD
    START(["User Request"])
    CHAT_INT{{"Chat Interpreter"}}
    ORCH(["Orchestrator<br/>production-grade"])

    START --> CHAT_INT
    CHAT_INT --> ORCH

    ORCH --> MODE{{"Classify Request<br/>22 Modes"}}

    MODE --> |"Full Build"| PHASE_DEFINE["DEFINE Phase<br/>BA → PM → Architect"]
    MODE --> |"Feature"| PHASE_FEATURE["FEATURE Phase<br/>PM → BE/FE → QA"]
    MODE --> |"Harden"| PHASE_HARDEN["HARDEN Phase<br/>Security → QA → Review"]
    MODE --> |"Ship"| PHASE_SHIP["SHIP Phase<br/>DevOps → SRE"]
    MODE --> |"Game Build"| PHASE_GAME["GAME Phase<br/>Designer → Engine → Level → Audio"]
    MODE --> |"AI Build"| PHASE_AI["AI Phase<br/>AI Engineer → Prompt → Data"]
    MODE --> |"Migrate"| PHASE_MIGRATE["MIGRATE Phase<br/>DB Eng → Software Eng → QA"]
    MODE --> |"Other"| PHASE_OTHER["Other Modes<br/>Test · Review · Design · Debug · etc."]

    PHASE_DEFINE --> GATE1{{"Gate 1<br/>Approve?"}}
    PHASE_FEATURE --> GATE1
    PHASE_HARDEN --> GATE2{{"Gate 2<br/>Approve?"}}
    PHASE_SHIP --> GATE2
    PHASE_GAME --> GATE3{{"Gate 3<br/>Approve?"}}
    PHASE_AI --> GATE3
    PHASE_OTHER --> GATE1

    GATE1 --> |"Yes"| BUILD["BUILD Phase<br/>BE → FE → QA → Security"]
    GATE1 --> |"No"| REVISE1["Revise DEFINE"]
    BUILD --> GATE2
    GATE2 --> |"Yes"| SHIP_DEPLOY["SHIP Phase<br/>Deploy → Monitor"]
    GATE2 --> |"No"| REVISE2["Revise BUILD"]
    SHIP_DEPLOY --> GATE3
    GATE3 --> |"Yes"| SUSTAIN["SUSTAIN Phase<br/>Monitor → Grow"]
    GATE3 --> |"No"| REVISE3["Revise SHIP"]
    SUSTAIN --> GROW["GROW Phase<br/>Growth → Optimize"]

    GROW --> END(["Output: Production<br/>Ready Code"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style CHAT_INT fill:#8e44ad,stroke:#9b59b6,color:#fff
    style END fill:#16213e,stroke:#0f3460,color:#e94560
    style ORCH fill:#0f3460,stroke:#e94560,color:#fff
    style MODE fill:#533483,stroke:#e94560,color:#fff
    style GATE1 fill:#533483,stroke:#f39c12,color:#fff
    style GATE2 fill:#533483,stroke:#f39c12,color:#fff
    style GATE3 fill:#533483,stroke:#f39c12,color:#fff
    style REVISE1 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REVISE2 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REVISE3 fill:#c0392b,stroke:#e74c3c,color:#fff
```

### Middleware Chain (every skill execution)

```mermaid
flowchart TD
    REQ(["User Request"])
    PRE1["① SessionData<br/>Load profile + session state"]
    PRE2["② ContextLoader<br/>Memory + conventions + KIs"]
    PRE3["③ SkillRegistry<br/>Progressive skill discovery"]
    PRE4["④ Guardrail<br/>Pre-tool authorization"]
    PRE5["⑤ PromptMaster<br/>Intent parse · Prompt techniques · Templates"]
    PRE6["⑥ Summarization<br/>Auto-compress if >70% budget"]
    SKILL_EXEC["SKILL EXECUTION<br/>Engineer → QA → Security → ..."]
    POST1["⑦ QualityGate<br/>4-level validation 0-100"]
    POST2["⑧ BrownfieldSafety<br/>Regression + change manifest"]
    POST3["⑨ TaskTracking<br/>Update task.md"]
    POST4["⑩ Memory Turn-Close<br/>REQ: DONE: OPEN: → mem0"]
    POST5["⑪ GracefulFailure<br/>Retry + exit strategy"]
    RESULT(["Result / Next Skill"])

    REQ --> PRE1 --> PRE2 --> PRE3 --> PRE4 --> PRE5 --> PRE6 --> SKILL_EXEC
    SKILL_EXEC --> POST1 --> POST2 --> POST3 --> POST4 --> POST5 --> RESULT

    style REQ fill:#1a1a2e,stroke:#e94560,color:#fff
    style RESULT fill:#16213e,stroke:#0f3460,color:#e94560
    style SKILL_EXEC fill:#0f3460,stroke:#e94560,color:#fff
    style PRE1 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE2 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE3 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE4 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE5 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE6 fill:#1a5276,stroke:#3498db,color:#fff
    style POST1 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST2 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST3 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST4 fill:#1e8449,stroke:#2ecc71,color:#fff
    style POST5 fill:#1e8449,stroke:#2ecc71,color:#fff
```

### Session Lifecycle (Turn-Start + Turn-Close)

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant Orch as Orchestrator
    participant Mem as Memory mem0
    participant Forge as ForgeNexus
    participant Skill as Skills

    User->>Orch: New Session Start

    Orch->>Orch: Step 0.5: Load .forgewright/ context
    Orch->>Orch: Step 1: Load project-profile.json
    Orch->>Orch: Step 2: Load session-log.json
    Orch->>Orch: Step 3: mem0 search + code-conventions
    Orch->>Forge: Step 3.5: Check index freshness
    Orch->>Orch: Step 4: Detect greenfield vs brownfield

    rect rgb(20, 30, 60)
        Note over Orch,Skill: FOR EACH REQUEST (within session)

        User->>Orch: Request

        rect rgb(30, 50, 80)
            Note over Orch: TURN-START
            Orch->>Mem: T1: Load CONVERSATION_SUMMARY.md
            Orch->>Mem: T2: mem0 search recent turns + session
            Orch->>Mem: T3: Load BA scope + pipeline context
        end

        Orch->>Skill: Route to skills via Plan Quality Loop
        Skill-->>Orch: Skill output

        rect rgb(20, 60, 40)
            Note over Orch: TURN-CLOSE (mandatory)
            Orch->>Mem: TC1: Auto-generate CONVERSATION_SUMMARY.md
            Orch->>Mem: TC2: mem0 add REQ/DONE/OPEN/SCOPE_UPDATE
            Orch->>Mem: TC3: Optional: decisions/architecture/blockers
        end

        Orch-->>User: Response
    end

    User->>Orch: Session End
```

### Game Build Pipeline (18 game skills)

```mermaid
flowchart TD
    START(["Game Build Request"])

    START --> DESIGNER["Game Designer<br/>Concept → GDD → MVP Spec"]
    DESIGNER --> ART_STYLE["Art Style + Visual Foundations<br/>Color · Shape · Composition · Lighting · Motion"]

    ART_STYLE --> ENGINE{{"Choose Engine"}}
    ENGINE --> |"Unity"| UNITY["Unity Engineer<br/>C# · ScriptableObjects · DOTS · ShaderGraph"]
    ENGINE --> |"Unreal"| UNREAL["Unreal Engineer<br/>C++ · Blueprint · GAS · Nanite · Lumen"]
    ENGINE --> |"Godot"| GODOT["Godot Engineer<br/>GDScript · Scene Tree · Signals · Godot 4"]
    ENGINE --> |"Phaser 3"| PHASER["Phaser 3 Engineer<br/>TypeScript · ECS · WebGL · Object Pool"]
    ENGINE --> |"Three.js"| THREEJS["Three.js Engineer<br/>ECS · WebGPU · Rapier Physics · PostFX"]
    ENGINE --> |"Roblox"| ROBLOX["Roblox Engineer<br/>Luau · Studio · DataStores"]

    UNITY --> LEVEL["Level Designer<br/>Layout · Pacing · Spatial Design"]
    UNREAL --> LEVEL
    GODOT --> LEVEL
    PHASER --> LEVEL
    THREEJS --> LEVEL
    ROBLOX --> LEVEL

    LEVEL --> TECH_ART["Technical Artist<br/>Shaders · VFX · Pipeline · DCC"]
    LEVEL --> NARRATIVE["Narrative Designer<br/>Story · Dialogue · Quest Design"]
    LEVEL --> AUDIO["Game Audio Engineer<br/>SFX · Music · Spatial Audio · Wwise/FMOD"]

    TECH_ART --> BUILD["BUILD Phase<br/>Implement → Integrate → Polish"]
    NARRATIVE --> BUILD
    AUDIO --> BUILD

    BUILD --> GAME_TEST{{"Game Test Protocol"}}
    GAME_TEST --> |"Mechanics"| MT["Mechanics Validation<br/>Physics · Controls · Collision · FSM"]
    GAME_TEST --> |"Balance"| BT["Balance Validation<br/>Economy · Difficulty · Progression"]
    GAME_TEST --> |"Performance"| PT["Performance Validation<br/>FPS · Memory · Load · Platform"]
    GAME_TEST --> |"Build"| BT2["Build Validation<br/>Platform · Crash · CI/CD"]
    GAME_TEST --> |"Platform"| PLT["Platform Validation<br/>iOS · Android · Console · WebGL"]

    MT --> SHIP["SHIP Phase<br/>Build · Store · Release"]
    BT --> SHIP
    PT --> SHIP
    BT2 --> SHIP
    PLT --> SHIP

    SHIP --> SUSTAIN["SUSTAIN Phase<br/>Analytics · LiveOps · Content Drops"]
    SUSTAIN --> END(["Shipped Game"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style END fill:#16213e,stroke:#0f3460,color:#e94560
    style ENGINE fill:#533483,stroke:#9b59b6,color:#fff
    style GAME_TEST fill:#d35400,stroke:#e67e22,color:#fff
    style ART_STYLE fill:#1e8449,stroke:#2ecc71,color:#fff
```

### Full Build Pipeline (6 Phases + 3 Gates)

```mermaid
flowchart LR
    START(["User Request"])

    START --> DEFINE["DEFINE Phase<br/>Business Analyst<br/>Product Manager<br/>Solution Architect"]

    DEFINE --> GATE1{{"Gate 1<br/>Plan Approved?"}}
    GATE1 --> |"No"| REV1["Revise DEFINE"]
    GATE1 --> |"Yes"| BUILD["BUILD Phase<br/>Backend Engineer<br/>Frontend Engineer<br/>QA Engineer<br/>Security Engineer"]

    BUILD --> GATE2{{"Gate 2<br/>Code Approved?"}}
    GATE2 --> |"No"| REV2["Revise BUILD"]
    GATE2 --> |"Yes"| HARDEN["HARDEN Phase<br/>Security Engineer<br/>QA Engineer<br/>Code Reviewer<br/>Accessibility Engineer"]

    HARDEN --> SHIP["SHIP Phase<br/>DevOps<br/>SRE<br/>Database Engineer<br/>Performance Engineer"]

    SHIP --> GATE3{{"Gate 3<br/>Deploy Approved?"}}
    GATE3 --> |"No"| REV3["Revise SHIP"]
    GATE3 --> |"Yes"| SUSTAIN["SUSTAIN Phase<br/>Monitor<br/>Test · Review<br/>Document"]

    SUSTAIN --> GROW["GROW Phase<br/>Growth Marketer<br/>Conversion Optimizer<br/>AI Engineer"]

    GROW --> END(["Production Ready"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style END fill:#16213e,stroke:#0f3460,color:#e94560
    style GATE1 fill:#533483,stroke:#f39c12,color:#fff
    style GATE2 fill:#533483,stroke:#f39c12,color:#fff
    style GATE3 fill:#533483,stroke:#f39c12,color:#fff
    style REV1 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REV2 fill:#c0392b,stroke:#e74c3c,color:#fff
    style REV3 fill:#c0392b,stroke:#e74c3c,color:#fff
    style DEFINE fill:#0f3460,stroke:#3498db,color:#fff
    style BUILD fill:#0f3460,stroke:#3498db,color:#fff
    style HARDEN fill:#0f3460,stroke:#3498db,color:#fff
    style SHIP fill:#0f3460,stroke:#3498db,color:#fff
    style SUSTAIN fill:#0f3460,stroke:#3498db,color:#fff
    style GROW fill:#0f3460,stroke:#3498db,color:#fff
```

### NotebookLM Research Workflow (Research Mode — v0.5.19)

```mermaid
flowchart TD
    START(["Deep Research Request"])

    START --> CHECK_AUTH["1. Check Auth<br/>nlm auth status"]
    CHECK_AUTH --> CHECK_NOTEBOOK["2. Check Notebooks<br/>nlm notebook list"]

    CHECK_NOTEBOOK --> |"New topic"| CREATE["3. Create Notebook<br/>nlm notebook create"]
    CHECK_NOTEBOOK --> |"Existing notebook"| EXISTING["Use existing notebook<br/>nlm notebook get"]
    CREATE --> ADD_SOURCES

    EXISTING --> ADD_SOURCES["3. Add Sources<br/>URL · YouTube · Text · Drive"]

    ADD_SOURCES --> RESEARCH{{"Research Mode"}}
    RESEARCH --> |"Fast"| FAST["4a. Fast Research<br/>~30s · ~10 sources"]
    RESEARCH --> |"Deep"| DEEP["4b. Deep Research<br/>~5min · ~40+ sources"]

    FAST --> IMPORT["5. Import Sources<br/>nlm research import"]
    DEEP --> IMPORT

    IMPORT --> SYNTH["6. Synthesize<br/>nlm notebook describe<br/>nlm notebook query"]
    SYNTH --> CROSS{{"Cross-Notebook?"}}
    CROSS --> |"Yes"| CROSS_Q["7. Cross Query<br/>nlm cross query"]
    CROSS --> |"No"| GENERATE

    CROSS_Q --> GENERATE["8. Generate Content<br/>nlm audio create<br/>nlm report create<br/>nlm quiz create<br/>nlm slides create<br/>nlm infographic create"]

    GENERATE --> POLL["9. Poll Status<br/>nlm studio status"]
    POLL --> |"In progress"| POLL
    POLL --> |"Completed"| DOWNLOAD["10. Download Artifact<br/>nlm download audio<br/>nlm download report<br/>nlm download slides"]

    DOWNLOAD --> TAG["11. Tag + Alias<br/>nlm tag add<br/>nlm alias set"]

    TAG --> END(["Grounded Research Report"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
    style END fill:#16213e,stroke:#0f3460,color:#e94560
    style RESEARCH fill:#533483,stroke:#9b59b6,color:#fff
    style CROSS fill:#d35400,stroke:#e67e22,color:#fff
    style CHECK_AUTH fill:#1a5276,stroke:#3498db,color:#fff
    style CHECK_NOTEBOOK fill:#1a5276,stroke:#3498db,color:#fff
    style ADD_SOURCES fill:#1a5276,stroke:#3498db,color:#fff
    style SYNTH fill:#1e8449,stroke:#2ecc71,color:#fff
    style GENERATE fill:#1e8449,stroke:#2ecc71,color:#fff
    style DOWNLOAD fill:#1e8449,stroke:#2ecc71,color:#fff
    style TAG fill:#1e8449,stroke:#2ecc71,color:#fff
```

### ForgeNexus Analyze Pipeline (code analysis)

```mermaid
flowchart LR
    ANAME["npx forgenexus analyze"]

    subgraph SCAN["① Scanner"]
        S1["glob file discovery"]
        S2["language detection"]
        S3[".gitignore filter"]
    end

    subgraph PARSE["② Parse — tree-sitter AST"]
        P1["Worker Pool<br/>cpus-1 threads<br/>20MB budget/worker"]
        P2["Graceful fallback<br/>sequential if <15 files"]
        P3["17 Edge Types extracted"]
    end

    subgraph RESOLVE["③ Resolve"]
        R1["Suffix Trie O(1)<br/>import path resolution"]
        R2["Fast-path<br/>skip if <3% gaps"]
    end

    subgraph PROP["④ Propagate"]
        PP1["Kahn topological sort"]
        PP2["Cross-file binding"]
    end

    subgraph COMMUNITY["⑤ Community — Leiden Algorithm"]
        C1["3-phase:<br/>move → refine → aggregate"]
        C2["60s timeout · large-graph mode"]
    end

    subgraph PROCESS["⑥ Process — BFS Entry-Point Tracing"]
        PR1["Call chain extraction"]
        PR2["Auto-detect framework:<br/>Next.js · FastAPI · NestJS<br/>Express · Django · Rails<br/>Gin · Spring · etc."]
    end

    subgraph FTS_EMB["⑦ FTS + Embeddings"]
        F1["Incremental FTS5<br/>only changed nodes"]
        E1["Cache-first embedding<br/>5 providers"]
    end

    subgraph META["⑧ Meta"]
        M1["Commit tracking"]
        M2["Early exit<br/>if git unchanged"]
    end

    DB[(<b>KuzuDB Graph<br/>Nodes + Rels + FTS<br/>Vector Embeddings</b>)]

    ANAME --> SCAN --> PARSE --> RESOLVE --> PROP --> COMMUNITY --> PROCESS --> FTS_EMB --> META
    FTS_EMB --> DB
    PARSE --> DB
    PROP --> DB

    style ANAME fill:#0f3460,stroke:#e94560,color:#fff
    style DB fill:#16213e,stroke:#4B0082,color:#fff
    style SCAN fill:#1a5276,stroke:#3498db
    style PARSE fill:#1a5276,stroke:#3498db
    style RESOLVE fill:#6c3483,stroke:#9b59b6
    style PROP fill:#6c3483,stroke:#9b59b6
    style COMMUNITY fill:#1e8449,stroke:#2ecc71
    style PROCESS fill:#1e8449,stroke:#2ecc71
    style FTS_EMB fill:#d35400,stroke:#e67e22
    style META fill:#2c3e50,stroke:#7f8c8d
```

### Multi-Repo Group Management

```mermaid
flowchart TD
    CLI["forgenexus group CLI"]
    MCP["MCP Tools<br/>8 group tools"]
    GROUPS[("Groups<br/>data/groups.ts")]
    REGISTRY[("Registry DB<br/>KuzuDB")]
    CONTRACTS[("Contracts<br/>Cross-repo API<br/>signatures")]
    REPOS[("Indexed Repos<br/>via forgenexus analyze")]

    CLI --> |"group create"| GROUPS
    CLI --> |"group list"| GROUPS
    CLI --> |"group add<br/>group remove"| GROUPS
    MCP --> |"group_sync"| GROUPS
    MCP --> |"group_contracts"| GROUPS
    MCP --> |"group_query<br/>group_status"| CONTRACTS

    GROUPS --> |"sync<br/>extract"| CONTRACTS
    CONTRACTS --> REGISTRY
    REPOS --> |"analyze"| REGISTRY
    REGISTRY --> |"link contracts<br/>cross-repo edges"| CONTRACTS

    style CLI fill:#0f3460,stroke:#e94560,color:#fff
    style MCP fill:#0f3460,stroke:#e94560,color:#fff
    style GROUPS fill:#16213e,stroke:#4B0082,color:#fff
    style REGISTRY fill:#16213e,stroke:#4B0082,color:#fff
    style CONTRACTS fill:#1e8449,stroke:#2ecc71,color:#fff
    style REPOS fill:#1a5276,stroke:#3498db,color:#fff
```

### ForgeNexus Enterprise — GitHub Actions

```mermaid
flowchart LR
    PR["Pull Request"] --> PR_REVIEW["PR Review<br/>Blast Radius"]
    PR --> CONTRACT["Contract Check<br/>oasdiff"]
    PR_REVIEW --> COMMENT["PR Comment<br/>Risk Level"]
    CONTRACT --> COMMENT

    PUSH["Push to main"] --> REINDEX["Auto Reindex<br/>Incremental"]
    PUSH --> WIKI["Auto Wiki<br/>LLM Generation"]

    REINDEX --> ARTIFACT["Index Artifact<br/>Share across CI"]
    WIKI --> PAGES["GitHub Pages<br/>or Gist"]

    PR_REVIEW --> STATUS["Status Check<br/>Branch Protection"]

    style PR fill:#0f3460,stroke:#e94560,color:#fff
    style PUSH fill:#0f3460,stroke:#e94560,color:#fff
    style COMMENT fill:#1e8449,stroke:#2ecc71,color:#fff
    style REINDEX fill:#1e8449,stroke:#2ecc71,color:#fff
    style WIKI fill:#1e8449,stroke:#2ecc71,color:#fff
```

#### Quick Setup — PR Review for your repo

#### CLI Commands (Enterprise)

| Command | Description |
|---------|-------------|
| `pr-review <base> [head]` | Analyze PR blast radius |
| `impact <symbol>` | Analyze symbol impact |
| `group contracts <group>` | View all contracts in group |
| `group status <group>` | Check staleness of all repos |
| `group query <group> <term>` | Search across all repos |

#### Enterprise Features

| Feature | CLI | GitHub Actions | Dry Run |
|---------|-----|---------------|---------|
| PR Review Blast Radius | ✅ | ✅ | ✅ |
| OpenAPI contract check (oasdiff) | N/A | ✅ | ✅ |
| Auto-generate Wiki | ✅ | ✅ | ✅ |
| Auto Reindex (incremental/full) | ✅ | ✅ | ✅ |
| Multi-Repo Group Management | ✅ | ✅ | ✅ |
| Cross-repo impact analysis | N/A | ✅ | ✅ |

**Completion: 100%** — All features support dry-run mode.

### Claude Code Hooks — Auto-Reindex

```mermaid
flowchart TD
    HOOK_PRE[("pre-tool-use hook<br/>Enrich context")]
    HOOK_POST[("post-tool-use hook<br/>Auto-reindex")]

    subgraph PRE_HOOK["pre-tool-use.ts"]
        T1{"tool name?"}
        T_GREP["grep / search<br/>ForgeNexus search<br/>→ show callers"]
        T_READ["read file<br/>→ show file symbols"]
        T_EDIT["edit / Write<br/>→ warn about callers"]
        T_SKIP["Other tools<br/>→ skip"]
    end

    subgraph POST_HOOK["post-tool-use.ts"]
        G1{"git commit<br/>detected?"}
        G2["Find forgenexus root<br/>detect last commit"]
        G3["Spawn incremental<br/>forgenexus analyze"]
        G4["Success → log<br/>Failure → warn"]
    end

    HOOK_PRE --> PRE_HOOK
    PRE_HOOK --> T1
    T1 --> |"grep/search"| T_GREP
    T1 --> |"read"| T_READ
    T1 --> |"edit/Write"| T_EDIT
    T1 --> |"other"| T_SKIP

    HOOK_POST --> POST_HOOK
    POST_HOOK --> G1
    G1 --> |"yes"| G2 --> G3 --> G4
    G1 --> |"no"| G_SKIP["(no action)"]

    style HOOK_PRE fill:#6c3483,stroke:#9b59b6,color:#fff
    style HOOK_POST fill:#6c3483,stroke:#9b59b6,color:#fff
    style PRE_HOOK fill:#1a1a2e,stroke:#9b59b6
    style POST_HOOK fill:#1a1a2e,stroke:#9b59b6
    style T_GREP fill:#1e8449,stroke:#2ecc71,color:#fff
    style T_READ fill:#1e8449,stroke:#2ecc71,color:#fff
    style T_EDIT fill:#d35400,stroke:#e67e22,color:#fff
    style G3 fill:#d35400,stroke:#e67e22,color:#fff
```

### 22 Modes — What You Say, Forgewright Chooses

```mermaid
flowchart LR
    INPUT["You say..."]

    INPUT --> F1["Build SaaS<br/>Production Grade"]
    INPUT --> F2["Add feature"]
    INPUT --> F3["Build Game<br/>Unity/Unreal/Godot/Roblox"]
    INPUT --> F4["Build VR/AR"]
    INPUT --> F5["Build Mobile<br/>iOS/Android"]
    INPUT --> F6["AI Feature<br/>RAG/LLM/Chatbot"]
    INPUT --> F7["Review Code<br/>Quality check"]
    INPUT --> F8["Write Tests"]
    INPUT --> F9["Deploy CI/CD<br/>Docker/Terraform"]
    INPUT --> F10["Design UI<br/>UX Research"]
    INPUT --> F11["Optimize<br/>Performance"]
    INPUT --> F12["Deep research"]
    INPUT --> F13["Marketing"]
    INPUT --> F14["Debug Fix<br/>Bug Trace"]
    INPUT --> F15["Analyze<br/>Requirements"]
    INPUT --> F16["Migrate DB"]
    INPUT --> F17["Harden Security<br/>Audit + Fix"]
    INPUT --> F18["Design Architecture<br/>API/Data Model"]
    INPUT --> F19["Write Docs"]
    INPUT --> F20["Improve Prompts<br/>Prompt Engineering"]

    F1 --> M1{{"Full Build"}}
    F2 --> M2{{"Feature"}}
    F3 --> M3{{"Game Build"}}
    F4 --> M4{{"XR Build"}}
    F5 --> M5{{"Mobile"}}
    F6 --> M6{{"AI Build"}}
    F7 --> M7{{"Review"}}
    F8 --> M8{{"Test"}}
    F9 --> M9{{"Ship"}}
    F10 --> M10{{"Design"}}
    F11 --> M11{{"Optimize"}}
    F12 --> M12{{"Research"}}
    F13 --> M13{{"Marketing"}}
    F14 --> M14{{"Debug"}}
    F15 --> M15{{"Analyze"}}
    F16 --> M16{{"Migrate"}}
    F17 --> M17{{"Harden"}}
    F18 --> M18{{"Architect"}}
    F19 --> M19{{"Document"}}
    F20 --> M20{{"Prompt"}}

    M1 --> SK1["BA → PM → Architect →<br/>BE → FE → QA →<br/>Security → DevOps → SRE"]
    M2 --> SK2["PM → Architect →<br/>BE/FE → QA"]
    M3 --> SK3["Game Designer →<br/>Engine Engineer →<br/>Level → Narrative →<br/>Technical Art → Audio"]
    M4 --> SK4["XR Engineer →<br/>XR Game Pipeline"]
    M5 --> SK5["BA → Mobile Engineer →<br/>PM → Architect"]
    M6 --> SK6["AI Engineer →<br/>Prompt Engineer →<br/>Data Scientist"]
    M7 --> SK7["Code Reviewer"]
    M8 --> SK8["QA Engineer"]
    M9 --> SK9["DevOps → SRE"]
    M10 --> SK10["UX Researcher →<br/>UI Designer"]
    M11 --> SK11["Performance Engineer →<br/>SRE"]
    M12 --> SK12["NotebookLM Researcher\n(+ Polymath web search)"]
    M13 --> SK13["Growth Marketer →<br/>Conversion Optimizer"]
    M14 --> SK14["Debugger →<br/>Engineer"]
    M15 --> SK15["Business Analyst"]
    M16 --> SK16["Database Engineer →<br/>Software Eng → QA"]
    M17 --> SK17["Security → QA →<br/>Code Review → Fix"]
    M18 --> SK18["Solution Architect"]
    M19 --> SK19["Technical Writer"]
    M20 --> SK20["Prompt Engineer →<br/>chat-interpreter →<br/>prompt-techniques → templates"]

    style INPUT fill:#1a1a2e,stroke:#e94560,color:#fff
    style M1 fill:#533483,stroke:#9b59b6,color:#fff
    style M2 fill:#533483,stroke:#9b59b6,color:#fff
    style M3 fill:#533483,stroke:#9b59b6,color:#fff
    style M4 fill:#533483,stroke:#9b59b6,color:#fff
    style M5 fill:#533483,stroke:#9b59b6,color:#fff
    style M6 fill:#533483,stroke:#9b59b6,color:#fff
    style M7 fill:#533483,stroke:#9b59b6,color:#fff
    style M8 fill:#533483,stroke:#9b59b6,color:#fff
    style M9 fill:#533483,stroke:#9b59b6,color:#fff
    style M10 fill:#533483,stroke:#9b59b6,color:#fff
    style M11 fill:#533483,stroke:#9b59b6,color:#fff
    style M12 fill:#533483,stroke:#9b59b6,color:#fff
    style M13 fill:#533483,stroke:#9b59b6,color:#fff
    style M14 fill:#533483,stroke:#9b59b6,color:#fff
    style M15 fill:#533483,stroke:#9b59b6,color:#fff
    style M16 fill:#533483,stroke:#9b59b6,color:#fff
    style M17 fill:#533483,stroke:#9b59b6,color:#fff
    style M18 fill:#533483,stroke:#9b59b6,color:#fff
    style M19 fill:#533483,stroke:#9b59b6,color:#fff
    style M20 fill:#8e44ad,stroke:#9b59b6,color:#fff
    style SK1 fill:#0f3460,stroke:#3498db,color:#fff
    style SK2 fill:#0f3460,stroke:#3498db,color:#fff
    style SK3 fill:#0f3460,stroke:#3498db,color:#fff
    style SK4 fill:#0f3460,stroke:#3498db,color:#fff
    style SK5 fill:#0f3460,stroke:#3498db,color:#fff
    style SK6 fill:#0f3460,stroke:#3498db,color:#fff
    style SK7 fill:#0f3460,stroke:#3498db,color:#fff
    style SK8 fill:#0f3460,stroke:#3498db,color:#fff
    style SK9 fill:#0f3460,stroke:#3498db,color:#fff
    style SK10 fill:#0f3460,stroke:#3498db,color:#fff
    style SK11 fill:#0f3460,stroke:#3498db,color:#fff
    style SK12 fill:#0f3460,stroke:#3498db,color:#fff
    style SK13 fill:#0f3460,stroke:#3498db,color:#fff
    style SK14 fill:#0f3460,stroke:#3498db,color:#fff
    style SK15 fill:#0f3460,stroke:#3498db,color:#fff
    style SK16 fill:#0f3460,stroke:#3498db,color:#fff
    style SK17 fill:#0f3460,stroke:#3498db,color:#fff
    style SK18 fill:#0f3460,stroke:#3498db,color:#fff
    style SK19 fill:#0f3460,stroke:#3498db,color:#fff
    style SK20 fill:#8e44ad,stroke:#3498db,color:#fff
```

---

## 55 Skills — Which One, When?

```mermaid
flowchart TD
    USER["What do you want to do?"]

    USER --> |"Build new website/app"| SaaS["📦 Core Engineering<br/>22 skills"]
    USER --> |"Build game (Unity/Unreal/Godot)"| GAME["🎮 Game Development<br/>18 skills"]
    USER --> |"Optimize / debug code"| OPT["🔧 Optimization & Debug<br/>Performance · Debugger · QA"]
    USER --> |"Research / data analysis"| DATA["📊 Data & AI<br/>AI Engineer · Data Scientist · NotebookLM"]
    USER --> |"Deploy / CI/CD / infra"| DEVOPS["🚀 DevOps & Ship<br/>DevOps · SRE · Database"]
    USER --> |"Marketing / growth"| GROW["📈 Growth<br/>Growth Marketer · Conversion Optimizer"]
    USER --> |"Design / UX"| DESIGN["🎨 Design & UX<br/>UX Researcher · UI Designer"]

    SaaS --> SaaS_DETAIL["<b>22 skills:</b><br/>Business Analyst · Product Manager<br/>Solution Architect · Software Engineer<br/>Frontend · QA · Security · DevOps · SRE<br/>Database · API Designer · Prompt Engineer"]
    GAME --> GAME_DETAIL["<b>18 skills:</b><br/>Game Designer · Unity/Unreal/Godot/Roblox Engineer<br/>Level Designer · Narrative Designer<br/>Technical Artist · Game Audio Engineer<br/>XR Engineer"]
    OPT --> OPT_DETAIL["<b>Optimize:</b> Performance Engineer<br/><b>Debug:</b> Debugger → Software Engineer<br/><b>Test:</b> QA Engineer"]
    DATA --> DATA_DETAIL["<b>AI:</b> AI Engineer · Prompt Engineer · Data Scientist<br/><b>Research:</b> NotebookLM Researcher<br/><b>Web:</b> Web Scraper · XLSX Engineer"]
    DEVOPS --> DEVOPS_DETAIL["<b>Ship:</b> DevOps · SRE · Performance Engineer<br/><b>Data:</b> Database Engineer<br/><b>API:</b> API Designer"]
    GROW --> GROW_DETAIL["<b>Growth:</b> Growth Marketer<br/><b>Conversion:</b> Conversion Optimizer"]
    DESIGN --> DESIGN_DETAIL["<b>Research:</b> UX Researcher<br/><b>Design:</b> UI Designer<br/><b>Accessibility:</b> Accessibility Engineer"]

    style USER fill:#1a1a2e,stroke:#e94560,color:#fff
    style SaaS fill:#1a5276,stroke:#3498db,color:#fff
    style GAME fill:#1a5276,stroke:#3498db,color:#fff
    style OPT fill:#1a5276,stroke:#3498db,color:#fff
    style DATA fill:#1a5276,stroke:#3498db,color:#fff
    style DEVOPS fill:#1a5276,stroke:#3498db,color:#fff
    style GROW fill:#1a5276,stroke:#3498db,color:#fff
    style DESIGN fill:#1a5276,stroke:#3498db,color:#fff
    style SaaS_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style GAME_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style OPT_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style DATA_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style DEVOPS_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style GROW_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
    style DESIGN_DETAIL fill:#0f3460,stroke:#3498db,color:#fff
```

---

## Detailed Setup

### Method 1: Add to another project as submodule

**Step 1:** Open Terminal, run from your project root:

```bash
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git \
  .antigravity/plugins/production-grade
```

**Step 2:** Copy the 2 required files:

```bash
cp .antigravity/plugins/production-grade/AGENTS.md .
cp .antigravity/plugins/production-grade/CLAUDE.md .
```

**Step 3:** Commit:

```bash
git add .gitmodules .antigravity AGENTS.md CLAUDE.md
git commit -m "feat: add forgewright"
```

**Step 4:** Initialize the submodule:

```bash
git submodule update --init --recursive
```

### Method 2: Upgrade to Level 2 (Smart)

Requires: **Node.js 18+**

```bash
# Check
node --version

# If missing → download from nodejs.org
# macOS: brew install node
```

Then:

```bash
npx --yes forgenexus analyze "$(pwd)"
```

Wait 1-2 minutes (first time). Done!

### Method 3: Add memory (Level 3)

Requires: **Python 3.8+**

```bash
# Check
python3 --version
```

Then:

```bash
bash .antigravity/plugins/production-grade/scripts/ensure-mem0.sh "$(pwd)"
```

### Method 4: Install MCP server (Level 4)

Run one command:

```bash
bash .antigravity/plugins/production-grade/scripts/mcp-generate.sh
```

Then restart Cursor/VS Code.

### Verify your installation

```bash
echo "=== Verification ==="
echo "Skills: $(ls .antigravity/plugins/production-grade/skills/ -1 2>/dev/null | wc -l | tr -d ' ')"
echo "ForgeNexus: $([ -f .antigravity/plugins/production-grade/forgenexus/dist/cli/index.js ] && echo 'OK' || echo 'MISSING')"
echo "MCP: $([ -d .forgewright/mcp-server ] && echo 'OK' || echo 'MISSING')"
echo "Memory: $([ -f .forgewright/memory.jsonl ] && echo 'OK' || echo 'MISSING')"
```

---

## Optional Enhancements

### Research — NotebookLM CLI (v0.5.19)

> **AI research that never gets it wrong.** Use Google NotebookLM to read documents, create summaries, quizzes, flashcards, podcasts, reports, slides, and more.

```bash
# Install (uv recommended)
pipx install notebooklm-mcp-cli

# Authenticate (launches browser, extracts cookies automatically)
nlm login

# Check status
nlm auth status        # Shows "Authenticated" with notebook count
nlm notebook list      # List all notebooks
nlm --ai              # Full AI-optimized documentation
```

**35+ tools:** notebook, source, research, studio, audio, video, report, quiz, flashcards, mindmap, slides, infographic, data-table, batch, cross-notebook, pipelines, tags, drive-sync, sharing, aliases.

### Web Scraping (crawl4ai)

```bash
pip install "crawl4ai>=0.8.0"
# Then: "Scrape [URL]" or "Crawl [website]"
```

### AI Vision Testing (Midscene.js)

```bash
npm install -g @anthropic-ai/midscene
# Then: "Test on Android" or "Test on iOS"
```

### Multi-Agent (Paperclip)

```bash
npx paperclipai onboard --yes
cd paperclip && pnpm dev
# Dashboard: http://localhost:3100
```

---

## Quality Gate — Automatic Scoring

Run anytime to score your project 0-100:

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
| 70–79 | C | Should review |
| 60–69 | D | Fix before deploy |
| < 60 | F | Not acceptable — blocks deploy |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `forgenexus: command not found` | Use `npx forgenexus` instead of `forgenexus` |
| `npm install` fails in submodule | Check `node --version` (needs 18+) |
| Can't see MCP tools | Restart Cursor/VS Code after config change |
| Stale index | Run `npx forgenexus analyze "$(pwd)"` |
| Submodule not initialized | `git submodule update --init --recursive` |
| `realpath` not found (macOS) | `brew install coreutils` |
| `python3` not found | Install Python 3.8+ for memory feature |
| Windows: `bash` not found | Use equivalent PowerShell commands |
| Mermaid diagrams not showing | Make sure viewer uses **mermaid 10+**. GitHub/GitLab supported. |
| `better-sqlite3` error after merge | Run `cd forgenexus && npm install` to install `kuzu` instead |

---

## Available Workflow Shortcuts

| Command | What it does |
|---------|--------------|
| `/setup` | First-time setup as git submodule |
| `/update` | Check for and install updates (safe, keeps your changes) |
| `/pipeline` | View full pipeline, modes, and skills list |
| `/onboard` | Deep project analysis — creates `.forgewright/project-profile.json` |
| `/mcp` | Generate or regenerate MCP server config |
| `/setup-mobile-test` | Set up mobile testing for Android/iOS |

---

## Contributing

1. Fork the repo
2. Create branch: `git checkout -b feature/your-feature`
3. Commit using [Conventional Commits](https://www.conventionalcommits.org/): `feat(skill): add new capability`
4. Open a Pull Request

**Adding a new skill:** Create a file at `skills/your-skill-name/SKILL.md`. See existing skills for examples.

---

## License

MIT

---

## Support the Project

If Forgewright helps you ship faster, you can support here:

<p align="center">
  <img src="assets/donate/give-me-a-coffee-international.png" width="280" alt="Buy Me a Coffee" />
</p>

---

<p align="center">
  <strong>Forgewright — 55 AI skills. 22 modes. Persistent Memory. Code Intelligence. SaaS to AAA games.</strong>
</p>
<p align="center">
  <em>Plan precisely. Build confidently. Scale intelligently.</em>
</p>
