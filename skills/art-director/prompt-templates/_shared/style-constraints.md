# Shared Style Constraints

These constraints apply to ALL asset generations (UI, Game 2D, Game 3D).

## Color System

### Primary Color Scale (10 shades)
Generate shades using HSL adjustment:

```
Primary:      [PRIMARY_HEX]
Primary-50:   Lightest (L + 40%)
Primary-100:  (L + 35%)
Primary-200:  (L + 25%)
Primary-300:  (L + 15%)
Primary-400:  (L + 5%)
Primary-500:  Base
Primary-600:  (L - 5%)
Primary-700:  (L - 15%)
Primary-800:  (L - 25%)
Primary-900:  Darkest (L - 35%)
```

### Off-Black Rule
- NEVER use pure black #000000
- USE: #09090b (zinc-950) or #1a1a1a or project dark color

### Color Temperature
- Warm: 2700K-3200K (reds, oranges, yellows)
- Cool: 5000K-7500K (blues, purples, greens)
- Rule: Key light warm → Fill light cool (or vice versa)
- Never: All elements same temperature

### Saturation
- Accent colors: Desaturate to 70-80% (never 100% saturation)
- Background: Desaturate 20-40%
- Example: `hsl(142 50% 45%)` not `hsl(142 100% 50%)`

## Typography

### Font Selection (AVOID Inter)
Acceptable alternatives:
- **Sans-serif:** Geist, Satoshi, Outfit, Plus Jakarta Sans, Cabinet Grotesk, Manrope
- **Serif:** Playfair Display, Lora, Merriweather, Source Serif Pro
- **Display:** Clash Display, Tungsten, Aktiv Grotesk
- **Mono:** JetBrains Mono, Fira Code, IBM Plex Mono

### Font Stacking
```
Heading: 'Font Name', Georgia, serif
Body: 'Font Name', -apple-system, system-ui, sans-serif
Mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace
```

### Type Scale (1.25 ratio — Major Third)
```
text-xs:   12px / 0.75rem
text-sm:   14px / 0.875rem
text-base: 16px / 1rem
text-lg:   18px / 1.125rem
text-xl:   20px / 1.25rem
text-2xl:  24px / 1.5rem
text-3xl:  30px / 1.875rem
text-4xl:  36px / 2.25rem
text-5xl:  48px / 3rem
```

### Line Height
- Body text: 1.5-1.75
- Headings: 1.1-1.3
- UI labels: 1.4-1.5

### Line Length
- Maximum: 65-75 characters per line
- Use: `max-width: 65ch` for prose

## Spacing System

### 4px Base Grid
```
space-0:   0px
space-1:   4px    (icon gap)
space-2:   8px    (tight)
space-3:   12px   (compact)
space-4:   16px   (standard)
space-5:   20px
space-6:   24px   (card padding)
space-8:   32px   (section gap)
space-10:  40px
space-12:  48px   (large section)
space-16:  64px   (page section)
space-20:  80px
space-24:  96px
```

## Border Radius

### Consistent Scale
```
radius-sm:  4px    (small inputs, badges)
radius-md:  8px    (cards, buttons)
radius-lg:  12px   (modals, large cards)
radius-xl:  16px   (large containers)
radius-2xl: 24px   (feature cards)
radius-full: 9999px (pills, avatars)
```

## Shadow System

### Inner Borders (preferred over outer glow)
```
shadow-sm:   0 1px 2px rgba(0,0,0,0.05)
shadow-md:   0 4px 6px rgba(0,0,0,0.1)
shadow-lg:   0 10px 15px rgba(0,0,0,0.1)
shadow-xl:   0 20px 25px rgba(0,0,0,0.1)
```

### Inner Shadow (tinted to background)
```
inner-shadow-sm: inset 0 1px 2px rgba(0,0,0,0.05)
inner-shadow-md: inset 0 2px 4px rgba(0,0,0,0.1)
```

### NO Outer Neon Glow
```
❌ box-shadow: 0 0 30px purple
❌ box-shadow: 0 0 60px rgba(138, 43, 226, 0.6)
✅ Use: inner borders or tinted subtle shadows
```

## Z-Index Scale

### Manageable System
```
z-0:   0       (default)
z-10:  10      (dropdowns, tooltips)
z-20:  20      (sticky elements)
z-30:  30      (modals backdrop)
z-40:  40      (modals)
z-50:  50      (popovers)
z-60:  60      (toast notifications)
z-70:  70      (debugger, dev tools)
```

## Animation Timing

### Duration Scale
```
duration-0:   0ms     (instant — color changes on click)
duration-75:  75ms    (micro — hover states)
duration-100: 100ms   (fast — button press)
duration-150: 150ms   (standard — hover)
duration-200: 200ms   (normal — dropdown, modal)
duration-300: 300ms   (slow — page transitions)
duration-500: 500ms   (very slow — complex animations)
```

### Easing Functions
```
ease-out:     cubic-bezier(0.16, 1, 0.3, 1)   — Elements entering
ease-in:      cubic-bezier(0.7, 0, 0.84, 0)    — Elements leaving
ease-in-out:  cubic-bezier(0.65, 0, 0.35, 1)  — Position changes
```

## Responsive Breakpoints

```
Mobile:   < 640px   (sm)
Tablet:   640-1024px (md-lg)
Desktop:  1024-1280px (lg-xl)
Large:    1280-1536px (xl-2xl)
Wide:     > 1536px   (2xl+)
```

## Touch Targets

### Mobile Accessibility
- Minimum: 44×44px
- Recommended: 48×48px
- Spacing: 8px minimum between adjacent targets
