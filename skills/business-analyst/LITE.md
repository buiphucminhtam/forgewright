---
name: business-analyst
description: "Orchestrates business analysis, requirement elicitation, and BDD-first feature specification generation [1]. Use when the user requests a new feature build, SaaS application design, user stories, or BDD specification files [1, 2]."
version: 1.0.0
---

# Business Analyst (LITE)

## SOLVE Step 2: GROUND (Business Analyst Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project stack and baseline profile are onboarded and defined | `cat .forgewright/project-profile.json` [3] | Project profile JSON with tech stack details [3] | |
| Existing product specifications or active requirements exist in the designated product folder | `find docs/01-product/ -name "*.md"` [4] | Lists existing kebab-case, lowercase requirement files [4] | |
| Standardized feature specifications template is present for formatting consistency | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` [4] | Standardized feature spec template layout [4] | |
| Spend budgets and token tracking are configured to ensure cost-aware feature scoping | `cat .forgewright/budget.yaml` [5, 6] | Active budget configurations, alert thresholds, and provider configurations [5] | |

## SOLVE Step 3: DECOMPOSE (Business Analyst Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. ELICIT | Product features and specifications via user requirements [2, 4] | Verify requirements map precisely to business goals and do not introduce out-of-scope bloat [4].
2. FORMAT | Create or update specification files under `docs/01-product/` following `TEMPLATE-FEATURE-SPEC.md` [4] | Ensure file names strictly use lowercase letters and kebab-case with no spaces (e.g., `api-specification.md`) [4].
3. SEQUENCE | Classify task complexity using GitNexus metrics to enforce BDD-first sequence [1] | Verify that high-complexity features trigger the sequence: `BA (BDD) -> QA (Stubs) -> Build -> Test` [1].
4. SYNC | Propagate live documentation to the Shared Obsidian Vault [7, 8] | Verify post-skill sync hooks create absolute symlinks to link documentation without file duplication [8].

## Common Mistakes Checklist
- **Non-compliant naming conventions**: Saving specification files under `docs/` that use uppercase letters, camelCase, or spaces instead of strictly lowercase kebab-case (e.g., `api-specification.md`) [4].
- **Bypassing the BDD sequence**: Skipping the strict sequence of `BA (BDD) -> QA (Stubs) -> Build -> Test` for high-complexity tasks, leading to requirement gaps [1].
- **Misplaced documentation files**: Placing business and feature requirements outside of the numeric-prefixed `docs/01-product/` directory [4].
- **Missing cost-control verification**: Running heavy requirement elicitation sessions without verifying `.forgewright/budget.yaml` or turning on local token tracking (`forge token on`) [1, 5].
- **Context bloat**: Ingesting excessive raw outputs or logs into specification files instead of leveraging compact trace handles [9].

## Worked Example

### Step 1: Verify the project profile and check the feature spec template [3, 4]
```bash
cat .forgewright/project-profile.json
cat docs/01-product/TEMPLATE-FEATURE-SPEC.md
```
Output:
```json
{
  "project_name": "forgewright-saas",
  "tech_stack": ["TypeScript", "SQLite", "Node.js"],
  "health_status": "PASS"
}
```

### Step 2: Create a lowercase, kebab-case feature specification `docs/01-product/billing-service.md` [4]
```bash
cat << 'EOF' > docs/01-product/billing-service.md
# Feature: Cost-Aware SaaS Billing [5]

## 1. Executive Summary
Provide automated, cost-aware billing boundaries mapped to client-server metrics [5].

## 2. User Personas
- Developer: Reviews real-time API token usage reports [5].
- Enterprise Admin: Manages budgets via `.forgewright/budget.yaml` [5, 6].

## 3. Acceptance Criteria (BDD) [1]
Scenario: Automated threshold restriction [5]
  Given a user has configured a budget threshold of $100 in budget.yaml [5]
  When cumulative API usage is calculated under GET /api/usage and exceeds 90% [5, 6]
  Then trigger an active budget alert notification [5]
EOF
```

### Step 3: Synchronize live documentation to the Shared Obsidian Vault using absolute symlinks [8]
```bash
# Execute post-skill hook to sync documents
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Symlinked docs/01-product/billing-service.md to /workspace/shared-obsidian-vault/forgewright/01-product/billing-service.md [8].
```
