# Negative Prompts — AI Tells to Avoid

This is the **master list** of AI clichés that must NEVER appear in generated assets.
Attach this to EVERY generation prompt.

## Critical (Auto-Reject if detected)

### UI/UX
- [ ] **Purple/blue neon glow** — The universal AI aesthetic
- [ ] **Three equal columns of cards** — The default AI layout
- [ ] **Centered hero section** — Overused AI pattern
- [ ] **Gradient text on headings** — Trying too hard to look premium
- [ ] **Outer glow box-shadow** — Cheap pasted-on look
- [ ] **Pure black #000000** — Harsh, not natural
- [ ] **Generic Inter font** — Default AI font
- [ ] **Circular spinner loading** — Lazy AI loading pattern
- [ ] **Broken Unsplash URLs** — Unsplash random URLs 404 frequently

### Game Art
- [ ] **5-finger hands** — AI over-renders (should be max 4)
- [ ] **Same face syndrome** — All NPCs look related
- [ ] **Anatomy errors** — Extra fingers, broken joints, asymmetric faces
- [ ] **Perfect symmetry** — Everything has mathematical symmetry
- [ ] **Over-detailed skin** — Photorealistic skin in stylized game
- [ ] **Uniform placement** — Trees, rocks, clouds in grid patterns
- [ ] **Plastic-perfect materials** — No wear, no grime
- [ ] **All-ambient lighting** — Flat, no depth
- [ ] **Perfect grass/stone texture** — No variation, mathematical tiling

## High Severity

### UI/UX
- [ ] **Fake round numbers** — 99.99%, 50%, $9.99 look obviously AI
- [ ] **Generic company names** — Acme, Nexus, SmartFlow, TechCorp
- [ ] **AI buzzwords in copy** — Elevate, Seamless, Unleash, Next-Gen, Transform
- [ ] **Default shadcn/ui** — Template feel, not project feel
- [ ] **Generic placeholder names** — John Doe, Jane Smith, Sarah Chen
- [ ] **Generic tech illustrations** — Floating circles with connecting lines

### Game Art
- [ ] **Purple glow on UI elements** — Universal AI aesthetic
- [ ] **Over-saturated accent colors** — 100% saturation looks fake
- [ ] **AI-generated textures** — Same face texture repeated
- [ ] **Uniform cloud/haze density** — Should be gradient fog
- [ ] **Perfect snow/grass coverage** — No variation
- [ ] **Character faces on same template** — No individuality

## Medium Severity

### UI/UX
- [ ] **Gradient backgrounds** — Solid or subtle texture preferred
- [ ] **Excessive border-radius** — Bubbly look
- [ ] **Too many shadows** — Over-shadowing
- [ ] **Generic stock photo style** — Obvious stock imagery
- [ ] **Startup-era design clichés** — Dark mode with neon accents

### Game Art
- [ ] **Perfect edge lighting** — Rim light on everything
- [ ] **Over-bright highlights** — Bloom on all light sources
- [ ] **No color variation in materials** — Same stone looks same everywhere
- [ ] **AI face generation issues** — Uncanny valley, dead eyes

## Quick Reference

Print this and check each asset:

```
🔴 CRITICAL (auto-reject):
   Purple/blue neon glow
   3 equal columns
   Centered hero
   Gradient text headers
   Outer glow shadows
   Pure black #000000
   Inter font
   Circular spinner
   5-finger hands
   Same face syndrome
   Anatomy errors

🟠 HIGH:
   Fake round numbers
   Generic company names
   AI buzzwords
   Default shadcn
   Perfect symmetry
   Over-detailed skin
   Uniform placement

🟡 MEDIUM:
   Gradient backgrounds
   Excessive roundedness
   Generic stock photos
   Over-saturation
   Perfect textures
```

## Enforcement

Every generated asset must be checked against this list.
Vision review scores AI Tells dimension from 1-10:
- 9-10: Zero AI tells
- 7-8: 1-2 subtle tells
- 5-6: 3-4 tells
- 3-4: 5+ tells
- 1-2: Overwhelming AI aesthetic

**Any CRITICAL tell = automatic REJECT regardless of total score.**
