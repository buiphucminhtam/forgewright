# Model Tier Assignment Protocol

> **Purpose:** Assign the optimal Claude model tier to each skill invocation based on task complexity. Optimizes cost and latency while maintaining quality.

## Model Tiers

| Tier | Model ID | Use Case | Cost | Latency |
|------|----------|----------|------|---------|
| **Haiku** | `claude-haiku-4-5-20251001` | Read-only, status checks, formatting | Lowest | Fastest |
| **Sonnet** | `claude-sonnet-4-6` | Implementation, design, analysis | Medium | Medium |
| **Opus** | `claude-opus-4-6` | Multi-document synthesis, high-stakes review | Highest | Slowest |

## Skill-to-Tier Mapping

### Haiku Skills (Lightweight)

These skills only read files and format output. No creative judgment or complex reasoning:

| Skill | Rationale |
|-------|-----------|
| `/help` | Read-only skill listing |
| `/sprint-status` | Status report from existing files |
| `/story-readiness` | Quick checklist check |
| `/scope-check` | Simple scope validation |
| `/project-stage-detect` | File existence scan |
| `/changelog` | Format existing commits |
| `/patch-notes` | Format existing changes |
| `/onboard` | Project state analysis |
| `/quick-design` | Lightweight design doc from template |
| `/estimate` | Quick estimation from existing data |

### Opus Skills (Complex Synthesis)

These skills synthesize 5+ documents, make high-stakes decisions, or require deep cross-domain analysis:

| Skill | Rationale |
|-------|-----------|
| `/review-all-gdds` | Cross-reference 5+ design documents |
| `/architecture-review` | Multi-system holistic analysis |
| `/gate-check` | Phase gate verdict (high stakes) |
| `/design-review` | Full design evaluation across systems |
| `/code-review` | Deep code quality analysis |
| `/balance-check` | Economy/game balance analysis |
| `/milestone-review` | Cross-milestone assessment |
| `/retrospective` | Multi-session synthesis |

### Sonnet Skills (Default)

All other skills default to Sonnet. This includes:

- **Execution skills:** Software Engineer, Frontend Engineer, QA, DevOps, etc.
- **Design skills:** Product Manager, Solution Architect, Game Designer, etc.
- **Analysis skills:** Security Engineer, Performance Engineer, Data Scientist, etc.

## Frontmatter Configuration

Add `model:` field to each SKILL.md frontmatter:

```yaml
---
name: sprint-status
model: haiku
---
```

```yaml
---
name: architecture-review
model: opus
---
```

```yaml
---
name: software-engineer
# No model field = defaults to Sonnet
---
```

## Tier Selection Algorithm

When invoking a skill:

```
1. Parse skill's SKILL.md frontmatter for model: field
2. IF model field exists:
     → Use specified model
     → Log: "Using [model] for [skill-name]"
3. ELSE IF skill in HAIKU_SKILLS list:
     → Use Haiku
4. ELSE IF skill in OPUS_SKILLS list:
     → Use Opus
5. ELSE:
     → Use Sonnet (default)
```

### Override Mechanism

User can override tier per invocation:

```
/[skill-name] --model opus
/code-review --model sonnet
/sprint-status --model haiku
```

CLI flags take precedence over frontmatter defaults.

## Cost Optimization

### Batch Processing

Group multiple Haiku-level tasks into a single invocation:

```
GOOD:
  Invoke: /sprint-status --model haiku
  # Status + scope check + changelog in one prompt

BAD:
  Invoke: /sprint-status --model haiku
  Invoke: /scope-check --model haiku  # Separate invocation
```

### Model Escalation

If a Haiku task reveals complexity requiring deeper analysis, escalate:

```
1. Haiku task detects issues
2. Log: "Haiku: [N] issues found — escalating to Sonnet"
3. Re-invoke with Sonnet for detailed analysis
```

## Quality Assurance

### Tier Verification

Before finalizing tier assignments:

```
1. Review skill outputs across tiers
2. Verify Haiku outputs match Sonnet quality for simple tasks
3. Verify Opus is only used for genuinely complex tasks
4. Adjust mappings based on observed quality
```

### Cost Tracking

Track estimated cost per pipeline run:

```bash
# Estimate based on tier usage
HAIKU_TASKS=10  # × ~$0.001
SONNET_TASKS=20  # × ~$0.003
OPUS_TASKS=5     # × ~$0.015

ESTIMATED_COST=$(echo "scale=4; ($HAIKU_TASKS * 0.001) + ($SONNET_TASKS * 0.003) + ($OPUS_TASKS * 0.015)" | bc)
Log: "Estimated cost: $${ESTIMATED_COST}"
```

## Implementation Notes

### Cursor/Claude Code Integration

When running as a Cursor subagent:

```
1. Check skill tier from SKILL.md frontmatter
2. Set subagent model parameter:
   Task(subagent_type, model="claude-sonnet-4-6", ...)
3. Log tier selection for audit
```

### Compatibility

- All tiers support the same tools and capabilities
- Output quality is equivalent; only cost/latency differ
- Context window varies: Haiku < Sonnet < Opus

## History

- v1.0 — Initial protocol (inspired by CCGS model tier assignment)
