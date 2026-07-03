---
name: code-quality-engineer
description: "Orchestrates static analysis, linting, formatting audits, complexity checks, and code intelligence risk assessments. Use when the user requests code reviews, refactoring, static analysis, linting setup, pre-commit hook audits, or code quality scoring."
version: 1.0.0
---

# Code Quality Engineer (LITE)

## SOLVE Step 2: GROUND (Code Quality Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack and language profile are established | `cat .forgewright/project-profile.json` | Confirms programming language and framework baseline [1] | |
| Active linters and code formatting packages are configured | `cat package.json \| jq '.devDependencies \| keys' \| grep -E \"(eslint\|prettier\|biome)\"` | Identifies linting tools, configurations, and version bindings [2] | |
| GitNexus symbol index and call graphs are present and initialized | `gitnexus analyze --status \|\| find . -name \"*.gitnexus\"` | Confirms GitNexus database readiness for structural queries [3, 4] | |
| Token budgets and spending safety caps are active | `cat .forgewright/budget.yaml` | Displays session cost ceilings and API threshold limits [5] | |

## SOLVE Step 3: DECOMPOSE (Code Quality Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Execute symbol blast-radius and impact evaluations via GitNexus | Warn the user if the impact analysis returns a HIGH or CRITICAL risk level [6].
2. AUDIT | Run static linters, format checkers, and security vulnerability scans | Verify zero critical linting errors or formatting warnings exist in the modified file set [2, 7].
3. SCORE | Assess code quality, complexity levels, and compliance against the Quality Gate | Ensure the generated or updated module matches a Production Ready Grade A status (Score 90-100) [8].
4. SYNC | Document code metrics, conventions, or ADR updates and execute sync hooks | Run the post-commit or post-skill sync hook to propagate reports to the Shared Obsidian Vault [9, 10].

## Common Mistakes Checklist
- **Ignoring GitNexus Impact Warnings**: Modifying high-touch symbols without running `gitnexus_impact` first, or neglecting HIGH/CRITICAL risk alerts on shared interfaces [6].
- **Bypassing Static Code Audits**: Committing code that fails linting or formatting checks, bypassing Git hook validations (e.g., Husky + lint-staged) [9, 11].
- **Formatting with Find-and-Replace**: Renaming functions, variables, or symbols across multiple files using string replacement instead of calling `gitnexus_rename` [6].
- **Non-Compliant Report Naming**: Saving code quality, linter profiles, or security audits under `docs/` using CamelCase, spaces, or absolute paths instead of lowercase kebab-case (e.g., `CodeQualityReport.md` instead of `code-quality-report.md`) [12].
- **Context Bloat with Large Logs**: Dumping massive, raw linter outputs or verbose compiler stack traces directly into the active prompt instead of summarizing or offloading [13, 14].

## Worked Example

### Step 1: Execute GitNexus impact analysis before refactoring a core validation symbol
```bash
gitnexus impact --target "validateUser" --direction "upstream"
```
Output:
```
[INFO] Querying symbol graph database...
[WARNING] "validateUser" is imported by 12 files.
[WARNING] Blast Radius Risk Level: HIGH
[MANDATORY ACTION] Ensure all upstream consumers are updated. Do not rename via find-and-replace!
```

### Step 2: Run linter and formatting checks on modified files
```bash
npm run lint -- --file src/utils/user-validator.ts
```
Output:
```
> eslint src/utils/user-validator.ts

/workspace/src/utils/user-validator.ts
  5:12  warning  Unexpected any. Specify a more precise type  @typescript-eslint/no-explicit-any

✖ 1 problem (0 errors, 1 warning)
```

### Step 3: Refactor the file to fix warnings, run local checks, and calculate the Quality Gate Score
```bash
# Correcting typescript types to resolve the any warning...
npm run lint -- --file src/utils/user-validator.ts
gitnexus_detect_changes --scope staged
```
Output:
```
[SUCCESS] Linting audit passed. 0 errors, 0 warnings.
[SUCCESS] Code Quality score: 98/100 (Grade A - Production Ready).
[INFO] GitNexus Detect Changes check: STAGED files verified as LOW risk.
```

### Step 4: Write linter report and synchronize to the Shared Obsidian Vault
```bash
cat << 'EOF' > docs/04-testing/code-quality-report.md
# Code Quality Audit: User Validator

## 1. Executive Summary
Conducted static analysis, linter formatting audits, and GitNexus impact analysis on the core user validation engine.

## 2. Technical Profile
- Linter: ESLint with TypeScript guidelines
- Quality Gate Score: 98/100 (Grade A)
- GitNexus Risk: LOW (All upstream consumer impacts resolved)
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for code-quality-report.md.
[SUCCESS] Symlinked docs/04-testing/code-quality-report.md to /workspace/shared-obsidian-vault/forgewright/04-testing/code-quality-report.md.
```
