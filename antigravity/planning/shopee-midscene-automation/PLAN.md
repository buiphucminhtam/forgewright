# Shopee Midscene Automation — Plan

## Why Midscene vs Playwright

| Factor | Playwright | Midscene |
|--------|-----------|----------|
| Detection | Shopee detects CDP/automation flags, headless mode blocked | Real Mac input events (CGEvent) — indistinguishable from human |
| Browser fingerprint | Detectable automation fingerprint | Uses real Safari/Chrome with real user profile |
| Anti-bot bypass | Fails at Shopee's anti-bot | Passes because it's real user input |
| Integration | OpenClaw browser relay (profile-based) | Direct Mac desktop control |

**Shopee actively blocks Playwright automation.** Midscene uses real macOS input events (`CGEventPost`) that are the same as physically pressing keys/moving the mouse. Shopee cannot distinguish this from a real user.

---

## Architecture

```
Shopee (Safari/Chrome - real browser)
    ↓ real Mac input via Midscene
Mac Desktop
    ↓ screenshot + AI vision parse
Product data extraction
    ↓
affiliate.shopee.vn (custom link generator)
    ↓ real Mac input via Midscene  
Affiliate links
    ↓
Facebook (existing poster)
    ↓
MiniMax image generation
    ↓
Facebook post with 3 images + affiliate link
```

---

## Phase 1: Product Research

### Goal
Find trending products on Shopee and extract: name, price, URL, rating, sold count.

### Steps
1. **Connect to Mac** via Midscene
2. **Open Safari** → navigate to `shopee.vn`
3. **Wait for page load** → take screenshot to verify logged-in state
4. **Click search bar** → type keyword (configurable: "serum", "kem chống nắng", etc.)
5. **Press Enter** → wait for search results
6. **Scroll to load more products** (3-5 scrolls)
7. **Take screenshot** of product listing
8. **Parse product cards** from screenshot using vision AI (Gemini)
9. **Save to** `products_midscene.json`

### Midscene Commands Used
```bash
npx @midscene/computer@1 connect
npx @midscene/computer@1 take_screenshot
npx @midscene/computer@1 act --prompt "click the search bar, type 'serum vitamin c', press Enter"
npx @midscene/computer@1 act --prompt "scroll down to see more products"
npx @midscene/computer@1 disconnect
```

### Output Schema
```json
{
  "search_keyword": "serum vitamin c",
  "searched_at": "2026-04-17T14:30:00+07:00",
  "products": [
    {
      "name": "Serum Vitamin C 20% The Ordinary",
      "price": "₫199.000",
      "url": "https://shopee.vn/product/...",
      "rating": "4.8",
      "sold_count": "12.5K",
      "screenshot_region": "card_1"
    }
  ]
}
```

### Script
`~/.openclaw/workspace/automation/scripts/shopee_research_midscene.py`

---

## Phase 2: Convert to Affiliate Links

### Goal
Convert product URLs to Shopee affiliate links via affiliate.shopee.vn.

### Steps
1. **Navigate to** `affiliate.shopee.vn` (already logged in via Safari)
2. **Click "Tạo link riêng"** (custom link generator)
3. **Type product URL** into input field
4. **Click tạo link** → wait for affiliate URL to appear
5. **Extract affiliate URL** from UI (take screenshot + vision parse)
6. **Repeat for all products** (with random delay 5-10s between)
7. **Save to** `affiliate_links.json`

### Safety/Stealth
- Random delay 5-10s between each link creation
- Vary click positions slightly (±5px)
- No rapid sequences
- Screenshot to verify each step

---

## Phase 3: Facebook Post

### Goal
Post affiliate product to Facebook page with images + affiliate link.

### Steps
1. Use existing `fb-content-poster` infrastructure
2. Generate 3 product images using **MiniMax**
3. Construct post: product intro → images → affiliate link → call to action
4. Post to configured Facebook page
5. Log post result

### Integration
- Read affiliate links from `affiliate_links.json`
- Generate images from product screenshots or via MiniMax
- Existing poster handles Facebook API

---

## Safety & Stealth

| Technique | Implementation |
|-----------|---------------|
| Random delays | 3-8s between actions (random.uniform) |
| Vary click positions | ±5px random offset on all click coordinates |
| No rapid sequences | Minimum 3s gap between any two actions |
| Screenshot verification | Take screenshot after every major action to confirm success |
| Recover from detection | If suspicious dialog detected → pause 30s → retry |

### Anti-Detection Rules
1. **Never run more than 10 actions/minute** on Shopee
2. **Randomize order** of actions (don't always click same spot first)
3. **Human-like timing**: fast enough to be useful, slow enough to be believable
4. **Real browser**: Safari with real Shopee session cookies (already logged in)

---

## File Structure

```
automation/
├── scripts/
│   └── shopee_research_midscene.py      # Phase 1: Product research
├── runtime/state/shopee_affiliate/
│   ├── products/                        # Extracted products
│   │   └── products_midscene.json
│   └── affiliate_links.json             # Generated affiliate links
└── planning/shopee-midscene-automation/
    └── PLAN.md                          # This plan
```

---

## Prerequisites

1. **macOS Accessibility permission** granted to Terminal
2. **Safari or Chrome** with active Shopee session (already logged in)
3. **Midscene connected** to Mac display
4. **Affiliate account** active at affiliate.shopee.vn

---

## Phase 1 Test Checklist

- [ ] Midscene connects to Mac desktop
- [ ] Safari opens to Shopee home
- [ ] Search for keyword "serum vitamin c"
- [ ] At least 3 products extracted with real URLs
- [ ] Data saved to `products_midscene.json`
- [ ] Script runs without crash
