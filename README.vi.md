# Forgewright — Adaptive AI Orchestrator

> **This is the Vietnamese version.** For English documentation, see [README.md](./README.md)

<p align="center">
  <img src="assets/forgewright-banner.png" alt="Forgewright Banner" width="100%" />
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/version-7.9.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/skills-55-brightgreen.svg" alt="Skills" />
  <img src="https://img.shields.io/badge/modes-22-blueviolet.svg" alt="Modes" />
  <img src="https://img.shields.io/badge/protocols-15-00CED1.svg" alt="Protocols" />
  <img src="https://img.shields.io/badge/Game_Dev-Unity·Unreal·Godot·Roblox-FF4500.svg" alt="Game Dev" />
  <img src="https://img.shields.io/badge/Code_Intelligence-ForgeNexus·GitNexus-4B0082.svg" alt="Code Intelligence" />
  <img src="https://img.shields.io/badge/Memory-Persistent%20(mem0)-00CED1.svg" alt="Memory" />
  <img src="https://img.shields.io/badge/MCP-12%20Tools-orange.svg" alt="MCP" />
</p>

---

## TL;DR — Forgewright là gì?

**Tưởng tượng:** Bạn có một đội ngũ 55 chuyên gia AI. Mỗi người giỏi một việc khác nhau — viết code, kiểm tra bảo mật, thiết kế game, tối ưu tốc độ. Forgewright là "người quản lý" — khi bạn nói "tôi muốn build một app bán hàng", nó tự biết cần gọi chuyên gia nào, theo thứ tự nào, và kiểm tra chất lượng ra sao.

> **Một câu:** Forgewright tự động chọn đúng chuyên gia AI cho đúng việc, từ ý tưởng đến sản phẩm.

### Ví dụ cụ thể

```
Bạn nói:  "Build cho tôi một website bán áo thun"

    ↓

Forgewright tự động làm:
    1. Phân tích thị trường (Business Analyst)
    2. Lên kế hoạch tính năng (Product Manager)
    3. Thiết kế kiến trúc database & API (Solution Architect)
    4. Viết code backend + frontend (Software Engineer)
    5. Viết unit test (QA Engineer)
    6. Kiểm tra bảo mật (Security Engineer)
    7. Deploy lên server (DevOps)
    8. Monitor & tối ưu (SRE)

    ↓

Kết quả: Website production-ready, đã review, đã test, score 0-100
```

### 4 cấp độ "sức mạnh" — chọn cái phù hợp với bạn

```mermaid
flowchart LR
    subgraph L1["⚡ Level 1 — Basic"]
        direction TB
        L1A["✅ Đã có gì"]
        L1B["• 52 kỹ năng AI"]
        L1C["• Pipeline tự động"]
        L1D["• Mặc định khi cài đặt"]
    end

    subgraph L2["⚡⚡ Level 2 — Smart"]
        direction TB
        L2A["🔍 Thêm gì"]
        L2B["• Hỏi 'thay đổi này ảnh hưởng gì?' → trả lời ngay"]
        L2C["• Phân tích blast radius tự động"]
        L2D["• Cần: Node.js 18+"]
    end

    subgraph L3["⚡⚡⚡ Level 3 — Memory"]
        direction TB
        L3A["🧠 Thêm gì"]
        L3B["• Nhớ mọi thứ qua các lần chat"]
        L3C["• Lưu quyết định, kiến trúc, blockers"]
        L3D["• Cần: Python 3.8+"]
    end

    subgraph L4["⚡⚡⚡⚡ Level 4 — Full Power"]
        direction TB
        L4A["🚀 Tất cả"]
        L4B["• 12 công cụ ForgeNexus trong chat"]
        L4C["• Tra cứu code tức thì"]
        L4D["• Cần: MCP server"]
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

## Cách bắt đầu — 3 bước dễ nhất

```mermaid
flowchart TD
    START(["Bạn ơi, bắt đầu từ đâu?"])

    START --> Q1{"Bạn là dev?"}
    Q1 --> |"Không / mới bắt đầu"| EASY["✅ Level 1 — Basic<br/>Chỉ cần cài là xong<br/>52 kỹ năng có sẵn"]
    Q1 --> |"Có, muốn thông minh hơn"| SMART["✅ Level 2 — Smart<br/>Thêm phân tích code<br/>Hỏi gì đáp nấy"]

    SMART --> Q2{"Cần nhớ qua các lần chat?"}
    Q2 --> |"Có, dự án dài"| MEM["✅ Level 3 — Memory<br/>Lưu mọi quyết định<br/>Không phải nói lại"]
    Q2 --> |"Không cần / CI only"| MCP["✅ Level 4 — Full Power<br/>12 công cụ trong chat<br/>Tra cứu code tức thì"]

    EASY --> DONE1["🎉 Xong! Bắt đầu dùng ngay"]
    SMART --> DONE2["🎉 Xong! Cài thêm 1 bước"]
    MEM --> DONE3["🎉 Xong! Cài thêm 2 bước"]
    MCP --> DONE4["🎉 Xong! Cài thêm 2 bước"]

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

