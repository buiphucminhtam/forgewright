---
name: frontend
description: >
  Routing alias for frontend development work. Delegates all execution
  to the frontend-engineer skill. Use when the user says "frontend"
  without specifying a particular skill.
type: alias
alias_target: frontend-engineer
version: 1.0.0
tags: [frontend, alias, routing]
---

# Frontend (Routing Alias)

> **This is a routing alias.** All frontend work is handled by the
> [frontend-engineer](file:///skills/frontend-engineer/SKILL.md) skill.

## When This Skill Is Selected

The orchestrator may route here when the user's request mentions "frontend"
generically (e.g., "build the frontend", "frontend components"). Rather than
duplicating logic, this alias immediately delegates:

1. **Read** `skills/frontend-engineer/SKILL.md` and follow its full protocol.
2. **Apply** frontend-specific GROUND slots from `skills/frontend/LITE.md`.
3. **Execute** using the frontend-engineer's SOLVE loop.

## Delegation Protocol

```
IF selected_skill == "frontend":
    LOAD skills/frontend-engineer/SKILL.md
    MERGE skills/frontend/LITE.md  (domain-specific GROUND slots)
    EXECUTE frontend-engineer workflow
```

## Why an Alias?

- Prevents skill duplication between "frontend" and "frontend-engineer"
- Keeps the skill directory enumerable (every dir has a SKILL.md)
- The LITE.md in this directory provides frontend-specific domain slots
  (framework detection, styling config, API base URLs, a11y audit) that
  augment the generic frontend-engineer workflow
