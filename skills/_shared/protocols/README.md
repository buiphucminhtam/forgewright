# Forgewright Shared Protocols

> **Purpose:** Single source of truth for core Forgewright concepts shared across all platforms.

## Files in this Directory

| File | Content | Used By |
|------|---------|---------|
| `evidence-first.md` | Evidence-First Thinking (Anti-Hallucination) | AGENTS.md, CLAUDE.md |
| `pipeline.md` | INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN | AGENTS.md, CLAUDE.md |
| `plan-quality-loop.md` | 9-criteria scoring rubric | AGENTS.md, CLAUDE.md |
| `expert-cli-mode.md` | Optional Claude/Codex CLI escalation and token controls | production-grade, CLI |
| `self-check.md` | Pre-completion checklist | AGENTS.md, CLAUDE.md |
| `research-gate.md` | Research flow for low-scoring plans | AGENTS.md, CLAUDE.md |

---

## Source Attribution

When updating shared content, update the file in this directory AND add a source attribution comment:

```markdown
<!-- source: skills/_shared/protocols/[filename].md -->
```

Example in AGENTS.md:
```markdown
<!-- source: skills/_shared/protocols/evidence-first.md -->
```

---

## Sync Rules

1. **Evidence-First Thinking** — Keep in sync with both AGENTS.md and CLAUDE.md
2. **Pipeline** — Primary source: AGENTS.md, derived in CLAUDE.md
3. **Plan Quality Loop** — Single source in protocols, reference from both
4. **Self-Check** — Single source in protocols

---

*Last Updated: 2026-05-29*
*Part of: Phase 1 - Task 1.2*
