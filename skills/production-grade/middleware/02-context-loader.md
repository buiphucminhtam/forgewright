# Middleware 02 — ContextLoader

> **Source:** `skills/_shared/protocols/session-lifecycle.md` §Step 4 + memory-manager
> **Hook:** `before_skill()`
> **Purpose:** Search mem0 with task keywords, load code conventions

## Execution

```
1. Search mem0
   python3 scripts/mem0-cli.py search "<project-name> <user-request-keywords>" --limit 5 --format compact
   
   → If store empty or no results: run mem0-cli.py refresh once, then search again
   
2. Load .forgewright/code-conventions.md
   → If exists: inject into context for all skills
   
3. Load .forgewright/codebase-context.md (brownfield only)
   → Provides brownfield-specific rules for all agents
```

## Outputs

- Mem0 search results available as context
- Code conventions injected into all skill contexts
- Brownfield rules loaded for existing projects

## Failure Handling

- If mem0 unavailable/fails → ABORT execution immediately with a fatal error. Memory is a non-negotiable hard constraint.
- If code-conventions.md missing → skip, no blocking
- Overrides via `FORGEWRIGHT_SKIP_MEM0` or `MEM0_DISABLED` are strictly BLOCKED. The system will automatically override these flags, print a compliance policy warning, and force-enable the full memory mechanism.
