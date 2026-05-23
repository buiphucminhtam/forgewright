# Game 2D Background Prompt Template

## Context
- **Asset type:** 2D Game Background / Environment
- **Project style:** READ FROM .style-guide.json
- **Game type:** [Side-scroller / Top-down / Isometric / Puzzle]
- **Art style:** [Pixel art / Hand-drawn / Vector / Painted]
- **Layer:** [Background / Midground / Foreground]

## Style Constraints

- **Camera angle:** [CAMERA_ANGLE]
- **Tile size:** [TILE_SIZE]px
- **Color palette:** STRICT — READ FROM .style-guide.json
- **Lighting:** [LIGHTING_DIR]

## Generation Prompt

Generate a 2D game background/environment matching these constraints.

**⚠️ CRITICAL RULES:**

**Perspective consistency:**
- Match the game's camera angle exactly
- Horizon line at correct height
- Depth layers must align (parallax layers)

**Color palette — STRICT:**
```
Primary:     [PRIMARY_HEX]
Secondary:   [ACCENT_HEX]
Background:  [BG_HEX]
Mid-tone:    [MUTED_HEX]
Shadow:      [CALCULATED]
Highlight:   [CALCULATED]
```

**AI tells to AVOID:**
- Perfect uniform placement of trees/rocks/clouds
- Mathematical grid patterns in organic elements
- All-warm or all-cool color temperature
- Over-detailed at distance (LOD awareness)
- Too-perfect symmetry in architecture

## Layer Specifications

**Background Layer (far, parallax 0.1-0.3):**
- Sky: Gradient or solid, atmospheric
- Distant mountains/buildings: Silhouette only, 1-2 colors
- Depth: Atmospheric haze, desaturated

**Midground Layer (medium, parallax 0.5):**
- Main environment: Trees, buildings, terrain
- Some detail, but simplified
- Main color palette

**Foreground Layer (near, parallax 0.8-1.0):**
- Interactive elements, platforms, details
- Full detail and color
- May have slight motion (grass, particles)

## Environment Type

**For [ENV_TYPE], generate:**
- **Forest:** Varied tree heights, organic spacing, depth through layering
- **Urban:** Architectural consistency, perspective grid, varied building styles
- **Dungeon:** Stone texture patterns, torch lighting, limited color palette
- **Abstract:** Geometric shapes, strong color blocks, no realistic detail
- **Natural:** Terrain variation, organic curves, weather/season feel

## Parallax Specifications

```
Layer 1 (far):   Parallax 0.1-0.3 — Mountains/sky
Layer 2 (mid):   Parallax 0.4-0.6 — Main environment
Layer 3 (near):  Parallax 0.7-0.9 — Details/foreground
Layer 4 (top):   Parallax 1.0    — Interactive elements
```

**Tile seam rules:**
- All tiles must wrap seamlessly (toroidal)
- Edge must match adjacent tile edges
- Test: Place 3×3 grid and verify no visible seams

## Color grading

**Atmospheric perspective:**
- Far: More desaturated, bluer, lower contrast
- Near: More saturated, warmer, higher contrast
- Apply color temperature gradient (warm near, cool far)

## Metadata
- **Format:** PNG with transparency
- **Naming:** `bg-[env-type]-[layer]-[W]x[H].png`
- **Example:** `bg-forest-midground-512x512.png`

## Acceptance Checklist
- [ ] Consistent perspective/camera angle
- [ ] All colors from palette
- [ ] No AI uniform placement
- [ ] Seamless tile edges
- [ ] Correct parallax layer depth
- [ ] Atmospheric perspective applied
- [ ] Works in 3×3 grid (if tileable)
