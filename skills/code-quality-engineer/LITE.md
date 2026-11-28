---
name: code-quality-engineer
description: "Orchestrates static analysis, linting, AI code slop gates, formatting audits, complexity checks, and code intelligence risk assessments. Use when the user requests code reviews, refactoring, static analysis, linting setup, pre-commit hook audits, or code quality scoring."
version: 2.0.0
---

# Code Quality Engineer (LITE)

## SOLVE Step 2: GROUND (Code Quality Engineer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Project tech stack and linter configs | Inspect `package.json`, `ruff.toml`, `pyproject.toml`, `.shellcheckrc`, or `tsconfig.json` | ... | Verified active linter/formatter configs and scripts |
| Deterministic AI-slop baseline | Run `python3 scripts/ci/slop-check.py` (or project complexity/duplication/lint checks) | ... | Recorded exit code, God-function/CC counts, and error list |
| Symbol blast radius before refactoring | Run `gitnexus` `impact` / `detect_changes` or caller search on target symbols | ... | Captured caller list, risk tier, and affected flows |

## SOLVE Step 3: DECOMPOSE (Code Quality Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Run symbol blast-radius analysis before touching shared interfaces | Flag HIGH/CRITICAL risk before refactoring.
2. SLOP & STATIC GATE | Run deterministic checks (`verify:slop`, `ruff`, `eslint`, `tsc`, `shellcheck`) | Reject bare `except:`, empty `catch {}`, unquoted shell hazards (`SC2115`/`SC2086`/`SC2164`), duplicate code files, and personal path leaks.
3. COMPLEXITY & DE-BLOAT | Inspect changed functions for SlopCodeBench erosion (>100 LOC, CC > 20, copy-paste helpers) | Decompose monoliths into cohesive units without changing public contracts.
4. VERIFY | Re-run targeted tests and static gates after refactor | Confirm observed GREEN exit codes without weakening lint rules or test oracles.

## Common Mistakes Checklist
- **Silencing Linters to Pass CI (Lint Theater)**: Disabling safety rules (`SC2115`, `SC2086`, `no-explicit-any`) globally instead of fixing the underlying defects.
- **Ignoring Structural Erosion**: Accepting passing unit tests while functions grow past 150 LOC / CC > 25 or duplicate existing helpers.
- **Modifying Shared Symbols Blindly**: Refactoring shared functions without checking upstream callers or `gitnexus` `impact`.
- **Creating Transient Audit Files in `docs/`**: Keep one-off lint/review dumps out of canonical `docs/` per `documentation-governance.md`.
