---
name: vision-review
description: "Provider-neutral rendered visual reviewer that validates UI/game-art output against a GROUNDED Visual Basis, deterministic constraints and current reference evidence; scores are telemetry, never aesthetic authority."
version: 3.0.0
---

# Vision Review (LITE)

## Domain Authority

Evaluate rendered output against `PIPELINE_CONTEXT.visual_basis`, validated Visual Evidence Cards, applicable `PIPELINE_CONTEXT.ui_style_profile`, approved Style DNA/UI contract and the real target context. Do not invent visual direction.

**Model prior is hypothesis-only.** Training memory, model consensus, generic taste and “AI-looking” folklore have evidence weight zero. If the basis/render/context is materially missing, return `UNVERIFIED` / `NEEDS_PIPELINE_GROUNDING` rather than applying remembered aesthetic rules.

## Ground

| Input | Verify | Script-produced evidence |
|---|---|---|
| Visual basis | `visual-basis/v1`, `status=GROUNDED`, `model_prior.used_as_evidence=false` | basis id + decision/card bindings |
| Evidence cards | current project/user authority or validated card library | source tier, context, observed mechanisms, causality limit |
| Render context | actual viewport/camera/scale/state/platform | inspected render/media refs |
| Deterministic constraints | layout/contrast/alpha/dimensions/import/state checks + `scripts/art-direction/ui-dom-probe.mjs` (`375..1920` + `--sweep`) for live web/HTML surfaces | project-owned tool/check output |

## Review

1. STRUCTURAL | Deterministic properties | Run tooling first; vision does not self-attest measurable facts.
2. REFERENCE FIDELITY | Render vs approved basis / System Drift (`Lệch hệ`) | Cite concrete `REFERENCE_DEVIATION` with exact `file:line` project token/component evidence when the same role uses inconsistent values; never flag distinct component roles or intentional brand tokens as errors.
3. USABILITY | Hierarchy/readability/task context / Broken (`Hỏng`) | Cite `USABILITY_ACCESSIBILITY` with actual scale/state evidence (contrast, 375px horizontal overflow, clipped meaning, tap target size, hover layout shift, focus visibility).
4. ARTIFACTS | Generation/render/import defects | Cite `TECHNICAL_ARTIFACT`; distinguish defects from intentional stylization.
5. PREFERENCE | Taste-only disagreement (`Gu`) | Label `SUBJECTIVE_PREFERENCE` with user-facing rationale; it stays optional and cannot block production or override brand identity unless made an explicit requirement.
6. VERDICT | Evidence + findings | `APPROVE | REVISE | REJECT | UNVERIFIED`.

## Verdict Rules

- `APPROVE`: relevant deterministic checks pass and no unresolved material evidence-backed finding remains.
- `REVISE`: direction is valid but material findings remain.
- `REJECT`: output materially contradicts the approved direction or cannot satisfy target function without a different approach.
- `UNVERIFIED`: required basis, render/state/context or reviewer capability is absent.

**Scores are telemetry, not authority.** A high score cannot override a concrete material deviation; a low score without an evidence-backed finding cannot reject a visual. Do not use a generic `ai_tells` score. Use `reference_fidelity` plus artifact-specific dimensions only when score telemetry is useful.

## Failure Modes

- rejecting purple/glass/centered/system-font/symmetry/minimal/maximal styling because it feels “AI”;
- accepting a polished render without a basis;
- inferring motion from a static frame;
- judging gameplay assets only at hero scale;
- treating product adoption as proof that its color/style caused success;
- allowing numeric averages to hide a concrete mismatch.

## Handoff

Return basis identity, inspected artifact/context, deterministic evidence, categorized findings, correction mechanism, verdict, limitations and next render/check. Newly discovered evidence that invalidates the basis returns to the pipeline as `DOMAIN_FINDING`; reviewer does not silently rewrite Style DNA.
