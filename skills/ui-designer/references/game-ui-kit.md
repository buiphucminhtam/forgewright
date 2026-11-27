---
title: Game flow, wireframe and UI kit handoff
status: active
owner: Game tooling maintainers
scope: Phaser 4 and Three.js experience handoff and mobile game UI/HUD design
last_reviewed: 2026-11-27
canonical: false
---

# Game flow, wireframe and UI kit handoff

For Phaser 4 (2D) and Three.js (3D), consume the existing game promise,
player verbs, target camera/input and grounded Visual Basis. Preserve Concept
Artist → Art Director authority. UI owns screen/component anatomy, states,
layout and interaction; it does not choose a competing art direction.

Build the applicable inventory: boot/loading, menu/onboarding, gameplay HUD,
pause/settings, results/retry and game-specific surfaces. Shop, inventory,
characters and meta-game are not compulsory features. For each reachable
screen/state, supply a low-fi wireframe; map its content and controls to
concept/Style DNA, semantic tokens, component IDs, asset IDs and runtime entry.
A full-color art sheet alone cannot close a missing interactive component.

Use `game-experience/v1` (`schemas/game-experience.schema.json`) for the required
set from the approved design-ready handoff, its journeys/screens and bindings.
Reference that source intent by file hash. The checker validates the declared
scope and local hashes, not authenticity of approval or semantic completeness
of arbitrary prose. A changed required set must go through the existing
ProductIntent/Delta and owner review; never delete requirements to pass.
The first state in each journey is its entry; all declared states must be
reachable through that journey's transitions. Declare and hash every JSON
card in the supplied creative card directory; helpers must not read unbound
neighboring cards.
Declared character/environment asset categories and UI components also make
their concept categories applicable. Assetless games may bind empty inventory
and import documents at implementation stage; the legacy lifecycle CLI keeps
its existing nonempty import requirement.

Use the full source/plugin checkout containing `scripts/art-direction`,
`schemas` and `templates`; run from that root or use its absolute script path.
For a receipt-owned shared MCP runtime, resolve and verify the original
`source_root` from its ownership receipt. Copied global skill catalogs are
not standalone game-tool installations; legacy symlinked skills resolve back
to their source checkout.

```sh
python3 scripts/art-direction/game-experience.py validate /project/experience.json --project-root /project --stage design
python3 scripts/art-direction/game-experience.py validate /project/experience.json --project-root /project --stage implementation
```

Design checks bind wireframes, concept categories, tokens and required component
states to the validated creative bundle. Implementation additionally needs real
assets, inventory/import manifest, component runtime/preview refs and hash-bound
import observations. Missing required evidence fails. Legitimate non-applicability
needs a reason and cannot waive an item in the approved required set.

Useful component families: buttons/icons, panel/dialog, tab, toggle/slider,
progress/resource display, tooltip/toast and HUD text. Include reachable
pressed/focus/disabled/loading/error states, relevant hover, safe-area/responsive
layouts, long/localized labels and keyboard/touch paths. Menus gate gameplay and
camera input; close restores the intended focus/control mode. Low quality and
reduced motion are distinct; essential feedback remains available.

## Mobile game UI and HUD

Design around the player's task and grip. In the screen inventory or wireframe,
identify the playfield, interaction zones, persistent HUD, contextual cues and
overlays. Keep information visible when the player needs it to act, such as a
turn limit or a time-critical warning. Put secondary details behind a stable,
discoverable entry. Give menus a clear destination, current progress where
applicable, and a visible next action. Keep Back and Close in consistent relative
positions and check what regains focus or control when a panel closes.
[Xbox XAG 109](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109),
[Xbox XAG 112](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112)

