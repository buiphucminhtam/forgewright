---
name: conversion-optimizer
description: "Orchestrates landing page conversion rate optimization (CRO), A/B testing setups, sign-up flow analytics instrumentation, call-to-action (CTA) performance improvements, and user friction audits. Use when the user requests funnel optimization, conversion tracking scripts, checkout flow fixes, or analytics event auditing."
version: 1.0.0
---

# Conversion Optimizer (LITE)

## SOLVE Step 2: GROUND (Conversion Optimizer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target conversion pages, checkout flows, or landing page configs are indexed | `find docs/01-product/ -name \"*conversion*\" -o -name \"*checkout*\" -o -name \"*cta*\"` | ... | Y/N |
| Analytics tracking dependencies and scripts are installed | `cat package.json \| jq '.dependencies \| select(. != null) \| with_entries(select(.key \| match(\"plausible\\|mixpanel\\|analytics\\|segment\")))'` | ... | Y/N |
| Project-specific tech stack and profile configurations are active | `cat .forgewright/project-profile.json` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Conversion Optimizer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze checkout flow steps, form validation loops, and drop-off points | Verify form fields are minimized and any friction-inducing steps (e.g., redundant password steps) are flagged.
2. CONSTRUCT | Implement high-converting call-to-action (CTA) buttons, checkout forms, or copy variants | Ensure copywriting structures align with persuasive frameworks (e.g., AIDA) and strictly avoid hardcoded pricing values.
3. INSTRUMENT | Integrate analytics tracking event triggers or custom pixel scripts into CTA actions | Confirm that checkout submissions and page views successfully emit custom event metrics to analytics providers.
4. SYNC | Save optimization specifications under `docs/01-product/` and trigger sync | Verify file name compliance (lowercase kebab-case) and establish absolute symlinks to the Shared Obsidian Vault.

## Common Mistakes Checklist
- **CTA Overhauls without Event Telemetry**: Modifying buttons, sign-up cards, or checkout logic without writing equivalent tracking triggers, leaving conversion metrics blind.
- **Hardcoding Partner Keys and Campaign Secrets**: Saving Google Analytics IDs, Plausible tracking tokens, or UTM tracking variables directly inside frontend source files instead of utilizing environment variables.
- **Form Field Bloat & Friction Points**: Requiring users to fill out non-essential inputs or forcing immediate account registrations during billing steps, leading to high cart-abandonment rates.
- **Non-Compliant File Names**: Storing landing page copy maps, A/B test setups, or optimization audit logs under `docs/` using CamelCase instead of strictly lowercase kebab-case (e.g., `docs/01-product/ConversionCheck.md` instead of `docs/01-product/conversion-check.md`).

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground the active project profile and tracking dependencies
```bash
cat .forgewright/project-profile.json
cat package.json | grep -E "(plausible|mixpanel)"
```
```json
    "plausible-tracker": "^0.3.8"
```

### Step 2: Implement a safe, conversion-optimized checkout form in `src/components/checkout-form.tsx`
```typescript
import React, { useState } from 'react';
import Plausible from 'plausible-tracker';

const { trackEvent } = Plausible();

export const CheckoutForm = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsSubmitting(true);
    // Secure conversion tracking instrumentation
    trackEvent('checkout_submitted', { props: { email_domain: email.split('@') } });
    
    setTimeout(() => {
      setIsSubmitting(false);
      trackEvent('checkout_success');
      console.log('[ANALYTICS] Dispatched successful checkout event.');
    }, 1000);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-white rounded-xl shadow-lg max-w-md mx-auto">
      <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
        Email Address
      </label>
      <input
        id="email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="alex@company.com"
        className="w-full px-4 py-3 rounded-lg border border-slate-200 mb-4 focus:ring-2 focus:ring-sky-500 outline-none"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
      >
        {isSubmitting ? 'Processing...' : 'Complete Payment'}
      </button>
    </form>
  );
};
```

