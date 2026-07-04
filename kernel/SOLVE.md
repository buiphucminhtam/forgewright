# SOLVE — The Reasoning Loop

Always follow all steps. If the task is a single trivial edit (e.g., a typo fix), steps 2–3 may collapse to one row/one item — but `VERIFY` (step 6) is never skipped.

## 1. UNDERSTAND (Write this scratchpad before anything else)
- Task in one sentence:
- What must be TRUE at the end (observable, checkable):
- What could I be wrong about (choose from: wrong file? wrong API shape? wrong version? wrong root cause? missing case?):

## 2. GROUND (Assumption sweep)
Verify essential elements (files, signatures, dependencies, CLI tools) using real check commands.
Do not self-attest Y/N. Mechanical checks must be script-produced evidence that you consume.
| Assumption | Check command / script | Script-produced Evidence |
|---|---|---|
| Target file exists | `ls` / View file | ... |
| Function signature | View file `<file:line>` | ... |
| Dependency/version | View file `package.json` | ... |
| Required CLI tool  | `which <tool>` | ... |

Resolve any failures now or mark the step `HARD`.

## 3. DECOMPOSE
Path branches based on task type:

**A. EDIT PATH (Code modifications)**
Plan least-to-most. EVERY item must have all three fields:
`n. ACTION (one concrete action) | TARGET (exact file/symbol) | CHECK (one command whose exit code proves this item done)`

**B. QUESTION PATH (Codebase queries, non-edit)**
`n. QUESTION | SEARCH COMMAND (e.g., rg "pattern" src/) | SYNTHESIS EXPECTATION`

**C. DESIGN PATH (Architecture/Review, non-edit)**
`n. COMPONENT | ANALYSIS SCRIPT/COMMAND | DESIGN CONSTRAINT`

**Gate**:
Do not self-attest Y/N claims. Mechanical checks must be script-produced evidence that you consume. Execute your plan's checks to verify:
- Edit plans have concrete actions, verified files, and runnable CHECK commands.
- Total items ≤ 10.
If the script-produced evidence shows failures, fix the list. Do not start execution.

## 4. PROGRAM-OF-THOUGHT (PoT) RULE
For any complex logic, calculations, algorithms, or non-trivial implementations:
- Write a quick Program-of-Thought (PoT) scratch script or verification test first.
- Run it to verify the logic and correctness of the assumptions in isolation.
- Use the execution output as ground truth before coding in the main application.

## 5. FREE-FORM THEN JSON RULE
If the task requires JSON or structured output:
- Always think free-form first (write a reasoning block or scratchpad).
- Only output the final clean JSON/structured payload at the very end of the response.

## 6. EXECUTE & VERIFY (One item at a time)
For each plan item:
1. Tag as `EASY` or `HARD` per [kernel/ESCALATE.md](file:///Users/buiphucminhtam/GitHub/forgewright/kernel/ESCALATE.md).
2. If `HARD` → run escalation command.
3. If `EASY` → execute it, then IMMEDIATELY run its CHECK command.
4. If CHECK fails → resolve the failure before moving to the next item. Never batch items without executing their checks.
5. After finishing all items, emit one `VERIFY` block per changed behavior (see [kernel/VERIFY.md](file:///Users/buiphucminhtam/GitHub/forgewright/kernel/VERIFY.md)).

## 7. STUCK RULE (After 2 failures on the same item)
Stop retrying. In order:
1. Write a minimal script/test to isolate and test the assumption, then run it.
2. Search the codebase for a working example of the same pattern.
3. Research external documentation or sources.
4. If still stuck → mark the item as `HARD` and escalate.
5. If escalation is unavailable → report the blocker along with all gathered evidence. Never attempt a third time on the same fix.
