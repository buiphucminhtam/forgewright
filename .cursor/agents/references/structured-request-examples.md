# Structured Request Examples

> Real-world examples of interpreted requests. Use these as reference when producing structured output.

## Example 1: Vague Build Request

**User input:**
```
I want to build something like Notion but for project management, you know, with tasks and stuff
```

**Interpreted output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode:          Full Build
Confidence:    HIGH

Intent:
  "I want to build something like Notion but for project management, with tasks and stuff"

What you want:
  A project management SaaS with task management, collaborative features

Key decisions made:
  1. Web-based (Notion is a web app) — no mobile mentioned, can add later
  2. Full-stack — needs backend for task storage, user management
  3. Collaborative — real-time or near-real-time updates implied
  4. Notion-like UX — clean, document-centric, block-based editing
  5. Self-hosted or SaaS? Default to SaaS with Docker deployment

Scope:
  ✓ Core: Task management (create, assign, status, due date)
  ✓ Core: Workspace/project organization
  ✓ Core: User authentication
  ✓ Nice: Block-based editor (Notion-style)
  ✗ Out of scope: Mobile app
  ✗ Out of scope: Billing/payments (can add later)
  ✗ Out of scope: Advanced integrations

Constraints detected:
  None stated — will default to MVP scope with room to grow
  Timeline not stated — PM will scope after BRD

Missing (will be handled by PM if needed):
  1. Database choice (PostgreSQL recommended for relational data)
  2. Tech stack preference (React + Node.js default)
  3. Real-time requirements (WebSocket vs polling)

Success criteria:
  - Users can create workspaces and projects
  - Users can create, assign, and complete tasks
  - User authentication works
  - Deployable as Docker container

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready to route to Full Build pipeline.
```

## Example 2: Specific Feature Request

**User input:**
```
add a dark mode toggle to my React settings page
```

**Interpreted output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode:          Feature
Confidence:    HIGH

Intent:
  "add a dark mode toggle to my React settings page"

What you want:
  A settings page with a dark/light mode toggle in an existing React app

Key decisions made:
  1. React — existing project confirmed
  2. Settings page exists — just adding a toggle, not building a page
  3. Dark mode — system preference detection + manual override
  4. CSS-based (Tailwind dark mode or CSS variables) — will check existing project

Scope:
  ✓ Toggle component in settings page
  ✓ System preference detection (prefers-color-scheme)
  ✓ Manual override (stored in localStorage)
  ✓ Smooth transition animation
  ✗ Global theme architecture refactor (unless needed)

Constraints detected:
  - Existing React project — must match existing code style
  - Settings page already exists — extend, don't replace

Success criteria:
  - Toggle switches between dark and light modes
  - Choice persists across page reloads
  - System preference is respected on first visit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready to route to Feature pipeline.
```

## Example 3: Bug Report

**User input:**
```
my app crashes when I upload files, idk why, it's so annoying
```

**Interpreted output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode:          Debug
Confidence:    HIGH

Intent:
  "my app crashes when I upload files"

What you want:
  Find and fix the crash that happens during file uploads

Key decisions made:
  1. Crash confirmed — not "slow" or "error message", actual crash
  2. File upload flow — upload handler, storage, validation
  3. Unknown cause — will need investigation

Scope:
  ✓ File upload flow (frontend and/or backend)
  ✓ Error/exception investigation
  ✓ Root cause fix
  ✓ Regression prevention (add tests if missing)
  ✗ Not a feature request — just fixing the crash

Constraints detected:
  - Existing project — crash reproducible

Success criteria:
  - File upload works without crash
  - Same crash cannot reoccur (tests added)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready to route to Debug pipeline.
```
