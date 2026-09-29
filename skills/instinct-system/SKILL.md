---
name: instinct-system
description: >
  Use for project-scoped tool observation, hook diagnostics, or evidence-bound
  learning candidates. Observation is opt-in and cannot promote a skill or
  substitute tool success for task acceptance.
version: 1.1.0
author: forgewright
tags: [learning, patterns, hooks, automation, observation]
---

# Instinct System — Observation and Evidence-Bound Learning

## Operating contract

The observer is **off by default**. Enabling it records bounded diagnostic patterns; it does not grant execution authority, install extra hooks, call a model, or modify active skills. A heuristic confidence score is not a calibrated probability and never authorizes promotion.

Use the current project root and explicit session identity. Project context and sessions are isolated by canonical physical workspace identity, not merely directory basename. Retained arguments and affected-file identifiers are hashed. Do not put secrets into tool names, session identifiers, or other metadata; pseudonymization is not a compliance certification.

## Maintained entrypoints

| Entry | Behavior |
| --- | --- |
| `FORGEWRIGHT_INSTINCTS_ENABLED=1` | Opt in to observation; unset is the no-write default. |
| `scripts/hooks/forgewright-instinct-hook.sh observe TOOL JSON true` | Run the shipped observer against a completed successful tool event. Missing or unknown success is not positive evidence. |
| `scripts/hooks/forgewright-instinct-hook.sh health` | Inspect safe health state, counters, last run and degradation reason. |
| `scripts/hooks/forgewright-instinct-hook.sh status` | Read-only status inspection; no initial store is created. |
| `processToolCall(...)` | Compatibility observation entrypoint. It returns no frequency-triggered promotion suggestion. |
| `fw_record_learning_candidate` | Native MCP proposal intake from an explicitly configured completed task and actual verifier/ledger artifacts. |

The top-level `scripts/forgewright-instinct-hook.sh` remains a compatibility shim. Legacy `promoter.ts` helpers are diagnostic compatibility utilities, **not Learning Foundry authorization**. Neither invoking the shim's `promote` action nor obtaining a frequent sequence grants promotion.

## Safe observation

Input limits are checked before retention: arguments are capped at 64 KiB UTF-8 bytes and events at 128 KiB. History, cache, store serialization and identifier lengths are bounded. Malformed JSON, absent success, recursive observation and unsafe storage locations do not count as successful observations. Persistence failure is reported as degraded instead of silently reporting a successful write.

The shipped `.forgewright/instincts/observer.mjs` is generated from source. Validate it with:

```sh
npm run check:observer
```

Installation, hook registration, execution and successful task learning are separate facts. An existing `.forgewright` directory is not proof that any host registered the hook. Native host adapters must map their event format to the maintained hook arguments; this skill does not install global host configuration. Windows and other host hook coverage require their own execution evidence.

A shell invocation starts a new process. Do not infer persistent in-memory sequence state, a universal event coverage percentage, or a sub-50 ms latency guarantee from a passing smoke test. Measure the actual host before claiming overhead improvements.

## Native candidate intake

The global MCP entrypoint supplies a native learning factory. The factory remains inactive without the project-owned `.forgewright/runtime/native-task-context.json`. A trusted parent uses `writeNativeTaskDescriptor()` after creating the locked contract and actual task evidence; the tool caller cannot select arbitrary filesystem destinations.

Required descriptor data: schema `forgewright-native-task-context/v1`, project/task IDs, a project-runtime contract path, bounded evidence paths under `.forgewright/verify`, and a terminal task ledger ID. Fixed storage locations are:

```text
.forgewright/runtime/native-task-context.json
.forgewright/runtime/learning/registry.json
.forgewright/runtime/learning/candidates/
.forgewright/runtime/trajectory-ledgers/
```

The parent provisions the registry with the existing Learning Foundry registry schema. Do not replace an existing registry or use a test-only host capability as production authority. `inspectNativeLearning()` distinguishes disabled, awaiting artifacts and ready to attempt intake; the last state is not acceptance.

Intake verifies the locked contract digest, actual current revision/tree, verifier output hash and invoked references, acceptance coverage, task/objective binding, ledger integrity and terminal quiescence. It rechecks task and registry drift before persisting. A successful result creates an **unapproved candidate proposal** and reports `promoted: false`; active registry bytes are unchanged. Ordinary MCP session shutdown is not task completion evidence.

Offline replay, independent review, protected non-regression, useful gain, registry compare-and-swap and rollback remain owned by the existing Learning Foundry promotion path. This intake adds no production promotion authority. Keyless evidence can bind exact artifacts but does not authenticate identities against a malicious actor with the same local-user filesystem permissions.

## Evidence to report

State exactly which host and entrypoint ran, which task acceptance/verifier references were matched, whether a proposal was persisted, and whether registry bytes remained unchanged. Distinguish local fixtures, native integration, and live model/product outcomes. Unknown token/cost usage is unavailable, not zero. Do not claim autonomous self-improvement or monetary benefit from diagnostic pattern counts.

For context continuation and task handoff, use the maintained protocols documented in [architecture](../../docs/architecture.md#evidence-gated-learning-and-worker-context-protocols); do not create a separate memory database or treat a saved checkpoint as tool authority.