- **Placement.** Try frequent actions in reach of the intended grip. Test with
  the hand on the screen and during real play, including relevant left- and
  right-handed grips. Check whether the hand, HUD or overlay blocks a target,
  preview or warning. Anchor groups to safe edges and check cutouts, system
  gestures and input conflicts. The best HUD location depends on what players
  need to notice and where they are already looking. The FPS study supports
  testing that relationship within its genre. [Apple WWDC26, touch controls](https://developer.apple.com/videos/play/wwdc2026/358/),
  [Peacocke et al., FPS information displays](https://www.yorku.ca/mack/ec2018.pdf)
- **Reflow.** Preserve access to the primary action and Back/Close at short
  heights. Allow long content to wrap or scroll vertically, with clearance to
  reach the last item above any fixed controls. Test supported orientations,
  longest labels, supported text enlargement and actual host insets. In an
  edge-to-edge WebView, check who applies the insets (host, web layer or canvas)
  so the rendered controls receive the required space once. [WebKit safe-area guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/),
  [WCAG 2.2 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
- **State and contrast.** Make selected, claimed, locked or unavailable states
  distinguishable through labels, icons or shapes paired with color. Expose
  the corresponding names and states through accessible controls. Measure
  against the actual composited background in each theme, including the least
  favorable gameplay frame for a translucent HUD. As applicable, WCAG AA calls
  for 4.5:1 normal text, 3:1 large text (about 24 CSS px regular or 18.67 CSS px
  bold), and 3:1 for the visual features needed to identify active controls,
  states and meaningful graphics against adjacent colors. A 22 CSS px regular
  title uses the normal-text threshold. [WCAG Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html),
  [WCAG Text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
  [WCAG Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- **Touch targets.** Label the measurement units. Android recommends at least
  48 × 48 dp. Apple lists 44 × 44 pt as the iOS/iPadOS default. WCAG 2.2's
  Level AA pointer-target criterion uses 24 × 24 CSS px with defined exceptions.
  The Level AAA enhanced criterion uses 44 × 44 CSS px with its own exceptions.
  Set a comfortable project target for high-use WebView controls and measure the
  actionable region and its neighbors. Small icons can have larger hit areas
  when expanded areas stay unambiguous. [Android touch targets](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views),
  [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
  [WCAG Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
  [WCAG Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)

### Seven-column daily challenge example

For this WebView example, start at 48 × 48 CSS px for general controls with
about 8 CSS px between them where space permits. Use a starting type scale of
22 CSS px for the screen title, 16–18 for key actions and values, and at least
14 for supporting labels. Check the actual font, viewing distance, localized
text and both Warm and Night themes before accepting the scale.

Maintain the day/weekday relationship. At 320 CSS px wide, 12 px insets on
each side and six 4 px gaps leave `(320 - 2 × 12 - 6 × 4) / 7 ≈ 38.9 CSS px`
per column before any additional safe-area constraint. Keep day cells at
least 48 CSS px tall and use a full-size Play Today control. Measure each
actionable day against its applicable requirement. The WCAG equivalent-target
exception requires a control on the same page that meets the criterion and
performs that day's action. A same-page date list can provide such controls
when the grid cannot offer comfortably selectable targets.
[WCAG Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

### Runtime evidence for mobile UI

Open the real player journey. Use the project's supported device/viewport
matrix. For the example above, check 320 × 568 and 390 × 844 portrait, and
844 × 390 landscape where supported. Record viewport width **and** height,
orientation, actual insets, themes, long labels, applicable locked/offline
states, horizontal overflow and whether the last item remains reachable.

For DOM, measure the rendered hit region and confirm activation at its edges
and misses outside it. For canvas, project the hit shape into viewport CSS
coordinates through the active object/camera and canvas display transforms.
Check both matching and adjacent targets using viewport-coordinate input after
resize or rotation. At a final scale of 0.75 CSS px per logical unit, a
48-unit box becomes 36 CSS px before clipping. Canvas backing pixels and
physical screenshot pixels carry their own units. Pair canvas controls with
operable semantics in an accessible layer where needed, then check names,
state and activation using platform text scaling and the applicable screen
reader (TalkBack or VoiceOver) on the actual device. Label coverage precisely
when evidence comes from browser emulation.

The optional `templates/game/ui-kit/` starter supplies working DOM controls and
a state gallery. Reuse an existing kit when it meets the same contract. Phaser
canvas panels may use version-verified NineSlice; Three world-space cues remain
scene-owned. No compulsory UI framework, font, gradient or motion style.

Checker PASS applies only to design/implementation completeness. Actual runtime
acceptance requires the current served build, public-input journey, rendered
viewport evidence, intended target and confirmed managed resource cleanup.
Visual appeal and player benefit need separate review/playtest.

The bundled config opts into `auto_detect_rules.game_engine_routing`: explicit Phaser 4/Three.js requests and new 2D/3D game intent select the relevant web specialist; existing project package pins win when the engine is unspecified. Older user configs without that setting preserve their routing until intentionally adopted. The orchestrator resolves configuration/project policy and package evidence from the consumer project, while skill source stays under the trusted framework root. Explicit CLI selectors remain available.
