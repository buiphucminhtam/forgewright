# GitNexus Guide

GitNexus builds a local code graph for supported files and exposes symbol context,
call relationships, execution flows, impact analysis, and change detection. It is
an aid for evidence-based navigation; unsupported or dynamic patterns may not resolve.

## Project Setup

From the repository root, analyze the current checkout and inspect its status:

```bash
npx gitnexus analyze
npx gitnexus status
```

Projects with a repository-local runner should use that wrapper instead. Re-run
analysis after large changes or when the index reports that it is stale.

## Safe Edit Loop

1. Query for the behavior or execution flow, not only a filename.
2. Inspect context for the target symbol and its callers.
3. Run upstream impact analysis before changing a symbol.
4. Treat HIGH, CRITICAL, UNKNOWN, partial, or stale results as requiring broader review.
5. Run change detection before commit and verify the affected flows with tests.

Graph results can be incomplete for generated code, reflection, shell indirection,
runtime imports, unsupported languages, and uninitialized submodules. Text search,
runtime traces, tests, and direct source inspection remain necessary evidence.

## Repository Rules

The active repository instructions in `AGENTS.md` define the required GitNexus
commands and risk handling for that project. Those local rules take precedence
over generic examples in this guide.
