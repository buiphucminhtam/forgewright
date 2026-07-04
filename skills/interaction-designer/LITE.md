---
name: interaction-designer
description: "Orchestrates interactive UI/UX prototyping, user flows, frontend component layouts, accessibility (a11y) audits, and responsive visual design specifications. Use when the user requests screen wireframes, UI/UX improvements, design system structures, or accessibility optimizations (WCAG)."
version: 1.0.0
---

# Interaction Designer (LITE)

## SOLVE Step 2: GROUND (Interaction Designer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target frontend libraries and styling frameworks are defined | `cat package.json \| jq '.dependencies \| select(. != null) \| with_entries(select(.key \| match("tailwind\|sass\|styled-components\|framer-motion")))'` | ... | run the check command and paste output |
| Existing visual guidelines, mockups, or wireframe specs are indexed | `find docs/ -name "*design*" -o -name "*ux*" -o -name "*wireframe*"` | ... | run the check command and paste output |
| Visual regression test (VRT) suites or screenshots are configured | `cat playwright.config.ts \|\| ls -la tests/` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Interaction Designer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Scan target component layouts, responsive breakpoints, and WCAG accessibility tags | Verify contrast ratios pass AAA/AA standards and screen elements utilize appropriate role and aria-label attributes.
2. CONSTRUCT | Implement interactive components utilizing responsive styling, state machines, and animations | Ensure proper loading indicators, disabled actions during API calls, and error boundaries are configured.
3. MAP | Build comprehensive visual sequence maps, user journeys, or Mermaid sequence charts | Confirm execution paths show intuitive user interactions and are saved using kebab-case under docs/.

## Common Mistakes Checklist
- **Keyboard Traps & Missing ARIA Tags**: Creating custom modal dialogs, slide-overs, or interactive tabs without focus traps or correct `aria-expanded` and `aria-label` properties, breaking screen readers.
- **Unoptimized CLS (Cumulative Layout Shift)**: Rendering dynamic components without pre-allocating height or bounding box dimensions, causing sudden jumps and layout shifts on load.
- **Non-Compliant File Structures**: Creating design assets, style guides, or interface wireframes under `docs/` using CamelCase, spaces, or absolute paths instead of strictly lowercase kebab-case (e.g., `docs/01-product/InteractiveCard.md` instead of `docs/01-product/interactive-card.md`).

### Step 1: Ground target styling frameworks and project status
```bash
cat .forgewright/project-profile.json
cat package.json | grep -E "(tailwind|framer-motion)"
```
```json
    "tailwindcss": "^3.4.1",
    "framer-motion": "^11.0.0"
```

### Step 2: Implement an accessible, highly interactive component in `src/components/interactive-accordion.tsx`
```typescript
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AccordionProps {
  title: string;
  content: string;
}

export const InteractiveAccordion: React.FC<AccordionProps> = ({ title, content }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="accordion-content"
        className="flex w-full justify-between items-center px-5 py-4 text-left font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
      >
        <span>{title}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-500"
          aria-hidden="true"
        >
          ▼
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id="accordion-content"
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="px-5 pb-5 pt-2 text-slate-600 border-t border-slate-100 leading-relaxed">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
```
