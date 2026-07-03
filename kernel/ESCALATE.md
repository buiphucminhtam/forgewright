# EASY / HARD Routing

Tag each task step during [kernel/SOLVE.md](file:///Users/buiphucminhtam/GitHub/forgewright/kernel/SOLVE.md) planning.

## Classification Checklist
A step is **HARD** if ANY box is checked (objective slots first, judgment last):
- [ ] Changes a public interface, schema, or cross-module contract.
- [ ] Concurrency, locking, or asynchronous ordering is involved.
- [ ] Security-sensitive context (auth, secrets, injection surface, permissions).
- [ ] An algorithm must be designed (not copied/adapted from an existing in-repo pattern).
- [ ] Requirement is ambiguous even after one clarifying question.
- [ ] The Stuck rule fired on this step.

Otherwise, the step is **EASY**.

## Execution Protocol
- **EASY**: Execute the step yourself (`thinking_level: MINIMAL`).
- **HARD**: Run the escalation command:
  ```bash
  bash scripts/lite/escalate.sh "<step + minimal context>"
  ```
  *(This spawns the strong model and returns its answer; you must integrate and verify it).*

## Agreement-Based Cascade Rules
When a task is escalated to a stronger model:
1. Verify the generated output matches all constraints and local coding patterns.
2. If the stronger model's output introduces any ambiguity or contradicts other parts of the plan, run another escalation to cross-validate or ask the user for confirmation.
3. Integrate and run a `VERIFY` check immediately. Never merge unverified code from escalated models.

## Budget Limit
- **Max 3 escalations per run/session.**
- If you exceed the budget, do your best and mark the output as `LOW-CONFIDENCE` and escalate to the user.
