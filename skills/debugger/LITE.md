---
name: debugger
description: "Use when the user reports a bug, crash, exception, broken behavior, failing test, regression, or performance degradation."
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

## Failure Classification
After a failed debugging approach, classify the evidence before choosing the next action:
- `hypothesis_wrong` — the focused experiment disproved the root-cause hypothesis.
- `implementation_wrong` — the hypothesis remains supported but the attempted fix is incorrect/incomplete.
- `environment_wrong` — runtime, dependency, configuration, platform, or fixture evidence invalidated the assumed environment.
- `architecture_wrong` — the local fix exposes a broader design/shared-state/contract problem that requires replanning.

If the **same approach fails twice**, do not try a cosmetic variant. Record the class + evidence, isolate the failed assumption, and return to the parent/Stuck Rule with the corresponding replan trigger.
