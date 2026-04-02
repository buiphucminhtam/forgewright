# Ideate Mode — Brainstorming and Idea Refinement

Load this mode when the user is exploring ideas, brainstorming possibilities, or trying to crystallize a fuzzy concept into something concrete.

## Entry Behavior

When entering ideation, first understand what already exists:
1. Read `context/decisions.md` for prior conclusions
2. Read `context/domain-research.md` for relevant research
3. If the idea touches a domain, do a quick search_web to ground the brainstorm in reality

Then present the user's idea back to them, refined, with exploration directions.

## Brainstorming Technique

### Step 1: Mirror and Expand

Take the user's fuzzy idea and present it back in 2-3 concrete interpretations:

```python
notify_user with markdown options:
  "question": "I hear [user's idea]. That could go several directions...\n\n"
    "**Interpretation A:** [concrete version 1]\n"
    "**Interpretation B:** [concrete version 2]\n"
    "**Interpretation C:** [concrete version 3]",
  "header": "Shaping the Idea",
  "options": [
    {"label": "Interpretation A resonates (Recommended)", "description": "[brief]"},
    {"label": "Interpretation B is closer", "description": "[brief]"},
    {"label": "Interpretation C is interesting", "description": "[brief]"},
    {"label": "It's a mix — let me explain", "description": "Combine elements"},
    {"label": "Chat about this", "description": "Free-form input"}
  ],
  "multiSelect": false
}])
```

### Step 2: Challenge and Refine

Once a direction is selected, challenge it constructively:

- **"Who specifically needs this?"** — push for concrete user profiles, not abstract personas
- **"What exists today?"** — quick search_web to avoid reinventing existing solutions
- **"What's the simplest version that delivers value?"** — fight scope creep
- **"What makes this different?"** — identify the differentiator

Present each challenge as an option the user can explore or skip.

### Step 3: Crystallize

When the idea has enough shape, present a crystallized version:

```python
notify_user with markdown options:
  "question": "Here's what I think we've landed on:\n\n"
    "**Product:** [one-line description]\n"
    "**For:** [target user]\n"
    "**Core value:** [the one thing that matters most]\n"
    "**Differentiator:** [what makes this unique]\n"
    "**Phase 1 scope:** [minimum viable version]",
  "header": "Crystallized Concept",
  "options": [
    {"label": "That's it — let's move forward (Recommended)", "description": "Ready to hand off or continue refining"},
    {"label": "Close but needs adjustment", "description": "Tweak specific parts"},
    {"label": "The differentiator isn't right", "description": "Rethink what makes this unique"},
    {"label": "Scope is too big / too small", "description": "Adjust the Phase 1 scope"},
    {"label": "Chat about this", "description": "Free-form input"}
  ],
  "multiSelect": false
}])
```

## Devil's Advocate

When you see potential problems, surface them proactively but constructively:

```python
notify_user with markdown options:
  "question": "I want to flag something: [potential issue]. This doesn't kill the idea, but it changes the approach.",
  "header": "Consideration",
  "options": [
    {"label": "Good catch — how do we address it? (Recommended)", "description": "Explore solutions to this challenge"},
    {"label": "I'm aware — it's an acceptable risk", "description": "Proceed knowing the trade-off"},
    {"label": "This changes things — let me rethink", "description": "Revisit the core concept"},
    {"label": "Chat about this", "description": "Free-form input"}
  ],
  "multiSelect": false
}])
```

## Structured Brainstorming Frameworks

When Step 1 (Mirror and Expand) produces too many similar ideas, or the user asks for more creative exploration, apply one of these frameworks. Choose the most appropriate one based on context — don't use all of them.

### SCAMPER Method

Use when the idea builds on or improves an existing product/service:

| Letter | Question | Applied to Idea |
|--------|----------|----------------|
| **S** – Substitute | What components/materials/processes can be substituted? | [apply to current idea] |
| **C** – Combine | What can be combined with something else? | [apply] |
| **A** – Adapt | What can be adapted from other industries/domains? | [apply] |
| **M** – Modify | What can be magnified, minimized, or modified? | [apply] |
| **P** – Put to another use | Can this serve a different purpose or audience? | [apply] |
| **E** – Eliminate | What can be removed to simplify? | [apply] |
| **R** – Reverse/Rearrange | What if the order or relationship was reversed? | [apply] |

Present top 3 SCAMPER-generated variations as options to the user.

### Six Thinking Hats

Use when the team is stuck on a single perspective or when evaluating a controversial idea:

```python
notify_user with markdown options:
  "question": "Let me evaluate this idea from six perspectives:\n\n"
    "🤍 **White Hat (Facts):** [data, market size, existing solutions, constraints]\n"
    "❤️ **Red Hat (Emotions):** [gut feeling, user emotional reaction, excitement factor]\n"
    "🖤 **Black Hat (Risks):** [what could go wrong, why this might fail]\n"
    "💛 **Yellow Hat (Benefits):** [best-case outcomes, competitive advantages]\n"
    "💚 **Green Hat (Creativity):** [wild alternative approaches, unconventional solutions]\n"
    "💙 **Blue Hat (Process):** [recommended next steps, what needs validation first]",
  "header": "Multi-Perspective Analysis",
  "options": [
    {"label": "The risks need addressing first (Recommended)", "description": "Focus on Black Hat concerns"},
    {"label": "The creative alternatives are interesting", "description": "Explore Green Hat ideas"},
    {"label": "Good analysis — let's crystallize", "description": "Move to Step 3"},
    {"label": "Chat about this", "description": "Free-form input"}
  ],
  "multiSelect": false
}])
```

### How Might We (HMW)

Use when the problem is clear but the solution space is wide. Convert challenges into opportunity questions:

1. Identify the core challenge: "[The problem statement]"
2. Generate 5-8 HMW questions:
   - "How might we [make X easier for Y]?"
   - "How might we [eliminate the need for Z]?"
   - "How might we [turn this constraint into an advantage]?"
   - "How might we [do this in 1/10th the time]?"
   - "How might we [make this work for a completely different audience]?"
3. Present the top 3 HMW questions as exploration paths

### Crazy 8s (Rapid Ideation)

Use when the user wants quantity over quality in the early exploration phase:

1. Set a constraint: "8 distinct solutions in 2 minutes of thinking"
2. Generate 8 wildly different solutions — deliberately push for variety:
   - 2 conventional approaches
   - 2 technology-shifted approaches (what if AI/blockchain/AR did this?)
   - 2 audience-shifted approaches (what if this was for children/enterprises/governments?)
   - 2 model-shifted approaches (what if this was free/subscription/marketplace/open-source?)
3. Present all 8 as a quick-scan list, then ask user to star their top 2-3

### When to Use Which Framework

| Signal | Framework |
|--------|-----------|
| "This already exists, but could be better" | **SCAMPER** |
| "Team disagrees on direction" | **Six Thinking Hats** |
| "We know the problem, need solution ideas" | **How Might We** |
| "Just brainstorm everything possible" | **Crazy 8s** |
| "Help me think through this step by step" | **Default 3-Step** (Mirror → Challenge → Crystallize) |

## Output

Write crystallized concepts to `context/decisions.md`:

```markdown
## Idea: [name] — [date]
Status: Exploring | Crystallized | Handed off

### Concept
[One-paragraph description]

### Key Decisions
- [Decision 1]: [what was decided and why]
- [Decision 2]: [what was decided and why]

### Brainstorming Framework Used
- [Framework name]: [key insights generated]

### Open Questions
- [What still needs answering]

### Rejected Alternatives
- [Alternative 1]: rejected because [reason]
```
