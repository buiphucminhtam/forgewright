# Game 2D Character Prompt Template

## Context
- **Asset type:** 2D Game Character
- **Project style:** READ FROM .style-guide.json
- **Game type:** [Side-scroller / Top-down / Isometric / Platformer]
- **Art style:** [Pixel art / Hand-drawn / Vector / Painted]

## Style Constraints

- **Camera:** [CAMERA_ANGLE] (e.g., 3/4 top-down isometric)
- **Tile size:** [TILE_SIZE]px
- **Character height:** [CHAR_HEIGHT_TILES] tiles = [CALC_HEIGHT]px
- **Color palette:** READ FROM .style-guide.json — STRICT adherence
- **Lighting direction:** [LIGHTING_DIR] (e.g., top-left 45°)

## Generation Prompt

Generate a 2D game character matching these exact constraints. The character must be production-ready and game-engine compatible.

**⚠️ CRITICAL CONSTRAINTS:**

**Anatomy — STRICT RULES:**
- Head-to-body ratio: [HEAD_BODY_RATIO] (e.g., 1:4 for heroic)
- Maximum 4 visible fingers (NOT 5 — AI over-renders hands)
- No extra digits, asymmetric limbs, or broken joints
- Proportions must match the art style (pixel = pixel grid, painted = painterly)
- Silhouette readable at 16×16px

**Color Palette — MANDATORY:**
```
[READ PALETTE FROM .style-guide.json]
Primary:    [PRIMARY_HEX]
Secondary:  [ACCENT_HEX]
Shadow:     [CALCULATE_SHADOW_FROM_PALETTE]
Highlight:  [CALCULATE_HIGHLIGHT_FROM_PALETTE]
Skin:       [SKIN_TONE_FROM_PALETTE]
```

**AI tells to AVOID:**
- Perfect symmetry (break symmetry: pose offset, asymmetric features)
- Generic "attractive average" face (define unique face shape)
- Over-detailed face at small display sizes
- Too-smooth skin textures (in stylized game = out of place)
- All characters from same face template

**Lighting:**
- Light direction: [LIGHTING_DIR]
- Shadow: Cast on opposite side of light
- Highlight: On light-facing surfaces
- Rim light: Complementary color to key light (optional, adds depth)

## Character Sheet Format

Generate a character sheet with ALL required frames:

```
Canvas size: [W]×[H]px (all frames same size)

Sheet layout:
[Row 1: Idle]     [idle_1] [idle_2] [idle_3] [idle_4]
[Row 2: Walk]     [walk_1] [walk_2] [walk_3] [walk_4]
[Row 3: Attack]   [atk_1]  [atk_2]  [atk_3]  [atk_4]
[Row 4: Hurt]     [hurt_1] [hurt_2]
[Row 5: Death]    [death_1] [death_2] [death_3]
```

**Frame count:**
- Idle: 4 frames (loop)
- Walk: 4-6 frames (loop)
- Attack: 4-6 frames
- Hurt: 2 frames
- Death: 3 frames

**Animation principles:**
- Use keyframe pacing: slow-in, slow-out
- Anticipation frame before attack (1 frame of wind-down)
- Impact frame: hold for 2× normal duration
- First frame = last frame for seamless loops
- Walk cycle: contact → passing → high point → contact

## Character Design

**Silhouette (readable at 16×16):**
- Distinct outline shape
- Readable weapon/tool
- Clear class archetype (tank = broad, mage = lean)

**Details (readable at full size):**
- Face: 2-3 colors max at pixel scale
- Equipment: 1-2 accent colors
- Cloth folds: 1px lines at pixel scale

**Palette limit:**
- Maximum 8 colors total (including outline)
- Use dithering for intermediate tones
- NO more than 1 highlight color
- NO more than 1 shadow color

## Metadata
- **Canvas:** [W]×[H]px (power of 2 preferred)
- **DPI:** 72
- **Format:** PNG with transparency
- **Naming:** `char-[name]-[animation]-[N]frames_w[xh].png`
- Example: `char-goblin-warrior-walk-6_32x48.png`

## Acceptance Checklist
- [ ] All colors from project palette only
- [ ] No AI anatomy errors (extra fingers, broken limbs)
- [ ] Consistent lighting direction
- [ ] Animations loop seamlessly
- [ ] Silhouette readable at 16×16
- [ ] Consistent pixel grid (if pixel art)
- [ ] Touch-ready export (clean edges, no artifacts)
