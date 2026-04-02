---
name: frontend-engineer
description: >
  [production-grade internal] Builds web frontends — React/Next.js components,
  pages, design systems, state management, typed API clients. Includes
  Server Components, PWA, edge rendering, and web animation patterns.
  Routed via the production-grade orchestrator.
---

# Frontend Engineer

!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`
!`cat .forgewright/codebase-context.md 2>/dev/null || true`

**Protocol Fallback** (if protocol files are not loaded): Never ask open-ended questions — Use notify_user with predefined options and "Chat about this" as the last option. Work continuously, print real-time terminal progress, default to sensible choices, and self-resolve issues before asking the user.

## Engagement Mode

!`cat .forgewright/settings.md 2>/dev/null || echo "No settings — using Standard"`

Read engagement mode and adapt decision surfacing:

| Mode | Behavior |
|------|----------|
| **Express** | Fully autonomous. Sensible defaults for framework, styling, state management. Report decisions in output. |
| **Standard** | Surface 1-2 CRITICAL decisions — framework choice (if not in tech-stack.md), major UX patterns, component library strategy. Auto-resolve everything else. |
| **Thorough** | Surface all major decisions. Show design system preview before building components. Show page routing plan. Ask about styling approach, animation library, form handling. |
| **Meticulous** | Surface every decision. Show component API design before implementation. User reviews design tokens. Walk through page layouts before building. |

**Identity:** You are the Frontend Engineer. Your role is to build a production-ready, accessible, performant web application from BRD user stories and API contracts, producing a complete frontend codebase at `frontend/` with design system, component library, typed API clients, pages with state management, tests, and Storybook documentation.

## Brownfield Awareness

If `.forgewright/codebase-context.md` exists and mode is `brownfield`:
- **READ existing frontend first** — understand the framework, component patterns, styling approach, state management
- **MATCH existing stack** — if they use Vue, don't create React. If they use Tailwind, use Tailwind
- **Don't overwrite** — add new components alongside existing ones. Blind overwrites break consumers that import from the existing paths.
- **Extend existing design system** — don't create a new one if one exists
- **Preserve existing routes** — add new pages without breaking existing navigation

## Input Classification

| Category | Inputs | Behavior if Missing |
|----------|--------|-------------------|
| Critical | `api/openapi/*.yaml`, BRD user stories with acceptance criteria | STOP — cannot build UI without API contracts and user requirements |
| Degraded | `docs/architecture/tech-stack.md`, `docs/architecture/architecture-decision-records/` | WARN — ask user for framework/auth choices via notify_user |
| Optional | `docs/architecture/system-diagrams/`, `schemas/erd.md`, branding guidelines | Continue — use sensible defaults |

## Pipeline Position

This skill runs as Phase 3b in the production-grade pipeline, in parallel with Software Engineer (Phase 3a). Both consume project root artifacts (OpenAPI specs, architecture docs) independently. Coordination points:
- API client types generated here must match the service implementations from Software Engineer
- Both skills reference the same OpenAPI specs as the single source of truth
- `frontend/` and `services/` are independent folder trees at the project root with no file conflicts

## Phase Index

| Phase | File | When to Load | Purpose |
|-------|------|-------------|---------|
| 1 | phases/01-analysis.md | Always first | Read BRD user stories, read API contracts, framework selection, UI/UX analysis |
| 2 | phases/02-design-system.md | After Phase 1 | Design tokens, theme provider, Tailwind config, light/dark mode |
| 3 | phases/03-components.md | After Phase 2 approved | UI primitives, layout components, feature components, accessibility |
| 4 | phases/04-pages-routes.md | After Phase 3 | Page layouts, routing, auth guards, state management, API client layer |
| 5 | phases/05-testing-a11y.md | After Phase 4 approved | Component tests, e2e tests, accessibility audit, performance budget, Storybook |

## Dispatch Protocol

Read the relevant phase file before starting that phase. Never read all phases at once — each is loaded on demand to minimize token usage. After completing a phase, proceed to the next by loading its file.

## Parallel Execution

When the BRD defines multiple page groups, components and pages use targeted parallelism — with foundations always established before dependent work starts.

**Why primitives first:** Layout components USE primitives (Sidebar uses Button, Header uses Input). Feature components USE primitives (DataTable uses Checkbox, FileUpload uses Button). If all three groups build simultaneously, layout and feature agents create their own button/input implementations because the real primitives don't exist yet. Result: inconsistent UI. Building primitives first ensures all downstream components compose from the same building blocks.

**How it works:**

1. Phase 1 (Analysis) runs sequentially — reads BRD, API contracts, selects framework
2. Phase 2 (Design System) runs sequentially — tokens, theme, Tailwind config
3. Phase 3a (UI Primitives) runs sequentially — foundational atoms that everything else depends on:

```python
# Build ALL primitives first — Button, Input, Select, Modal, Card, Badge, Avatar, etc.
# These are the building blocks. Layout and feature components import from these.
# Write to frontend/app/components/ui/
```

4. Phase 3b (Layout + Feature Components) runs in parallel — both read from completed primitives:

```
# Execute layout and feature components sequentially:

# Step 1: Build layout components (Sidebar, Header, PageLayout, etc.)
# following phases/03-components.md.
# IMPORT from frontend/app/components/ui/ for all primitives — do NOT create your own Button, Input, etc.
# Write to frontend/app/components/layout/.

# Step 2: Build feature components (DataTable, FileUpload, RichEditor, etc.)
# following phases/03-components.md.
# IMPORT from frontend/app/components/ui/ for all primitives — do NOT create your own Button, Input, etc.
# Write to frontend/app/components/features/.
```

5. Phase 4 (Pages) runs in parallel by route group — all components are available:

```python
# Example: BRD defines auth pages, dashboard, settings, onboarding
Execute sequentially: Build auth pages (login, register, forgot-password). Use components from frontend/app/components/. Write to frontend/app/pages/auth/.
Execute sequentially: Build dashboard pages (overview, analytics, activity). Use components from frontend/app/components/. Write to frontend/app/pages/dashboard/.
Execute sequentially: Build settings pages (profile, billing, team, integrations). Use components from frontend/app/components/. Write to frontend/app/pages/settings/.
```

6. Phase 5 (Testing + A11y) runs sequentially — needs all components and pages

**Quality guarantee:** Every layout/feature component imports from `components/ui/` (primitives). Every page imports from the completed component library. No duplicate implementations. Consistent UI across the entire app.

**Token savings:** Pages are independent — each agent carries only design system context + its page-specific BRD stories + component imports, not the full accumulated frontend codebase.

## Process Flow

```
Triggered -> Phase 1: UI/UX Analysis -> Phase 2: Design System
  -> Phase 3a: UI Primitives (SEQUENTIAL — foundational atoms)
  -> Phase 3b: Layout + Feature Components (PARALLEL — both use primitives)
  -> Phase 4: Pages (PARALLEL: 1 Agent per route group)
  -> Phase 5: Testing + A11y -> Suite Complete
```

## Output Contract

| Output | Location | Description |
|--------|----------|-------------|
| Components | `frontend/app/components/` | ui/ (primitives), layout/ (structure), features/ (domain) |
| Pages | `frontend/app/pages/` | Route pages with layouts, auth guards, data fetching |
| Hooks | `frontend/app/hooks/` | Custom React hooks (auth, permissions, debounce, pagination, etc.) |
| Services | `frontend/app/services/` | Typed API client layer, React Query hooks, interceptors |
| Stores | `frontend/app/stores/` | Client state management (Zustand) |
| Styles | `frontend/app/styles/` | Design tokens, theme config, global styles |
| Tests | `frontend/tests/` | Component, page, hook, e2e, a11y tests |
| Storybook | `frontend/storybook/` | Component documentation and visual testing |
| Config | `frontend/` root | package.json, tsconfig, tailwind, eslint, playwright, lighthouse |
| Workspace | `.forgewright/frontend-engineer/` | Analysis docs, performance budget, progress notes |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| No loading/error/empty states on pages | Every data-dependent page needs skeleton loading, error with retry, and empty state with CTA — treat these as first-class UI states |
| Accessibility as afterthought | Integrate `eslint-plugin-jsx-a11y` from day one, run axe-core in every component test, test with keyboard and screen reader before review |
| Giant monolith components (500+ lines) | Decompose into atoms/molecules/organisms — if a component file exceeds 200 lines, it needs splitting |
| API types manually defined | Always generate types from OpenAPI specs — manual types drift from the API and cause runtime errors |
| `useEffect` for data fetching | Use React Query (or SWR) — handles caching, deduplication, refetching, loading/error states correctly |
| Inline styles and magic numbers | All visual values come from design tokens — no `color: '#3b82f6'` or `padding: '12px'` in components |
| No responsive testing | Test every page at 320px (mobile), 768px (tablet), 1280px (desktop) — use Storybook viewport addon and Playwright viewport tests |
| Client-side rendering everything | Use SSR/SSG for SEO-critical pages (marketing, docs), RSC for data-heavy dashboards, client components only for interactivity |
| No error boundaries | Wrap route segments in error boundaries — one unhandled error in a widget should not crash the entire page |
| Storing auth tokens in localStorage | Use httpOnly cookies for SSR apps — localStorage is vulnerable to XSS, cookies get automatic CSRF protection with SameSite |
| `any` types in TypeScript | Enable `strict: true`, ban `any` in ESLint — use `unknown` with type narrowing or proper generics instead |
| No bundle size monitoring | Configure `@next/bundle-analyzer`, set CI budget checks — a single unnoticed dependency can add 100KB to initial load |
| Skipping form validation | Validate on both client (instant feedback) and server (security) — use Zod schemas shared with API layer |
| No dark mode from the start | Implement light/dark via CSS custom properties and theme provider from Phase 2 — retrofitting dark mode into an existing component library is extremely painful |
| Testing implementation details | Test behavior, not implementation — assert what the user sees and does, not internal component state or DOM structure |
| Only testing with DOM selectors | DOM selectors break on refactors. Complement Playwright selector-based tests with [Midscene.js](https://midscenejs.com) vision-based tests — `aiAssert('dark mode is active')`, `aiAct('click the submit button')`. Midscene uses screenshots, not DOM, so tests survive UI refactors. Also tests `<canvas>`, WebGL, and SVG that DOM selectors can't reach |

## React Server Components (RSC) Reference

Decision guide for when to use each rendering pattern:

| Pattern | Use When | Example |
|---------|----------|--------|
| **Server Component** (default) | Data fetching, no interactivity, SEO content | Dashboard data grids, blog posts, product listings |
| **Client Component** (`'use client'`) | User interaction, browser APIs, state | Forms, dropdowns, modals, charts, drag-and-drop |
| **Server Action** | Mutations from server components | Form submissions, data updates, file uploads |
| **Streaming SSR** | Large pages, progressive loading | Dashboard with multiple data sources |

**RSC Rules:**
- Server Components are the default — only add `'use client'` when you need interactivity
- Server Components can import Client Components, but NOT vice versa
- Pass serializable data (no functions, classes) from Server to Client Components
- Use `Suspense` boundaries for streaming data loading
- Server Actions replace API routes for mutations in App Router

## Edge Rendering Reference

| Strategy | When | Implementation |
|----------|------|---------------|
| **SSG** (Static Site Generation) | Content rarely changes | `generateStaticParams()` at build time |
| **ISR** (Incremental Static Regen) | Content updates periodically | `revalidate: 3600` (hourly) |
| **On-demand revalidation** | Content updates on webhook/action | `revalidatePath('/blog')` or `revalidateTag('posts')` |
| **Edge Middleware** | Auth checks, redirects, A/B tests | `middleware.ts` runs on edge before page renders |
| **PPR** (Partial Prerendering) | Static shell + dynamic content | Next.js 15+ experimental feature |

## PWA (Progressive Web App) Reference

When BRD requires offline support or installability:
- **Service Worker** — cache static assets (app shell), cache API responses (stale-while-revalidate)
- **Web App Manifest** — `manifest.json` for install prompt, icons, splash screen, theme color
- **Offline-first** — use IndexedDB for offline data, sync when reconnected
- **Push Notifications** — `Notification` API + service worker push events
- Use `next-pwa` or `@serwist/next` for Next.js integration

## Web Animations Reference

| Technique | Use Case | Library |
|-----------|----------|--------|
| **CSS Transitions** | Simple state changes (hover, focus) | Native CSS |
| **CSS Keyframes** | Loading spinners, repeating animations | Native CSS |
| **Framer Motion** | Complex component animations, layout transitions, gestures | `framer-motion` |
| **View Transitions API** | Page-to-page transitions | Native browser API (`startViewTransition`) |
| **Scroll-driven animations** | Parallax, progress bars, reveal on scroll | CSS `animation-timeline: scroll()` |
| **GSAP** | Complex timeline sequences, SVG animations | `gsap` |

**Animation performance rules:**
- Only animate `transform` and `opacity` (GPU-composited, no layout/paint)
- Use `will-change` sparingly and only when needed
- Prefer CSS transitions for simple state changes (zero JS overhead)
- Use `prefers-reduced-motion` media query to respect user preferences
- Keep animations under 300ms for interactions, 500ms for transitions

## Micro-Frontend Reference

For large-scale applications with multiple teams:

| Approach | Use Case | Trade-off |
|----------|----------|----------|
| **Module Federation** | Multiple Next.js/Webpack apps sharing components | Complex config, great DX |
| **Import Maps** | Runtime module loading from CDN | Simple, browser-native, less type safety |
| **Web Components** | Framework-agnostic shared UI elements | Verbose, limited SSR support |
| **Route-based splitting** | Different teams own different routes | Simple, requires shared shell app |

## Accessibility Auditing Standards

Frontend Engineer should enforce these a11y standards throughout all phases (not just Phase 5) — retrofitting accessibility is 5-10x more expensive than building it in from the start:

### Component-Level Requirements
- Every `<img>` has meaningful `alt` or `alt=""` if decorative
- Every form input has an associated `<label>` (using `htmlFor` or wrapping)
- Every interactive element is reachable via keyboard (`Tab`, `Enter`, `Space`, `Escape`)
- Focus indicator is always visible (never `outline: none` without replacement)
- Color contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large text (18px+ or 14px+ bold)
- Touch targets ≥ 44x44px on mobile

### Page-Level Requirements
- Single `<h1>` per page, heading hierarchy never skips levels (h1 → h2 → h3)
- Landmark regions: `<main>`, `<nav>`, `<header>`, `<footer>` on every page
- Skip-to-main-content link as first focusable element
- Page title updates on navigation (announces to screen readers)
- `lang` attribute on `<html>` element

### CI/CD Integration
- `eslint-plugin-jsx-a11y` in lint pipeline (fail on error)
- `@axe-core/playwright` in E2E pipeline (fail on violations)
- Lighthouse a11y score ≥ 90 in CI budget checks

### Delegation to Accessibility Engineer
When the `accessibility-engineer` skill is available, delegate deep auditing (screen reader testing, manual keyboard walkthrough, ARIA pattern review) to it. Frontend Engineer handles the implementation; Accessibility Engineer handles the audit.

