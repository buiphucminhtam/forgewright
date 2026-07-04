---
name: debugger
description: "Systematic debugging and root-cause analysis — hypothesis-driven investigation, log analysis, bisection, reproduction strategies, and fix verification. Use when the user reports a bug, crash, error, exception, broken feature, failing test, performance degradation, or says something is 'not working'."
version: 2.0.0
---

# Debugger — Systematic Root-Cause Analysis Specialist (LITE)

## SOLVE Step 2: GROUND (Debugger Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Bug reproduces on main/branch | Run tests or execute repro script | ... | run the check command and paste output |
| Location of error trace / log | Read log file or check CLI output | ... | run the check command and paste output |
| Target file exists at `<path>` | `ls` / View file `<path>` | ... | run the check command and paste output |
| Current state of offending variables | View file / add print/debug statement | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Debugger Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (reproduce bug) | TARGET (tests/repro_test.py) | CHECK (pytest tests/repro_test.py)`
- `n. ACTION (trace state/logs) | TARGET (src/error_handler.py:45) | CHECK (grep -i "error" server.log)`
- `n. ACTION (apply minimal fix) | TARGET (src/utils.py:12) | CHECK (pytest tests/repro_test.py)`
- `n. ACTION (verify no regression) | TARGET (tests/suite.py) | CHECK (pytest tests/)`

## Hypothesis Table
| Hypothesis | Likelihood (H/M/L) | Evidence / Clues | Verification Command | Status |
|---|---|---|---|---|
| e.g. Variable X is null | High | Stacktrace at line 42 | `grep -n "X =" src/main.py` | Open |

---

### 1. UNDERSTAND
- **Task**: Fix `TypeError: Cannot read properties of undefined (reading 'split')` at `src/utils/parser.ts:24`.
- **What must be TRUE**: A robust check prevents crash, `split` executes on string, tests pass.
- **What could I be wrong about**: Input might be null/undefined or integer; fixing just the type vs fixing the source of undefined.

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target file exists | `ls src/utils/parser.ts` | File exists | Y |
| Line 24 executes split | `sed -n '24p' src/utils/parser.ts` | `const parts = input.split(',');` | Y |
| Input type in signature | `sed -n '20,23p' src/utils/parser.ts` | `function parse(input?: string)` | Y |

### 3. DECOMPOSE
1. ACTION (reproduce crash)   TARGET (tests/parser.test.ts)   CHECK (npx jest tests/parser.test.ts)
2. ACTION (add nullish check)   TARGET (src/utils/parser.ts:24)   CHECK (npx jest tests/parser.test.ts)
3. ACTION (run full suite)   TARGET (tests/)   CHECK (npm test)

### 4. EXECUTE
#### Step 1: Reproduce crash
- Added test case: `parse(undefined)` to `tests/parser.test.ts`.
- CHECK: `npx jest tests/parser.test.ts` -> Failed as expected (TypeError).

#### Step 2: Add nullish check
- Modified `src/utils/parser.ts`:
```typescript
function parse(input?: string) {
  if (!input) return [];
  const parts = input.split(',');
  return parts;
}
```
- CHECK: `npx jest tests/parser.test.ts` -> Passed.

#### Step 3: Run full suite
- CHECK: `npm test` -> Passed.

### 5. VERIFY
CLAIM: parser handles undefined safely without crashing
COMMAND: npx jest tests/parser.test.ts
PASS  tests/parser.test.ts
✓ should parse string comma values
✓ should handle undefined input gracefully
EXIT CODE: 0
VERDICT: PASS
