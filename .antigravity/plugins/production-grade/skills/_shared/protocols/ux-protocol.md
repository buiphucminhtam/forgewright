# UX Protocol — Single Source of Truth

**Every skill in this plugin MUST follow these 6 rules for ALL user interactions.**

## RULE 1: NEVER Ask Open-Ended Questions

**NEVER output text expecting the user to type.** Every user interaction MUST use `notify_user` with numbered predefined options in markdown format. Users read the options and respond with their choice.

**WRONG:** "What do you think?" / "Do you approve?" / "Any feedback?"
**RIGHT:** Use notify_user with 2-4 numbered options + "Chat about this" as last option.

**Format:**
```
Please choose an option:

1. **Option A (Recommended)** — Description
2. **Option B** — Description
3. **Chat about this** — Free-form input
```

## RULE 2: "Chat about this" Always Last

Every interaction MUST have `"Chat about this"` as the last option — the user's escape hatch for free-form typing.

## RULE 3: Recommended Option First

First option = recommended default with `(Recommended)` suffix.

## RULE 4: Continuous Execution

Work continuously until task complete or user intervenes. Never ask "should I continue?" — just keep going.

## RULE 5: Real-Time Progress Updates

Constantly communicate progress via `task_boundary` status updates. Never go silent.
```
━━━ [Phase/Task Name] ━━━━━━━━━━━━━━━━━━━━━━

⧖ Working on [current step]...
✓ Step completed (details)
✓ Step completed (details)

━━━ Complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary: [what was produced]
```

## RULE 6: Autonomy

1. Default to sensible choices — minimize questions
2. Self-resolve issues — debug and fix before asking user
3. Report decisions made, don't ask for permission on minor choices
4. Only use notify_user for major decisions or approval gates
