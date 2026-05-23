# UI Card Prompt Template

## Context
- **Asset type:** UI Card (content container)
- **Project style:** READ FROM .style-guide.json
- **Output format:** PNG or SVG

## Style Constraints

- **Background:** [BG_HEX] (light mode) or dark variant
- **Border:** 1px solid [BORDER_HEX]
- **Border radius:** [BR_MD]px
- **Shadow:** [SHADOW_SM] — subtle, matching background tint
- **Padding:** 16px-24px internal

## Generation Prompt

Generate a UI card matching this exact specification. The card must look professional and human-designed.

**Visual Style:**
- Style: Clean, minimal — NO glassmorphism, NO heavy blur
- Background: Solid [BG_HEX] — NOT gradient
- Border: 1px solid [BORDER_HEX] — subtle, not dominant
- Border radius: [BR_MD]px (NOT [BR_LG]px — too bubbly)
- Shadow: Subtle, z-index 10 equivalent — NO large drop shadow

**Typography:**
- Heading: [HEADING_FONT], weight 600, size 18-20px, color [TEXT_HEX]
- Body: [BODY_FONT], weight 400, size 14-16px, color [TEXT_HEX]
- Muted: [MUTED_HEX], size 12-14px
- Line height: 1.5 for body text

**Content Layout:**
- Header: Optional, with title + action icon
- Body: Text, image, or mixed content
- Footer: Optional, with actions (buttons, links)
- Spacing: 16px between sections

**Card Variants:**
1. **Basic:** Border only, no shadow
2. **Elevated:** Shadow added (for floating above content)
3. **Interactive:** Hover state — border color changes to [PRIMARY_HEX], slight translateY(-2px)
4. **Stat Card:** Large number + label + trend indicator
5. **Media Card:** Image top, content bottom
6. **Action Card:** Prominent CTA button

**Layout — AVOID these AI patterns:**
- ❌ Three equal-width cards in a row → Use: 2-column, asymmetric, or bento grid
- ❌ Centered content → Use: left-aligned or off-center composition
- ❌ Equal padding all sides → Use: larger padding top/bottom, tighter inline spacing
- ❌ Purple or blue accent → Use: [PRIMARY_HEX] or [ACCENT_HEX]
- ❌ Circular avatar images → Use: rounded square (border-radius: 8px)

**Composition:**
- Width: Variable (min 280px, max 400px for standalone)
- Aspect ratio: Variable based on content
- Background: Never pure white #FFFFFF — use #FAFAFA or [BG_HEX]

**Negative prompts (NEVER generate):**
- ❌ Purple/blue neon glow
- ❌ Gradient backgrounds or borders
- ❌ Large shadow (max shadow-sm equivalent)
- ❌ Circular spinner or loading indicator inside card
- ❌ Generic Inter font
- ❌ Pure black #000000
- ❌ Three equal cards side by side
- ❌ Centered everything

## Metadata
- **Format:** PNG with transparency / SVG
- **Naming:** `card-[variant]-[W]x[H].png`

## Acceptance Checklist
- [ ] No AI tells (purple glow, 3 equal columns, generic fonts)
- [ ] Consistent border radius (same across all card variants)
- [ ] Proper typography hierarchy
- [ ] Interactive states defined (hover, focus, active)
