---
id: model-tier
title: Capability-Aware Model Tier Protocol
summary: Select a role tier first; select a concrete model only from verified runtime capabilities.
status: active
version: 4.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---

# Capability-Aware Model Tier Protocol

## Invariant

Tier selection and model selection are separate decisions. ForgeWright may choose
`scout`, `builder`, or `expert` from task evidence, but it must not invent or
hard-code a provider display name, model ID, snapshot, or unsupported thinking
parameter.

## Task-start Runtime and Token Economics Preflight

At the start of every request, identify the active execution surface—Codex,
Claude Code, Antigravity, Cursor, or another runtime—from current system/tool
evidence. Record the surface, provider, capability source, advertised models and
reasoning controls, and available concurrency. Do not infer them from branding,
examples, environment variable names, earlier sessions, or a pricing page.

Every request makes an explicit dispatch-economics decision before deciding
whether to dispatch:

1. Shape the work first. Small, coupled, or serial work records a no-spawn
   decision and stays parent-owned; do not add research or dispatch overhead that
   cannot shorten the critical path or improve acceptance confidence.
2. For any candidate spawn, research the current official input, cached-input,
   and output token rates for each exact advertised model under consideration.
   Record the first-party URL, retrieval date, currency/unit, context threshold,
   and any billed reasoning/intermediate tokens that materially affect the
   estimate. Evidence fetched earlier on the same date may be reused only when
   the provider, exact model, and billing mode are unchanged; otherwise refresh
   it. Missing or unpublished prices are `UNVERIFIED`, never guessed.
3. API list price is not proof of subscription, quota, or credit cost. Record the
   observed billing mode when available; otherwise use list price only as a
   comparison basis and label actual spend `UNVERIFIED`.
4. Estimate candidate input/output tokens, retry risk, parallel critical path,
   and token cost as a range. Avoid false precision when prompt size, reasoning
   tokens, cache hits, or tool-loop depth are unknown.
5. Select in this order: effectiveness first, then wall-clock speed, then total
   tokens and estimated token cost. A cheaper model must not be selected when it
   is likely to increase retries, miss acceptance, weaken required verification,
   or delay the critical path. Use the smallest model/tier that is still likely
   to finish its bounded role correctly and quickly.

The parent owns the final topology and records the considered models, price
evidence, estimated ranges, role fit, spawn/no-spawn decision, and stop condition.
This record is compact task state, not a new durable report.

## Role Tiers

| Tier | Use |
|---|---|
| `scout` | Mechanical inventory, bounded read-only search, status extraction |
| `builder` | Normal implementation, synthesis, testing, and code review |
| `expert` | Security, schema, public API, concurrency, disagreement, or a step that failed twice |
| `planner` | STANDARD/DEEP planning and design decisions: `PLAN_LOCKED`, task decomposition, architecture, requirements, roadmaps, game design, open-ended exploration |
| `reviewer` | Independent adversarial review of a finished change, including HARD review-2 (a different model from the implementer) |

`scout`, `builder` and `expert` form the escalation ladder that HARD signals
floor at `expert`. `planner` and `reviewer` are role tiers on the most capable
configured model: they are requested explicitly and kept as requested; under
HARD signals without their verified model they fall back to `expert`. QUICK
work never delegates to them.

Small or serial tasks stay in the parent agent. Parallel work uses two or three
workers only when scopes are genuinely independent; mechanical inventory may use
one scout.

## Native Codex Configuration

Read `subagents.codex` from `.production-grade.yaml` before a native Codex
dispatch. The owner-approved map (2026-11-28) assigns routine
implementation to `gpt-6.2-sol` at medium effort and expert work to Sol at
high effort. Use `gpt-6-luna` at low effort for bounded mechanical inventory,
`gpt-6.1-terra` at low effort for exploration and visual inspection, and
`gpt-6.2-astra` at high effort for planning and independent review.

