# Self-Check Protocol

<!-- source: skills/_shared/protocols/self-check.md -->
<!-- This is the single source of truth for the Pre-Completion Checklist -->

Before finishing ANY task, verify ALL of the following:

| # | Check | Action if Failed |
|---|-------|-----------------|
| 0 | ✅ IntentGate analysis done? | If mode reclassified, note Intent vs Literal shift |
| 1 | ✅ Request interpreted? | Go back to Step 0 |
| 2 | ✅ Plan scored ≥ 9.0? | Improve plan first |
| 3 | ✅ Assumptions declared? | Write verification artifacts for each assumption |
| 4 | ✅ Verification artifacts run? | Run artifacts → get pass/fail evidence before proceeding |
| 5 | ✅ Test cases prepared? | For medium/large features, write test cases/stubs first |
| 6 | ✅ Code changed? | Implement code to satisfy requirements & test cases |
| 7 | ✅ Tests run & verified? | Run QA tests to verify 100% pass |
| 8 | ✅ Scope respected? | Flag scope creep |
| 9 | ✅ User approval? | Wait for approval (if gate) |
| 10 | ✅ Turn-Close memory saved? | Save before ending turn |
| 11 | ✅ Memory Bank updated? | Update progress.md at session end |
| 12 | ✅ Skill self-improved? | Run lesson migrator → check if skills evolved |

## ⚠️ MANDATORY RULE

```
For Complex Tasks: Given/When/Then (BA) → Write Tests/Stubs (QA) → Code (Dev) → Run Tests → Pass ✓
For Simple Tasks:  Code (Dev) → Write & Run Tests (QA) → Pass ✓
```

**Never wait for user to ask for tests. Apply complexity-based hybrid testing flow.**

## Session-End Ritual (NEW v8.2)

**Before closing any session, ALWAYS run:**

```
1. Update progress.md:
 - Mark completed tasks
 - Add blockers/open questions
 - Update last_updated timestamp

2. Update session state (automated):
 python3 scripts/memory-middleware.py session-log end "[summary]"
 # → Sets status to "completed"
 # → Adds completed_at timestamp
 # → Updates activeContext.md automatically

3. Generate handover if needed:
 python3 scripts/memory-middleware.py handover
 # → Creates HANDOVER.md for next session
 # → Includes goals, tasks, blockers, next steps

4. Migrate lessons to skill files + skill update check:
 bash scripts/forgewright-lesson-migrator.sh migrate
 # For every failed assumption this session:
 # a. Was it a test/script failure? → execution lesson
 # b. Was it a plan failure? → planning lesson
 # c. Was research done? → append to relevant SKILL.md
```

---

*Source: skills/_shared/protocols/self-check.md*
*Synced to: AGENTS.md, CLAUDE.md*
