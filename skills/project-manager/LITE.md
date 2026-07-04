---
name: project-manager
description: "Orchestrates project initialization, task decomposition, milestone tracking, resource leveling, and execution status reporting. Use when the user requests project onboarding, task tracking updates, sprint planning, status report generation, or multi-role delegation plans."
version: 1.0.0
---

# Project Manager (LITE)

## SOLVE Step 2: GROUND (Project Manager Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Project tech stack and onboarding status profile are established | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |
| Task boards or target execution files exist in standard directories | `find docs/ -name "*tasks*" -o -name "*roadmap*" -o -name "*milestones*"` | ... | run the check command and paste output |
| Standardized product specification templates are onboarded | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Project Manager Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. INITIALIZE | Auto-detect environment tech stack and run project onboarding queries | Verify that `.forgewright/project-profile.json` generates cleanly with zero validation errors.
2. DECOMPOSE | Break down high-level milestones into sequential, BDD-compliant task files | Ensure subtasks are assigned to target directories under `docs/` with testable acceptance criteria.
3. TRACK | Read and update active status checklists to reflect completed execution steps | Verify checkboxes (`- [ ]`, `- [/]`, `- [x]`) correspond accurately to build and test statuses.

## Common Mistakes Checklist
- **Unverified Task Completion**: Marking checklist items as completed without verifying that the associated build compilation or test suite passes.
- **Vague Acceptance Criteria**: Specifying tickets or task cards with non-executable criteria instead of explicit behavioral expectations (BDD) matching TEMPLATE-FEATURE-SPEC.
- **No-Verification Path Execution**: Proceeding to heavy architectural builds or refactorings without conducting Step 2 (Ground) verification scans.
- **Context Overload (Missing Truncation)**: Attempting to print massive task logs or absolute project structures directly inside active chat contexts instead of offloading to `.forgewright/offload/`.
- **Non-Compliant File Names**: Storing task checklists, schedules, or sprint reports under `docs/` using CamelCase, spaces, or absolute paths instead of lowercase kebab-case naming.

### Step 1: Execute project-onboarding command to establish baseline context
```bash
# Run the built-in onboarding sequence to detect tech stack and tool chains
forge onboard
```

### Step 2: Create a compliant, lowercase kebab-case sprint tracking file `docs/05-operations/sprint-status.md`
```bash
cat << 'EOF' > docs/05-operations/sprint-status.md
# Sprint 1 Status & Task Tracker

## 1. Active Milestones
- [x] Onboard project workspace — Tech stack and constraints identified.
- [/] Build database migration — Integrate SQLite transaction-safe WAL mode.
- [ ] Connect client API — Link fetch controllers to backend routes.

## 2. Acceptance Criteria
Given a completed onboarding scan
When the project-profile.json contains "TypeScript"
Then let downstream engineering tasks begin execution.
EOF
```