### Cài đặt nhanh (không cần biết bash)

#### Nếu bạn dùng Cursor / VS Code

1. Mở Cursor hoặc VS Code
2. Điền câu hỏi hoặc yêu cầu của bạn
3. **Xong!** Không cần cài gì thêm — Level 1 đã hoạt động

#### Nếu bạn muốn thông minh hơn (Level 2+)

Mở **Terminal** (hoặc Command Prompt) và chạy:

```bash
# Kiểm tra Node.js
node --version

# Nếu thấy số (vd: v20.x.x) → đã đủ điều kiện
# Nếu báo "command not found" → cài Node.js trước
#   macOS: brew install node
#   Windows: tải từ nodejs.org
```

---

## The Flow — Forgewright làm việc thế nào?

> Tất cả sơ đồ dưới đây hiển thị tốt trên GitHub, GitLab, và mọi trình xem mermaid.
> Nếu không thấy hình — đảm bảo trình xem dùng **mermaid 10+**.

### Tổng quan — Ai làm gì

```mermaid
flowchart TD
    START(["Bạn nói: 'Build app bán hàng'"])
    ORCH(["Forgewright<br/>(người quản lý)"])

    ORCH --> MODE{{"Chọn chế độ<br/>phù hợp"}}

    MODE --> |"Build toàn bộ"| DEFINE["DEFINE<br/>Phân tích → Kế hoạch"]
    MODE --> |"Thêm tính năng"| FEATURE["FEATURE<br/>PM → Code → Test"]
    MODE --> |"Build game"| GAME["GAME<br/>Designer → Code → Test"]
    MODE --> |"AI feature"| AI["AI<br/>AI Engineer → Prompt → Data"]
    MODE --> |"Khác"| OTHER["Khác<br/>Test · Review · Design · Debug"]

    DEFINE --> GATE1{{"OK?"}}
    FEATURE --> GATE1
    GATE1 --> |"✅ Yes"| BUILD["BUILD<br/>Code → Test → Security"]
    GATE1 --> |"❌ No"| REV1["Sửa lại DEFINE"]
    BUILD --> GATE2{{"OK?"}}
    GATE2 --> |"✅ Yes"| SHIP["SHIP<br/>Deploy → Monitor"]
    GATE2 --> |"❌ No"| REV2["Sửa lại BUILD"]
    SHIP --> END(["🎉 Production Ready"])

    START --> ORCH

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
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
    ORCH(["Orchestrator<br/>production-grade"])

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

    START --> ORCH
    GROW --> END(["Output: Production<br/>Ready Code"])

    style START fill:#1a1a2e,stroke:#e94560,color:#fff
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

### Middleware Chain (mỗi lần chạy skill)

```mermaid
flowchart TD
    REQ(["User Request"])
    PRE1["① SessionData<br/>Load profile + session state"]
    PRE2["② ContextLoader<br/>Memory + conventions + KIs"]
    PRE3["③ SkillRegistry<br/>Progressive skill discovery"]
    PRE4["④ Guardrail<br/>Pre-tool authorization"]
    PRE5["⑤ Summarization<br/>Auto-compress if >70% budget"]
    SKILL_EXEC["SKILL EXECUTION<br/>Engineer → QA → Security → ..."]
    POST1["⑥ QualityGate<br/>4-level validation 0-100"]
    POST2["⑦ BrownfieldSafety<br/>Regression + change manifest"]
    POST3["⑧ TaskTracking<br/>Update task.md"]
    POST4["⑨ Memory Turn-Close<br/>REQ: DONE: OPEN: → mem0"]
    POST5["⑩ GracefulFailure<br/>Retry + exit strategy"]
    RESULT(["Result / Next Skill"])

    REQ --> PRE1 --> PRE2 --> PRE3 --> PRE4 --> PRE5 --> SKILL_EXEC
    SKILL_EXEC --> POST1 --> POST2 --> POST3 --> POST4 --> POST5 --> RESULT

    style REQ fill:#1a1a2e,stroke:#e94560,color:#fff
    style RESULT fill:#16213e,stroke:#0f3460,color:#e94560
    style SKILL_EXEC fill:#0f3460,stroke:#e94560,color:#fff
    style PRE1 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE2 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE3 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE4 fill:#1a5276,stroke:#3498db,color:#fff
    style PRE5 fill:#1a5276,stroke:#3498db,color:#fff
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

