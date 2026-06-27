# Plan Quality Loop Protocol

<!-- source: skills/_shared/protocols/plan-quality-loop.md -->
<!-- This is the single source of truth for the Plan Quality Loop -->

**⚠️ MANDATORY: Plan Quality Loop with Research Gate**

Before ANY skill does ANY work:
1. **PLAN** — Create a plan with 9 criteria
2. **SCORE** — Score against rubric (0-10 each, mode-specific weights)
3. **META-EVALUATE** — Check threshold (complexity-scaled, see below)
4. **IMPROVE** (if below threshold) — Research → Improve skill → Re-plan
5. **EXECUTE** — Only after passing threshold

## 10-Criteria Rubric

| Criterion | Default Weight | Description |
|-----------|---------------|-------------|
| **Completeness** | 1.0 | Plan covers all required elements |
| **Specificity** | 1.0 | Plan has concrete, actionable steps |
| **Feasibility** | 1.0 | Plan can realistically be executed |
| **Risk Awareness** | 1.0 | Plan identifies and mitigates risks |
| **Scope Control** | 1.0 | Plan maintains clear scope boundaries |
| **Dependency Ordering** | 1.0 | Tasks are in correct dependency order |
| **Testability** | 1.0 | Plan can be verified with concrete criteria |
| **Impact Assessment** | 1.0 | Plan considers downstream effects |
| **Evidence Verification** | 1.0 | Plan lists assumptions and details how they will be verified (Evidence-First) |
| **Confidence Check** | 1.0 | Plan specifies exactly how 99% empirical confidence will be proven (or how UI visual gate will be triggered) |

## Complexity-Scaled Thresholds (P1-1)

**Pass threshold adapts to task complexity — simple tasks don't need Full Build rigor.**

```
┌──────────────────────────────────────────────────────────────────┐
│ COMPLEXITY-SCALED PLAN THRESHOLDS                                │
├──────────────────────────────────────────────────────────────────┤
│ Mode                    │ Threshold │ Max Iterations │ Rationale │
│ ────────────────────────│───────────│────────────────│───────────│
│ Explore, Research       │ ≥ 6.0/10  │ 1              │ Discovery │
│ Review, Test, Document  │ ≥ 7.0/10  │ 1              │ Focused   │
│ Feature, Debug, Optimize│ ≥ 8.0/10  │ 2              │ Scoped    │
│ Full Build, Ship, Game  │ ≥ 9.0/10  │ 3              │ Critical  │
│ XR Build, AI Build      │ ≥ 9.0/10  │ 3              │ Critical  │
│ Harden, Migrate         │ ≥ 8.5/10  │ 2              │ High risk │
└──────────────────────────────────────────────────────────────────┘
```

**Rules:**
- Default threshold (mode not listed): **≥ 8.0/10, max 2 iterations**
- If `.production-grade.yaml` overrides `planQuality.threshold`, that value takes precedence
- Session tracker still applies: ≥2 consecutive failures → Research Gate MANDATORY regardless of mode

## Mode-Specific Criteria Weights (P1-2)

**Different modes prioritize different criteria.** Weighted score = Σ(criterion × weight) / Σ(weights).

| Criterion | Review/Test | Feature | Full Build | Explore |
|-----------|:-----------:|:-------:|:----------:|:-------:|
| Completeness | 1.0 | 1.0 | 1.0 | 0.5 |
| Specificity | 1.0 | 1.0 | 1.0 | 0.5 |
| Feasibility | 0.5 | 1.0 | **1.5** | 0.3 |
| Risk Awareness | 0.3 | 0.8 | **1.5** | 0.3 |
| Scope Control | 0.5 | **1.2** | 1.0 | 0.3 |
| Dependency Ordering | 0.3 | 1.0 | **1.5** | 0.3 |
| Testability | **1.5** | 1.0 | 1.0 | 0.3 |
| Impact Assessment | **1.5** | 1.0 | 0.8 | 0.3 |
| Evidence Verification | 1.0 | 1.0 | 1.0 | 0.5 |
| Confidence Check | 1.0 | 1.2 | 1.2 | 0.5 |

**Calculation example (Review mode):**
```
Raw scores:   [9, 8, 10, 7, 9, 8, 9, 10, 8, 9]
Weights:      [1.0, 1.0, 0.5, 0.3, 0.5, 0.3, 1.5, 1.5, 1.0, 1.0]
Weighted sum: 9×1.0 + 8×1.0 + 10×0.5 + 7×0.3 + 9×0.5 + 8×0.3 + 9×1.5 + 10×1.5 + 8×1.0 + 9×1.0
            = 9 + 8 + 5 + 2.1 + 4.5 + 2.4 + 13.5 + 15 + 8 + 9 = 76.5
Sum weights:  1.0 + 1.0 + 0.5 + 0.3 + 0.5 + 0.3 + 1.5 + 1.5 + 1.0 + 1.0 = 8.6
Final score:  76.5 / 8.6 = 8.89 → check against Review threshold (≥ 7.0) → ✅ PASS
```

