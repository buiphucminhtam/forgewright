# UI Hero Section Prompt Template

## Context
- **Asset type:** Hero Section (landing page above-the-fold)
- **Project style:** READ FROM .style-guide.json
- **Output format:** Full-width composition

## Style Constraints

- **Background:** [BG_HEX] or dark [PRIMARY_HEX] variant
- **Typography:** [HEADING_FONT] + [BODY_FONT]
- **Primary color:** [PRIMARY_HEX]
- **Accent:** [ACCENT_HEX]
- **Spacing:** 4px grid, large section gaps (64px+)

## Generation Prompt

Generate a hero section that feels editorial and human-designed — NOT generic AI output.

**🚫 AVOID: The most common AI hero mistakes:**
- Centered H1 over dark background
- Gradient text on headings
- Three feature cards in equal columns below
- Purple/blue neon glow effects
- Generic Inter font

**✅ USE INSTEAD:**

**Layout — Choose ONE asymmetric approach:**
1. **Split screen:** 60% text left, 40% visual right (NOT 50/50)
2. **Off-center:** Text positioned at left third, visual fills right two-thirds
3. **Magazine:** Large headline overlapping a full-bleed image
4. **Asymmetric grid:** Bento-style layout with varying card sizes

**Background:**
- Solid color OR subtle texture (noise, grain)
- Dark mode: [BACKGROUND_COLOR] dark variant — NOT pure black #000000
- Light mode: [BG_HEX] or slightly off-white (#FAFAFA)
- NO large gradient fills (small gradient accents OK)

**Typography:**
- Heading: [HEADING_FONT] (NOT Inter), weight 700-800, size 48-64px
- Subheading: [BODY_FONT], weight 400, size 18-20px, color [MUTED_HEX]
- NO gradient text on headings — use weight and size for hierarchy
- Line height: 1.1 for headings, 1.6 for body

**Visual:**
- Image/illustration: Abstract, geometric, or editorial photography style
- NO generic tech illustration with floating circles/nodes
- Position: Offset, not perfectly centered

**CTA (Call to Action):**
- Primary button: [PRIMARY_HEX] background, clear action text
- Secondary: Text link or ghost button
- NO: "Get Started" or "Learn More" — use specific copy

**Social proof (if included):**
- Use realistic company names (NOT: Acme, Nexus, SmartFlow)
- Use organic messy numbers (NOT: 99.99%, 50%, $9.99)

**Below the fold (if shown):**
- NOT three equal cards — use asymmetric grid
- Feature cards with varying widths
- Different card heights for rhythm

**Negative prompts (NEVER generate):**
- ❌ Centered hero layout
- ❌ Gradient text headers
- ❌ Three equal feature cards
- ❌ Purple/blue neon glow
- ❌ Inter font
- ❌ Circular node network illustrations
- ❌ "Elevate", "Seamless", "Unleash", "Next-Gen" copy
- ❌ Generic company names or fake round numbers
- ❌ Default shadcn/ui styling

## Metadata
- **Dimensions:** Full viewport width, 600-800px height
- **Format:** PNG or SVG
- **Naming:** `hero-[layout-type]-[W]x[H].png`

## Acceptance Checklist
- [ ] Asymmetric layout (NOT centered)
- [ ] No gradient text
- [ ] No three equal columns
- [ ] No AI tells
- [ ] Typography hierarchy clear
- [ ] CTA is specific (not generic)
