# Technical Configuration and System Reference

<!-- source: skills/production-grade/references/technical-reference.md -->

## Metrics, Performance, and Configuration Reference

### Metrics Collection

Track these metrics per pipeline execution:

```json
{
  "session_id": "uuid",
  "timestamp": "ISO8601",
  "mode": "full-build|feature|...",
  "engagement": "express|standard|thorough|meticulous",
  "execution": "sequential|parallel",
  "duration_minutes": 0,
  "skills_invoked": ["skill1", "skill2"],
  "tasks_completed": 0,
  "tasks_total": 0,
  "quality_scores": {
    "build": 0,
    "harden": 0,
    "overall": 0
  },
  "gates_approved": 0,
  "gates_rejected": 0,
  "errors_encountered": 0,
  "retry_count": 0,
  "user_approvals": 0
}
```

### Performance Benchmarks

| Metric | Target | Warning | Critical |
|--------|--------|---------|----------|
| Context utilization | < 70% | 70-80% | > 80% |
| Task duration | < 30 min | 30-60 min | > 60 min |
| Error rate | < 5% | 5-15% | > 15% |
| Retry rate | < 10% | 10-20% | > 20% |
| Quality score | > 90 | 80-90 | < 80 |

### Dependency Injection Pattern

For skills that need shared services:

```typescript
// Service container
interface ServiceContainer {
  logger: LoggerService;
  memory: MemoryService;
  config: ConfigService;
  metrics: MetricsService;
}

// Inject via constructor
class SoftwareEngineerSkill {
  constructor(private services: ServiceContainer) {}

  execute(context: SkillContext): SkillResult {
    this.services.logger.info('Starting software engineer skill');
    // ... implementation
  }
}
```

### Configuration Schema

`.production-grade.yaml` full schema:

```yaml
# Project metadata
project:
  name: "My Project"
  version: "0.1.0"
  description: "Project description"

# Feature flags
features:
  frontend: true        # Enable frontend development
  mobile: false        # Enable mobile development
  ai_ml: false         # Enable AI/ML features
  skip_define_ba: false # Skip BA in DEFINE phase

# Path overrides
paths:
  backend: "services"
  frontend: "frontend"
  tests: "tests"
  docs: "docs"
  infrastructure: "infrastructure"

# Quality thresholds
quality:
  block_score: 60
  minimum_score: 90
  excellent_score: 95
  coverage_threshold: 80

# Pipeline settings
pipeline:
  engagement: "standard"  # express|standard|thorough|meticulous
  execution: "parallel"    # sequential|parallel
  max_workers: 4

# Review settings
review:
  mode: "lean"           # full|lean|solo
  auto_review: true

# Coding level (1-10)
codingLevel: 8

# Brownfield settings
brownfield:
  protected_paths:
    - "config/production/*"
    - "scripts/deploy.sh"
  baseline_branch: "main"

# Game-specific (for Game Build mode)
game:
  engine: "unity"         # unity|unreal|godot|phaser|three
  platform: "web"        # web|ios|android|steam
  target_fps: 60
  mobile_fps: 30

# AI/ML settings
ai:
  model: "gpt-4"
  temperature: 0.7
  max_tokens: 4000
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FORGEWRIGHT_WORKSPACE` | Project workspace path | Current directory |
| `FORGEWRIGHT_SKIP_MEMORY` | Skip memory initialization | 0 |
| `FORGEWRIGHT_LOCAL_MEMORY` | Use local memory | 1 |
| `FORGEWRIGHT_DEBUG` | Enable debug logging | 0 |
| `FORGEWRIGHT_MAX_RETRIES` | Max retry attempts | 3 |
| `FORGEWRIGHT_TIMEOUT` | Skill timeout (seconds) | 600 |

### Emergency Procedures

**When pipeline encounters critical failure:**

1. **Assess scope:** Isolate the failure point
2. **Preserve state:** Save all progress to handoff document
3. **Evaluate options:**
   - Retry with fixes
   - Skip failed task
   - Abort and escalate
4. **Communicate:** Report to user with options
5. **Decide:** User selects course of action

**Escalation criteria:**
- Security vulnerability discovered
- Data corruption risk
- Budget/time overrun > 50%
- Unresolvable blocker after 3 attempts

### Cross-Skill Communication Protocol