### Game Build Pipeline (18 kỹ năng game)

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

### Full Build Pipeline (6 Phase + 3 Cổng kiểm tra)

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

### ForgeNexus Analyze Pipeline (phân tích code)

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

### Multi-Repo Group Management (quản lý nhóm multi-repo)

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

#### Cài đặt nhanh — PR Review cho repo của bạn

#### Lệnh CLI (Enterprise)

| Lệnh | Mô tả |
|-------|--------|
| `pr-review <base> [head]` | Phân tích blast radius của PR |
| `impact <symbol>` | Phân tích ảnh hưởng của symbol |
| `group contracts <group>` | Xem tất cả contracts trong group |
| `group status <group>` | Kiểm tra staleness của tất cả repos |
| `group query <group> <term>` | Tìm kiếm xuyên suốt các repos |

#### Tính năng Enterprise

| Tính năng | CLI | GitHub Actions | Dry Run |
|------------|-----|---------------|---------|
| PR Review Blast Radius | ✅ | ✅ | ✅ |
| Kiểm tra contract OpenAPI (oasdiff) | N/A | ✅ | ✅ |
| Tạo Wiki tự động | ✅ | ✅ | ✅ |
| Auto Reindex (tăng dần/đầy đủ) | ✅ | ✅ | ✅ |
| Quản lý Multi-Repo Groups | ✅ | ✅ | ✅ |
| Phân tích ảnh hưởng xuyên repos | N/A | ✅ | ✅ |

**Độ hoàn thiện: 100%** — Tất cả tính năng đều hỗ trợ dry-run mode.

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

### 22 Modes — Bạn nói gì, Forgewright chọn cái đó

```mermaid
flowchart LR
    INPUT["Bạn nói..."]

    INPUT --> F1["Build SaaS<br/>Production Grade"]
    INPUT --> F2["Thêm tính năng"]
    INPUT --> F3["Build Game<br/>Unity/Unreal/Godot/Roblox"]
    INPUT --> F4["Build VR/AR"]
    INPUT --> F5["Build Mobile<br/>iOS/Android"]
    INPUT --> F6["AI Feature<br/>RAG/LLM/Chatbot"]
    INPUT --> F7["Review Code<br/>Kiểm tra chất lượng"]
    INPUT --> F8["Viết Tests"]
    INPUT --> F9["Deploy CI/CD<br/>Docker/Terraform"]
    INPUT --> F10["Design UI<br/>UX Research"]
    INPUT --> F11["Optimize<br/>Performance"]
    INPUT --> F12["Research sâu"]
    INPUT --> F13["Marketing"]
    INPUT --> F14["Debug Fix<br/>Bug Trace"]
    INPUT --> F15["Analyze<br/>Requirements"]
    INPUT --> F16["Migrate DB"]
    INPUT --> F17["Harden Security<br/>Audit + Fix"]
    INPUT --> F18["Design Architecture<br/>API/Data Model"]
    INPUT --> F19["Write Docs<br/>Tài liệu"]

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
```

---

## 55 Skills — Dùng cái nào, khi nào?