```yaml
subagents:
  codex:
    default:
      model: "gpt-6.2-sol"
      reasoning_effort: "medium"
    tiers:
      scout: { model: "gpt-6-luna", reasoning_effort: "low" }
      builder: { model: "gpt-6.2-sol", reasoning_effort: "medium" }
      expert: { model: "gpt-6.2-sol", reasoning_effort: "high" }
      planner: { model: "gpt-6.2-astra", reasoning_effort: "high" }
      reviewer: { model: "gpt-6.2-astra", reasoning_effort: "high" }
    agent_types:
      explorer: { model: "gpt-6.1-terra", reasoning_effort: "low" }
      worker: { model: "gpt-6.2-sol", reasoning_effort: "medium" }
```

On FrontierCode 2.0 in Codex at max effort, GPT-6.2 Sol scored 43.8%
at $1.29 per rollout and GPT-6.2 Astra scored 44.2% at $5.97 per rollout.
The results support the role split. Measure the project workload before
changing the default reasoning effort or speed tier.
[Cognition FrontierCode](https://cognition.com/frontiercode) ·
[OpenAI model selection](https://developers.openai.com/api/docs/guides/model-selection)

Resolve `model` and `reasoning_effort` independently with this precedence:

1. Explicit user/task dispatch override.
2. `tiers.<planner|reviewer>`: a role tier names the job, so it outranks the spawn agent type.
3. `agent_types.<spawn_agent agent_type>`.
4. `tiers.<scout|builder|expert>`.
5. `default`.
6. Parent/provider inheritance when no configured value survives validation.

Treat configuration as preference only. Before every spawn, inspect the active
`spawn_agent` schema and apply a field only when the exact model and reasoning
effort are advertised for that model. Never silently substitute another model,
downgrade reasoning, or turn a configured preference into a capability claim.
Record the resolved tier, agent type, model, reasoning effort, preference source,
and capability status in the dispatch packet.

Before each native spawn, run this exact local resolver command with the
structured capability JSON captured from that same authorized invocation:

```sh
python3 scripts/runtime/codex-subagent-routing.py \
  --config .production-grade.yaml \
  --capabilities-json "$CODEX_SPAWN_CAPABILITIES_JSON" \
  --tier "$TIER" \
  --agent-type "$AGENT_TYPE" \
  --overrides-json "$EXPLICIT_OVERRIDES_JSON"
```

Pass only the emitted `spawn_agent_args` object to native `spawn_agent`; omit
fields absent from that object. The resolver emits `verified` only for an exact
model/reasoning-effort pair. Missing, malformed, or unsupported capability data
emits `provider-managed` (or `unavailable`) with no unsafe override. This
resolver is not the external AGY adapter.

## Native Claude Code Configuration

Claude Code routes by agent type. The plugin ships five tier agents under
`agents/`, each pinning a model alias and an effort level in its frontmatter
(`model:` and `effort:`). The efforts match the Codex tiers:

| Tier | Agent | Model alias | Effort | Tools / use |
|---|---|---|---|---|
| `scout` | `forgewright-scout` | `haiku` | `low` | Read, Grep, Glob only (no shell, no edits): lookups, inventories, summaries of files already on disk |
| `builder` | `forgewright-builder` | `sonnet` | `medium` | Normal bounded implementation, tests, debugging, code review |
| `expert` | `forgewright-expert` | `opus` | `high` | HARD-signal implementation and debugging |
| `planner` | `forgewright-planner` | `fable` | `high` | Read, Grep, Glob, Bash (read-only use), WebSearch, WebFetch; no edits: planning and design decisions |
| `reviewer` | `forgewright-reviewer` | `fable` | `high` | Read, Grep, Glob, Bash; no edits: independent review and HARD review-2 |

How selection happens, and what is enforced:

1. **Interactive delegation is description-driven.** The parent model chooses an
   agent from these descriptions, which state the difficulty and HARD criteria.
   That choice is model judgment, not a deterministic gate.
2. **Orchestrated dispatch is deterministic.** Before an Agent tool call, run
   the resolver with the requested tier (for example `worker.role` from
   `orchestration_policy.py`) and the scope's risk signals as free text. Any
   ESCALATE HARD signal (matched by keyword stems such as payment, receipt,
   in-app, public, schema, migration, release, guardrail, termination; broad on
   purpose, so a false positive costs an expert run rather than a downgrade)
   floors the tier at `expert`. The floor only sees the signals passed, so
   always pass the task brief or summary itself as one more `--risk-signal`;
   HARD wording in the task is then matched even when no explicit signal was
   derived. A requested tier can raise it but never lower it, so a HARD scope cannot be downgraded to save tokens. With no HARD
   signal, mechanical inventory resolves to `scout` and other work to `builder`.
   Request `--tier planner` for planning and `--tier reviewer` for independent
   review; the resolver keeps them as requested. Under HARD signals it keeps
   them only when their `fable` model is verified, and otherwise routes to
   `expert` (`escalated: true`), so a role tier never lands below the expert floor.
3. A scout or builder that discovers a HARD signal stops and reports for
   re-routing.

```sh
python3 scripts/runtime/claude-subagent-routing.py \
  --tier "$TIER" --risk-signal "$SIGNAL" \
  --capabilities-json '{"models": ["haiku", "sonnet", "opus", "fable"], "agent_types": ["forgewright:forgewright-scout", "forgewright:forgewright-builder", "forgewright:forgewright-expert", "forgewright:forgewright-planner", "forgewright:forgewright-reviewer", "general-purpose"], "efforts": ["low", "medium", "high", "xhigh", "max"]}'
```

Pass only the emitted `agent_args`. `subagent_type` appears only for an
advertised agent (bare, or a unique plugin-namespaced match). `model` appears
only for an advertised alias (`model_selection: verified`). Otherwise the
subagent inherits the parent model (`provider-managed`). `effort` is resolved
independently: it appears only when the configured level is in the schema's
`efforts` list (`effort_selection: verified`). Otherwise no `effort` is passed:
a `forgewright-*` agent then runs at its frontmatter effort, a generic agent
type inherits the parent effort, and the resolver never substitutes another
level. Aliases resolve to the
runtime's current model of that family; they are not pinned snapshots. The
plugin-namespaced names (`forgewright:forgewright-<tier>`) were observed in a
headless Claude Code session loaded with `--plugin-dir` on 2026-11-15; other
hosts or install paths remain `UNVERIFIED` until probed. Configuration lives in
`subagents.claude.tiers` in `.production-grade.yaml`.

## Native Antigravity Configuration

Antigravity (`agy` CLI and IDE) runs on the Gemini 4 / 3.8 model family and
Orchestrator plan-execute routing. Treat configured model IDs as preferences
only: apply a model or subagent parameter only when advertised by the active
session (for example via `agy models` or the active `invoke_subagent` / `swarm`
tool schema); never invent or pin an unverified ID.

Observed `agy models` capabilities (`agy` v1.5.14, probed 2026-11-25):

| Tier | Preferred `agy` model | `invoke_subagent` `Model` | Workload / native primitive |
|---|---|---|---|
| `scout` | `gemini-3.8-flash-low` | `flash_lite` (`flash` for `browser`) | Bounded read-only discovery, `research`, `browser` UI inspection |
| `builder` | `gemini-4-neon-medium` | `inherit` | Normal bounded implementation, tests, debugging |
| `expert` | `gemini-4-neon-high` | `pro` | HARD signals, security/concurrency/public-contract changes |
| `planner` | `gemini-4-neon-high` | `pro` | Orchestrator planning (`gemini-pro-orchestrator-neon`: Neon plans `PLAN_LOCKED`, faster execution model builds) |
| `reviewer` | `gemini-4-neon-high` | `pro` | Independent adversarial review & HARD review-2 |

Antigravity-native execution primitives:

1. **Plan/Execute Orchestrator (`gemini-pro-orchestrator-neon`)**: the planning
   turn reasons on Neon high/medium to lock `PLAN_LOCKED`; execution runs on a
   faster model and hands back via `enter_plan_mode` on failed assumptions or
   repeated errors.
2. **`/swarm` (native parallel team)**: spawn independent workers under one
   coordinator using `workspace: "share"` for concurrent file authors and
   `inherit` for readers/checkers.
3. **`invoke_subagent`**: delegate bounded `research`, `browser` (default
   `Model: "flash"`), or isolated `self` tasks instead of polluting parent
   context.
4. **`/schedule` / `automation`**: run optional periodic reviews (for example
   weekly ledger/outcome review); require explicit user confirmation before
   creating automations or applying proposed prompt/rule changes.

### Cross-Platform Tier Parity

| Tier | Antigravity (`subagents.antigravity`) | Claude Code (`subagents.claude`) | OpenAI Codex (`subagents.codex`) |
|---|---|---|---|
| `scout` | `gemini-3.8-flash-low` (`flash_lite`) | `forgewright-scout` (`haiku`, `low`) | `gpt-6-luna` (`low`) |
| `builder` | `gemini-4-neon-medium` (`inherit`) | `forgewright-builder` (`sonnet`, `medium`) | `gpt-6.2-sol` (`medium`) |
| `expert` | `gemini-4-neon-high` (`pro`) | `forgewright-expert` (`opus`, `high`) | `gpt-6.2-sol` (`high`) |
| `planner` | `gemini-4-neon-high` (`pro`) | `forgewright-planner` (`fable`, `high`) | `gpt-6.2-astra` (`high`) |
| `reviewer` | `gemini-4-neon-high` (`pro`) | `forgewright-reviewer` (`fable`, `high`) | `gpt-6.2-astra` (`high`) |

Configured values are preferences only and apply solely when advertised by the
active runtime session.

## Codex GPT-6 Family

When no project/user preference resolves and the current Codex runtime advertises
matching model overrides, use this workload mapping as an optional fallback:

| Tier or agent type | Preferred model | Workload |
|---|---|---|
| `planner`, `reviewer` | Astra (6.2) | Planning, design decisions and independent review |
| `expert`, `builder` | Sol (6.2) | Main implementation work; high reasoning for HARD scopes |
| `scout` | Luna (6) | Bounded mechanical inventory |
| `explorer` | Terra (6.1) | Read-only exploration and visual inspection |

The configured native Codex default takes precedence over this preset. These
family names express routing intent, not verified model IDs.
Pass a model override only for an exact model ID advertised by the current Codex runtime.
If the preferred model is not advertised, keep `provider-managed` selection and
omit the override instead of inventing or substituting an ID.

## Capability Resolution

1. Probe the active provider in the same authorized invocation.
2. Load project/user preferences without treating them as capabilities.
3. Accept only structured machine-readable model IDs and reasoning controls from
   that runtime probe/schema.
4. Resolve configured precedence, then validate the exact values.
5. If verified, report `model_selection: verified` and pass the exact values.
6. If the provider owns selection, report `provider-managed` and omit overrides.
7. If runtime capability data is missing, malformed, human-readable only, or has
   no tier match, report `provider-managed` (or `unavailable` when the provider
   explicitly reports that state) and omit model/reasoning fields.

Never trust a manifest-supplied capability artifact to authorize a model flag,
or infer an ID from prose, examples, prior sessions, marketing names, or the tier
label itself. Never add provider-specific thinking/temperature flags unless the
same-invocation runtime capability surface declares support.

## Parallel Dispatch

`scripts/runtime/orchestration_policy.py` chooses worker tiers without provider
knowledge. `scripts/parallel-dispatch-runner.py` resolves optional AGY model IDs
only from a structured same-invocation `agy models` probe. Dry-run remains useful
when selection is provider-managed or unavailable.

Independent reviewers receive only requirements, diff, and raw evidence. They do
not receive worker reasoning or mutable synthesis context.

## Audit Fields

Record tier, agent type, selection status, preference source, capability source,
resolved model/reasoning, reason, token budget plus
`enforcement: advisory`, enforced deadline/output caps, and stop condition. A
requested reviewer reserves one advisory token-budget slot. Do not record hidden
reasoning or secret-bearing prompts.
