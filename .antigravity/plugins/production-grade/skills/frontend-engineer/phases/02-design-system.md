# Phase 2: Design System

## Objective

Generate design tokens, theme configuration, and foundational styles in `frontend/app/styles/`. Establish the visual foundation that all components will build upon: colors, typography, spacing, breakpoints, shadows, motion tokens, light/dark themes, and Tailwind integration.

## 2.1 Design Tokens

Create `frontend/app/styles/tokens/`:

```
tokens/
├── colors.ts          # Color palette with semantic aliases
├── typography.ts      # Font families, sizes, weights, line heights
├── spacing.ts         # Spacing scale (4px base unit)
├── breakpoints.ts     # Responsive breakpoints
├── shadows.ts         # Elevation/shadow tokens
├── radii.ts           # Border radius tokens
├── z-index.ts         # Z-index scale
├── motion.ts          # Animation durations, easings
└── index.ts           # Unified export
```

Token standards:
- **Colors** — Semantic naming: `primary`, `secondary`, `success`, `warning`, `danger`, `neutral` with shade scales (50-950). Include WCAG 2.1 AA contrast ratios documented for each text/background combination.
- **Typography** — Modular scale (1.25 ratio). System font stack as default. Heading levels h1-h6 with responsive sizes. Line height minimums: 1.5 for body, 1.2 for headings.
- **Spacing** — 4px base unit, scale: `0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96` (multiplied by 4px).
- **Breakpoints** — `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`. Mobile-first approach.
- **Motion** — `duration-fast: 150ms`, `duration-normal: 300ms`, `duration-slow: 500ms`. Respect `prefers-reduced-motion`.

## 2.2 Theme Configuration

Create `frontend/app/styles/theme/`:

```
theme/
├── theme-provider.tsx     # React context for theme switching
├── light-theme.ts         # Light mode token overrides
├── dark-theme.ts          # Dark mode token overrides
├── theme.css              # CSS custom properties generated from tokens
└── global.css             # Reset, base styles, font loading
```

Theme requirements:
- Light and dark mode with system preference detection (`prefers-color-scheme`)
- Theme toggle component with persistence (localStorage)
- Smooth theme transition (CSS transitions on `color`, `background-color`)
- CSS custom properties as the bridge between tokens and components
- No flash of unstyled content (FOUC) on theme load — use `<script>` in `<head>` or cookie-based detection for SSR

## 2.3 Tailwind Configuration (if Tailwind selected)

Create `frontend/tailwind.config.ts`:
- Extend default theme with design tokens
- Custom color palette mapped to semantic tokens
- Typography plugin configuration
- Animation utilities from motion tokens
- Container queries plugin
- Prose styles for rich text content

## Validation Loop

Before moving to Phase 3:
- All design tokens are defined and exported
- Light and dark themes render correctly
- Theme toggle persists across page reloads
- No FOUC on initial load
- Tailwind config (if applicable) extends with custom tokens
- CSS custom properties bridge tokens to components

**Present design system to user via notify_user for approval before proceeding.**

## Quality Bar

- Every color combination meets WCAG 2.1 AA contrast requirements
- Typography scale is consistent and responsive
- Spacing scale covers all common layout needs
- Theme switching is instant and smooth
- No hardcoded visual values — everything comes from tokens
