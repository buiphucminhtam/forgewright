# UI Button Prompt Template

## Context
- **Asset type:** UI Button (interactive element)
- **Project style:** READ FROM .style-guide.json
- **Output format:** PNG with transparency (web) or SVG (vector)

## Style Constraints

- **Primary color:** [PRIMARY_HEX]
- **Accent color:** [ACCENT_HEX]
- **Border radius:** [BR_SM]px (small) / [BR_MD]px (medium) / [BR_LG]px (large)
- **Typography:** [BODY_FONT], weight 600
- **Shadow:** [SHADOW_SM] (subtle, inner-tinted)
- **Spacing:** 4px grid system

## Generation Prompt

Generate a UI button matching this exact specification. The button must look professional and human-designed — NOT AI-generated.

**Visual Style:**
- Style: Modern, flat with subtle depth — NOT glassmorphism, NOT neumorphism, NOT gradient-heavy
- Background: Solid [PRIMARY_HEX] — NOT gradient
- Text color: White (#FFFFFF) or [TEXT_HEX] depending on contrast
- Border: None (clean edges) OR 1px solid [BORDER_HEX]
- Border radius: [BR_SM]px
- Padding: 12px vertical × 24px horizontal

**Typography:**
- Font: [BODY_FONT] (NOT Inter) — prefer: Geist, Satoshi, Outfit, Cabinet Grotesk, Plus Jakarta Sans
- Weight: 600 (semi-bold)
- Size: 16px
- Letter spacing: 0.01em

**Shadow (if elevated):**
- Use inner shadow tint matching background hue
- NO outer neon glow
- NO large box-shadow
- Example: `inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.1)`

**States to include:**
1. **Default:** As described above
2. **Hover:** Background lightens 8%, translateY(-1px), shadow increases slightly
3. **Active/Pressed:** Background darkens 5%, translateY(0), shadow decreases
4. **Disabled:** Opacity 40%, cursor: not-allowed, no shadow
5. **Loading:** Skeleton pulse OR small spinner (NOT large circular spinner)

**Variants:**
- **Primary:** [PRIMARY_HEX] background, white text
- **Secondary:** Transparent background, [PRIMARY_HEX] border + text
- **Ghost:** Transparent background, [PRIMARY_HEX] text only
- **Danger:** [ERROR_HEX] background for destructive actions
- **Icon-only:** Square, icon centered, 40×40px minimum touch target

**Composition:**
- Minimum touch target: 44×44px (WCAG)
- Text centered, never truncate
- Icon left (optional): Lucide-style, 20px, stroke width 2
- Clean edges, no anti-aliasing artifacts

**Negative prompts (NEVER generate):**
- ❌ Purple or blue neon glow effects
- ❌ Gradient backgrounds
- ❌ Circular spinner loading (use skeleton or small spinner)
- ❌ Pure black #000000
- ❌ Inter font
- ❌ Outer glow box-shadow
- ❌ AI buzzword copy inside button ("Elevate", "Seamless")
- ❌ 99.99% or $9.99 fake numbers
- ❌ Three equal-width buttons side by side (use varied widths)

## Metadata
- **Aspect ratio:** Variable (typically 2:1 to 4:1)
- **DPI:** 72 (web) or 144 (mobile retina)
- **Format:** PNG with transparency / SVG
- **Naming:** `button-[variant]-[state]wxh.png` (e.g., `button-primary-default-120x44.png`)

## Acceptance Checklist
- [ ] Passes WCAG AA contrast (4.5:1 minimum)
- [ ] Touch target ≥ 44×44px
- [ ] No AI tells detected
- [ ] Consistent with project style guide
- [ ] All states (default, hover, active, disabled) generated
