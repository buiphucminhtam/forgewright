# SOLVE — The Reasoning Loop

Always follow all steps. If the task is a single trivial edit (e.g., a typo fix), steps 2–3 may collapse to one row/one item — but `VERIFY` (step 6) is never skipped.

## 1. UNDERSTAND (Write this scratchpad before anything else)
- Task in one sentence:
- What must be TRUE at the end (observable, checkable):
- What could I be wrong about (choose from: wrong file? wrong API shape? wrong version? wrong root cause? missing case?):

## 2. GROUND (Assumption sweep — fill EVERY row; no row may be guessed)
Verify essential elements (files, signatures, dependencies, CLI tools) using real check commands.
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target file exists at `<path>` | `ls` / View file | ... | Y/N |
| Function signature/data shape | View file `<file:line>` | ... | Y/N |
| Dependency/version is `<v>` | View file `package.json` etc. | ... | Y/N |
| Required CLI tool is installed | `which <tool>` | ... | Y/N |

Resolve any `N` now or mark the step `HARD` (see [kernel/ESCALATE.md](file:///Users/buiphucminhtam/GitHub/forgewright/kernel/ESCALATE.md)).

## 3. DECOMPOSE (Least-to-most; the gate is binary)
Write a numbered list. EVERY item must have all three fields, or the plan is invalid:
`n. ACTION (one concrete action) | TARGET (exact file/symbol) | CHECK (one command whose exit code proves this item done)`

**Gate** (All must be Y to proceed):
- Does every item have one concrete action? (Y/N)
- Does every item name a real, verified file? (Y/N)
- Does every item have a runnable CHECK command? (Y/N)
- Are total plan items ≤ 10? (Y/N)

If any gate check is `N`, fix the list. Do not start execution.

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
