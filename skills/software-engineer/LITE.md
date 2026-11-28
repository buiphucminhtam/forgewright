---
name: software-engineer
description: "Use for backend, API, service, or business-logic feature work, bounded bug fixes, and implementation refactors routed through the production pipeline."
version: 2.1.0
tags: [backend, api, services, implementation, clean-architecture, anti-slop, tdd]
---

# Software Engineer (LITE)

## SOLVE Step 2: GROUND (Software Engineer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Existing domain abstractions & contracts | Inspect target modules, types, schemas, and callers before creating new helpers or files | ... | Verified existing file paths, symbols, and caller signatures |
| Dependencies & runtime versions | Read `package.json`, `pyproject.toml`, `go.mod`, or lockfiles (never invent/slopsquat packages or APIs) | ... | Recorded installed package names and runtime versions |
| Baseline tests & static checks | Run the focused existing test/lint/typecheck command for affected modules | ... | Captured baseline command, exit code, and pass/fail summary |
| Failure & boundary semantics | Check existing error-handling conventions, authz boundaries, and rollback requirements | ... | Documented expected error types and negative-path behavior |

## SOLVE Step 3: DECOMPOSE (Software Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
1. REPRODUCE OR DEFINE CONTRACT | Failing behavioral test or minimal contract check | Observe RED before fixing bugs; keep tests behavior-focused (no mock mirroring).
2. IMPLEMENT SMALLEST SAFE CHANGE | Reuse existing abstractions; keep functions cohesive (avoid >100 LOC God functions and deep nesting) | Explicit error propagation (no silent `catch {}`, bare `except:`, or swallowed defaults).
3. VERIFY TARGET & ADJACENT REGRESSION | Run focused test suite, typecheck, and linter on changed files | Observe exact GREEN exit code and output.
4. ANTI-SLOP SELF-AUDIT | Inspect `git diff` for dead code, copy-paste bloat, hardcoded local paths, or unrequested scope | Confirm minimal clean diff and run [kernel/AUDIT.md](../../kernel/AUDIT.md) for multi-file edits.
