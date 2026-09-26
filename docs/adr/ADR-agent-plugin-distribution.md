# ADR — Portable Agent Plugin Distribution and Skill Quality Engine

## Status

Accepted for beta local distribution. Provider-specific publication to official hosted marketplaces is a separate release/distribution concern.

## Context

Forgewright historically required a clone or Git submodule to obtain its full local runtime, skills, generated rule hooks, and MCP integration. That remains useful for reproducible project-owned tooling, but it is too heavy for users who only want the engineering workflows inside an agent harness.

The Superpowers project demonstrates two relevant patterns:

1. package one skills source for multiple harnesses instead of maintaining separate prompt copies;
2. treat skills as executable behavior contracts that can be evaluated under pressure rather than judging prompt quality by inspection alone.

Forgewright already has stronger requirement locking, exact-tree evidence, local gates, worktree isolation, and provider-neutral orchestration. The upgrade therefore reuses those controls instead of importing a second planning or evidence system.

## Decision

### One core, multiple plugin manifests

The repository root is the plugin source of truth.

- plugin.json is the portable Agent Plugins manifest.
- .codex-plugin/plugin.json provides Codex compatibility metadata and points to the shared skills/ tree.
- .agents/plugins/marketplace.json exposes a repository marketplace for Codex.
- .claude-plugin/plugin.json and .claude-plugin/marketplace.json expose the same source to Claude Code.
- skills/forgewright/SKILL.md is an entry workflow and registry alias, not a new specialist. The canonical specialist count remains 84.

The default plugin layer is skills-first and consent-gated: there is no unconditional SessionStart command and no advertised local MCP runtime, but the package includes one bounded `PreToolUse` bootstrap hook. The hook is inert unless a user-owned global policy has explicitly enabled automatic bootstrap. This preserves lazy loading, avoids adding boot context to every session, and keeps plugin installation itself non-mutating.

### One-time global bootstrap policy

Users who want full machine-local automation create the shared Forgewright runtime once and explicitly run `forge bootstrap policy set --mode automation|full --auto on`. The policy is stored under the user's Forgewright config home, includes allow/deny roots, desired mode, update policy, selected MCP clients and Pi policy, and never stores credentials.

On the first substantive plugin use inside an unmanaged repository, the hook performs a bounded local preflight. If policy permits, it invokes an idempotent bootstrap transaction that records project ownership receipts and can provision project profile/policy, GitNexus, Docs Hub registration, delegation readiness, and—only in `full` mode—the shared runtime integrations selected by policy. Once a valid project receipt is `ready`, later prompts perform only the cheap preflight.

The transaction does not require a project submodule. A submodule remains available for teams that deliberately want project-pinned framework source.

Global consent is necessary but does not replace native host hook approval. Automatic mutation belongs to the trusted hook, never a skill-side fallback that invokes setup while a hook is disabled or untrusted. Explicit owner-requested CLI setup is a separate path. The shared launcher pins a verified Python 3.11+ interpreter and the installing Node executable so a host's sanitized PATH cannot silently select an incompatible system Python.

### Behavioral skill quality

scripts/runtime/skill_quality.py evaluates a candidate across baseline/current/candidate arms with versioned JSON contracts. Promotion is blocked by trigger/compliance regressions, increased forbidden behavior/rationalization, or critical forbidden behavior. A candidate also needs measured behavioral or efficiency improvement.

Pressure scenarios and rationalization traps are explicit data. Provider adapters may supply real model observations, but fixture tests never become evidence of real-model quality gains.

### Trigger-only routing metadata

Boot skill descriptions describe **when** a skill should activate. Procedure, implementation steps, authority, and verification rules stay in the skill body. The strict migration initially covers the six boot-routed skills; other skill descriptions are linted as a migration backlog rather than rewritten without behavioral evidence.

### Minimal worker packets

PLAN_LOCKED is compiled into a digest-bound worker packet with only the task's objective, acceptance, out-of-scope constraints, owned paths, selected skill, interfaces/decisions, verifier refs, and specialist checks. The binding includes goal_id, plan_digest, task_id, scope_id, and exact base SHA.

Parent accounting remains parent-side. Removing parent-only statistics produces a newly hashed worker-visible packet so integrity still binds the bytes actually dispatched.

### Scoped review packages

Review material uses exact BASE..HEAD, not session history. Task review requires explicit task paths. Widening to branch/release requires either a planned final review or a named cross-cutting risk such as public contract, shared state, schema, security boundary, concurrency, migration, or release.

Review packages never include implementer private reasoning.

### Plan-scoped transient state

Transient state lives under:

.forgewright/runtime/goals/<goal_id>/<plan_digest>/

and binds the goal, plan digest, base SHA, and owner. Successful bounded execution removes its transient plan state; failed execution retains it for diagnosis/resume. Stale or foreign bindings fail closed.

### Failure classification

After a failed debugging approach, Forgewright records one of:

- hypothesis_wrong
- implementation_wrong
- environment_wrong
- architecture_wrong

The same approach failing twice forbids a third cosmetic retry. Replanning still follows the existing PLAN_LOCKED trigger contract.

## Verification

Local release evidence includes:

- isolated Codex marketplace discovery/install in a temporary CODEX_HOME;
- isolated Claude validate/install/list/details in a temporary HOME;
- shared entry skill and bounded auto-bootstrap hook present in the installed plugin package;
- plugin installation alone remains non-mutating when no global bootstrap policy exists;
- policy, project-state, ownership/rollback, repair/disable, concurrent-project admission and no-paid-fallback contracts are covered by deterministic tests;
- plugin manifests contain no machine-specific paths or secrets;
- deterministic skill-quality, metadata-lint, context-packet, review-scope, plan-runtime, and orchestration regression tests;
- normal repository full hooks and exact-tree independent review before publication;
- one isolated macOS Codex ordinary-prompt turn with the trusted current `PreToolUse` hook, a ready full project receipt, and a connected default 16-tool MCP catalog.

npm run verify:plugins intentionally uses isolated profiles and does not alter the user's real Codex or Claude configuration.

## Consequences and limits

- Plugin installation is the lightweight front door. Full auto-bootstrap requires a one-time shared runtime + global consent policy, but no per-project clone/submodule.
- Claude local installation currently copies/caches the repository and can take substantially longer than Codex installation; this is packaging overhead, not agent inference latency.
- Local plugin install evidence does not mean Forgewright is already listed in OpenAI/Anthropic official hosted marketplaces.
- No universal token, latency, or quality improvement is claimed until representative real-model evaluations establish it.
- Local MCP, Pi, and arbitrary tool execution retain their existing trust and production gates. The Codex acceptance did not exercise model MCP invocation; Claude native execution is user-deferred, and native Windows, physical power-loss, and remote-host acceptance remain unverified.
- Deploy/publish, billing, credentials and destructive cleanup outside receipt-owned state are never implied by auto-bootstrap.
