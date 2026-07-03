---
name: skill-maker
description: "Orchestrates the scaffolding, authoring, validation, and registration of new custom Forgewright skills and execution templates. Use when the user requests a new AI skill, updates to existing skill SOP definitions, custom skill templates, or adding capabilities to the multi-agent registry."
version: 1.0.0
---

# Skill Maker (LITE)

## SOLVE Step 2: GROUND (Skill Maker Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Master skills directory and existing custom skills are indexed | `find skills/ -maxdepth 2 -name "SKILL.md" \| sort` | Lists all active custom skills and operational SOP definitions | |
| Project-specific tech stack and base configuration are loaded | `cat .forgewright/project-profile.json` | Displays onboarded tech stacks and project metadata | |
| Standard feature specification and design templates exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures design specifications conform to the standard layout format [1] | |
| Running spend limits and token budgets are active for task loops | `cat .forgewright/budget.yaml` | Verifies current session spend limits and warning triggers [2] | |

## SOLVE Step 3: DECOMPOSE (Skill Maker Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. SCAFFOLD | Construct the target skill directory and the initial compliant `SKILL.md` template | Verify that the target path under `skills/` is constructed with a valid markdown header [3].
2. VALIDATE | Run semantic formatting audits to verify naming conventions and check for placeholders | Verify that all files use lowercase kebab-case and contain no unreplaced template bracket variables [1].
3. REGISTER | Add the newly created custom skill to the global agent skills registry | Verify that the orchestrator loads the new skill definition without schema parsing errors [4].
4. SYNC | Export skill specifications to Obsidian and trigger the post-skill sync hook | Run standard sync scripts to establish absolute symlinks under the Shared Obsidian Vault [5, 6].

## Common Mistakes Checklist
- **Incorrect Directory Structure**: Creating new skills outside the standard `skills/` directory or omitting the mandatory `SKILL.md` entrypoint file [3].
- **CamelCase or Space-Filled Naming**: Using spaces, uppercase characters, or CamelCase in folder or skill names instead of strictly lowercase kebab-case (e.g., `skills/MyNewSkill` instead of `skills/my-new-skill`) [1].
- **Unresolved Template Placeholders**: Leaving unresolved template brackets (`{{variable}}` or `<placeholder>`) inside the active markdown profile, causing agent parsing crashes.
- **Dangling Tool Mappings**: Declaring local executable CLI commands or script tools in the skill description without verifying their paths are globally mapped or in the sandbox.
- **Unverified API spending**: Executing recursive validation loops or large-scale generation scripts without verifying active budgets inside `.forgewright/budget.yaml` [2, 7].

## Worked Example

### Step 1: Ground the active skills setup and verify the project profile
```bash
cat .forgewright/project-profile.json
find skills/ -maxdepth 1 -type d
```
Output:
```json
{
  "project_name": "forgewright-skills-workspace",
  "tech_stack": ["TypeScript", "Shell"],
  "health_status": "PASS"
}
```
```
skills/
skills/data-engineer
skills/prompt-optimizer
```

### Step 2: Scaffold a new compliant custom skill under `skills/`
```bash
# Create custom skill folder and the base SKILL.md template
mkdir -p skills/custom-validator
cat << 'EOF' > skills/custom-validator/SKILL.md
# Skill: Custom Validator

## 1. Description
Verifies payload data schemas against strict regex filters prior to deployment.

## 2. Triggers
Use when the user requests JSON payload structural audits.

## 3. Operational SOP Checklist
- [ ] Check schema formatting against target definitions
- [ ] Ensure credentials and API keys are redacted
EOF
```

### Step 3: Run pre-flight validation to check layout formats
```bash
# Verify that name conventions conform to lowercase kebab-case
node -e "
const fs = require('fs');
const skillDir = 'skills/custom-validator';
if (/[A-Z\s]/.test(skillDir)) {
  throw new Error('Non-compliant directory name: Use lowercase kebab-case!');
}
console.log('[SUCCESS] Skill name check passed.');
"
```
Output:
```
[SUCCESS] Skill name check passed.
```

### Step 4: Write standard documentation and trigger the Shared Obsidian Vault sync
```bash
# Write compliant documentation
cat << 'EOF' > docs/03-guides/custom-validator-guide.md
# Guide: Custom Validator Skill Setup

## 1. Executive Summary
Provides setup guidelines for scaffolding and registering the Custom Validator skill.

## 2. Technical Profile
- Directory: `skills/custom-validator/`
- Manifest File: `SKILL.md`
- Target Runtime: TypeScript validation engines
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for custom-validator-guide.md.
[SUCCESS] Symlinked docs/03-guides/custom-validator-guide.md to /workspace/shared-obsidian-vault/forgewright/03-guides/custom-validator-guide.md.
```
