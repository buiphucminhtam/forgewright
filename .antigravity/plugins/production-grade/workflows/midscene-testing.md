---
description: Set up and run Midscene.js vision-based AI testing for web, mobile, and desktop
---

# Midscene Vision Testing Workflow

Use this workflow to add AI-powered, vision-based testing to any project. Midscene.js uses visual language models to interact with UIs through natural language — no selectors, no DOM dependency.

## Prerequisites
- Node.js installed
- Vision model API access (Gemini Flash recommended — cheapest + fastest)
- For mobile: ADB (Android) or WebDriverAgent (iOS)

## Steps

### Phase 1: Setup

1. **Install Midscene for your test runner:**
   ```bash
   # With Playwright (recommended)
   npm install @midscene/web @playwright/test --save-dev

   # With Puppeteer
   npm install @midscene/web puppeteer --save-dev
   ```

2. **Configure model (create `.env`):**
   ```env
   # Gemini Flash — recommended (fast, cheap, accurate)
   MIDSCENE_MODEL_API_KEY="your-google-api-key"
   MIDSCENE_MODEL_NAME="gemini-3-flash"
   MIDSCENE_MODEL_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
   MIDSCENE_MODEL_FAMILY="gemini"
   ```

3. **Install cross-platform skills (optional):**
   ```bash
   npx skills add web-infra-dev/midscene-skills
   ```

### Phase 2: Write Vision Tests

4. **Create test file with Midscene + Playwright:**
   ```typescript
   // tests/e2e/vision/flows/checkout.vision.ts
   import { PlaywrightAiFixture } from '@midscene/web/playwright';
   import { test as base, expect } from '@playwright/test';

   const test = base.extend(PlaywrightAiFixture());

   test('complete checkout flow', async ({ page, ai, aiAssert, aiQuery }) => {
     await page.goto('/products');

     // Natural language interactions
     await ai('click on the first product');
     await ai('click "Add to Cart"');
     await ai('open the shopping cart');
     await aiAssert('cart contains 1 item');

     // Extract data from UI
     const cart = await aiQuery(
       { total: 'string', items: 'number' },
       'get cart total and item count'
     );
     expect(cart.items).toBe(1);

     await ai('proceed to checkout and complete purchase');
     await aiAssert('order confirmation is displayed');
   });
   ```

5. **Add visual assertions for design QA:**
   ```typescript
   test('dark mode renders correctly', async ({ page, ai, aiAssert }) => {
     await page.goto('/settings');
     await ai('toggle dark mode switch');
     await aiAssert('background is dark, text is light');
     await aiAssert('all buttons have visible contrast against dark background');
   });
   ```

### Phase 3: Run and Debug

6. **Run vision tests:**
   ```bash
   npx playwright test tests/e2e/vision/ --reporter=html
   ```

7. **View Midscene visual replay:**
   ```bash
   # Reports generated automatically at ./midscene_run/report/
   open ./midscene_run/report/index.html
   ```

### Phase 4: Mobile Testing (Optional)

8. **Android testing:**
   ```bash
   # Connect device via ADB
   adb devices
   # Then in your agent: "Use Midscene android skill to test the login flow"
   ```

9. **iOS testing:**
   ```bash
   # Start WebDriverAgent on simulator/device
   # Then in your agent: "Use Midscene ios skill to verify the home screen"
   ```

## Cost Estimation

| Model | Cost per Call | Speed | Accuracy |
|-------|-------------|-------|----------|
| Gemini 3 Flash | ~$0.001 | ~2s | High |
| Gemini 3 Pro | ~$0.005 | ~3s | Very High |
| Qwen3-VL (self-hosted) | Free | ~2-4s | High |

A typical E2E flow with 10 vision steps costs **~$0.01-0.05** per run.

## Integration with Forgewright Skills

| Skill | How Midscene Helps |
|-------|--------------------|
| **QA Engineer** | Phase 5c — vision E2E tests alongside Playwright |
| **Frontend Engineer** | Visual QA for design fidelity without manual review |
| **Mobile Engineer** | Cross-platform testing (Android + iOS) with natural language |
| **UI Designer** | Automated design spec validation against implementation |
