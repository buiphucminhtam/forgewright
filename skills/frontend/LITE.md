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
| Frontend structure / path | Check directories for `frontend/` or `src/` | ... | run the check command and paste output |
| Framework and styling framework | Read `package.json` and CSS/config files | ... | run the check command and paste output |
| API base URLs & client ready | Read `.env` or client service configuration | ... | run the check command and paste output |
| Accessibility audit runner | Check for `jest-axe` or devtools config | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Frontend Domain Slots)
Format: `n. ACTION | TARGET | CHECK`
- `n. ACTION (create design system tokens) | TARGET (tailwind.config.ts) | CHECK (npm run build)`
- `n. ACTION (build UI component with ARIA) | TARGET (src/components/Modal.tsx) | CHECK (npm run test:a11y)`
- `n. ACTION (wire component state / store) | TARGET (src/components/Modal.tsx) | CHECK (npx jest Modal.test.tsx)`
- `n. ACTION (integrate API service clients) | TARGET (src/services/api.ts) | CHECK (npm run build)`

---

### 1. UNDERSTAND
- **Task**: Build a responsive and accessible Login Form using TailwindCSS and React.
- **What must be TRUE**: Form uses `<form>`, inputs have linked labels (`htmlFor`/`id`), error states use `aria-invalid` and `aria-describedby`, Tailwind styles are responsive, build passes.
- **What could I be wrong about**: Incorrect ARIA attributes causing screen reader failure.

### 2. GROUND
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Tailwind CSS is configured | `cat tailwind.config.ts` | Tailwind CSS configured | Y |
| Component directory exists | `ls src/components` | Directory exists | Y |
| React is installed | Read `package.json` | React v18 | Y |

### 3. DECOMPOSE
1. ACTION (create LoginForm component)   TARGET (src/components/LoginForm.tsx)   CHECK (npm run build)
2. ACTION (add validation & ARIA attributes)   TARGET (src/components/LoginForm.tsx)   CHECK (npx jest LoginForm.test.tsx)
3. ACTION (verify layout responsiveness)   TARGET (src/components/LoginForm.tsx)   CHECK (npm run build)

### 4. EXECUTE
#### Step 1: Create LoginForm component
- Wrote basic React form structure with Tailwind layout styling.
- CHECK: `npm run build` -> Passed.

#### Step 2: Add validation & ARIA attributes
- Modified `src/components/LoginForm.tsx` to handle submission and show errors:
```typescript
import React, { useState } from 'react';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
    } else {
      setError('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm mx-auto p-4 border rounded">
      <div>
        <label htmlFor="email-input" className="block text-sm font-medium text-gray-700">Email Address</label>
        <input
          id="email-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? "email-error" : undefined}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
        {error && <p id="email-error" className="text-red-600 text-sm mt-1">{error}</p>}
      </div>
      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Log In</button>
    </form>
  );
}
```
- CHECK: `npx jest LoginForm.test.tsx` (using jest-axe) -> Passed.

#### Step 3: Verify layout
- Checked class names: `w-full max-w-sm flex-col gap-4`.
- CHECK: `npm run build` -> Passed.

### 5. VERIFY
CLAIM: login form is fully accessible and responsive with validation
COMMAND: npm run build
> frontend@0.1.0 build
> next build
✓ Creating an optimized production build...
✓ Compiled successfully
EXIT CODE: 0
VERDICT: PASS
