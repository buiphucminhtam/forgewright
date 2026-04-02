---
name: skill-maker
description: >
  Creates and improves Forgewright skills through interview, writing, testing,
  and iteration. Use when user asks to create, improve, or audit skills.
  Triggers on: "make a skill", "build a skill", "create a skill for...",
  "improve this skill", "audit skills", "skill quality check".
  Routed via the production-grade orchestrator.
---

# Skill Maker

## Protocols

!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly. Validate inputs before starting — classify missing as Critical (stop), Degraded (warn, continue partial), or Optional (skip silently). Use parallel tool calls for independent reads. Use view_file_outline before full Read.

## Overview

End-to-end skill creation and improvement pipeline. Interviews the user, writes the SKILL.md, tests it against real prompts, iterates based on feedback, and installs. Also supports auditing existing skills for quality.

## When to Use

- User asks to create a new skill or plugin
- User describes a reusable workflow that should be a skill
- User says "make a skill", "build a skill", "I need a skill for..."
- User asks to improve, audit, or review existing skills
- NOT for: one-time edits to an existing skill (just edit the file directly)

## Process Flow

```
Phase 1: Interview → Phase 2: Write SKILL.md → Phase 3: Test Cases
    → Phase 4: Evaluate & Iterate → Phase 5: Install → Phase 6: Audit (optional)
```

---

## Phase 1: Interview (Quick)

Ask 3-4 questions using notify_user, one at a time:

1. **What does this skill do?** — Core purpose in one sentence
2. **When should it trigger?** — Specific words, patterns, or situations
3. **What's the workflow?** — Steps the skill should follow (linear, loop, decision tree?)
4. **Skill type?** — Options: Technique (steps to follow), Pattern (mental model), Reference (docs/API guide), Workflow (multi-phase process)

If the current conversation already contains a workflow the user wants to capture, extract answers from the conversation history first — the tools used, the sequence of steps, corrections the user made. The user may need to fill gaps, but don't re-ask what's already obvious.

---

## Phase 2: Write SKILL.md

### Writing Philosophy

**Explain WHY, not just WHAT.**

Today's LLMs are smart. They have good theory of mind and when given a good harness can go beyond rote instructions. Rather than writing oppressively constrictive MUSTs and NEVERs, explain the reasoning so the model understands why something matters. This produces more robust, generalizable behavior.

**Yellow flags in your writing:**
- Excessive `MUST`, `ALWAYS`, `NEVER` in ALL CAPS — reframe as explanations
- Overly rigid structures — add flexibility language
- Rules without rationale — add "because..." after each rule
- Skill only works for the specific examples tested — generalize the patterns

**Good vs Bad:**
```
❌ BAD:  "You MUST ALWAYS use try-catch. NEVER use raw promises."
✅ GOOD: "Wrap async operations in try-catch because unhandled rejections
         crash Node.js silently. Raw promises lose stack traces, making
         debugging painful."
```

### Anatomy of a Skill

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic tasks
    ├── references/ - Docs loaded into context as needed
    └── phases/     - Sub-phases for complex multi-step skills
```

### Progressive Disclosure (3 Levels)

Skills use a three-level loading system to manage context efficiently:

1. **Metadata** (name + description) — Always in context (~100 words). This is the primary trigger mechanism.
2. **SKILL.md body** — In context when skill triggers (<500 lines ideal)
3. **Bundled resources** — Loaded on-demand (unlimited size)

If SKILL.md approaches 500 lines, add hierarchy: move detailed content to `references/` or `phases/` with clear pointers about when to read them.

### Frontmatter Rules

```markdown
---
name: skill-name        # kebab-case, letters/numbers/hyphens only
description: >
  Use when [triggering conditions]. Include specific trigger phrases,
  contexts, and adjacent topics. Be slightly "pushy" — the model tends
  to under-trigger, so err toward broader matching.
---
```

**Description is the primary trigger mechanism.** It determines whether the model invokes the skill. Include:
- What the skill does
- Specific trigger phrases and contexts
- Adjacent topics that should also trigger it
- Never summarize the workflow — that goes in the body

### Structure Template

```markdown
---
name: skill-name
description: Use when [triggering conditions]
---

# Skill Name

## Protocols
[Protocol injection lines — cat shared protocols]

## Overview
Core principle in 1-2 sentences. Why this skill exists.

## When to Use
Bullet list with symptoms and use cases.

## Process Flow (if multi-step)
Small inline flowchart for non-obvious decisions.

## [Core Content]
Steps, patterns, or reference material.
Explain WHY each step matters, not just WHAT to do.

