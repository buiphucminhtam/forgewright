---
name: growth-marketer
description: "Orchestrates landing page copy iterations, conversion rate optimization (CRO), analytics event tracking configurations, and growth funnel auditing. Use when the user requests copy changes, landing page creation, SEO metadata updates, tracking pixel integrations, or acquisition funnel analysis."
version: 1.0.0
---

# Growth Marketer (LITE)

## SOLVE Step 2: GROUND (Growth Marketer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target landing pages, copy configs, or funnel assets are indexed | `find docs/01-product/ -name "*marketing*" -o -name "*landing*" -o -name "*funnel*"` | Identifies active marketing specifications and copy assets | |
| Analytics tracking libraries (Plausible, Mixpanel, Google Analytics) are installed | `cat package.json \| jq '.dependencies \| select(. != null) \| with_entries(select(.key \| match("plausible\|mixpanel\|analytics")))'` | Confirms active frontend analytical frameworks and versions | |
| Active project tech stack and onboarding status profile are defined | `cat .forgewright/project-profile.json` | Displays onboarded tech stacks (e.g., Next.js, React) and health indicators [1] | |
| Active session spend trackers and token budget thresholds are configured | `cat .forgewright/budget.yaml` | Verifies cost boundaries prior to initiating heavy copy variants [2, 3] | |

## SOLVE Step 3: DECOMPOSE (Growth Marketer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Review landing page copy, visual media loads, and SEO metadata tags | Verify color contrast ratios, H1-H3 tag distributions, and core web vitals load performance.
2. GENERATE | Build multi-variant A/B landing page copies, social assets, or signup forms | Ensure text structures conform to conversion frameworks (e.g., AIDA) and strictly avoid hardcoded pricing values.
3. INSTRUMENT | Integrate analytics tracking event triggers or custom tracking pixels into the codebase | Confirm tracking calls (e.g., click triggers, conversion completions) execute securely on target component buttons.
4. SYNC | Save marketing specs as lowercase kebab-case under `docs/01-product/` and sync | Trigger standard post-skill sync scripts to establish absolute symlinks for documentation [4, 5].

## Common Mistakes Checklist
- **Missing Tracking Hooks**: Redesigning landing pages or CTA copy without adding explicit conversion tracking event triggers, making subsequent performance analysis impossible.
- **Hardcoded Campaign Parameters**: Hardcoding campaign variables, UTM source keys, or partner credentials directly inside components instead of using runtime config variables.
- **Heavy Media Attachments**: Placing uncompressed, massive image assets or high-resolution video banners directly on high-traffic landing pages, destroying mobile load speed metrics.
- **Non-Compliant File Names**: Storing acquisition funnel maps, design assets, or copy guidelines under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/01-product/GrowthStrategy.md` instead of `docs/01-product/growth-strategy.md`) [5].
- **Unverified AI Token Spending**: Generating dozens of procedural landing page copywriting iterations without verifying active session budgets inside `.forgewright/budget.yaml` [2, 3].

## Worked Example

### Step 1: Ground the target platform stack and analytics settings
```bash
cat .forgewright/project-profile.json
cat package.json | grep -E "(plausible|mixpanel)"
```
Output:
```json
{
  "project_name": "forgewright-saas-landing",
  "tech_stack": ["Next.js", "TypeScript", "Tailwind CSS"],
  "health_status": "PASS"
}
```
```json
    "plausible-tracker": "^0.3.8"
```

### Step 2: Create a secure, compliant, lowercase kebab-case copy specification under `docs/01-product/`
```bash
cat << 'EOF' > docs/01-product/landing-page-copy.md
# Feature: Landing Page Copy Optimization

## 1. Executive Summary
Provide high-converting, CTA-focused hero copy optimized for developer-audience conversion.

## 2. Core Copy Matrix
- **Hero Title**: "The AI Orchestrator That Learns From Every Failure"
- **Sub-headline**: "Stop debugging raw loops. Let Forgewright self-heal your pipelines."
- **Primary CTA**: "Deploy Free Local Harness"

## 3. Analytics Events
- Button: `btn-deploy-harness`
- Event ID: `harness_deployment_initiate`
- Custom Dimension: `{ source: "hero-section" }`
EOF
```

### Step 3: Implement the conversion event hook safely inside the button component
Create `src/components/DeployButton.tsx`:
```typescript
import React from 'react';
import Plausible from 'plausible-tracker';

const { trackEvent } = Plausible();

export const DeployButton = () => {
  const handleDeployClick = () => {
    // Verified conversion tracking integration
    trackEvent('harness_deployment_initiate', {
      props: { source: 'hero-section' }
    });
    console.log('[ANALYTICS] Dispatched conversion tracker metric.');
  };

  return (
    <button 
      onClick={handleDeployClick}
      className="rounded-lg bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-500 active:bg-sky-700"
    >
      Deploy Free Local Harness
    </button>
  );
};
```

### Step 4: Run the post-skill synchronization script to link docs to Obsidian
```bash
# Execute synchronization hook to align docs with the Shared Obsidian Vault
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for landing-page-copy.md.
[SUCCESS] Symlinked docs/01-product/landing-page-copy.md to /workspace/shared-obsidian-vault/forgewright/01-product/landing-page-copy.md.
```
