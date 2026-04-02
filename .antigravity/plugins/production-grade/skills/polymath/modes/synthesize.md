# Synthesize Mode — Holistic Reflection

Load this mode when the user wants to understand the big picture of what was built, plan next iterations, or extract learnings from completed work.

## Entry Behavior

Read broadly before presenting — parallel reads across the entire workspace:

```
Read(".forgewright/product-manager/BRD/brd.md")
Read(".forgewright/solution-architect/working-notes.md")
Read(".forgewright/qa-engineer/test-plan.md")
Read(".forgewright/security-engineer/...")
Read(".forgewright/code-reviewer/review-report.md")
Read(".forgewright/sre/...")
Glob("services/**/*")
Glob("frontend/**/*")
Glob("docs/**/*")
```

Also read polymath's own context:
```
Read(".forgewright/polymath/context/decisions.md")
Read(".forgewright/polymath/context/domain-research.md")
```

## Synthesis Frameworks

### "What Did We Build?" Summary

For when the user wants a holistic view of the completed project:

```python
notify_user with markdown options:
  "question": "Here's the full picture:\n\n"
    "**Product:** [name — one-line description]\n"
    "**Architecture:** [pattern, tech stack, key decisions]\n"
    "**Scale:** [N] services, [N] endpoints, [N] tests passing\n"
    "**Security:** [N] findings found, [N] resolved, [N] remaining\n"
    "**Infrastructure:** [cloud, estimated cost, deployment strategy]\n"
    "**Docs:** [what's documented]\n\n"
    "Original vision vs. what was built: [comparison]",
  "header": "Project Synthesis",
  "options": [
    {"label": "What should we improve next? (Recommended)", "description": "Prioritized iteration roadmap"},
    {"label": "Deep dive into a specific area", "description": "Explore one part in detail"},
    {"label": "How does this compare to competitors?", "description": "Position against market"},
    {"label": "What are the risks going forward?", "description": "Operational and business risks"},
    {"label": "Chat about this", "description": "Free-form input"}
  ],
  "multiSelect": false
}])
```

### Iteration Planning

For when the user wants to plan what's next:

1. **Review original scope** — what was planned vs. what was delivered
2. **Collect signals** — code review findings, security findings, PM open questions, SRE concerns
3. **Research current market** — search_web for recent developments since project started
4. **Prioritize** — group into: quick wins, strategic investments, technical debt, new features
5. **Present as prioritized roadmap with options**

### Lessons Learned

For when the user wants to extract insights:

1. **What worked well** — patterns, tools, decisions that paid off
2. **What was harder than expected** — underestimated complexity, surprises
3. **What would we do differently** — with hindsight
4. **Reusable patterns** — things that should become skills or templates

## Output

Write to `context/synthesis.md`:

```markdown
# Project Synthesis — [project name]
Generated: [date]

## What Was Built
[Holistic summary — product, architecture, scale]

## Original Vision vs. Reality
- Planned: [what was envisioned]
- Delivered: [what actually shipped]
- Delta: [what changed and why]

## Strengths
- [What's particularly well-built]

## Known Gaps
- [What needs attention]

## Recommended Next Steps
1. [Highest priority]
2. [Second priority]
3. [Third priority]

## Market Position
- [How this compares to competitors based on research]
```

This file persists — future polymath sessions can read it to maintain continuity across iterations.
