# Research Gate Protocol

<!-- source: skills/_shared/protocols/research-gate.md -->
<!-- This is the single source of truth for the Research Gate flow -->

When a plan scores below 9.0, the Research Gate activates to improve the plan quality.

## Research Gate Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ RESEARCH GATE │
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
│ 5. RE-PLAN with new insights, then re-score │
│ │
└─────────────────────────────────────────────────────────────────────┘
```

## Research Gate Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| **Plan Score** | Score < 9.0 | Activate Research Gate |
| **Consecutive Failures** | ≥ 2 failures | Force Research Gate |
| **Unknown Topics** | No prior knowledge | Activate Research Gate |

## Research Synthesis Guidelines

**GOOD Synthesis:**
- "JWT + refresh token rotation is the recommended auth pattern for SPAs"
- "React Server Components reduce client-side JS by 30-50%"

**BAD Synthesis:**
- "Found 15 articles about auth"
- "Many options exist for state management"

## After Research

1. **Re-plan** with synthesized insights
2. **Re-score** against 9-criteria rubric
3. **If still < 9.0**, iterate (max 3 times)
4. **If still failing**, escalate to user with findings

---

*Source: skills/_shared/protocols/research-gate.md*
*Synced to: AGENTS.md, CLAUDE.md*
