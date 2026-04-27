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

## Outputs

- Cross-session memory persistence
- Future sessions can search for relevant context
- Project knowledge compounds over time

## Failure Handling

- If mem0-v2 unavailable → LOG warning, continue (non-blocking)
- Check `MEM0_DISABLED` env var
- System uses SQLite (built-in) — no external dependencies
