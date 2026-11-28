---
name: frontend
description: "[production-grade internal] Builds web frontends — React/Next.js components, pages, design systems, state management, typed API clients. Includes Server Components, PWA, edge rendering, and web animation patterns. Routed via the production-grade orchestrator."
version: 2.0.0
tags: [frontend, react, nextjs, typescript, tailwindcss, state-management, api-client, design-system, accessibility]
---

# Frontend Engineer (LITE)

## SOLVE Step 2: GROUND (Frontend Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Frontend structure / path | Check directories for `frontend/` or `src/` | ... | Verified `Frontend structure / path` facts from inspected file/command output |
| Framework and styling framework | Read `package.json` and CSS/config files | ... | Verified `Framework and styling framework` facts from inspected file/command output |
| API base URLs & client ready | Read `.env` or client service configuration | ... | Verified `API base URLs & client ready` facts from inspected file/command output |
| Accessibility audit runner | Check for `jest-axe` or devtools config | ... | Verified `Accessibility audit runner` facts from inspected file/command output |

## SOLVE Step 3: DECOMPOSE (Frontend Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (create design system tokens) | TARGET (tailwind.config.ts) | CHECK (npm run build)`
- `n. ACTION (build UI component with ARIA) | TARGET (src/components/Modal.tsx) | CHECK (npm run test:a11y)`
- `n. ACTION (wire component state / store) | TARGET (src/components/Modal.tsx) | CHECK (npx jest Modal.test.tsx)`
- `n. ACTION (integrate API service clients) | TARGET (src/services/api.ts) | CHECK (npm run build)`
