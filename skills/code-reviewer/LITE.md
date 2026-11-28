---
name: code-reviewer
description: "Use for code or pull-request review, architecture conformance, maintainability, performance, anti-pattern, AI code slop, or technical-debt assessment."
version: 2.1.0
tags: [code-review, quality, architecture, anti-patterns, ai-slop, tech-debt, maintainability]
---

# Code Reviewer (LITE)

## SOLVE Step 2: GROUND (Code Reviewer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Exact diff & blast radius | Run `git diff --stat` and upstream symbol impact (`gitnexus` `impact` / caller search) | ... | Captured diff file list, changed LOC, and caller blast radius |
| Existing linters & static gates | Inspect project linter/typecheck/CI configs (`package.json`, `ruff.toml`, `tsconfig.json`, `slop-check.py`) | ... | Observed linter/typecheck config paths and exit status |
| AI Code Slop & Structural Erosion | Scan diff for God functions (>100 LOC), high CC (>20), duplicate helpers, swallowed exceptions (`catch {}`, bare `except`, `\|\| true`), dead code, and unverified dependencies (slopsquatting) | ... | Recorded file:line metrics and deterministic tool output |
| Spec, Authz & Test Integrity | Compare diff against acceptance criteria; inspect authz/boundary checks and verify tests assert behavior (not implementation-mirroring mocks or prose greps) | ... | Concrete file:line citations for each verified or failed check |

## SOLVE Step 3: DECOMPOSE (Code Reviewer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
1. SPEC & BOUNDARY CHECK | Changed files vs acceptance criteria & authz/public contracts | Cite exact `file:line` gaps; reject silent fallbacks or swallowed errors.
2. AI SLOP & EROSION SCAN | Diff complexity, duplication, error handling, dead code, dependency provenance | Run project static/slop checks (`verify:slop`, `ruff`, `tsc`, `eslint`, `shellcheck`) and flag structural drift.
3. TEST INTEGRITY CHECK | Added/modified tests & negative paths | Verify tests fail on plausible faults and preserve existing oracles without weakening assertions.
4. REPORT FINDINGS | Direct review response (or `.forgewright/` task state; never create transient `docs/review-comments.md`) | Group by root cause with severity (`P0`–`P3`), exact `file:line`, and concrete fix.
- Close with [kernel/AUDIT.md](../../kernel/AUDIT.md) proportional to change risk.
