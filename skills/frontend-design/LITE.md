---
name: frontend-design
description: "Aesthetic direction for new or reshaped UI: a distinct palette, typography and layout chosen for the brief instead of templated defaults, with boldness spent on one memorable element. Use when a game's title screen, menus or store page needs a visual identity of its own."
version: 1.0.0
---

# Frontend Design — Aesthetic Direction (LITE)

> Vendored from `anthropics/skills` (Apache-2.0, Anthropic, `https://github.com/anthropics/skills`, skill `frontend-design`, commit `e4bb5d9`), unmodified; `LICENSE.txt` kept.

## Domain Authority & Harmonization
Proposes the aesthetic point of view. `unslop` remains the mandatory craft gate: its 5-line Direction and Template Check decide whether a proposal ships, and existing brand tokens always win. `art-director` and `concept-artist` own in-game art and world visuals; this skill covers the interface layer around them (title, menus, settings, store, overlays) so it matches the game's world instead of a generic web template.

## SOLVE Step 2: GROUND
| Input | Check | Evidence |
|---|---|---|
| Brief and world | Game genre, setting, audience, platform; existing art and brand tokens | One-paragraph brief |
| Current UI | Rendered screenshot of the screens in scope | Baseline image |

## SOLVE Step 3: DECOMPOSE
1. PLAN | compact token system (color, type, layout) tied to the game's world | Each choice names the brief detail it comes from.
2. BUILD | one memorable element, everything else quiet | Remove decoration that does not serve the brief.
3. VERIFY | render the screens at the project's viewports | Passes `unslop` Template Check; no horizontal overflow; text contrast ≥ 4.5:1.
