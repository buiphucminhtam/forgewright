# Pipeline Reference

> **Status: Placeholder** — Content to be added.

## The 6-Phase Pipeline

Forgewright uses a structured pipeline to ensure consistent, high-quality delivery:

```
INTERPRET → DEFINE → BUILD → HARDEN → SHIP → SUSTAIN
```

## Phase Details

### 1. INTERPRET
Extract intent from the user's request:
- Classify into one of 24 modes
- Extract key constraints, success criteria
- Check memory for prior context

### 2. DEFINE
Plan the execution:
- Create implementation plan
- Score plan quality (threshold ≥ 9.0/10)
- Research if score is low
- Define acceptance criteria

### 3. BUILD
Execute with appropriate skills:
- Route to skill(s) based on mode
- Implement code/features
- Write tests

### 4. HARDEN
Quality assurance:
- Security audit
- Code review
- Test execution
- Performance check

### 5. SHIP
Deployment:
- CI/CD pipeline
- Environment configuration
- Rollback plan

### 6. SUSTAIN
Ongoing maintenance:
- Monitor health
- Gather feedback
- Iterate

## Quality Gates

Each phase has a quality gate that must pass before proceeding:
- **T1** — Plan quality gate (score ≥ 9.0)
- **T2** — Implementation gate (tests pass, lint clean)
- **T3** — Integration gate (E2E tests pass)
- **T4** — Deploy gate (security scan clean)

## Script References

- `scripts/skill-health.sh` — Validate skill health
- `scripts/dep-graph.sh` — Check dependencies
- `scripts/forgewright-session-tracker.sh` — Track session quality

---

*Last updated: 2026-05-29*
