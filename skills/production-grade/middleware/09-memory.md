# Middleware 09 — Memory

> **Source:** `memory-manager.md` §Hooks + `session-lifecycle.md` §Per-request
> **Hook:** `after_skill()` AND `turn_close()`
> **Purpose:** Async fact extraction and persistent storage

## Execution

### After Each Skill

```
1. Extract key decisions and blockers from skill output
2. Run: python3 scripts/mem0-v2.py add "<facts>" --category decisions
3. Store skill completion facts
```

### After Each User Request (turn_close)

```
1. Mandatory memory add:
   python3 scripts/mem0-v2.py add "Session: [mode] mode, engagement: [level]" --category session

2. Optional additional stores:
   - Decisions: architecture choices, key rationale
   - Blockers: unresolved issues for next session
   - Architecture: tech stack, service decomposition
```

### Lesson Migration Hook (ASIP v8.3)

On session end, migrate lessons from session-level files to skill-level persistent storage:

```bash
# Part of session-end ritual (step 4)
bash scripts/forgewright-lesson-migrator.sh migrate
```

This pushes new entries from `.forgewright/plan-lessons.md` and `.forgewright/execution-lessons.md` into the relevant `SKILL.md` `## Planning Improvements` / `## Execution Learnings` sections, avoiding duplicates via migration state tracking.

## Outputs

- Cross-session memory persistence
- Future sessions can search for relevant context
- Project knowledge compounds over time

## Failure Handling

- If mem0-v2 unavailable/fails → ABORT execution immediately with a fatal error. Memory is a non-negotiable hard constraint.
- Overrides via `MEM0_DISABLED` or `FORGEWRIGHT_SKIP_MEM0` are strictly BLOCKED. The system will automatically override these flags, print a compliance warning, and force-enable the full memory mechanism.
- System uses SQLite (built-in) — no external dependencies.
