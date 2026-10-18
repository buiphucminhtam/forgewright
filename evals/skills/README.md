# Skill Quality Evals

Forgewright skill promotion is evidence-driven rather than prompt-aesthetic.

Each `scenarios.jsonl` row uses `forgewright-skill-eval-scenario/v1`.
A provider adapter receives one `forgewright-skill-eval-request/v1` JSON object on
stdin and returns one observation JSON object on stdout. The core runner compares:

1. **baseline** — no target skill; frozen common context remains;
2. **current** — current skill;
3. **candidate** — proposed skill.

The promotion gate rejects trigger/compliance regressions, increased forbidden
behavior or rationalization, and any critical forbidden behavior. With quality
preserved, a candidate still needs measured behavioral or efficiency improvement.

Pressure tags and rationalization traps are explicit test inputs. Generated
results/reports belong under `.forgewright/runtime/` and are never committed.
Application requires a report bound to the exact candidate SHA-256 plus trusted
observed verification; changing the candidate after evaluation or a `hold` result
blocks the atomic Python promotion API. The standalone CLI cannot provide trust. The legacy skill upgrader therefore stages candidates
under `.forgewright/runtime/skill-candidates/` instead of overwriting live skills.

Application additionally binds the canonical current target path and
`SKILL.md`/`LITE.md` variant, rechecks evaluated current bytes under a cooperative
writer lock, and publishes the exact candidate buffer that was hashed. A newer
current version is preserved. Equal zero costs never establish efficiency gain.
An existing promotion lock fails closed; inspect its owner before recovery.

Declared JSON runner metrics alone are insufficient for application. The Python
host API `promote_candidate(..., verify_observed=...)` requires an out-of-band
trusted verifier that checks raw host trajectory, unchanged independent oracles,
cost provenance and exact artifacts. No report JSON can supply that callback.
The standalone CLI has no observed-host adapter and refuses application; `run`
can still report quantitative eligibility. Contract/synthetic/fixture reports
are explicitly ineligible even with a callback. A cooperative lock and hashes do
not authenticate a host or exclude arbitrary external writers.

## Experimental capture and independent judgment

`scripts/runtime/skill_eval_host.py` separates a bounded
Codex exec attempt from semantic judgment. `capture_run(HostRequest(...),
output_dir=..., limits=HostLimits(...))` retains the submitted public packet,
manifest, raw stdout/stderr, terminal/action/usage metadata, failure and cleanup
records. Hidden scenario labels and oracle digests are not submitted as task
content. An empty working directory alone does not prove global instruction,
plugin, tool or memory isolation. Tool observation/rejection is not a proven
pre-execution tool denial.

The capture host requires Linux process identity and a private child subreaper.
It reaps owned descendants on completion, timeout, cancellation and setup errors;
PID birth identity protects unrelated processes. Abrupt caller death cannot write
a final caller-side record; the surviving supervisor reaps its owned descendants.
The generic v1 runner retains its prior invocation path on other platforms, where
this new subtree-cleanup guarantee is unavailable. Do not interpret that fallback
as the Linux host being supported on macOS or Windows.

`verify_issued_run` checks the original process-local object and unchanged raw
artifacts/dependencies. A loaded `run.json` is evidence for review, never issuance.
Fixture captures are permanently ineligible. **The current native exec transport
remains ineligible:** actual instruction/tool isolation and required model/action
metadata have not been established. Real output and token counts support
development diagnostics, while instruction-source and action-accounting scope
remain incomplete. These observations do not establish isolated comparisons or
authorize promotion. Establish capture/isolation capability under bounded review
before qualification; successful login or a plausible response is insufficient.

The opt-in `codex-app-server` transport implements one version-pinned Linux path for
`gpt-5.6-sol` at `low` effort. It verifies the native binary, effective local
configuration, source-backed tool-isolation controls, empty environment/thread-MCP
catalogs and complete turn/usage evidence
before issuing an eligible run. Inherited custom instruction or compaction files
are refused. Each capture binds runtime helper bytes and native controls;
comparison rejects drift across arms. Unexpected tool requests are never forwarded.

Native model/effort fields describe **service-confirmed configuration**, not an
attested backend identity. Provider-internal context and backend snapshots remain
unknown. Local configuration responses are projected to audited safe controls
before evidence storage; private reasoning and unstructured stderr retain only
hashes/counts. The supported comparison is limited to observed cases under the
recorded configuration. It cannot establish full-context savings, general skill
reliability, player benefit or revenue. Live capability must be checked on the
actual supported host; fixture protocol tests cannot establish it.

**Observed status:** the live native validation is blocked. After correcting a
documented connection-status notification, the next bounded attempt refused a
Code Mode unavailable warning, produced no answer and reclaimed its owned
processes. No eligible live comparison or skill promotion has occurred. Do not
ignore that warning, enable tools to suppress it or infer capability from fixture
success. Resume only after a source-backed compatibility review and a newly
bounded validation plan; the failed attempts remain evidence.

`scripts/runtime/skill_eval_verify.py` provides the
separate trusted verifier. The evaluation owner, who is not the candidate author:

1. Freezes public case packets separately from hidden scenarios/oracles. Use
   `freeze_comparison(current_skill=..., candidate_skill=..., shared_sources=...,
   dependency_deltas=...)` before capture and pass it to `freeze_oracle`.
   Shared context is exact; any intentional reference delta is declared in advance.
   A renamed copy of candidate bytes cannot become baseline context.
2. Supplies a source-file-backed independent evaluator to `judge_run`. It checks
   actual decisions/actions/calculations against frozen facts and records exact raw
   spans, diagnoses, each required/forbidden outcome and disagreements. A label,
   matching keyword, copied expected answer or self-awarded score is insufficient.
