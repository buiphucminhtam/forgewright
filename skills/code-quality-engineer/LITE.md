---
name: code-quality-engineer
description: "Orchestrates static analysis, linting, formatting audits, complexity checks, and code intelligence risk assessments. Use when the user requests code reviews, refactoring, static analysis, linting setup, pre-commit hook audits, or code quality scoring."
version: 1.0.0
---

# Code Quality Engineer (LITE)

## SOLVE Step 2: GROUND (Code Quality Engineer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Project tech stack and language profile are established | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |
| Active linters and code formatting packages are configured | `cat package.json \| jq '.devDependencies \| keys' \| grep -E \"(eslint\|prettier\|biome)\"` | ... | run the check command and paste output |
| GitNexus symbol index and call graphs are present and initialized | `gitnexus analyze --status \|\| find . -name \"*.gitnexus\"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Code Quality Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Execute symbol blast-radius and impact evaluations via GitNexus | Warn the user if the impact analysis returns a HIGH or CRITICAL risk level.
2. AUDIT | Run static linters, format checkers, and security vulnerability scans | Verify zero critical linting errors or formatting warnings exist in the modified file set.
3. SCORE | Assess code quality, complexity levels, and compliance against the Quality Gate | Ensure the generated or updated module matches a Production Ready Grade A status (Score 90-100).

## Common Mistakes Checklist
- **Ignoring GitNexus Impact Warnings**: Modifying high-touch symbols without running `gitnexus_impact` first, or neglecting HIGH/CRITICAL risk alerts on shared interfaces.
- **Bypassing Static Code Audits**: Committing code that fails linting or formatting checks, bypassing Git hook validations (e.g., Husky + lint-staged).
- **Formatting with Find-and-Replace**: Renaming functions, variables, or symbols across multiple files using string replacement instead of calling `gitnexus_rename`.
- **Non-Compliant Report Naming**: Saving code quality, linter profiles, or security audits under `docs/` using CamelCase, spaces, or absolute paths instead of lowercase kebab-case (e.g., `CodeQualityReport.md` instead of `code-quality-report.md`).
- **Context Bloat with Large Logs**: Dumping massive, raw linter outputs or verbose compiler stack traces directly into the active prompt instead of summarizing or offloading.

### Step 1: Execute GitNexus impact analysis before refactoring a core validation symbol
```bash
gitnexus impact --target "validateUser" --direction "upstream"
```

### Step 2: Run linter and formatting checks on modified files
```bash
npm run lint -- --file src/utils/user-validator.ts
```

### Step 3: Refactor the file to fix warnings, run local checks, and calculate the Quality Gate Score
```bash
# Correcting typescript types to resolve the any warning...
npm run lint -- --file src/utils/user-validator.ts
gitnexus_detect_changes --scope staged
```
