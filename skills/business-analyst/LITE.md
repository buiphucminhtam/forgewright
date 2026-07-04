---
name: business-analyst
description: "Orchestrates business analysis, requirement elicitation, and BDD-first feature specification generation. Use when the user requests a new feature build, SaaS application design, user stories, or BDD specification files."
version: 1.0.0
---

# Business Analyst (LITE)

## SOLVE Step 2: GROUND (Business Analyst Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Project stack and baseline profile are onboarded and defined | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |
| Existing product specifications or active requirements exist in the designated product folder | `find docs/01-product/ -name "*.md"` | ... | run the check command and paste output |
| Standardized feature specifications template is present for formatting consistency | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Business Analyst Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. ELICIT | Product features and specifications via user requirements | Verify requirements map precisely to business goals and do not introduce out-of-scope bloat.
2. FORMAT | Create or update specification files under `docs/01-product/` following `TEMPLATE-FEATURE-SPEC.md` | Ensure file names strictly use lowercase letters and kebab-case with no spaces (e.g., `api-specification.md`).
3. SEQUENCE | Classify task complexity using GitNexus metrics to enforce BDD-first sequence | Verify that high-complexity features trigger the sequence: `BA (BDD) -> QA (Stubs) -> Build -> Test`.

## Common Mistakes Checklist
- **Non-compliant naming conventions**: Saving specification files under `docs/` that use uppercase letters, camelCase, or spaces instead of strictly lowercase kebab-case (e.g., `api-specification.md`).
- **Bypassing the BDD sequence**: Skipping the strict sequence of `BA (BDD) -> QA (Stubs) -> Build -> Test` for high-complexity tasks, leading to requirement gaps.
- **Misplaced documentation files**: Placing business and feature requirements outside of the numeric-prefixed `docs/01-product/` directory.
- **Context bloat**: Ingesting excessive raw outputs or logs into specification files instead of leveraging compact trace handles.

### Step 1: Verify the project profile and check the feature spec template
```bash
cat .forgewright/project-profile.json
cat docs/01-product/TEMPLATE-FEATURE-SPEC.md
```

### Step 2: Create a lowercase, kebab-case feature specification `docs/01-product/billing-service.md`
```bash
cat << 'EOF' > docs/01-product/billing-service.md
# Feature: Cost-Aware SaaS Billing

## 1. Executive Summary
Provide automated, cost-aware billing boundaries mapped to client-server metrics.

## 2. User Personas
- Developer: Reviews real-time API token usage reports.
- Enterprise Admin: Manages budgets via `.forgewright/budget.yaml` [5, 6].

## 3. Acceptance Criteria (BDD)
Scenario: Automated threshold restriction
  Given a user has configured a budget threshold of $100 in budget.yaml
  When cumulative API usage is calculated under GET /api/usage and exceeds 90% [5, 6]
  Then trigger an active budget alert notification
EOF
```