3. Keeps capture, judgments and `TrustedRunRegistry` in the same trusted process.
   `freeze_manifest` binds expected case/arm runs, exact file/dependency bytes and
   evaluator implementation. The registry requires common model/effort/runtime,
   limits and public inputs across arms and projects judged runs through the
   existing v1 report builder. The cycle owner separately retains every capture
   disposition, including failed attempts with no output that cannot be judged.
4. Calls `promote_candidate(..., verify_observed=...)` with a callback invoking
   `verify_observed_report(report, registry=registry, manifest=manifest)`. It
   recomputes the report, checks raw provenance/freshness, rejects fixtures and
   per-case regressions hidden by aggregate gains, and requires measured semantic
   improvement while total-context/price efficiency is unknown.

The existing subprocess `evaluate()` remains a declaration/scoring adapter;
its JSON cannot carry in-process issuance. A trusted coordinator uses existing
`build_report`/`bind_skill_artifacts` through the registry, not a JSON trust flag.
Pass plain JSON mappings to `HostRequest`, not immutable mapping proxies from
frozen verifier objects. All effective instruction, reference, workflow, config,
oracle and evaluator dependencies belong in the frozen comparison. Changing them
invalidates affected evidence; evaluate/apply files sequentially and recheck the
final integrated bundle before claiming qualification.

Submitted context means the exact canonical UTF-8 experiment-packet bytes
(exec stdin or native `developerInstructions`), excluding fixed turn scaffolding,
transport envelopes and unobservable provider/system context. Native token usage is
post-hoc accounting, not an enforced token/spend limit. Price and immutable backend
snapshot remain unavailable. Hashes and process-local identity are not protection
against a malicious same-user code/memory writer. These contracts bound an honest
trusted evaluation owner; they do not authenticate arbitrary receipt JSON.

Linux capture/verification contracts are tested separately from portable v1 units:

```bash
python3 -m pytest -q tests/linux_skill_eval/ tests/unit_tests/test_skill_quality.py tests/unit_tests/test_game_skill_eval.py
```

These are offline contract/lifecycle tests. They perform no model calls and do not
prove skill, product, player or financial improvement. Local CI runs the Linux lane
only on its supported platform; portable v1 unit checks remain cross-platform.

## Product evidence is a separate lane

`scripts/runtime/game_product_eval.py` validates
`product-eval-plan/v1` and produces `product-eval-decision/v1` through
`evaluate_product_evidence(plan, registry=..., observation_refs=...)`. Pairing
requires the same declared consumer starting state, protected rules and evaluator;
authorized arm output trees may differ. Pairing validity only checks declarations,
not observed product behavior. Missing metrics never receive fallback scores.

The registry currently issues only `agent-decision` observations. Its source hash
identifies submitted instructions and its build hash identifies the host request
manifest, **not a rendered game build**. Human, rendered-game, native, novice and
business collectors are not implemented. All product outcome axes therefore remain
UNVERIFIED even for a genuine agent-decision receipt. Relabelled JSON, a fabricated
observer, or attachment to an unrelated genuine run cannot certify those axes.

Scoped task evidence and whole-product readiness stay separate. Preserve inherited
defects, fresh first-exposure assignment, assistance/abandonment/censoring, actual
units/denominators/windows and missingness. A second exposure cannot be primary
novice comprehension. A successful onboarding task cannot imply native delivery or
revenue. The real consumer evaluator still needs independent capture/validation;
its missing-metric behavior cannot be certified by these sidecar tests alone.

## Game role coverage and contract experiments

The game-designer, game-engineer, art-director and qa-engineer corpora cover
clone preservation, timing, creative authority, resource ownership, real test
execution and stale playtest evidence, with negative triggers and pressure
cases. Designer feel cases additionally challenge input mapping, commitment,
camera clocks, over-decoration, audio fatigue, combined accessibility modes,
unsupported claims and quiet signatures. `game-designer/holdout.jsonl` is a
separate set for an evaluation owner; do not inject it into authoring prompts
or repeatedly tune against it. Once exposed for tuning, replace the holdout.

These are desired-behavior scenarios, not measured compliance. Required/forbidden
event labels are adapter contracts, not semantic proof from keyword matching or
model self-report. Retain raw decisions and judge diagnosis, discriminating
tests, ownership, trade-offs and rejection criteria independently. One small
exploratory current/candidate observation cannot establish stable uplift;
representative baseline/current/candidate gains remain unmeasured. Contract
tests and source corrections do not supply automatic promotion eligibility.

After producing raw captures with the managed Signal Dash experiment, run:

```bash
python3 scripts/runtime/game_skill_eval.py \
  --contract tests/game/fixtures/threejs-lifecycle/reference-contract.json \
  --reference .forgewright/runtime/game-reference/reference.json \
  --candidate .forgewright/runtime/game-reference/candidate.json \
  --current-build CURRENT_BUILD_SHA256 --repeats 3 \
  --out .forgewright/runtime/game-reference/contract-eval.json
```

This executes the independent Node validator nine times with cache disabled,
fresh execution IDs and measured verifier wall time. It rechecks artifact hashes
and stops on timeout/incomplete evidence. The three arm labels repeat the same
captures; they are **not agent variants or independent provider samples**. The
result is structurally `contract-replay`, `promotion_eligible=false`, with zero
model calls. Contract PASS proves validator/adapter behavior only. It cannot
measure player enjoyment, model latency, token cost or skill uplift.

Provider-specific adapters may call a local or subscription model, but such calls
are separate owner-authorized evidence. The core engine and unit suite require no
network, API key, or model spend.
