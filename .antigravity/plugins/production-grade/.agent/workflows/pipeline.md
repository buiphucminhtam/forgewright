---
description: Show Forgewright pipeline reference, available modes, and skill list
---

# Forgewright Pipeline Reference

## Pipeline Phases

```
DEFINE → BUILD → HARDEN → SHIP → SUSTAIN
```

| Phase | Tasks | Skills |
|-------|-------|--------|
| **DEFINE** | T1: Requirements, T1.5: UI Design, T2: Architecture | PM, UI Designer, Architect |
| **BUILD** | T3a: Backend, T3b: Frontend, T3c: Mobile, T4: Containers | SW Engineer, FE Engineer, Mobile Engineer, DevOps |
| **HARDEN** | T5: Tests, T6a: Security, T6b: Review, T8: Fixes | QA, Security, Code Reviewer |
| **SHIP** | T7: IaC + CI/CD, T9: SRE | DevOps, SRE |
| **SUSTAIN** | T10: Data/AI, T11: Docs, T12: Custom Skills, T13: Learning | Data Scientist, Tech Writer, Skill Maker |

## Execution Modes

| Mode | Trigger | Skills Used |
|------|---------|------------|
| Full Build | "build a SaaS", "production grade", greenfield | All 17 skills |
| Feature | "add [feature]", "new endpoint" | PM → Architect → BE/FE → QA |
| Harden | "audit", "secure", "before launch" | Security + QA + Code Review |
| Ship | "deploy", "CI/CD", "terraform" | DevOps → SRE |
| Test | "write tests", "test coverage" | QA only |
| Review | "review my code", "code quality" | Code Reviewer only |
| Architect | "design architecture", "API design" | Solution Architect only |
| Document | "write docs", "API docs" | Technical Writer only |
| Explore | "help me think", "explain" | Polymath only |
| Optimize | "performance", "optimize" | SRE + Code Reviewer |
| Design | "design UI", "wireframes" | UI Designer only |
| Mobile | "mobile app", "React Native" | Mobile Engineer |

## How to Invoke

Just describe what you want in natural language. The orchestrator classifies automatically.

Examples:
- "Build a production-grade SaaS for multi-vendor e-commerce"
- "Add user authentication with Google OAuth"
- "Review my code for security issues"
- "Write Playwright tests for my login flow"
- "Design a UI system for a fintech dashboard"
- "Help me think about building a restaurant management platform"
