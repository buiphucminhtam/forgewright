# Self-Healing Execution Protocol (Autonomous Sandbox)

> **Purpose:** For Non-Technical User pipelines, the AI must act as an autonomous sandbox. The user cannot and will not fix compilation errors, dependency conflicts, or configuration issues in the terminal. The AI must resolve these internally.

## When to Apply
Whenever an execution skill (`Software Engineer`, `Frontend Engineer`, `DevOps`, `QA Engineer`, `Debugger`) executes a terminal command (e.g., compilation, testing, deployment) and receives a non-zero exit code or stderr output indicating failure.

## The Self-Healing Loop

If a command fails, **DO NOT STOP AND ASK THE USER FOR HELP.**
**Pre-Healing Checkpoint:** BEFORE attempting fix #1, you MUST create a safe rollback point by running `git commit -am "Pre-healing checkpoint"`.

You must execute the following loop up to **5 times** autonomously:

1. **Read the Error:** Capture the stderr/stdout from the terminal execution. Use tools to read logs if they are long.
2. **Mandatory Web Search (Search-Augmented Healing):** BEFORE attempting any raw code changes or blindly guessing the fix, you MUST use the `search_web` tool to look up the exact error token, error code, or stack trace. 
   - **Search Filter Enforcement:** To prevent search engine hallucinations and finding outdated code, you MUST append `site:github.com/issues OR site:stackoverflow.com after:2024-01-01` to your search query. Only apply patches from recent, verified sources. Gather context on the standard community fix.
3. **Analyze the Root Cause:** Using the search results and logs, identify if it is:
   - A missing dependency (e.g., `Module not found`, `ImportError`).
   - A syntax/type error (e.g., `TS2322`, `SyntaxError`).
   - A configuration mismatch (e.g., `wrong Node version`, `missing environment variable`).
3. **Formulate a Fix:**
   - If missing dependency: run `npm install <package>`, `pip install <package>`, etc.
   - If code error: use file editing tools to patch the specific lines directly.
   - If config issue: create or modify the necessary config files (e.g., `.env`, `tsconfig.json`).
4. **Retry Execution:** Run the exact same command that failed originally.
5. **Verify:** If the command succeeds (exit code 0), the self-healing was successful; proceed with the rest of your plan. If it fails again, increment your attempt counter and go back to step 1.

## Rules of Engagement

- **Zero User Intervention:** You are strictly forbidden from saying "Please run `npm install`" or "I need you to fix this bug" to the user. You must run the fix yourself.
- **Budgeting Limit:** You have a strict budget of **5** self-healing attempts per failure site.
- **Escalation (Auto-Rollback & Escrow):** ONLY if you reach 5 failed attempts, you MUST run `git reset --hard HEAD~1` to revert the codebase to the safe Pre-Healing Checkpoint. **DO NOT present a stack trace to the user.** Instead, generate a highly simplified, non-technical **Escrow Report** (e.g., "We hit a roadblock building the payment system. Option A: Switch to a simpler checkout. Option B: Remove payments for now.").
- **Worktree Isolation:** Always conduct repairs within your active parallel `Worktree` (managed by `Worktree Manager`) so that massive self-healing failures do not corrupt the `main` stable branch.
