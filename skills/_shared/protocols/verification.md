# Verification Protocol (Evidence-First Verification)

<!-- source: skills/_shared/protocols/verification.md -->
<!-- This is the single source of truth for the Verification Middleware -->

> **Purpose:** Guarantee that all code changes, assumptions, and execution steps are validated against concrete evidence before concluding a skill execution. Serves as Slot ⑭ in the Post-Skill Middleware Chain.
>
> **⚠️ This protocol enforces the practical application of Evidence-First Thinking (evidence-first.md) at the end of every skill run.**

---

## Overview

The Verification Middleware (`after_skill` hook) ensures we do not close a task or a turn on unverified assumptions. Every assumption made during design, coding, or testing must be validated using empirical evidence.

```
Skill Execution Finished
   │
   ▼
[Verification Middleware]
   │
   ├── 1. Identify Assumptions (from plan & execution logs)
   ├── 2. Map Verification Methods (inspect file, run command, run tests)
   ├── 3. Execute Verification Artifacts (if evidence is absent)
   │     ├── Pass → Confirm assumption. Proceed.
   │     └── Fail → Reject assumption. Trigger ASIP/Re-plan.
   ▼
Conclude Turn / Close Skill
```

---

## 5-Step Verification Workflow

When executing the Verification Middleware, the agent must perform these steps:

### 1. Extract & Declare Assumptions
List all assumptions made during this turn, such as:
*   "File path `/src/utils/math.ts` exists and has function `add`."
*   "Database schema is updated with the `users` table."
*   "The API response format is JSON with a `status` key."

### 2. Check for Direct Evidence
For each assumption, check if direct evidence has already been gathered:
*   Did we read the file using `view_file`?
*   Did we run the test command and see it pass?
*   Did we check the database directly?

### 3. Generate Verification Artifacts (if Evidence is Absent)
If evidence is absent, do NOT guess. Write a verification artifact:
*   **For APIs:** Write a minimal curl/fetch script or integration test.
*   **For Logic:** Write a small unit test (`test_xxx.py`, `xxx.test.ts`).
*   **For State:** Write a script to dump the DB schema or inspect directory structure.

### 4. Execute and Record Evidence
Run the verification artifact or verification commands:
*   Record the exact command and command output.
*   Save the output in `<appDataDir>/brain/<conversation-id>/scratch/` if it is a large output file.

### 5. Evaluate & Decide
*   **Confirmed (Pass):** If all evidence matches the expected state, proceed to close the skill.
*   **Denied (Fail):** If any verification fails:
    1. Log the failure reason.
    2. Revert/modify the changes.
    3. Trigger the self-improving loop (ASIP) or re-plan immediately.

---

## Verification Levels

Depending on the complexity of the task, apply the correct verification level:

| Level | Scope | Method | Required Output |
|---|---|---|---|
| **Level 1: Inspect** | File changes, code references, structure | `view_file`, `list_dir`, `grep_search` | Direct file read / terminal list |
| **Level 2: Run** | Script execution, basic CLI tools | Running the compiled code / script | Exact command stdout/stderr |
| **Level 3: Test** | Logic correctness, unit behavior | Executing unit tests (`pytest`, `npm test`, etc.) | Test suite passing report |
| **Level 4: E2E/Sys** | API endpoints, system integration | Curl calls, integration tests, DB queries | Response body / DB row counts |

---

## Rules of Verification

1.  **Never assume success from a lack of errors:** A compiler not throwing errors does not mean the logic is correct.
2.  **Verify the correct environment:** Verify against the active workspace, not template directories.
3.  **Document the Evidence Trail:** When concluding a skill, list the evidence collected (e.g. "Verified that `/src/auth.ts` has `validateToken` by reading lines 12-45 in `view_file`").

---

*Source: skills/_shared/protocols/verification.md*
*Synced to: AGENTS.md, CLAUDE.md*