**If mode not listed:** Use default weights (all 1.0).

## Scoring Calibration Examples (P1-3)

**Use these examples to calibrate scoring consistency across sessions.**

### Completeness (Does the plan cover everything needed?)

| Score | Example |
|:-----:|---------|
| 5/10 | "Add user authentication" — no details on which auth method, storage, or flows |
| 7/10 | "Implement JWT auth with bcrypt hashing, login/register endpoints" — missing password reset, rate limiting |
| 9/10 | "Implement JWT auth with bcrypt, refresh token rotation, rate limiting (100/min), password reset via email, account lockout after 5 failed attempts" |

### Specificity (Are steps concrete and actionable?)

| Score | Example |
|:-----:|---------|
| 5/10 | "Set up the database" — which database? what schema? |
| 7/10 | "Create PostgreSQL tables for users and orders with indexes" — missing specific columns, constraints |
| 9/10 | "Create PostgreSQL: `users` table (id UUID PK, email UNIQUE, password_hash VARCHAR(60), created_at TIMESTAMPTZ), `orders` table (id UUID PK, user_id FK → users, status ENUM, total DECIMAL(10,2)), index on orders.user_id" |

### Feasibility (Can this realistically be executed?)

| Score | Example |
|:-----:|---------|
| 5/10 | "Build a real-time collaborative editor" — for a 1-person team in 2 days |
| 7/10 | "Build a REST API with CRUD operations" — feasible but no time/resource consideration |
| 9/10 | "Build REST API: 4 endpoints, estimated 3 hours, using existing Express setup. Risk: if auth middleware is complex, may take 4 hours. Fallback: use simple API key auth first" |

### Risk Awareness (Does the plan identify and mitigate risks?)

| Score | Example |
|:-----:|---------|
| 5/10 | "Deploy to production" — no mention of what could go wrong |
| 7/10 | "Deploy to production. Rollback plan: revert to previous version" — identifies rollback but not specific failure scenarios |
| 9/10 | "Deploy to production. Risks: (1) DB migration may lock tables → run during low-traffic window, (2) New auth flow may break existing sessions → deploy with feature flag, (3) CDN cache invalidation → pre-warm critical paths" |

### Evidence Verification (Are assumptions listed and verifiable?)

| Score | Example |
|:-----:|---------|
| 5/10 | Plan uses assumptions without stating them |
| 7/10 | "Assumption: API uses REST" — stated but not verified |
| 9/10 | "Assumption: API uses REST → VERIFY by reading `routes.ts`. Assumption: DB supports JSON columns → VERIFY by checking PostgreSQL version ≥ 9.4" |

## Enhanced Research Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ RESEARCH GATE (when score < threshold) │
├─────────────────────────────────────────────────────────────────────┤
│ │
│ 0. CHECK NotebookLM availability: │
│ nlm --version 2>/dev/null || echo "NOT_AVAILABLE" │
│ └─ If NOT_AVAILABLE → SKIP to Step 2 (Web Search fallback) │
│ │
│ 1. TRY NotebookLM CLI (if available): │
│ nlm notebook create "[Project] - [Skill] - [Topic]" │
│ nlm research start "[topic]" --mode deep │
│ │
│ 2. FALLBACK to Web Search (always available): │
│ WebSearch: "best practices [topic]" │
│ WebSearch: "[framework] [pattern] implementation" │
│ │
│ 3. SYNTHESIZE: Extract 1-3 actionable insights │
│ ✓ "Auth pattern: JWT + refresh token rotation" │
│ ✗ "Found 15 articles about auth" │
│ │
│ 4. UPDATE session tracker: │
│ bash scripts/forgewright-session-tracker.sh plan <score> │
│ bash scripts/forgewright-session-tracker.sh check │
│ └─ If ≥2 consecutive failures → Research Gate MANDATORY │
│ │
│ 5. RE-PLAN with new insights │
│ │
└─────────────────────────────────────────────────────────────────────┘
```

## Session Tracking

- Use `scripts/forgewright-session-tracker.sh` to track consecutive failures
- Check: `bash scripts/forgewright-session-tracker.sh check`
- Record: `bash scripts/forgewright-session-tracker.sh plan <score>`

## ⚠️ BA Scope Exception

- If plan requires Business Analyst scope elicitation (new project, unclear requirements), ASK clarifying questions via BA skill
- This is NOT blocking — this IS the Forgewright workflow for new projects
- Continue Plan → Score loop after BA scope is defined

Max iterations per mode (see threshold table above). No skill may skip this.

---

*Source: skills/_shared/protocols/plan-quality-loop.md*
*Synced to: AGENTS.md, CLAUDE.md*