```mermaid
flowchart TD
    USER["Bạn muốn làm gì?"]

    USER --> |"Build website/app mới"| SaaS["📦 Core Engineering<br/>22 kỹ năng"]
    USER --> |"Build game (Unity/Unreal/Godot)"| GAME["🎮 Game Development<br/>18 kỹ năng"]
    USER --> |"Tối ưu / debug code"| OPT["🔧 Optimization & Debug<br/>Performance · Debugger · QA"]
    USER --> |"Research / phân tích dữ liệu"| DATA["📊 Data & AI<br/>AI Engineer · Data Scientist · NotebookLM"]
    USER --> |"Deploy / CI/CD / infra"| DEVOPS["🚀 DevOps & Ship<br/>DevOps · SRE · Database"]
    USER --> |"Marketing / tăng trưởng"| GROW["📈 Growth<br/>Growth Marketer · Conversion Optimizer"]
    USER --> |"Design / UX"| DESIGN["🎨 Design & UX<br/>UX Researcher · UI Designer"]

    SaaS --> SaaS_DETAIL["<b>22 kỹ năng:</b><br/>Business Analyst · Product Manager<br/>Solution Architect · Software Engineer<br/>Frontend · QA · Security · DevOps · SRE<br/>Database · API Designer · Prompt Engineer"]
    GAME --> GAME_DETAIL["<b>18 kỹ năng:</b><br/>Game Designer · Unity/Unreal/Godot/Roblox Engineer<br/>Level Designer · Narrative Designer<br/>Technical Artist · Game Audio Engineer<br/>XR Engineer"]
    OPT --> OPT_DETAIL["<b>Tối ưu:</b> Performance Engineer<br/><b>Debug:</b> Debugger → Software Engineer<br/><b>Test:</b> QA Engineer"]
    DATA --> DATA_DETAIL["<b>AI:</b> AI Engineer · Prompt Engineer · Data Scientist<br/><b>Research:</b> NotebookLM Researcher<br/><b>Web:</b> Web Scraper · XLSX Engineer"]
    DEVOPS --> DEVOPS_DETAIL["<b>Ship:</b> DevOps · SRE · Performance Engineer<br/><b>Data:</b> Database Engineer<br/><b>API:</b> API Designer"]
    GROW --> GROW_DETAIL["<b>Tăng trưởng:</b> Growth Marketer<br/><b>Chuyển đổi:</b> Conversion Optimizer"]
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

## Cài đặt chi tiết

### Cách 1: Thêm vào dự án khác như submodule

**Bước 1:** Mở Terminal, chạy từ thư mục gốc dự án của bạn:

```bash
git submodule add -b main https://github.com/buiphucminhtam/forgewright.git \
  .antigravity/plugins/production-grade
```

**Bước 2:** Copy 2 file cần thiết:

```bash
cp .antigravity/plugins/production-grade/AGENTS.md .
cp .antigravity/plugins/production-grade/CLAUDE.md .
```

**Bước 3:** Commit:

```bash
git add .gitmodules .antigravity AGENTS.md CLAUDE.md
git commit -m "feat: add forgewright"
```

**Bước 4:** Khởi tạo submodule:

```bash
git submodule update --init --recursive
```

### Cách 2: Nâng cấp lên Level 2 (Smart)

Cần: **Node.js 18+**

```bash
# Kiểm tra
node --version

