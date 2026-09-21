---
name: forgewright
description: "Use when doing substantive software engineering, debugging, testing, review, release, or multi-step product work with the Forgewright plugin installed."
version: 1.0.0
---

# Forgewright — Plugin Entry Workflow

Use this skill as the provider-neutral entrypoint for Forgewright. Do not recreate a second specification system and do not add ceremony merely because this plugin exists.

## Core flow

1. **Frame the outcome** — state the objective, observable acceptance, material constraints/non-goals, and unresolved decisions that could change the solution.
2. **Ground before editing** — inspect the current workspace/runtime and relevant references. Current evidence outranks stale prose or model memory.
3. **Right-size execution** — use `QUICK` for clear/local/reversible work, `STANDARD` for normal bounded features/debugging/refactors, and `DEEP` for public contracts, security, concurrency, release, migration, irreversible/high-blast or repeated-failure work.
4. **Load only the specialist needed** — select at most one primary `skills/<name>/SKILL.md` workflow for the current task unless a bounded independent review/parallel contract explicitly requires more roles.
5. **Lock requirements, not implementation guesses** — behavioral tests and acceptance criteria trace to current requirements. Never weaken an oracle just to get green.
6. **Execute in bounded scope** — protect user edits, avoid unrelated changes, use worktrees/task contracts only when independence or risk justifies them.
7. **Verify with observed evidence** — a build/test/tool result must prove the material behavior on the current tree/runtime. Report failures; do not narrate them into success.
8. **Audit proportionally** — inspect the final diff and acceptance coverage; `DEEP` work also requires adversarial/independent review where material.

## Failure discipline

After the same approach fails twice, stop varying the same fix. Classify the failure as one of `hypothesis_wrong`, `implementation_wrong`, `environment_wrong`, or `architecture_wrong`; isolate the failed assumption, then replan only when evidence justifies it.

## Bundled references

The plugin package also includes the canonical Forgewright kernel and specialist skills. When more detail is required, consult `kernel/ENTRY.md`, `kernel/SOLVE.md`, `kernel/VERIFY.md`, and the selected specialist `SKILL.md` rather than expanding this entry skill.

## Surface boundary

Plugin installation guarantees the bundled skills and trusted lifecycle guidance only. Local MCP, hooks that execute commands, and other machine-local automation require an execution surface that supports them and user trust/configuration. Never claim those capabilities merely because the plugin appears installed.
