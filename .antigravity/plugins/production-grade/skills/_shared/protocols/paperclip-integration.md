---
name: paperclip-integration
description: >
  Protocol for Forgewright skills operating under Paperclip orchestration.
  Defines how skills detect, interact with, and report to Paperclip's
  ticket system, heartbeat cycle, and budget controls.
version: 1.0.0
---

# Paperclip Integration Protocol

## Overview

[Paperclip](https://github.com/paperclipai/paperclip) is an **optional** business orchestration layer that manages AI agents as a company. When present, Forgewright skills operate within Paperclip's ticket-based workflow instead of direct prompts.

**Paperclip manages WHAT to do. Forgewright manages HOW to do it.**

## Detection

At session start, check for Paperclip context:

```
Indicators that Paperclip is managing this session:
1. Ticket reference in prompt: "#42", "ticket:", "CLIP-", "[paperclip]"
2. Heartbeat context: "heartbeat", "scheduled run", "autonomous"
3. Budget mention: "budget remaining", "cost limit"
4. Agent identity: "you are Agent-1", "assigned to you"
```

If detected → apply Paperclip-Aware Behavior below.
If not detected → normal Forgewright operation (no changes).

## Paperclip-Aware Behavior

When operating under Paperclip orchestration, skills MUST follow these additional rules:

### 1. Ticket Scope Discipline

```
MUST:
- Stay within ticket scope — do not expand beyond the assigned task
- Complete the ticket fully before requesting new work
- Report blockers explicitly rather than working around them

MUST NOT:
- Create new features not in the ticket
- Refactor unrelated code (unless ticket says "refactor")
- Ask open-ended questions (Paperclip agents run autonomously)
```

### 2. Cost Awareness

```
MUST:
- Prefer cheaper operations first (read before write, search before scan)
- Use CSS extraction over LLM extraction (web-scraper skill)
- Batch related operations to minimize API calls
- Skip optional enhancements when budget is mentioned as tight

MUST NOT:
- Run full pipeline when ticket requires single skill
- Generate unnecessary artifacts (only what the ticket asks for)
- Use Research mode expansively unless ticket is research-specific
```

### 3. Autonomous Operation

When running under Paperclip heartbeat (no human in the loop):

```
Decision Protocol:
- If ambiguous → pick the most conservative approach
- If blocked → report blocker in commit message, move to next ticket
- If test fails → fix up to 3 times, then report as blocked
- If security concern → STOP, report, do NOT proceed

Engagement Mode:
- Default to EXPRESS mode (fully autonomous, no user approval needed)
- Skip all notify_user calls (no human is watching)
- Log decisions in commit messages instead
```

### 4. Structured Output

Format all output for Paperclip consumption:

```markdown
## Ticket: [ticket-id]
**Status:** completed | blocked | needs-review
**Changes:** [list of files modified]
**Tests:** passed | failed (details)
**Cost estimate:** [if trackable]
**Blockers:** [if any]
**Next:** [suggested follow-up tickets]
```

### 5. Commit Message Convention

When operating under Paperclip, use this commit format:

```
[CLIP-{ticket-id}] {type}: {description}

Ticket: {ticket-id}
Agent: {agent-name}
Cost: {estimated-api-cost}
```

Example:
```
[CLIP-42] feat: add payment API endpoint

Ticket: CLIP-42
Agent: openclaw-1
Cost: $0.34
```

## Skill-Specific Overrides

| Skill | Normal Behavior | Paperclip Override |
|-------|----------------|-------------------|
| **Orchestrator** | Classify → present plan → wait for approval | Classify → execute immediately (Express mode) |
| **PM** | Generate full BRD with user input | Scope from ticket description only |
| **QA** | Ask about test strategy | Auto-select based on codebase context |
| **Security** | Report findings, ask severity | Auto-fix LOW/MEDIUM, report HIGH/CRITICAL as blocker |
| **Code Reviewer** | Present findings for discussion | Auto-fix style issues, report architecture concerns |
| **UI Designer** | Present 2-3 style options | Auto-select highest Fit Score (Express mode) |
| **Polymath** | Interactive exploration | Bounded research, max 5 min per topic |

## Budget Guard

When Paperclip provides budget context:

```
IF budget_remaining < 20%:
  → Switch to minimal operations
  → Skip optional skills (Code Reviewer, Technical Writer)
  → Use CSS extraction only (no LLM)
  → Report "budget-warning" in output

IF budget_remaining < 5%:
  → Complete current ticket only
  → No new research or exploration
  → Report "budget-critical" in output
```

## Integration with Parallel Dispatch

When Paperclip assigns multiple tickets to the same agent:

1. Paperclip decides WHICH tickets to assign (business priority)
2. Forgewright's Parallel Dispatch decides HOW to execute them (git worktrees)
3. No conflict — Paperclip prioritizes, Forgewright parallelizes

```
Paperclip assigns: [CLIP-42, CLIP-43, CLIP-44]
Forgewright checks: Can these run in parallel? (no shared files?)
  → Yes: git worktree per ticket → merge when all complete
  → No: sequential execution in priority order
```

## Fallback

If Paperclip server is unreachable during a heartbeat:

```
1. Complete current in-progress work
2. Commit with message: "[CLIP-?] wip: paperclip unreachable, saving progress"
3. Exit gracefully — Paperclip will retry on next heartbeat
```
