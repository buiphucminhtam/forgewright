---
title: Game Build Checklist Migration
status: active
owner: core/documentation
scope: Help users of the former game gate guide enter the canonical studio workflow
last_reviewed: 2026-10-18
canonical: false
---

# Game Build Checklist Migration

This supporting guide retains the old URL for existing links. The former
Gate 0–4 checklists are superseded by the seven phases in the
[Game Studio Control Plane](../skills/_shared/protocols/game-studio-pipeline.md).
Start with the [Game Studio workflow](../workflows/game-studio-build.md), including
its novice walkthrough. The protocol alone owns phase activation, required
outcomes, evidence, handoffs, state resolution and gate decisions; this page
adds no approval or gate.

## Reuse existing evidence

Inspect current project artifacts and enter at the earliest incomplete phase;
a narrow repair attaches evidence to its relevant milestone. Preserve the
established studio state path and engine/shell/pins. Useful former checklist
items become evidence in their applicable existing phase:

- Scoping and art direction belong in Concept. Preserve the selected Concept
  Packet and approved Style DNA, with UX/research → Concept Artist → Art Director
  → downstream implementation ownership.
- Architecture and build/test readiness use Systems Design and Technical Setup
  handoffs. Engine-specific patterns come from the actual selected engine;
  Unity ScriptableObjects, URP or a particular input system are not universal
  game architecture requirements.
- Implementation, regression, accessibility, performance and player evidence
  use the applicable story and phase contracts. Targets come from approved
  project/platform budgets, not a universal frame-rate target.
- Reproducible packaging, rights/listing claims, artifact identity, distribution,
  telemetry and support use Release & Sustain. Web/static checks, installed
  device builds, internal beta and production release require distinct evidence
  and scoped authorization.

## Creative and asset evidence

Use the [canonical creative handoff](../skills/_shared/protocols/game-studio-pipeline.md#creative-routing-and-executable-dispatch-contract)
for Concept Packet and Art Director ownership. Existing tools remain useful at
the stage that consumes their artifacts:

```bash
python3 scripts/art-direction/style-contract.py validate .forgewright/art-direction/game-art-contract.json --stage generation
scripts/art-direction/art-pipeline.sh drift
scripts/art-direction/art-pipeline.sh manifest
scripts/art-direction/art-pipeline.sh handoff <game-project-dir>
```

Style validation, current inventory/source hashes, drift validation and verified
engine handoff support their scoped evidence items. They do not prove the whole
phase, player outcomes or target-device performance. Keep STYLE/TARGET/CHARACTER
reference roles separate under the current Style DNA contract.

## Use the canonical verdict

`PASS` requires the applicable evidence and no material unresolved risk.
`CONCERNS` is limited to non-blocking residual risks with an owner and explicit
user acceptance. Missing applicable required evidence or a blocker is `FAIL`;
a failure cannot be accepted or waived. `N/A` needs a genuine applicability
rationale, never an absent test or device.

Failed applicable mechanics/platform tests or unresolved blocking defects cannot
coexist with a “no blockers” release record. Recording a defect does not resolve
it. Attach the failure, assign remediation, then rerun the applicable check and
gate. Keep exact commands, exit codes, current artifact identity and observed
playtest/device limits in the existing evidence/state records.

Use [game testing](../skills/_shared/protocols/game-test-protocol.md) and the
[canonical phase gate record](../skills/_shared/protocols/game-studio-pipeline.md#phase-gate-record)
for current verification and acceptance rules. Only material direction and
accepted concerns require user decisions under those rules; ordinary agent-owned
artifact preparation does not add a sign-off form.
