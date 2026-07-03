---
name: project-manager
description: "Orchestrates project initialization, task decomposition, milestone tracking, resource leveling, and execution status reporting. Use when the user requests project onboarding, task tracking updates, sprint planning, status report generation, or multi-role delegation plans."
version: 1.0.0
---

# Project Manager (LITE)

## SOLVE Step 2: GROUND (Project Manager Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack and onboarding status profile are established [1] | `cat .forgewright/project-profile.json` | Displays tech stack dependencies, baseline metrics, and project name [1] | |
| Task boards or target execution files exist in standard directories [2] | `find docs/ -name "*tasks*" -o -name "*roadmap*" -o -name "*milestones*"` | Lists active project checklists, ticket manifests, or status trackers [2] | |
| Standardized product specification templates are onboarded [3] | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Confirms the formatting schema for acceptance criteria and functional specs [3] | |
| Active session spend tracker parameters and token limits are configured [4] | `cat .forgewright/budget.yaml` | Displays configured budget cap rules to restrict agent task loops [5] | |

## SOLVE Step 3: DECOMPOSE (Project Manager Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. INITIALIZE | Auto-detect environment tech stack and run project onboarding queries [1] | Verify that `.forgewright/project-profile.json` generates cleanly with zero validation errors [1].
2. DECOMPOSE | Break down high-level milestones into sequential, BDD-compliant task files [4] | Ensure subtasks are assigned to target directories under `docs/` with testable acceptance criteria [3].
3. TRACK | Read and update active status checklists to reflect completed execution steps [2, 6] | Verify checkboxes (`- [ ]`, `- [/]`, `- [x]`) correspond accurately to build and test statuses [7].
4. SYNC | Propagate project boards and milestone logs to the Shared Obsidian Vault [2, 7] | Run the post-skill sync hook to create absolute symlinks under the operations folder [3, 7].

## Common Mistakes Checklist
- **Unverified Task Completion**: Marking checklist items as completed without verifying that the associated build compilation or test suite passes [7, 8].
- **Vague Acceptance Criteria**: Specifying tickets or task cards with non-executable criteria instead of explicit behavioral expectations (BDD) matching TEMPLATE-FEATURE-SPEC [3].
- **No-Verification Path Execution**: Proceeding to heavy architectural builds or refactorings without conducting Step 2 (Ground) verification scans.
- **Context Overload (Missing Truncation)**: Attempting to print massive task logs or absolute project structures directly inside active chat contexts instead of offloading to `.forgewright/offload/` [6].
- **Non-Compliant File Names**: Storing task checklists, schedules, or sprint reports under `docs/` using CamelCase, spaces, or absolute paths instead of lowercase kebab-case naming [3].

## Worked Example

### Step 1: Execute project-onboarding command to establish baseline context
```bash
# Run the built-in onboarding sequence to detect tech stack and tool chains
forge onboard
```
Output:
```
[INFO] Scanning workspace directory structure...
[INFO] Found: package.json, tsconfig.json, docs/01-product/TEMPLATE-FEATURE-SPEC.md.
[SUCCESS] Generated .forgewright/project-profile.json. Tech stack: React + TypeScript.
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

### Step 3: Update sprint status following verified build completions and sync with Obsidian
```bash
# Simulating successful build of database migrations and running validation checks
npm run test:db-migrations
```
Output:
```
[SUCCESS] 5/5 database migration tests executed successfully.
```

```bash
# Edit tracking checklists to reflect the verified success
sed -i 's/- \[\/\] Build database migration/- \[x\] Build database migration/g' docs/05-operations/sprint-status.md
sed -i 's/- \[ \] Connect client API/- \[\/\] Connect client API/g' docs/05-operations/sprint-status.md

# Run post-skill synchronization hook to align docs with the Shared Obsidian Vault
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for sprint-status.md.
[SUCCESS] Symlinked docs/05-operations/sprint-status.md to /workspace/shared-obsidian-vault/forgewright/05-operations/sprint-status.md.
```
