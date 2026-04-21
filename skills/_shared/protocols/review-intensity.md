# Review Intensity Protocol

> **Purpose:** Control how much design/architecture review happens at each step of the pipeline. Users choose their review depth once, and the system adapts automatically.

## Modes Overview

| Mode | Review Behavior | Best For | Speed |
|------|-----------------|----------|-------|
| **Full** | Director specialists review at every key workflow step | Teams, learning, thorough feedback | Slowest |
| **Lean** (default) | Directors only at phase gate transitions (`/gate-check`) | Solo devs, balanced | Balanced |
| **Solo** | No director reviews at all | Game jams, prototypes, maximum speed | Fastest |

## Mode Definitions

### Full Mode

Every skill that has a review component runs its director/lead review:

```
DEFINE phase:
  - PM → Designer/Architect review of BRD
  - Architect → Creative/Technical Director review of architecture

BUILD phase:
  - Software Engineer → Lead Programmer review of each service
  - Frontend Engineer → UI Designer review of components

HARDEN phase:
  - QA → QA Lead review of test plan
  - Security Engineer → Technical Director review
  - Code Reviewer → Lead review

SHIP phase:
  - DevOps → Release Manager review
  - SRE → Production Director review

SUSTAIN phase:
  - Technical Writer → Documentation review
  - Skill Maker → Peer review
```

### Lean Mode (Default)

Reviews only at strategic phase gates:

```
Gate 1 (BRD Approval):
  - PM self-review + quick validation

Gate 2 (Architecture Approval):
  - Architect self-review + ADR checklist

Gate 3 (Production Readiness):
  - /gate-check runs automated validation
  - Security scan only (no full review)
  - Quality gate score displayed
```

### Solo Mode

No review steps. Pipeline runs at maximum speed:

```
- All review skills are skipped
- No gate checkpoints (auto-approve)
- Only blocking quality gates apply
- Best for: game jams, rapid prototyping, highly experienced users
```

## Configuration

### File Location

`production/review-mode.txt`

```
full
# or
lean
# or
solo
```

### Default

If `production/review-mode.txt` does not exist, default to **Lean**.

### Command-Line Override

Any skill can be invoked with `--review [mode]` to override:

```
/gate-check --review solo
/code-review --review full
/design-review --review lean
```

Override is per-invocation only and does not change the saved mode.

## Orchestrator Integration

### Mode Selection (Initial Setup)

When `production/review-mode.txt` doesn't exist, prompt user:

```
notify_user:
  "How much design review would you like as you work?

  1. **Full** — Director specialists review at every step. Best for teams, learning, or when you want thorough feedback on every decision.
  2. **Lean (Recommended)** — Reviews only at major phase transitions. Balanced approach for solo devs.
  3. **Solo** — No reviews. Maximum speed. Best for game jams or rapid prototyping."

  Options:
  > "Lean (Recommended)"
  > "Full"
  > "Solo"
```

After user selection:

```bash
mkdir -p production
echo "[selected]" > production/review-mode.txt
```

### Reading the Mode

At the start of every skill invocation, check the mode:

```bash
REVIEW_MODE=$(cat production/review-mode.txt 2>/dev/null || echo "lean")
```

### Gate Behavior by Mode

| Gate | Full | Lean | Solo |
|------|------|------|------|
| Gate 1 — BRD | PM + Designer review | PM self-review | Skip |
| Gate 2 — Architecture | Full Director review | ADR checklist | Skip |
| Gate 3 — Production | QA + Security + Review | /gate-check + Security only | Skip |

### Skill Routing by Mode

```
SKILL_GATE = {
  "full":   "/gate-check --review full",
  "lean":   "/gate-check --review lean",
  "solo":   "skip"
}

APPLY SKILL_GATE at each strategic gate.
```

## Review Skip Conditions

### Skippable Reviews (Lean Mode)

These reviews are skipped in Lean mode:

| Skill | Lean Behavior |
|-------|--------------|
| `/design-review` | Skip, merge into Gate 2 |
| `/code-review` | Skip, merge into Gate 3 |
| `/qa-review` | Skip, shown in /gate-check |
| `/architecture-review` | Run only if architecture changed since last review |

### Always-Run Checks (Even Solo Mode)

These are never skipped:

| Check | Reason |
|-------|--------|
| Quality Gate (≥ 60/100) | Minimum quality bar |
| Security scan | OWASP/CVE detection |
| Regression check | Existing tests must pass |
| Build verification | Code must compile |

## Progress Indicators

### Status Display

```
[Review Mode: Lean] Phase 2/6 — BUILD
  ✓ DEFINE: BRD + Architecture approved
  → BUILD: Software Engineer (T3a)
  ○ HARDEN: pending
  ○ SHIP: pending
```

### Gate Prompts by Mode

#### Full Mode Gate

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate 1 — BRD Approval [Review: Full]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Product Manager has drafted the Business Requirements Document.

Review Status:
  ✓ PM self-review complete
  ⏳ Creative Director review — pending
  ⏳ Game Designer review — pending

Current Status: Awaiting director reviews

1. **Wait for reviews (Recommended)** — Director reviews in progress
2. **Proceed without reviews** — Skip to implementation
3. **View draft BRD** — Read before deciding
```

#### Lean Mode Gate

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gate 1 — BRD Approval [Review: Lean]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PM has completed the Business Requirements Document.

1. **Approve — proceed to Architecture (Recommended)**
2. **Show BRD details** — Review before deciding
3. **Request changes** — PM to revise
```

#### Solo Mode Gate

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1 — DEFINE Complete [Review: Solo]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BRD and Architecture are ready. Moving to BUILD phase.

(No gate pause — auto-proceeding)

⏳ Starting T3a: Software Engineer
```

## Review Mode Change

User can change mode at any time:

```
notify_user:
  "Current review mode: [mode]

  Change to:
  1. **Full** — More review, slower
  2. **Lean** — Balanced (Recommended)
  3. **Solo** — Less review, faster
  4. **Keep current mode**"
```

Update `production/review-mode.txt` immediately after user selection.

## Integration Points

| Component | Integration |
|-----------|-------------|
| `production-grade/SKILL.md` | Read mode at startup, apply to gate behavior |
| `/gate-check` skill | Adapts output based on mode |
| `/code-review` skill | Skips in Lean/Solo, runs in Full |
| `/design-review` skill | Skips in Lean/Solo, runs in Full |
| `/qa-plan` skill | Shows review status in Lean, full review in Full |
| Quality Gate Protocol | Always runs regardless of mode |

## Best Practices

1. **Start with Lean** — Default for most users
2. **Upgrade to Full** when working on complex features or with a team
3. **Use Solo** for rapid prototyping, game jams, or highly scoped changes
4. **Change modes as needed** — No lock-in, always adjustable
5. **Watch quality scores** — Even in Solo mode, Quality Gate enforces minimum standards

## History

- v1.0 — Initial protocol (inspired by CCGS review modes)
