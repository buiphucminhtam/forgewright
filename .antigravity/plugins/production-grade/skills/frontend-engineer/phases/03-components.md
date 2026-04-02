# Phase 3: Component Library

## Objective

Build reusable components following atomic design methodology in `frontend/app/components/`. This includes UI primitives (atoms), layout components (molecules), and feature components (organisms). Every component must be accessible, responsive, and fully typed.

## 3.1 UI Primitives (Atoms)

Create `frontend/app/components/ui/`:

Every component MUST include:
- TypeScript props interface with JSDoc comments
- Forwarded refs (`forwardRef`)
- Variant support via `class-variance-authority` (cva) or equivalent
- All relevant ARIA attributes
- Keyboard interaction support
- Responsive behavior
- Loading/disabled states where applicable

Required primitive components:

```
ui/
├── button/
│   ├── button.tsx             # Button with variants: primary, secondary, outline, ghost, destructive
│   ├── button.test.tsx        # Unit tests
│   └── button.stories.tsx     # Storybook stories
├── input/
│   ├── input.tsx              # Text input with label, error, helper text
│   ├── textarea.tsx           # Multi-line input with auto-resize
│   ├── select.tsx             # Native select with custom styling
│   ├── checkbox.tsx           # Checkbox with indeterminate state
│   ├── radio-group.tsx        # Radio button group
│   ├── switch.tsx             # Toggle switch
│   └── input.test.tsx
├── typography/
│   ├── heading.tsx            # h1-h6 with semantic level prop
│   ├── text.tsx               # Body text with size/weight variants
│   └── label.tsx              # Form label with required indicator
├── feedback/
│   ├── alert.tsx              # Alert banners: info, success, warning, error
│   ├── toast.tsx              # Toast notification system
│   ├── badge.tsx              # Status badges with color variants
│   ├── progress.tsx           # Progress bar (determinate/indeterminate)
│   ├── skeleton.tsx           # Loading skeleton with animation
│   └── spinner.tsx            # Loading spinner with accessible label
├── overlay/
│   ├── modal.tsx              # Dialog with focus trap, scroll lock, portal
│   ├── drawer.tsx             # Slide-out panel (left/right)
│   ├── tooltip.tsx            # Tooltip with delay and positioning
│   ├── popover.tsx            # Popover with click/hover trigger
│   └── dropdown-menu.tsx      # Accessible dropdown menu
├── data-display/
│   ├── avatar.tsx             # User avatar with fallback initials
│   ├── card.tsx               # Card container with header/body/footer
│   ├── table.tsx              # Data table with sorting, selection
│   ├── empty-state.tsx        # Empty state with icon, title, action
│   └── stat-card.tsx          # Metric display with trend indicator
├── navigation/
│   ├── breadcrumb.tsx         # Breadcrumb trail
│   ├── tabs.tsx               # Tab navigation (accessible)
│   ├── pagination.tsx         # Page navigation with cursor support
│   └── command-palette.tsx    # Cmd+K search/navigation
└── index.ts                   # Barrel export
```

### Accessibility Requirements (Every Component)
- **Keyboard navigation** — All interactive elements reachable via Tab, activated via Enter/Space
- **Screen reader** — Correct ARIA roles, labels, descriptions, live regions for dynamic content
- **Focus management** — Visible focus indicator (2px outline minimum), focus trap in modals/drawers
- **Color contrast** — WCAG 2.1 AA minimum (4.5:1 text, 3:1 large text/UI elements)
- **Motion** — Respect `prefers-reduced-motion`, disable animations when set to `reduce`
- **Touch targets** — Minimum 44x44px touch target size on mobile

## 3.2 Layout Components (Molecules)

Create `frontend/app/components/layout/`:

```
layout/
├── header.tsx               # App header with nav, user menu, theme toggle
├── sidebar.tsx              # Collapsible sidebar navigation
├── footer.tsx               # App footer
├── page-header.tsx          # Page title, breadcrumb, actions
├── container.tsx            # Max-width content container
├── stack.tsx                # Vertical/horizontal stack with gap
├── grid.tsx                 # Responsive grid layout
├── auth-layout.tsx          # Layout for login/signup pages
├── dashboard-layout.tsx     # Layout with sidebar + header + content
├── marketing-layout.tsx     # Public pages layout
└── error-boundary.tsx       # Error boundary with fallback UI
```

## 3.3 Feature Components (Organisms)

Create `frontend/app/components/features/`:

Build feature-specific components derived from BRD user stories:

```
features/
├── auth/
│   ├── login-form.tsx           # Email/password + OAuth buttons
│   ├── signup-form.tsx          # Registration with validation
│   ├── forgot-password-form.tsx # Password reset request
│   ├── reset-password-form.tsx  # New password entry
│   └── oauth-buttons.tsx        # Google, GitHub, etc.
├── dashboard/
│   ├── stats-overview.tsx       # KPI cards grid
│   ├── recent-activity.tsx      # Activity feed
│   └── quick-actions.tsx        # Shortcut action buttons
├── data-table/
│   ├── data-table.tsx           # Full-featured table
│   ├── data-table-toolbar.tsx   # Search, filters, bulk actions
│   ├── data-table-pagination.tsx
│   └── column-def.ts            # Column definition helpers
├── forms/
│   ├── form-field.tsx           # Form field wrapper with error handling
│   ├── search-input.tsx         # Debounced search with suggestions
│   ├── file-upload.tsx          # Drag-and-drop file upload
│   ├── rich-text-editor.tsx     # WYSIWYG editor
│   └── date-picker.tsx          # Date/time picker
├── settings/
│   ├── profile-form.tsx         # User profile editor
│   ├── notification-prefs.tsx   # Notification settings
│   └── billing-section.tsx      # Subscription/billing management
└── common/
    ├── user-menu.tsx            # User avatar dropdown
    ├── notification-bell.tsx    # Notification indicator
    ├── theme-toggle.tsx         # Light/dark mode switch
    └── search-command.tsx       # Global search (Cmd+K)
```

## Validation Loop

Before moving to Phase 4:
- All UI primitives render correctly in all variants
- Keyboard navigation works for all interactive components
- ARIA roles and labels are correct (verified with axe-core)
- All components are responsive at mobile/tablet/desktop breakpoints
- Components use design tokens from Phase 2 (no hardcoded visual values)
- Feature components integrate with the layout system

## Quality Bar

- Every component has TypeScript props with JSDoc
- Every interactive component supports keyboard navigation
- Every component passes axe-core accessibility checks
- No component exceeds 200 lines (decompose if larger)
- All visual values come from design tokens
- Every component has at least one Storybook story
