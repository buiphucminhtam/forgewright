---
name: ux-researcher
description: "Orchestrates user experience audits, user persona definition, user flow design, usability testing planning, and behavioral metrics reviews. Use when the user requests customer journey mappings, user persona creation, usability spec sheets, or UX flow optimization designs."
version: 1.0.0
---

# Ux Researcher (LITE)

## SOLVE Step 2: GROUND (Ux Researcher Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| User research files, personas, or journey maps are indexed | `find docs/ -name "*research*" -o -name "*persona*" -o -name "*user-flow*"` | Identifies active, lowercase kebab-case user research assets [1] | |
| Project-specific tech stack and baseline profile are active | `cat .forgewright/project-profile.json` | Project profile JSON confirming target frameworks and platform [2] | |
| Standardized product requirements and feature spec templates exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs [1] | |
| Running token tracker budget and spending ceilings are configured | `cat .forgewright/budget.yaml` | Verifies active session spend parameters prior to task loops [3] | |

## SOLVE Step 3: DECOMPOSE (Ux Researcher Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Scan active user flow mappings, user reviews, and wireframe documents | Verify that research insights are mapped against standard BDD acceptance criteria in feature specs [1].
2. DEFINE | Build targeted user persona matrices and behavior-driven scenarios | Ensure persona documents focus on functional user needs and strictly avoid placeholder templates.
3. MAP | Construct comprehensive user journey maps or Mermaid visual interactive flows | Verify that state transitions have defined error and loading fallback routes.
4. SYNC | Propagate research reports and maps to the Shared Obsidian Vault | Run the post-skill sync hook to generate unified logs and establish absolute symlinks [4, 5].

## Common Mistakes Checklist
- **Vague or Superficial Personas**: Defining user personas using static demographic profiles instead of functional, BDD-aligned behavioral scenarios and goals.
- **Missing Loading or Fallback States**: Designing user flows that assume perfect happy-path performance without documenting how users interact with network disconnects or API loading states.
- **Non-Compliant File Names**: Storing research specs, user flows, or user-testing reports under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/01-product/UserPersona.md` instead of `docs/01-product/user-persona.md`) [1].
- **Dangling Shared Assets**: Adding bulky screenshots, high-resolution visual prototypes, or raw video logs directly to the codebase, leading to repository size bloat.
- **Unverified Token Budgets**: Generating complex procedural user scenario variants without verifying active expenditure limits inside `.forgewright/budget.yaml` [3, 6].

## Worked Example

### Step 1: Ground the active UX research configurations
```bash
cat .forgewright/project-profile.json
find docs/01-product/ -name "*research*"
```
Output:
```json
{
  "project_name": "forgewright-checkout-ux",
  "tech_stack": ["React", "TypeScript"],
  "health_status": "PASS"
}
```
```
docs/01-product/checkout-user-flow.md
```

### Step 2: Create a secure, compliant, lowercase kebab-case user persona specification
Create `docs/01-product/developer-persona.md`:
```markdown
# Persona: Devops Engineer (Alex)

## 1. Core Profile
- Role: Lead Devops Engineer
- Behavioral Goal: Reduce CI/CD deployment failure resolution times.
- Friction Point: Repeatedly debugging identical container build faults due to uncaptured agent memories.

## 2. BDD User Scenario
Given a failed Docker compilation pipeline
When Alex opens the Forgewright Console dashboard
Then let him retrieve the exact cached procedural execution path with a sub-second recovery search.
```

### Step 3: Synchronize research documents with the Shared Obsidian Vault
```bash
# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for developer-persona.md.
[SUCCESS] Symlinked docs/01-product/developer-persona.md to /workspace/shared-obsidian-vault/forgewright/01-product/developer-persona.md.
```
