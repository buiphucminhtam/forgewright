# Execution Blocker Loop Protocol

> **DEPRECATED — Use `self-improving-loop.md` (ASIP) instead.**

## Status: DEPRECATED (2026-05-24)

This protocol has been **merged into ASIP** (`self-improving-loop.md`).

### What Changed

All execution blocker loop logic has been incorporated into ASIP Phase 2 (Execution Blocker Loop). The canonical loop now includes:

- **Verification artifacts** as primary evidence gathering (test → run → evidence)
- **Blocker type categorization** (Technical / Architectural / Tooling / External)
- **Research gate** (mandatory after 2 failures)
- **Skill self-improvement** (Execution Learnings → Planning Improvements cross-feedback)

### Migration

Replace references to `execution-blocker-loop.md` with `self-improving-loop.md`.

### Old Reference → New

| Old | New |
|-----|-----|
| `execution-blocker-loop.md` | `self-improving-loop.md` (ASIP Phase 2) |
| Blocked → assess → research → synthesize → attempt | Blocked → write artifact → run → research → skill update → attempt |
| Blocker categorization | Blocked type → research priority (same categories) |
| Skill update (Execution Learnings) | Same — appended to SKILL.md |

### Why This Was Deprecated

- ASIP provides a **single canonical loop** for both plan failures and execution failures
- Having two separate execution blocker protocols created conflicting guidance
- ASIP's unified loop is more coherent and easier to follow

### Where It Was Referenced

```bash
# Find remaining references (should be updated):
grep -r "execution-blocker-loop" skills/
```

Update any remaining references to point to `self-improving-loop.md`.
