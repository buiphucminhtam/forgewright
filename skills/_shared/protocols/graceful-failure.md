# Graceful Failure Protocol

> **Purpose:** Prevents skills from looping on impossible tasks. Provides stuck detection, retry limits, graceful exit, and failure classification.
>
> **⚠️ The self-improvement / research loop is handled by ASIP (self-improving-loop.md). Graceful Failure is for detection and exit — not for research or skill updates.**

## Core Principle

A clear, well-documented failure is MORE VALUABLE than a half-broken success. Users prefer an honest report over an agent that silently loops, burns tokens, and produces garbage output.

## When to Apply

- After any action that doesn't produce the expected result
- When a skill is stuck in a loop (same action, no progress)
- When an approach has been tried and failed
- When a skill hits retry limits

## Anti-Guessing Rules

These universal rules apply to ALL skill execution:

| ❌ Don't say | ✅ Say instead |
|------------|---------------|
| "Let me try a different approach" | "Hypothesis H1 disproved by test output. H2 confirmed by `grep` result. Implementing fix." |
| "Maybe it's a config issue" | "Test output: `PORT=undefined`. Fix: add default in config.ts:14." |
| "I'll assume X is the problem" | "No evidence for X. Writing `test_cause_x.py` to verify." |
| "Let's see if this works" | "Artifact written. Running. Output will tell us." |

## Retry Limits

### Action-Level Retries

```
Max retries per action: 3

Retry 1: Same action, check for typos/errors in parameters
Retry 2: Adjust approach (different selector, different file, different command)
Retry 3: Last attempt with alternative strategy

After 3 retries → STOP this action. Mark as FAILED.
If attempt count >= 2 → delegate to ASIP (self-improving-loop.md) for research gate.
```

### Approach-Level Retries

```
Max approach changes per goal: 2

Approach 1: Primary technique (most likely to work)
Approach 2: Alternative technique (different angle)

After 2 approach changes → delegate to ASIP → if research fails → STOP. Report to user.
```

### Investigation Cycles (multi-step skills like Debugger)

```
Max investigation cycles without new evidence: 3

Cycle 1: Investigate → gather evidence
Cycle 2: Investigate further → must find NEW evidence
Cycle 3: Final attempt → if no new evidence → STOP → escalate

After 3 cycles with no progress → delegate to ASIP → escalate to user.
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

> Inspired by [Superpowers](https://github.com/obra/superpowers) systematic debugging methodology

Watch for these redirections from the user — treat as STOP commands:

| User Signal | What It Means | Required Action |
|-------------|---------------|----------------|
| "Is that not happening?" | Agent assumed without verifying | STOP. Verify assumption with evidence. |
| "Will it show us...?" | Agent skipped evidence gathering | Add diagnostic output. Don't proceed without data. |
| "Stop guessing" | Agent proposing fixes without understanding | STOP. Return to root cause. |
| "Ultrathink this" | Agent treating symptoms, not fundamentals | Step back. First principles. |
| "We're stuck?" (frustrated) | Approach isn't working | STOP. Try completely different strategy. |
| "That's not what I asked" | Agent misunderstood the goal | Clarify before acting. |
| "You already tried that" | Agent in a loop | STOP. Change approach entirely. |
| *Any sign of frustration* | Not systematic enough | Acknowledge. Slow down. Show evidence trail. |

## Graceful Exit Format

When a skill must fail, produce a structured report:

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
1. [Most likely fix]
2. [Alternative approach]
3. [Escalation if needed]
```

## Failure Categories

| Category | Behavior | Example |
|----------|----------|---------|
| **User error** | Report clearly, suggest correction. Do NOT retry. | "Request references a file that doesn't exist." |
| **Environment issue** | **FOR NON-TECH USERS (Autonomous Sandbox):** DO NOT notify the user. Enter a Self-Healing Loop. Budget: 5 attempts. If all fail → Auto-Rollback + Escrow Report. | "Build fails due to missing dependency — try npm install." |
| **Knowledge gap** | Write verification artifact. If artifact impossible → escalate to user. | "Cannot determine correct API endpoint — write test to verify." |
| **Impossible request** | Explain why impossible. Suggest alternative. | "Cannot delete production DB in review mode — use migration instead." |
| **Scope exceeded** | Report what was completed, what remains. | "Completed 3 of 5 services. Service D requires credentials." |

## Integration with Existing Protocols

- **ASIP (self-improving-loop.md):** Graceful Failure handles stuck detection and retry limits. ASIP handles the research gate (2+ failures) and skill self-improvement. After 2 failed attempts, Graceful Failure delegates to ASIP for mandatory research.

- **circuit-breaker.md:** Circuit Breaker provides stateful, system-wide mechanism for failing components. Graceful Failure handles individual action retries; Circuit Breaker handles systemic failures.

- **quality-gate.md:** Quality Gate runs AFTER skill success. Graceful Failure runs DURING skill execution. On failure → skip quality gate, write failure report.

- **session-lifecycle.md:** Session hooks (`ERROR`) capture failures for cross-session tracking.

- **input-validation.md:** Input validation catches issues BEFORE execution. Graceful Failure catches issues DURING execution.

- **brownfield-safety.md:** Failure during brownfield changes → trigger safety rollback before reporting failure.

## Skill Implementation

Every skill MUST include in its Protocols section:

```
!`cat skills/_shared/protocols/graceful-failure.md 2>/dev/null || true`
```

And follow these rules:

1. **Before each multi-step phase:** Set a progress checkpoint. If no advancement after retry limits, exit gracefully.
2. **On error:** Classify the error and respond accordingly. After 2 failed attempts → delegate to ASIP for research gate.
3. **On success but wrong result:** Count as a failed attempt toward retry limits.
4. **Always preserve partial results:** Even if the overall task fails, save useful outputs.
