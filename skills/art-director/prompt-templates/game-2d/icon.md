# Game 2D Icon Prompt Template

## Context
- **Asset type:** Game UI Icon (inventory, abilities, items, HUD)
- **Project style:** READ FROM .style-guide.json
- **Art style:** [Pixel art / Vector / Hand-drawn]
- **Size:** [SIZE]×[SIZE]px (e.g., 64×64, 32×32, 16×16)

## Style Constraints

- **Size:** [SIZE]px (STRICT — icons must be exact size)
- **Color palette:** READ FROM .style-guide.json (MAX 4 colors including outline)
- **Outline:** 1-2px, color [BORDER_COLOR]
- **Grid:** Pixel-perfect (if pixel art)

## Generation Prompt

Generate a game icon matching these exact specifications.

**⚠️ CRITICAL:**

**Size — STRICT:**
- Icon must be exactly [SIZE]×[SIZE]px
- All icons in a set must use same grid
- No anti-aliasing (if pixel art)
- Use nearest-neighbor scaling only

**Readability at scale:**
```
[SIZE] = 16px:  Silhouette only, 1 color + outline, no internal detail
[SIZE] = 32px:  Basic shape + 1 main detail
[SIZE] = 64px:  Full detail, readable face/expression
```

**Color limit — MANDATORY:**
- Maximum 4 colors per icon (including outline)
- Color 1: Main fill
- Color 2: Highlight
- Color 3: Shadow
- Color 4: Outline

**AI tells to AVOID:**
- Over-detailed for size (16px icon ≠ 256px illustration)
- Too many colors
- Complex gradients
- Poor silhouette at small sizes
- Inconsistent style within icon set

## Icon Types

**For [ICON_TYPE], generate:**

**Inventory Item:**
- Simple shape: recognizable from silhouette
- Color coding: item rarity (common/uncommon/rare/legendary)
- Icon frame: optional, consistent across set

**Ability/Action:**
- Clear action symbol (sword = attack, shield = defend)
- Cooldown indicator space (if applicable)
- Cast animation hint (if animated)

**HUD Element:**
- Health: Red/orange fill
- Mana: Blue/purple fill
- Stamina: Green fill
- Experience: Yellow fill
- Progress bars: Clear fill vs empty

**Navigation:**
- Arrow: Directional, 8-way or 4-way
- Marker: Pin/dot/flag with readable symbol
- Minimap: Simplified silhouette

## Set Consistency

**All icons in a set must share:**
- Same pixel grid
- Same outline style (1px / 2px)
- Same color palette
- Same perspective (front-facing / top-down)
- Same detail level

**Inconsistent = rejected**

## Metadata
- **Format:** PNG with transparency
- **Naming:** `icon-[category]-[name]-[size].png`
- **Example:** `icon-item-health-potion-32x32.png`

## Acceptance Checklist
- [ ] Exact pixel size [SIZE]×[SIZE]
- [ ] Maximum 4 colors
- [ ] Readable silhouette at [SIZE]
- [ ] Consistent with icon set
- [ ] No anti-aliasing artifacts
- [ ] Clear at small scale
