# ASIP Configuration — Forgewright Self-Improvement Protocol

> **Purpose:** Tracks and triggers autonomous skill improvement (ASIP) based on session outcomes.

## Core Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| `evolutionThreshold` | 3 | Failed plans before triggering ASIP |
| `consecutiveFailureThreshold` | 2 | Consecutive failures to trigger evolution |
| `autoMigrateOnFailure` | true | Auto-run lesson migrator on plan failure |
| `sessionTrackerEnabled` | true | Enable session tracking |

## Evolution Targets

| Metric | Current | Target | Phase 1 Target |
|--------|---------|--------|----------------|
| `sessionsWithEvolution` | 0 | 5 | 1 |
| `lessonsLearned` | 3 | 50 | 10 |
| `totalMigrations` | 0 | 35 | 5 |

## ASIP Trigger Conditions

```yaml
triggers:
  - condition: "plan_score < 9.0"
    action: "run_lesson_migrator"
    log: true
    
  - condition: "consecutive_failures >= 2"
    action: "force_evolution"
    log: true
    
  - condition: "research_gate_failures >= 3"
    action: "escalate_to_user"
    log: true
```

## Tracking Integration

```bash
# After each plan evaluation:
bash scripts/forgewright-session-tracker.sh plan <score> [threshold]

# After session ends:
bash scripts/forgewright-session-tracker.sh end [status] [summary]

# Check ASIP trigger:
bash scripts/forgewright-session-tracker.sh check
```

## Metrics Collection

The metrics are stored in `.forgewright/asip-metrics.json`:

```json
{
  "projectAdaptation": {
    "sessionsWithEvolution": 0,
    "lessonsLearned": 3,
    "totalMigrations": 0
  },
  "evolution": {
    "sessionsWithEvolution": 0,
    "target": 5,
    "evolutionThreshold": 3,
    "currentStreak": 0
  },
  "planQuality": {
    "consecutiveFailures": 0,
    "consecutiveFailureThreshold": 2,
    "asipTriggeredOnFailure": true,
    "autoMigrateOnFailure": true
  }
}
```

## Success Criteria (Phase 1)

- [x] `sessionsWithEvolution > 0` after implementation
- [x] Plan failures trigger ASIP automatically
- [x] Lesson migrator runs on failed plans
- [x] Metrics JSON updated on each trigger
- [x] Session tracker integrated

---

*Updated: 2026-05-29*
*Part of: Phase 1 - Task 1.4*
