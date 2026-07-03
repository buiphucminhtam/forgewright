---
name: accessibility-engineer
description: "Orchestrates accessibility audits, WCAG 2.1/2.2 AA compliance testing, and automated ARIA/semantic HTML remediation. Use when the user requests frontend UI updates, accessibility audits, design system reviews, or screen reader and keyboard navigation validation."
version: 1.0.0
---

# Accessibility Engineer (LITE)

## SOLVE Step 2: GROUND (Accessibility Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target accessibility auditing libraries (axe-core, Playwright) are installed | `cat package.json \| jq '.devDependencies["@axe-core/playwright"]'` | Validates axe accessibility testing engine dependency | |
| Existing accessibility guidelines or compliance specs are loaded | `find docs/04-testing/ -name "*accessibility*" -o -name "*wcag*"` | Lists existing lowercase, kebab-case accessibility documentation | |
| Standardized QA/testing template is present under testing directory | `cat docs/04-testing/TEMPLATE-TEST-PLAN.md` | Verification of layout templates for accessibility logs | |
| Active token budget boundaries are mapped for headless browser audits | `cat .forgewright/budget.yaml` | Displays configured API token cost and spend limits | |

## SOLVE Step 3: DECOMPOSE (Accessibility Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Run automated WCAG checks (axe-core) on target routes and components | Capture violation counts, impact levels (critical, serious, moderate), and affected selectors.
2. REMEDIATE | Correct non-semantic markups, missing aria-states, and keyboard traps | Ensure interactive components receive proper keyboard focus and ARIA attributes (e.g., `aria-expanded`, `tabindex`).
3. CONFIRM | Run manual or automated keyboard focus sequence traversals | Verify logical tab orders and focus-restoration rules for modal/dialog closures.
4. SYNC | Document compliant status logs to `docs/04-testing/` and Obsidian | Write kebab-case summaries and trigger absolute symlink sync hooks to update the central wiki.

## Common Mistakes Checklist
- **Keyboard Trap Ingestion**: Launching overlays or modals without capturing keyboard focus or forgetting to restore focus to the trigger button on close.
- **Div-Soup Interactive Buttons**: Creating clickable actions using standard `<div>` or `<span>` elements without mapping keyboard listener fallbacks (Enter/Space keys) and `role="button"`.
- **Contrast Ratio Degradation**: Implementing color schemas below WCAG AA thresholds (4.5:1 for normal text, 3:1 for large text) without verifying UI styling configurations.
- **Alt-Text Redundancy**: Writing screen reader alt-texts starting with descriptive words like "image of" or "photo of" instead of semantic representations.
- **Non-Compliant File Names**: Writing test results or design reports under `docs/` using CamelCase, spaces, or absolute paths instead of lowercase kebab-case.

## Worked Example

### Step 1: Check accessibility test package integration and templates
```bash
cat package.json | grep -E "axe-core"
cat docs/04-testing/TEMPLATE-TEST-PLAN.md
```
Output:
```json
    "@axe-core/playwright": "^4.9.0"
```

### Step 2: Remediate modal with accessible focus-trap and ARIA bindings in `src/AccessibleModal.tsx`
```bash
cat << 'EOF' > src/AccessibleModal.tsx
import React, { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

export const AccessibleModal: React.FC<ModalProps> = ({ isOpen, onClose, title }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="modal-overlay">
      <div className="modal-content">
        <h2 id="modal-title">{title}</h2>
        <button 
          ref={closeButtonRef} 
          onClick={onClose} 
          aria-label="Close dialog"
        >
          X
        </button>
        <div className="modal-body">
          <p>This content is fully navigable via screen readers and keyboard sequences.</p>
        </div>
      </div>
    </div>
  );
};
EOF
```

### Step 3: Execute Playwright accessibility tests to confirm WCAG 2.1 AA compliance
```bash
npx playwright test tests/accessibility.spec.ts
```
Output:
```
[SUCCESS] Running axe-core accessibility scanner...
[WCAG AA] 0 Critical Violations found.
[SUCCESS] Generated docs/04-testing/wcag-accessibility-audit.md.
```

### Step 4: Synchronize audit reports to the Shared Obsidian Vault
```bash
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Symlinked docs/04-testing/wcag-accessibility-audit.md to /workspace/shared-obsidian-vault/forgewright/04-testing/wcag-accessibility-audit.md.
```
