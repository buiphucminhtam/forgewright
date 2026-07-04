---
name: product-manager
description: "[production-grade internal] Turns product ideas and business goals into formal requirements — BRD, user stories, acceptance criteria, prioritization, metrics frameworks, A/B test design, and competitive analysis. Routed via the production-grade orchestrator."
version: 2.0.0
---

# Product Manager (LITE)

## SOLVE Step 2: GROUND (Product Manager Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target requirements document | Locate existing BRD / PRD / feature specs | ... | Y/N |
| Target audience & persona | Read docs for defined user personas | ... | Y/N |
| Key performance indicators (KPI) | Search for success metrics or tracking requirements | ... | Y/N |
| Out of scope limits | Identify boundaries in existing issue description | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Product Manager Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (draft BRD user flow) | TARGET (docs/requirements/BRD.md) | CHECK (cat docs/requirements/BRD.md)`
- `n. ACTION (write Gherkin user stories) | TARGET (docs/requirements/stories.md) | CHECK (cat docs/requirements/stories.md)`
- `n. ACTION (prioritize features matrix) | TARGET (docs/requirements/priority.md) | CHECK (cat docs/requirements/priority.md)`
- `n. ACTION (define telemetry tracking spec) | TARGET (docs/requirements/analytics.md) | CHECK (cat docs/requirements/analytics.md)`

---

## Worked Example: Password Reset Feature Specification
> [!NOTE]
> The following example is illustrative.

### 1. UNDERSTAND
- **Task**: Author requirements and Gherkin user stories for a "Password Reset via Email" feature.
- **What must be TRUE**: BRD document lists user flow, error conditions (non-existent email), user stories use standard Gherkin format, and documents are saved.
- **What could I be wrong about**: Security implications of user enumeration (confirming if email exists in system).

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Requirements folder exists | `ls docs/requirements` | Directory exists | Y |
| Out-of-scope security constraint | View project guidelines | "Do not reveal if email exists during reset" | Y |

### 3. DECOMPOSE
1. ACTION (draft Password Reset BRD)   TARGET (docs/requirements/BRD.md)   CHECK (cat docs/requirements/BRD.md)
2. ACTION (write Gherkin user stories)   TARGET (docs/requirements/stories.md)   CHECK (cat docs/requirements/stories.md)
3. ACTION (document metrics/success KPIs)   TARGET (docs/requirements/analytics.md)   CHECK (cat docs/requirements/analytics.md)

### 4. EXECUTE
#### Step 1: Draft BRD
- Created `docs/requirements/BRD.md` with:
  - Scope: Reset form, email token generation, token expiry (1 hour), reset password entry.
  - User Flow: Request reset -> Receive link -> Click link -> Set new password.
- CHECK: `cat docs/requirements/BRD.md` -> Printed correctly.

#### Step 2: Write Gherkin stories
- Created `docs/requirements/stories.md`:
  ```gherkin
  Feature: User Password Reset
    As a registered user who forgot their password
    I want to request a password reset link
    So that I can regain access to my account securely

    Scenario: Requesting a reset link successfully
      Given I am on the reset password page
      When I submit email "user@example.com"
      Then I see a message "If that email exists, a link was sent."
  ```
- CHECK: `cat docs/requirements/stories.md` -> Printed correctly.

#### Step 3: Document metrics
- Created `docs/requirements/analytics.md` defining metrics: Reset Conversion Rate, Token Expiration Rate, Reset Failure rate.
- CHECK: `cat docs/requirements/analytics.md` -> Printed correctly.

### 5. VERIFY
CLAIM: password reset requirements are drafted and Gherkin validated
COMMAND: cat docs/requirements/stories.md
Feature: User Password Reset
...
  Scenario: Requesting a reset link successfully
...
EXIT CODE: 0
VERDICT: PASS
