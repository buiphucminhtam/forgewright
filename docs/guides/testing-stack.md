# Autonomous Testing Stack

Forgewright combines deterministic checks, focused unit and integration tests,
build verification, evidence capture, and adversarial review. These controls reduce
delivery risk; they do not guarantee zero escaped bugs in production.

## Verification Layers

1. Run the narrow check for each changed behavior immediately after the edit.
2. Run affected module tests and build/type checks.
3. Use `scripts/lite/run-check.sh` to write machine-readable verification evidence.
4. Run an independent review for broad or high-risk changes.
5. Run `scripts/ci/run-required-checks.sh` before release.

Example evidence capture:

```bash
bash scripts/lite/run-check.sh --turn local-check -- pytest -q tests/unit_tests/test_audit_step.py
```

The resulting `.forgewright/verify/<turn>.json` records the command, exit code,
bounded redacted output, timestamp, workspace, and tree fingerprint. Evidence is
valid only for the tree state it identifies.

## Boundaries

Passing local checks does not prove hosted deployment behavior, store policy
acceptance, third-party availability, user experience quality, or absence of
unknown defects. Production claims need production evidence, monitoring, rollback,
and human approval where policy or money is involved.