Skills communicate through structured artifacts:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ARTIFACT CONTRACT                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Each skill writes artifacts to:                                     │
│ .forgewright/<skill-name>/<artifact-name>.json                      │
│                                                                     │
│ Artifact structure:                                                 │
│ {                                                                   │
│   "version": "1.0",                                                 │
│   "skill": "skill-name",                                            │
│   "timestamp": "ISO8601",                                           │
│   "data": { ... skill-specific data ... }                           │
│ }                                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Standard artifacts:**

| Artifact | From | To | Content |
|----------|------|-----|---------|
| `brd.json` | PM | Architect, BE, FE | User stories, acceptance criteria |
| `architecture.json` | Architect | BE, FE, DevOps | Services, API contracts, data models |
| `api-contracts.json` | Architect | BE, FE | Endpoint definitions, request/response schemas |
| `test-plan.json` | QA | QA | Test cases, coverage targets |
| `security-report.json` | Security | Security | Vulnerabilities, severity, recommendations |
| `quality-report.json` | Review | Review | Code quality findings, patterns |
| `delivery.json` | Any skill | Orchestrator | Task completion status |

### Skill Invocation Patterns

**Sequential pattern** (skills run one after another):
```
Skill A → Artifact A → Skill B → Artifact B → Skill C
```

**Parallel pattern** (skills run simultaneously):
```
┌─────────────┐
│ Artifact A   │
└─────────────┘
       │
   ┌───┴───┐
   ▼       ▼
┌───────┐ ┌───────┐
│Skill A│ │Skill B│
└───┬───┘ └───┬───┘
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│Artifact│ │Artifact│
│   A   │ │   B   │
└───┬───┘ └───┬───┘
    │         │
    └────┬────┘
         ▼
    ┌────────┐
    │Merge   │
    │Arbiter │
    └────────┘
```

**Sequential with feedback:**
```
Skill A → Artifact A → Skill B → Test B → [Fail] → Skill B fix → Artifact B updated
                                            ↓
                                          [Pass]
                                            ↓
                                       Skill C
```

### Skill Health Monitoring

Track skill performance over time:

```json
{
  "skill_health": {
    "software-engineer": {
      "invocations": 15,
      "avg_duration_minutes": 25,
      "success_rate": 0.93,
      "avg_quality_score": 88,
      "last_failure": {
        "timestamp": "2026-05-20",
        "reason": "Timeout on large service",
        "resolution": "Increased timeout, split service"
      }
    }
  }
}
```

**Health thresholds:**
- Success rate < 80%: Investigate skill
- Avg quality < 70%: Update skill guidance
- Avg duration > 60 min: Optimize skill

### Test Pyramid Implementation

```
                    ▲
                   /█\      E2E: 5-10 tests
                  / █ \     - Critical user flows
                 /  █  \   - Login, purchase, core loop
                /────█────\
               /     █     \  Integration: 15-20 tests
              /      █      \ - Service interactions
             /───────█────────\ - Database operations
            /        █         \ Unit: 50-100 tests
           /         █          \ - Pure functions
          /──────────█───────────\ - Formula calculations
```

**Unit test coverage targets:**
- Business logic: 90%
- Utility functions: 95%
- State machines: 85%
- Formatters/validators: 100%

**Integration test coverage:**
- API endpoints: 80%
- Database operations: 70%
- Message queues: 60%
- External services (mocked): 90%

**E2E test coverage:**
- Critical paths: 100%
- Happy path: 100%
- Error recovery: 50%
- Edge cases: 30%

### Continuous Integration Template

```yaml
# .github/workflows/forgewright.yml
name: Forgewright Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run e2e tests
        run: npm run test:e2e

      - name: Check coverage
        run: npm run test:coverage

      - name: Security scan
        run: npm audit --audit-level=high

  build:
    needs: quality-gate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: npm run build

      - name: Docker build
        run: docker build -t app:${{ github.sha }} .

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging
        run: ./scripts/deploy.sh staging

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to production
        run: ./scripts/deploy.sh production
```

### Deployment Checklist

Before any deployment:

- [ ] All tests passing
- [ ] Security scan clean
- [ ] Code review approved
- [ ] Documentation updated
- [ ] Rollback plan ready
- [ ] Monitoring configured
- [ ] Runbooks updated
- [ ] Stakeholders notified

### Monitoring & Observability

**Metrics to track:**

| Category | Metrics |
|----------|---------|
| **Business** | DAU, MAU, retention, conversion rate, revenue |
| **Performance** | Response time, throughput, error rate |
| **Reliability** | Availability, MTTR, MTBF |
| **Quality** | Test coverage, bug count, tech debt |

