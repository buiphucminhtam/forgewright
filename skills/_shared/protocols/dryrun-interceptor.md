# DryRun Interceptor Protocol

> **Purpose:** Integrates "Global Dry Run" context into the AI Agent's thought loop from the very beginning. Runs as Middleware ③b in the chain. Working in tandem with Guardrail layer to ensure zero side-effects combined with token-efficient behavior.

## When to Apply

- Runs immediately after `② ContextLoader` and before `③ SkillRegistry`.
- ONLY active when `.production-grade.yaml` has `guardrail.mode` set to `dry_run`.

## How It Works

This middleware does **NOT** block operations (that is Guardrail's job). Instead, it **injects explicit operational boundaries** into the Agent's system prompt prior to execution. By doing so, the Agent knows not to waste tokens formulating heavy `write_to_file` commands that will inevitably be blocked.

### The System Prompt Injection

When `guardrail.mode == dry_run`, the Middleware Chain will synthesize and attach the following critical instruction to the AI's persona:

```text
<SYSTEM_MESSAGE>
[CRITICAL] GLOBAL DRY RUN MODE IS ACTIVE.

You are currently operating in a simulated sandbox environment. 
1. DO NOT use explicit modifying tools (e.g., write_to_file, replace_file_content) or destructive run_command calls. 
2. Any attempt to modify files will result in a mocked success (`WARN_DRYRUN_MOCK`), but nothing will be saved to disk.
3. INSTEAD: Analyze the structure, formulate your refactoring logic, and output your changes strictly as a Unified Diff (`.diff` or `.patch`) embedded inside an implementation artifact.
4. If asked to run command, append `--dry-run` or similar verification flags.
5. Your final result MUST be a plan containing the exact `.diff` snippet or `git diff` output.
6. MANDATORY QUALITY LOOP: Before yielding to the user, you MUST self-evaluate your `.diff` using `skills/_shared/protocols/plan-quality-loop.md` with a threshold of 9.0.
7. If your self-score is < 9.0, you MUST NOT return the result to the user. Instead, you MUST trigger the continuous loop:
   - LEARN: Identify weak criteria.
   - RESEARCH: Search the codebase or best practices.
   - IMPROVE SKILL: Append a lesson to your SKILL.md.
   - RE-PLAN: Generate a new `.diff` patch.
   - Repeat this loop strictly until the score is ≥ 9.0.
</SYSTEM_MESSAGE>
```

## Symbiosis with Guardrail

The **DryRun Interceptor (Option B)** and **Guardrail (Option A)** work together to achieve a 10/10 safety and efficiency score:

1. **The Brain (DryRun Interceptor):** Tells the AI *"Don't even try to touch the files, just show me the diff"*. This saves 90% of wasted tokens normally spent trying to force writes.
2. **The Shield (Guardrail):** Sits as a physical barrier. If the AI hallucinates, ignores the prompt, or forgets it is in Dry Run, Guardrail intercepts the API call and blocks it.

## Verification (Self-Evolving Loop)

If a skill completes a `.diff` under Dry Run Mode, it is subjected to the rigid **Plan Quality Loop** embedded in its system prompt with a 9.0 Threshold. 

Dry Run execution explicitly tests:
- **Impact Assess:** Does the diff cleanly avoid breaking dependents (verifiable via ForgeNexus)?
- **Feasibility:** Is the syntax valid for TS/Node compilation?
- **Specificity:** Are the diff line removals/additions unambiguous?

If the Agent scores itself < 9.0, it is forced to self-research, write an improvement to its own `SKILL.md`, and redo the `.diff` computation silently. Only when it reaches $\ge 9.0$ is the output returned to the human reviewer via Middleware ⑥ (QualityGate).
