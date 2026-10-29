# Middleware 01 — SessionData

> **Source:** `skills/_shared/protocols/session-lifecycle.md` §Steps 1-3
> **Hook:** `before_skill()` when matching project context is needed
> **Purpose:** Reconcile current task, ownership and relevant saved context

## Execution

1. Classify the request and effort before expanding onboarding or context work.
2. Read the explicit workspace's task state and relay ownership. Reconcile saved
   progress with current files and matching receipts before choosing the next
   action. An old `in_progress` log does not prove another executor is stopped.
3. Reuse relevant profile facts; refresh material stale assumptions only. A
   missing profile or its age alone does not require full project onboarding.
4. Resume authorized unfinished work directly. Ask only when a material scope,
   ownership or irreversible-action ambiguity remains after inspection.
5. Load trends and old logs only when needed for the user's task. Missing
   optional session data does not block execution.

## Outputs

- Project fingerprint loaded into context
- Session state available for all subsequent middleware
- Task-plan truth remains `<workspace>/.agent/state/current-task.json` where
  that contract is active. Derived task.md/session logs cannot supersede it.

## Failure Handling

- If project-profile.json missing → WARN, continue with empty profile (new project)
- If session-log.json missing → WARN, treat as first session
- Never block pipeline due to session data issues