**Alert thresholds:**

| Alert | Threshold | Severity |
|-------|-----------|----------|
| Error rate | > 1% | Warning |
| Error rate | > 5% | Critical |
| Response time | > 500ms p95 | Warning |
| Response time | > 2000ms p95 | Critical |
| Availability | < 99.9% | Critical |
| CPU | > 80% | Warning |
| Memory | > 90% | Critical |

### Knowledge Transfer Protocol

When transitioning between sessions:

```
1. EXECUTIVE SUMMARY (3 sentences)
   - What was the goal?
   - What was accomplished?
   - What remains?

2. TECHNICAL STATE
   - Architecture decisions (key ones)
   - Current blockers
   - Next actions

3. FILE INVENTORY
   - Created/modified files
   - Their purposes

4. TESTING STATUS
   - Tests passing/failing
   - Coverage percentage

5. OPEN QUESTIONS
   - Decisions pending
   - Ambiguities unresolved

6. CONTEXT FOR CONTINUATION
   - Exact command to resume
   - Files to examine first
```

### Skill Catalog

Complete list of 80 skills organized by category:

**Orchestration & Meta:**
1. Orchestrator (production-grade)
2. Polymath
3. Parallel Dispatch
4. Memory Manager
5. Skill Maker
6. MCP Generator
7. Token Tracker
8. Instinct System
9. Strategic Compaction
10. Hook Expert (generated/hook-expert)

**Engineering:**
11. Business Analyst
12. Product Manager
13. Solution Architect
14. Software Engineer
15. Software Engineer (Go)
16. Software Engineer (Python)
17. Software Engineer (Rust)
18. Frontend Engineer
19. Fullstack Engineer
20. QA Engineer
21. Security Engineer
22. Code Reviewer
23. Code Reviewer (Go)
24. Code Reviewer (Python)
25. Code Reviewer (Rust)
26. Code Quality Engineer
27. DevOps
28. SRE
29. Build & Release Engineer
30. Data Scientist
31. Technical Writer
32. UI Designer
33. Interaction Designer
34. Art Director
35. Vision Review
36. Mobile Engineer
37. Mobile Tester
38. API Designer
39. Database Engineer
40. Debugger
41. Prompt Engineer
42. Prompt Optimizer
43. AI Engineer
44. Accessibility Engineer
45. Performance Engineer
46. UX Researcher
47. Data Engineer
48. XLSX Engineer
49. Project Manager
50. Eval Engineer

**Game Development:**
51. Game Designer
52. Game Engineer
53. AI Behavior Engineer
54. Animation Engineer
55. Game Accessibility Engineer
56. LiveOps Engineer
57. Unity Engineer
58. Unity MCP
59. Unreal Engineer
60. Godot Engineer
61. Godot Multiplayer
62. Roblox Engineer
63. Phaser 3 Engineer
64. Three.js Engineer
65. Level Designer
66. Narrative Designer
67. Technical Artist
68. Game Audio Engineer
69. Game Asset & VFX
70. Unity Shader Artist
71. Unity Multiplayer
72. Unreal Technical Artist
73. Unreal Multiplayer
74. XR Engineer

**Growth & Marketing:**
75. Growth Marketer
76. Conversion Optimizer

**Testing:**
77. Autonomous Testing

**Data Acquisition:**
78. Web Scraper
79. NotebookLM Researcher

**Workflow:**
80. Goal-Driven

### Session Lifecycle Hooks

Call these hooks at the appropriate lifecycle points:

| Event | Hook | Action |
|-------|------|--------|
| Phase completes | `PHASE_COMPLETE(name, summary)` | Update session-log, save to memory, update quality metrics |
| Task completes | `TASK_COMPLETE(id, name, status, summary)` | Update session-log |
| Gate decided | `GATE_DECISION(gate#, decision, feedback)` | Update session-log, save decision to memory |
| Architecture approved | `ARCH_DECISION(tech_stack, services, rationale)` | Save architecture to memory — see Gate 2.5 |
| Error occurs | `ERROR(task_id, type, details)` | Update session-log, save blocker to memory |
| Pipeline ends | Session End | Summarize, save to memory, update project profile |
| User request answered | `TURN_CLOSE` | Mandatory memory `add` — see session-lifecycle §Per-request memory |
