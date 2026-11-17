---
name: ui-ux-pro-max
description: "Searchable local UI/UX data (styles, product and game-genre palettes, font pairings, UX guidelines, motion presets, stack notes) that returns a candidate design system for a product type. Use to widen exploration of palettes, type pairings and styles for a game's menus, store page or landing page before choosing with project evidence."
version: 1.0.0
---

# UI UX Pro Max — Design Data Lookup (LITE)

> Vendored from `nextlevelbuilder/ui-ux-pro-max-skill` (MIT, Next Level Builder, `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`, commit `e59ff37`). Upstream tests are not vendored. The only change: script paths in `SKILL.md` use `<skill folder>/scripts/` instead of `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/`.

## Domain Authority & Harmonization
Supplies candidates, not direction or evidence. `skills/ui-designer/data/reference-registry.json` classifies this source as `discovery_only` / `inspiration_only` (`can_ground_without_card: false`): never accept its product-to-style, palette or font recommendations as evidence-backed defaults, and never copy its generated output into production without independent project evidence. `unslop` keeps the mandatory UI craft gate and its Direction; `ui-designer` owns hierarchy, tokens and states. Game genres with their own profiles include casual puzzle, trivia/quiz, card/board, idle/clicker, word/crossword and general gaming. Results lean toward landing and menu screens; in-game HUD layout still comes from `game-designer` and `ui-designer`.

## SOLVE Step 2: GROUND
| Input | Check command / file read | Evidence |
|---|---|---|
| Design system for a product or game genre | `python3 <skill folder>/scripts/search.py "<genre> game <platform>" --design-system -p "<Name>"` | Printed style, palette with CSS variables, fonts, accessibility notes |
| One domain (style, color, typography, ux, product, landing, chart, icons, gsap) | `python3 <skill folder>/scripts/search.py "<keyword>" --domain <domain>`; stack notes via `--stack <stack>` | Ranked rows from `data/*.csv` |
| Design tokens | add `--tokens css` or `--tokens dtcg` to a `--design-system` query | `:root` variables or DTCG JSON |

## SOLVE Step 3: DECOMPOSE
1. LOOKUP | genre + platform query | Note the candidates and the search terms they suggest.
2. VALIDATE | candidates vs brief, existing brand tokens, direct references and the `unslop` Direction | Keep only choices the project evidence supports; drop pairs below 4.5:1 text contrast.
3. ADOPT | the validated choices into the project's styling system | Render the screen and check states, reduced motion and overflow.

Python 3 standard library only, no network access. A plain lookup only prints. `--persist` writes `MASTER.md`, page files and optional `tokens.*` under `--output-dir` (the current directory when omitted, so always pass it); `--preview` writes `preview.html` to `--output-dir` or a printed temp path.