## Common Mistakes
Table of mistake → fix pairs.
```

### Quality Rules

- One excellent example beats many mediocre ones
- Flowcharts ONLY for non-obvious decision points
- Keep under 500 lines for standard skills (add references/ for more)
- Use active voice, verb-first naming
- Include keywords for discoverability (error messages, symptoms, tool names)
- Every rule should have a "because..." rationale

**Present the SKILL.md to the user and ask for approval** using notify_user before proceeding.

---

## Phase 3: Test Cases

After writing the skill draft, create 2-3 realistic test prompts — the kind of thing a real user would actually say.

```json
{
  "skill_name": "example-skill",
  "test_cases": [
    {
      "id": 1,
      "prompt": "User's task prompt — realistic, not contrived",
      "expected_behavior": "Description of what should happen",
      "success_criteria": [
        "Criterion 1 — objectively verifiable",
        "Criterion 2 — objectively verifiable"
      ]
    }
  ]
}
```

**Good test cases are:**
- Realistic — what a real user would actually say
- Diverse — cover different aspects of the skill
- Substantive — complex enough that the skill adds clear value
- Verifiable — success criteria can be objectively checked

Share them with the user: "Here are a few test cases I'd like to try. Do these look right, or do you want to add/change any?"

Save test cases to `skills/<skill-name>/evals/test-cases.json`.

---

## Phase 4: Evaluate & Iterate

### Running Tests

For each test case, mentally walk through the skill with the prompt:
1. Read the prompt as if you were the AI receiving it
2. Follow the skill instructions step by step
3. Check each success criterion
4. Note where the skill produced good/bad guidance

### Improvement Principles

1. **Generalize from feedback.** Skills will be used across many different prompts. If you're fixing something for a specific test case, make sure the fix generalizes. Rather than adding fiddly overfitting changes, try different metaphors or patterns.

2. **Keep the skill lean.** Remove things that aren't pulling their weight. If instructions are making the model waste time on unproductive steps, cut them.

3. **Explain the why.** Try hard to explain the reasoning behind every instruction. If you find yourself writing ALWAYS or NEVER in all caps, that's a yellow flag — reframe and explain the reasoning instead.

4. **Look for repeated work.** If every test case would result in the model writing the same utility script or taking the same setup steps, bundle that script in `scripts/` or add it to the skill instructions. Save every future invocation from reinventing the wheel.

### Iteration Loop

```
Write/Update SKILL.md
    → Run test cases (mental walkthrough or actual execution)
    → Review results against success criteria
    → Identify issues: WHY did it fail?
    → Apply improvements (generalize, don't overfit)
    → Repeat until satisfied (usually 2-3 iterations)
```

---

## Phase 5: Install

Place the generated SKILL.md directly in the project's skills directory:

```
skills/
└── <skill-name>/
    ├── SKILL.md
    ├── evals/
    │   └── test-cases.json
    └── references/        (optional)
        └── detailed-docs.md
```

The skill is immediately available for use — Antigravity loads skills directly from the `skills/` directory. No packaging or marketplace registration needed.

1. Create the skill directory: `mkdir -p skills/<skill-name>/`
2. Write the SKILL.md to `skills/<skill-name>/SKILL.md`
3. For complex skills with phases, create sub-files: `skills/<skill-name>/phases/*.md`
4. Report to user: `✓ Skill "<skill-name>" installed to skills/<skill-name>/SKILL.md`

### Create Repo & Push (Optional)

If the user wants to share the skill publicly:

1. Create a standalone directory for the skill
2. `git init` in the skill directory
3. `git add -A && git commit -m "Initial release: <skill-name> skill v1.0.0"`
4. `gh repo create <skill-name>-skill --public --source . --push`
5. If `gh` auth fails, guide user through `gh auth login`

---

## Phase 6: Skill Quality Audit

When asked to audit existing skills, apply this checklist to each skill:

### Quality Checklist

| # | Check | Score |
|---|-------|-------|
| 1 | **Description triggers correctly** — includes trigger phrases, contexts, adjacent topics | 0-2 |
| 2 | **Explains WHY** — rules have rationale, not just prescriptive MUSTs | 0-2 |
| 3 | **Progressive disclosure** — under 500 lines, references/ for overflow | 0-2 |
| 4 | **Practical examples** — at least 1 real-world example, not contrived | 0-2 |
| 5 | **Lean instructions** — no bloat, every paragraph earns its place | 0-2 |
| 6 | **Consistent structure** — follows the template (Overview, When, Flow, Content, Mistakes) | 0-1 |
| 7 | **Keywords for discoverability** — error messages, symptoms, tool names in content | 0-1 |

**Score guide:** 0 = missing/poor, 1 = adequate, 2 = excellent

**Grade:**
- 10-12: A — Production-ready, exemplary
- 7-9: B — Good, minor improvements possible
- 4-6: C — Needs improvement, specific issues identified
- 0-3: D — Major rewrite needed

### Audit Output

For each skill audited, produce:

```
━━━ Skill Audit: <skill-name> ━━━━━━━━━━━━━━━━━
Score: 8/12 (B)
Issues:
  ⚠ Description too narrow — missing adjacent triggers
  ⚠ Phase 3 rules lack rationale (WHY)
Fixes applied:
  ✓ Expanded description with trigger keywords
  ✓ Added "because..." to 3 rules in Phase 3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Common Quality Issues (in priority order)

| Issue | Impact | Fix Pattern |
|-------|--------|-------------|
| MUST/ALWAYS/NEVER overuse | Model becomes rigid, fails on edge cases | Replace with "because..." rationale |
| Description too narrow | Under-triggering, skill never activates | Add adjacent topics, synonyms, user phrases |
| No examples | Model guesses format, inconsistent output | Add 1-2 concrete input→output examples |
| 500+ lines, no hierarchy | Dilutes important instructions | Move detail to references/, keep core lean |
| Rules without WHY | Model follows letter but misses spirit | Add reasoning after each significant instruction |
| Duplicate content | Wastes context window | Consolidate into shared protocol or reference |

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Description summarizes workflow | Description = triggering conditions ONLY. "Use when..." |
| Special chars in name | Letters, numbers, hyphens only. No parentheses. |
| Skill too verbose (500+ lines) | Cut ruthlessly. Move to references/. One example, not five. |
| Missing keywords for discovery | Add error messages, symptoms, tool names in the content |
| Not placing in skills/ directory | Skills go in `skills/<name>/SKILL.md` for auto-loading |
| Overfitting to test cases | Generalize patterns, explain WHY, not just WHAT |
| All caps instructions (MUST/NEVER) | Yellow flag — reframe as explanations with rationale |
