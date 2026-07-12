# ADR-006: Deterministic CLI Init/Onboard Golden Path

Date: 2026-07-12

## Context

P3.3 requires one documented, reproducible project setup path. The command must be safe to re-run and useful without a model provider or project dependency installation.

## Decision

`forge init [target]` creates `.forgewright/project.json`, and `forge onboard [target]` requires that manifest before creating `.forgewright/project-profile.json`. The profile records only deterministic local filesystem facts: Git metadata presence, `package.json` presence, recognized lockfiles, and a readable declared `test` script.

Existing generated files are preserved by default and return `already_exists`; `--force` explicitly refreshes the corresponding generated file. Both commands support the normal CLI JSON envelope.

The canonical evidence is `tests/golden/forge-init-onboard.test.mjs`. It exercises creation, idempotent reruns, manifest-required failure, protected existing content, and explicit refresh. It is invoked by `npm run test:golden`, the required aggregate gate, and the `cli-init-onboard-golden` GitHub Actions job.

## Consequences

The path is deterministic and model-free, so it can be reproduced locally after dependencies are installed. It does not inspect source code semantically, validate project quality, install dependencies, upload data, or prove production readiness.

The configured GitHub Actions job is evidence of intended hosted clean-checkout execution, not evidence that a hosted run has passed. Hosted CI status is established only by a completed CI run.
