# Protocol Reference

> **Status: Placeholder** — Content to be added.

## Overview

Forgewright uses shared protocols to ensure consistency across all 70 skills. Protocols live in `skills/_shared/protocols/`.

## Core Protocols

| Protocol | File | Purpose |
|----------|------|---------|
| Plan Quality Loop | `plan-quality-loop.md` | Score and improve plans before execution |
| Evidence-First | `evidence-first.md` | Anti-hallucination: verify before acting |
| Research Gate | `research-gate.md` | Research flow when plan score < 9.0 |
| Self-Check | `self-check.md` | Pre-completion checklist |
| Execution Blocker | `execution-blocker-loop.md` | Handle stuck execution |
| Session Lifecycle | `session-lifecycle.md` | Session start/end/pause/resume |

## Quality Protocols

| Protocol | Purpose |
|----------|---------|
| `quality-gate.md` | T1/T2/T3/T4 gates |
| `merge-arbiter.md` | PR merge decision logic |
| `brownfield-safety.md` | Safe navigation of existing codebases |
| `graceful-failure.md` | Handle failures without crashing |

## Workflow Protocols

| Protocol | Purpose |
|----------|---------|
| `pipeline.md` | INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN |
| `paperclip-integration.md` | Multi-agent orchestration |
| `task-contract.md` | Task definition format |
| `task-validator.md` | Task completion validation |

## Tooling Protocols

| Protocol | Purpose |
|----------|---------|
| `tool-efficiency.md` | Minimize token usage |
| `tool-sandbox.md` | Safe shell command execution |
| `credit-killing-patterns.md` | Avoid vague requests |
| `input-validation.md` | Validate inputs before processing |

## Session Protocols

| Protocol | Purpose |
|----------|---------|
| `session-lifecycle.md` | Session management |
| `session-deduplication.md` | Avoid duplicate work |
| `summarization.md` | Context summarization |

## Full List (40+ protocols)

Run to see all:
```bash
ls skills/_shared/protocols/
```

---

*Last updated: 2026-05-29*
