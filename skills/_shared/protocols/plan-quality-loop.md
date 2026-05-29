# Plan Quality Loop Protocol

<!-- source: skills/_shared/protocols/plan-quality-loop.md -->
<!-- This is the single source of truth for the Plan Quality Loop -->

**⚠️ MANDATORY: Plan Quality Loop with Research Gate**

Before ANY skill does ANY work:
1. **PLAN** — Create a plan with 8 criteria
2. **SCORE** — Score against rubric (0-10 each)
3. **META-EVALUATE** — Check threshold ≥ 9.0
4. **IMPROVE** (if < 9.0) — Research → Improve skill → Re-plan
5. **EXECUTE** — Only after passing threshold

## 8-Criteria Rubric

| Criterion | Weight | Description |
|-----------|--------|-------------|
| **Completeness** | 1.0 | Plan covers all required elements |
| **Specificity** | 1.0 | Plan has concrete, actionable steps |
| **Feasibility** | 1.0 | Plan can realistically be executed |
| **Risk Awareness** | 1.0 | Plan identifies and mitigates risks |
| **Scope Control** | 1.0 | Plan maintains clear scope boundaries |
| **Dependency Ordering** | 1.0 | Tasks are in correct dependency order |
| **Testability** | 1.0 | Plan can be verified with concrete criteria |
| **Impact Assessment** | 1.0 | Plan considers downstream effects |

**Pass Threshold:** ≥ 9.0/10 (with bonus from Dependency Ordering)

## Enhanced Research Flow (NEW)

```
┌─────────────────────────────────────────────────────────────────────┐
│ RESEARCH GATE (when score < 9.0) │
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

## Session Tracking (NEW v8.1)

- Use `scripts/forgewright-session-tracker.sh` to track consecutive failures
- Check: `bash scripts/forgewright-session-tracker.sh check`
- Record: `bash scripts/forgewright-session-tracker.sh plan <score>`

## ⚠️ BA Scope Exception

- If plan requires Business Analyst scope elicitation (new project, unclear requirements), ASK clarifying questions via BA skill
- This is NOT blocking — this IS the Forgewright workflow for new projects
- Continue Plan → Score loop after BA scope is defined

Max 3 iterations. No skill may skip this.

---

*Source: skills/_shared/protocols/plan-quality-loop.md*
*Synced to: AGENTS.md, CLAUDE.md*
