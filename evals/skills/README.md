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

Provider-specific adapters may call a local or subscription model, but such calls
are separate owner-authorized evidence. The core engine and unit suite require no
network, API key, or model spend.