# Nếu chưa có → tải tại nodejs.org
# macOS: brew install node
```

Sau đó:

```bash
npx --yes forgenexus analyze "$(pwd)"
```

Đợi 1-2 phút (lần đầu). Xong!

### Cách 3: Thêm bộ nhớ (Level 3)

Cần: **Python 3.8+**

```bash
# Kiểm tra
python3 --version
```

Sau đó:

```bash
bash .antigravity/plugins/production-grade/scripts/ensure-mem0.sh "$(pwd)"
```

### Cách 4: Cài MCP server (Level 4)

Chạy 1 lệnh:

```bash
bash .antigravity/plugins/production-grade/scripts/mcp-generate.sh
```

Sau đó khởi động lại Cursor/VS Code.

### Kiểm tra đã cài đúng chưa

```bash
echo "=== Kiểm tra ==="
echo "Skills: $(ls .antigravity/plugins/production-grade/skills/ -1 2>/dev/null | wc -l | tr -d ' ')"
echo "ForgeNexus: $([ -f .antigravity/plugins/production-grade/forgenexus/dist/cli/index.js ] && echo 'OK' || echo 'MISSING')"
echo "MCP: $([ -d .forgewright/mcp-server ] && echo 'OK' || echo 'MISSING')"
echo "Memory: $([ -f .forgewright/memory.jsonl ] && echo 'OK' || echo 'MISSING')"
```

---

## Tính năng bổ sung

### Research — NotebookLM CLI (v0.5.19)

> **AI nghiên cứu không sai.** Dùng Google NotebookLM để đọc tài liệu, tạo tóm tắt, quiz, flashcards, podcast, báo cáo, slide, và hơn thế nữa.

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

## Quality Gate — Chấm điểm tự động

Chạy bất kỳ lúc nào để chấm điểm dự án 0-100:

```bash
bash scripts/forge-validate.sh

# Chế độ CI (chỉ exit code)
bash scripts/forge-validate.sh --quiet

# Báo cáo JSON
bash scripts/forge-validate.sh --json
```

| Điểm | Grade | Ý nghĩa |
|-------|-------|---------|
| 90–100 | A | Sẵn sàng production |
| 80–89 | B | Có vài lỗi nhỏ |
| 70–79 | C | Nên review |
| 60–69 | D | Sửa trước khi deploy |
| < 60 | F | Không chấp nhận được — chặn deploy |

---

## Xử lý sự cố thường gặp

| Vấn đề | Cách xử lý |
|---------|------------|
| `forgenexus: command not found` | Dùng `npx forgenexus` thay vì `forgenexus` |
| `npm install` bị lỗi trong submodule | Kiểm tra `node --version` (cần 18+) |
| Không thấy MCP tools | Khởi động lại Cursor/VS Code sau khi đổi config |
| Index cũ | Chạy `npx forgenexus analyze "$(pwd)"` |
| Submodule chưa khởi tạo | `git submodule update --init --recursive` |
| `realpath` không tìm thấy (macOS) | `brew install coreutils` |
| `python3` không tìm thấy | Cài Python 3.8+ cho tính năng memory |
| Windows: `bash` không tìm thấy | Dùng lệnh PowerShell tương đương |
| Sơ đồ mermaid không hiển thị | Đảm bảo trình xem dùng **mermaid 10+**. GitHub/GitLab đã hỗ trợ. |
| Lỗi `better-sqlite3` sau merge | Chạy `cd forgenexus && npm install` để cài `kuzu` thay thế |

---

## Lệnh tắt (Shortcuts)

| Lệnh | Tác dụng |
|------|-----------|
| `/setup` | Cài đặt lần đầu như git submodule |
| `/update` | Kiểm tra & cài cập nhật mới (an toàn, giữ thay đổi) |
| `/pipeline` | Xem toàn bộ pipeline, modes, và danh sách skills |
| `/onboard` | Phân tích sâu dự án — tạo `.forgewright/project-profile.json` |
| `/mcp` | Tạo hoặc tạo lại MCP server config |
| `/setup-mobile-test` | Cài đặt mobile testing cho Android/iOS |

---

## Đóng góp

1. Fork repo
2. Tạo nhánh: `git checkout -b feature/your-feature`
3. Commit theo [Conventional Commits](https://www.conventionalcommits.org/): `feat(skill): add new capability`
4. Mở Pull Request

**Thêm skill mới:** Tạo file `skills/your-skill-name/SKILL.md`. Xem skill có sẵn làm ví dụ.

---

## License

MIT

---

## Ủng hộ dự án

Nếu Forgewright giúp bạn ship nhanh hơn, bạn có thể ủng hộ tại đây:

<p align="center">
  <img src="assets/donate/give-me-a-coffee-international.png" width="280" alt="Buy Me a Coffee" />
</p>

---

<p align="center">
  <strong>Forgewright — 55 AI skills. 22 modes. Persistent Memory. Code Intelligence. SaaS to AAA games.</strong>
</p>
<p align="center">
  <em>Lên kế hoạch chính xác. Build với tự tin. Mở rộng thông minh.</em>
</p>
