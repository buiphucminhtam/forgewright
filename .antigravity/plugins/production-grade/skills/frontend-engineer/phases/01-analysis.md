# Phase 1: UI/UX Analysis

## Objective

Read BRD user stories and solution architect artifacts from the project root. Confirm framework, state management, and styling choices with the user. Produce a structured analysis in `.forgewright/frontend-engineer/docs/` (workspace artifacts).

## Phase 0: Framework Selection

Before beginning analysis, confirm the framework with the user via notify_user:

### Framework Options

| Framework | Best For | SSR/SSG | Ecosystem |
|-----------|----------|---------|-----------|
| **Next.js 14+ (recommended)** | SaaS products, SEO-critical apps, dashboard-heavy UIs | App Router, RSC, ISR | Largest React ecosystem, Vercel deployment |
| **Nuxt 3 / Vue 3** | Teams with Vue experience, progressive enhancement | Nitro server, hybrid rendering | Pinia, VueUse, Vuetify/PrimeVue |
| **SvelteKit** | Performance-critical, smaller bundles, simpler mental model | Adapter-based SSR/SSG | Smaller ecosystem, growing rapidly |

### State Management Options

| Stack | Best For | Why |
|-------|----------|-----|
| **React Query + Zustand (recommended)** | Next.js SaaS with REST/GraphQL APIs | Server state separated from client state, minimal boilerplate, excellent devtools |
| **Redux Toolkit + RTK Query** | Complex client-side state, offline-first, time-travel debugging | Mature, predictable, large team familiarity |
| **Pinia** | Vue/Nuxt applications | Official Vue store, TypeScript-native, devtools integration |
| **Svelte stores + TanStack Query** | SvelteKit applications | Native reactivity, minimal overhead |

### Styling Options

| Approach | Recommendation |
|----------|---------------|
| **Tailwind CSS + CSS variables** | Recommended — design tokens map to CSS custom properties, utility-first with design system constraints |
| **CSS Modules + design tokens** | Good for teams that prefer scoped CSS without utility classes |
| **Styled Components / Emotion** | Runtime CSS-in-JS, declining in favor of zero-runtime solutions |
| **Vanilla Extract** | Zero-runtime, type-safe styles, excellent for design systems |

**Confirm framework, state management, and styling choices with user before proceeding.**

## 1.1 User Flow Mapping

Create `.forgewright/frontend-engineer/docs/user-flows.md`:

- Map every BRD user story to a page or component
- Identify all distinct user flows (signup, onboarding, core CRUD, settings, admin)
- Document navigation hierarchy (top-level routes, nested routes, modals)
- Identify shared layouts (auth layout, dashboard layout, public marketing layout)
- Map role-based access per page (which roles see which pages/sections)

## 1.2 Page Inventory

Create `.forgewright/frontend-engineer/docs/page-inventory.md`:

```markdown
| Page | Route | Layout | Auth Required | Roles | Key Components | API Endpoints |
|------|-------|--------|---------------|-------|----------------|---------------|
| Login | /login | AuthLayout | No | All | LoginForm, OAuthButtons | POST /auth/login |
| Dashboard | /dashboard | DashboardLayout | Yes | user, admin | StatsCards, RecentActivity, QuickActions | GET /dashboard/stats |
| ... | ... | ... | ... | ... | ... | ... |
```

## 1.3 Component Inventory

Create `.forgewright/frontend-engineer/docs/component-inventory.md`:

- Catalog every unique UI element from user stories
- Classify by atomic design level (atom, molecule, organism)
- Identify shared vs feature-specific components
- Note interactive states (loading, error, empty, success)
- Document responsive behavior requirements per component

## 1.4 API Surface Mapping

Cross-reference BRD user stories with OpenAPI specs:
- Map each page to the API endpoints it consumes
- Identify real-time requirements (WebSocket, SSE, polling)
- Note optimistic update opportunities
- Document file upload flows and their endpoints
- Identify pagination patterns per list endpoint

## Input Dependencies

This skill reads from two upstream sources:

### From Project Root
- `api/openapi/*.yaml` — OpenAPI 3.1 specs for typed client generation
- `docs/architecture/tech-stack.md` — Framework, language, auth provider decisions
- `docs/architecture/system-diagrams/` — C4 container diagrams for understanding service boundaries
- `docs/architecture/architecture-decision-records/` — ADRs for auth strategy, API patterns, multi-tenancy
- `schemas/erd.md` — Entity relationships for understanding data shapes

### From BRD
- User stories with acceptance criteria
- User flow diagrams (signup, onboarding, core workflows, admin)
- Information architecture and navigation structure
- Role-based access requirements (admin, user, viewer, etc.)
- Branding guidelines (if provided)

## Validation Loop

Before moving to Phase 2:
- Framework, state management, and styling choices confirmed with user
- User flows mapped to pages and components
- Page inventory complete with routes, layouts, auth requirements, and API endpoints
- Component inventory classified by atomic design level
- API surface mapped per page

**Present analysis summary to user for quick review (no formal approval gate — informational).**

## Quality Bar

- Every BRD user story is mapped to at least one page or component
- Every page has its API endpoints identified
- Role-based access documented per page
- Shared layouts identified and catalogued
