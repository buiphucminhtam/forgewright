# Skill Quality Evals

Forgewright skill promotion is evidence-driven rather than prompt-aesthetic.

Each `scenarios.jsonl` row uses `forgewright-skill-eval-scenario/v1`.
A provider adapter receives one `forgewright-skill-eval-request/v1` JSON object on
stdin and returns one observation JSON object on stdout. The core runner compares:

1. **baseline** — no skill;
2. **current** — current skill;
3. **candidate** — proposed skill.

The promotion gate rejects trigger/compliance regressions, increased forbidden
behavior or rationalization, and any critical forbidden behavior. With quality
preserved, a candidate still needs measured behavioral or efficiency improvement.

Pressure tags and rationalization traps are explicit test inputs. Generated
results/reports belong under `.forgewright/runtime/` and are never committed.
A candidate is promoted only from a `run` report that binds the exact candidate
SHA-256; changing the candidate after evaluation or a `hold` result blocks the
atomic `promote` command. The legacy skill upgrader therefore stages candidates
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
