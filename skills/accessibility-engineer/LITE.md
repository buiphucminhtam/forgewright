---
name: accessibility-engineer
description: "Orchestrates accessibility audits, WCAG 2.1/2.2 AA compliance testing, and automated ARIA/semantic HTML remediation. Use when the user requests frontend UI updates, accessibility audits, design system reviews, or screen reader and keyboard navigation validation."
version: 1.0.0
---

# Accessibility Engineer (LITE)

## SOLVE Step 2: GROUND (Accessibility Engineer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target accessibility testing tools (axe-core or playwright) are installed | `cat package.json \| jq '.devDependencies["@axe-core/playwright"]'` | ... | run the check command and paste output |
| Standardized QA/testing templates are present | `cat docs/04-testing/TEMPLATE-TEST-PLAN.md` | ... | run the check command and paste output |
| Existing accessibility documentation or audits are located | `find docs/04-testing/ -name "*accessibility*" -o -name "*wcag*"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Accessibility Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Execute automated axe-core checks on UI routes | Capture WCAG 2.1/2.2 AA violations categorized by impact severity (critical, serious, moderate).
2. REMEDIATE | Correct non-semantic HTML layout tags, missing ARIA bindings, and keyboard traps | Verify focus visibility, modal dialog trap states, and keyboard sequences operate correctly.
3. CAPTURE | Run Playwright visual regression (VRT) checks locally or in virtual framebuffer | Ensure rendering changes comply with contrast rules and match visual baseline screenshots.

## Common Mistakes Checklist
- **Keyboard Trap Ingestion**: Launching overlays or modal frames without capturing focus within the modal container or neglecting to restore focus to the trigger on close.
- **Div-Soup Controls**: Creating interactive clickable objects using `<div>` or `<span>` without assigning a `role="button"`, `tabindex="0"`, and keyboard handlers (Enter/Space).
- **Non-Compliant File Names**: Writing audits or reports using camelCase, capital letters, or spaces instead of strictly lowercase kebab-case (e.g., `accessibility-compliance-report.md`) under `docs/04-testing/`.
- **Contrast Ratio Under-spec**: Applying background-foreground color schemas that fall below WCAG AA thresholds (4.5:1 for standard text, 3:1 for large text).
- **Verbose Tool Output Bloat**: Appending raw, multi-megabyte axe-core JSON logs directly into the chat session instead of offloading logs to `.forgewright/offload/`.

### Step 1: Check testing environment dependencies and template guidelines
```bash
cat package.json | grep -E "(axe-core|playwright)"
cat docs/04-testing/TEMPLATE-TEST-PLAN.md
```

### Step 2: Implement a semantic, keyboard-accessible modal component inside `src/Modal.tsx`
```typescript
import React, { useEffect, useRef } from 'react';

export const AccessibleModal = ({ isOpen, onClose, title }: { isOpen: boolean; onClose: () => void; title: string }) => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      closeBtnRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="modal-overlay">
      <div className="modal-content">
        <h2 id="modal-title">{title}</h2>
        <button ref={closeBtnRef} onClick={onClose} aria-label="Close dialog">
          Close
        </button>
        <div className="modal-body">
          <p>This panel captures tab focuses correctly.</p>
        </div>
      </div>
    </div>
  );
};
```

### Step 3: Run Playwright WCAG automated testing suite
```bash
npx playwright test tests/accessibility.spec.ts
```
