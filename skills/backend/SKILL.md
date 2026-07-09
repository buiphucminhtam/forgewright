---
name: backend
description: >
  Routing alias for backend development work. Delegates all execution
  to the software-engineer skill. Use when the user says "backend"
  without specifying a particular skill.
type: alias
alias_target: software-engineer
version: 1.0.0
tags: [backend, alias, routing]
---

# Backend (Routing Alias)

> **This is a routing alias.** All backend work is handled by the
> [software-engineer](file:///skills/software-engineer/SKILL.md) skill.

## When This Skill Is Selected

The orchestrator may route here when the user's request mentions "backend"
generically (e.g., "build the backend", "backend API"). Rather than
duplicating logic, this alias immediately delegates:

1. **Read** `skills/software-engineer/SKILL.md` and follow its full protocol.
2. **Apply** backend-specific GROUND slots from `skills/backend/LITE.md`.
3. **Execute** using the software-engineer's SOLVE loop.

## Delegation Protocol

```
IF selected_skill == "backend":
    LOAD skills/software-engineer/SKILL.md
    MERGE skills/backend/LITE.md  (domain-specific GROUND slots)
    EXECUTE software-engineer workflow
```

## Why an Alias?

- Prevents skill duplication between "backend" and "software-engineer"
- Keeps the skill directory enumerable (every dir has a SKILL.md)
- The LITE.md in this directory provides backend-specific domain slots
  (framework checks, DB config, API router, auth strategy) that augment
  the generic software-engineer workflow
