# Graceful Failure Protocol

**Prevents skills from wasting tokens on impossible tasks and ensures failures are informative. Applies to ALL skills. Inspired by Page Agent's ReAct loop design: "It is ok to fail. Trying too hard can be harmful."**

## Core Principle

A clear, well-documented failure is MORE VALUABLE than a half-broken success. Users prefer an honest report of what went wrong over an agent that silently loops, burns tokens, and produces garbage output.

## When to Apply

- After any action that doesn't produce the expected result
- When a skill is stuck in a loop (same action, no progress)
- When an approach has been tried and failed
- When user's request is ambiguous, impossible, or requires information the agent doesn't have

## Retry Limits

### Action-Level Retries

```
Max retries per action: 3

Retry 1: Same action, check for typos/errors in parameters
Retry 2: Adjust approach (different selector, different file, different command)
Retry 3: Last attempt with alternative strategy

After 3 retries → STOP this action. Mark as FAILED. Move to next step or escalate.
```

### Approach-Level Retries

```
Max approach changes per goal: 2

Approach 1: Primary technique (most likely to work)
Approach 2: Alternative technique (different angle)

After 2 approach changes → STOP. Report to user with findings.
```

### Investigation Cycles (for multi-step skills like Debugger)

```
Max investigation cycles without new evidence: 3

Cycle 1: Investigate → gather evidence
Cycle 2: Investigate further → must find NEW evidence
Cycle 3: Final attempt → if no new evidence → STOP

After 3 cycles with no progress → escalate to user.
```

## Stuck Detection

A skill is **stuck** when ANY of these patterns are detected:

| Pattern | Detection Rule | Action |
|---------|---------------|--------|
| **Same action loop** | Same tool call with same parameters 2+ times | STOP immediately. Report: "Repeated action without progress." |
| **Oscillation** | Alternating between 2 actions (A→B→A→B) | STOP after 2nd cycle. Report: "Oscillating between approaches." |
| **No progress** | 3+ steps without any measurable progress toward goal | STOP. Report current state and what was tried. |
| **Error cascade** | 3+ consecutive errors from different actions | STOP. Report: "Multiple failures suggest a systemic issue." |
| **Token waste** | Investigation consuming >50% of expected budget with <25% progress | WARN user. Offer: continue or stop. |

## Human Partner Signals

> **Inspired by [Superpowers](https://github.com/obra/superpowers) systematic debugging methodology**

**Watch for these redirections from the user — they indicate the agent is off-track.** These signals should be treated as a STOP command, equivalent to stuck detection.

| User Signal | What It Means | Required Action |
|-------------|---------------|-----------------|
| "Is that not happening?" | Agent assumed without verifying | STOP. Verify the assumption with evidence before proceeding. |
| "Will it show us...?" | Agent skipped evidence gathering | Add diagnostic output. Don't proceed without data. |
| "Stop guessing" | Agent is proposing fixes without understanding | STOP. Return to root cause investigation. |
| "Ultrathink this" | Agent is treating symptoms, not fundamentals | Step back. Reconsider the problem from first principles. |
| "We're stuck?" (frustrated) | Agent's approach isn't working | STOP current approach. Try a completely different strategy. |
| "That's not what I asked" | Agent misunderstood the goal | Clarify the goal before taking any further action. |
| "You already tried that" | Agent is in a loop | STOP immediately. Acknowledge the loop. Change approach entirely. |
| *Any sign of frustration or impatience* | Agent is not being systematic enough | Acknowledge. Slow down. Show evidence trail. Ask what the user needs. |

**When ANY of these signals appear:** Treat as if stuck detection triggered. Follow the Graceful Exit Format below.

## Graceful Exit Format

When a skill must fail, it MUST produce a structured failure report:

```markdown
## ❌ Task Failed: [task description]

### What was attempted
- [Step 1: action taken → result]
- [Step 2: action taken → result]
- [Step 3: action taken → result]

### Why it failed
[Root cause if known, or best hypothesis]

### What was learned
[Any useful information gathered during the attempt]

### Recommended user actions
1. [Most likely fix — e.g., "Provide specific file path instead of wildcard"]
2. [Alternative approach — e.g., "Try running locally first to reproduce"]
3. [Escalation — e.g., "This may require manual investigation of X"]
```

## Failure Categories

| Category | Behavior | Example |
|----------|----------|---------|
| **User error** | Report clearly, suggest correction. Do NOT retry. | "Request references a file that doesn't exist." |
| **Environment issue** | **FOR NON-TECH USERS (Autonomous Sandbox):** DO NOT notify the user. You MUST enter a Self-Healing Loop. You have a budget of 5 self-healing attempts. If 5 attempts fail, you MUST perform an Auto-Rollback (`git reset`) and generate a non-technical Escrow Report instead of showing a stack trace. | "Build fails due to missing dependency — try npm install." |
| **Knowledge gap** | Ask user for specific information. Do NOT guess. | "Cannot determine correct API endpoint — please specify." |
| **Impossible request** | Explain why impossible. Suggest alternative. | "Cannot delete production DB in review mode — use migration instead." |
| **Scope exceeded** | Report what was completed, what remains. | "Completed 3 of 5 services. Service D requires credentials not available." |

## Integration with Existing Protocols

- **quality-gate.md:** Quality Gate runs AFTER skill success. Graceful Failure runs DURING skill execution when things go wrong. On failure → skip quality gate, write failure report instead.
- **session-lifecycle.md:** Session hooks (`ERROR`) capture failures for cross-session tracking.
- **input-validation.md:** Input validation catches issues BEFORE execution. Graceful Failure catches issues DURING execution. They are complementary.
- **brownfield-safety.md:** If a failure occurs during brownfield changes → trigger safety rollback before reporting failure.

## Skill Implementation

Every skill MUST include in its Protocols section:

```
!`cat skills/_shared/protocols/graceful-failure.md 2>/dev/null || true`
```

And follow these rules:

1. **Before each multi-step phase:** Set a progress checkpoint. If the phase produces no advancement after the retry limits above, exit gracefully.
2. **On error:** Classify the error (user error, environment, knowledge gap, impossible, scope exceeded) and respond accordingly.
3. **On success but wrong result:** Count as a failed attempt toward retry limits.
4. **Always preserve partial results:** Even if the overall task fails, save any useful outputs (partial code, discovered information, evidence gathered).
