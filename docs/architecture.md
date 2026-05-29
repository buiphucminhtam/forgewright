# Forgewright Architecture Overview

> **Status: Placeholder** — Content to be added.

## Overview

Forgewright is an adaptive orchestrator that routes requests to specialized AI skills based on context, mode, and project configuration.

## Core Components

### Orchestrator
The central pipeline that coordinates all skill execution:
- **INTERPRET** — Understand the user's request
- **DEFINE** — Scope and plan
- **BUILD** — Execute with skills
- **HARDEN** — Quality, security, testing
- **SHIP** — Deploy
- **SUSTAIN** — Monitor, maintain

### Skills (70 total)
Organized into categories:
- **Engineering** — Software, Frontend, Mobile, Database, DevOps, SRE, etc.
- **Game Dev** — Unity, Unreal, Godot, Roblox, Phaser 3, Three.js
- **AI/ML** — AI Engineer, Prompt Engineer, Data Scientist
- **Meta** — Polymath, Memory Manager, Parallel Dispatch

### MCP Server
Located at `~/.forgewright/mcp-server/server.ts`, providing:
- Code intelligence (via GitNexus)
- File system operations
- Terminal execution
- Browser automation

### Protocol Layer
Shared protocols in `skills/_shared/protocols/`:
- Plan quality loop
- Evidence-first thinking
- Research gate
- Self-check
- And 40+ more

## Data Flow

```
User Request
    ↓
Orchestrator (INTERPRET)
    ↓
Skill Registry → Route to best skill(s)
    ↓
Skill executes → Writes to .forgewright/
    ↓
Quality Gate → Verify output
    ↓
Deliver to user
```

## Configuration

- `.production-grade.yaml` — Project-level overrides
- `.forgewright/` — Project state, metrics, session logs
- `skills/_shared/` — Shared protocols, dependencies, health checks

---

*Last updated: 2026-05-29*
