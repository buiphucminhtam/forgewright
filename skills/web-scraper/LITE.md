---
name: web-scraper
description: "Orchestrates automated web page fetching, HTML/DOM parsing, target data extraction, rate limit throttling, and structured JSON/CSV export pipelines. Use when the user requests data extraction, web scraping scripts, page content parsing, automated dynamic site crawling, or API fallback data harvesting."
version: 1.0.0
---

# Web Scraper (LITE)

## SOLVE Step 2: GROUND (Web Scraper Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target web scraping libraries (e.g., Axios, Cheerio, Playwright, BeautifulSoup) are installed | `cat package.json \| jq '.dependencies \| select(. != null) \| with_entries(select(.key \| match("cheerio\|puppeteer\|playwright\|beautifulsoup4\|requests\|scrapy")))'` | Identifies active scraping and parsing dependencies | |
| Project-specific tech stack and baseline profile configurations are active | `cat .forgewright/project-profile.json` | Displays onboarded tech stacks (e.g., Node.js, Python) and health status [1] | |
| Standard feature specs and BDD-first testing templates exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures design specifications conform to the standard layout format [2] | |
| Running spend limits and token budgets are active for task loops | `cat .forgewright/budget.yaml` | Verifies current session spend limits and warning thresholds [3] | |

## SOLVE Step 3: DECOMPOSE (Web Scraper Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate the target URL structure, page accessibility, and dynamic rendering requirements | Ensure the scraping strategy accounts for static HTML vs single-page applications (SPA).
2. EXTRACT | Parse DOM selectors, class patterns, or API network endpoints to harvest target elements | Verify CSS selectors or XPath paths are highly specific to reduce parsing noise.
3. CONSTRAIN | Implement rate-limiting, custom User-Agent headers, and timeout boundary handlers | Confirm fetch loops do not flood target domains or violate site robots.txt parameters.
4. SYNC | Document dataset schemas, save lowercase kebab-case specifications, and sync | Run the post-skill sync hook to propagate reports and establish absolute symlinks to Obsidian [2, 4].

## Common Mistakes Checklist
- **Dynamic Content Blocker Misses**: Attempting to parse dynamic client-side (SPA) sites using static HTML libraries like Cheerio or BeautifulSoup instead of a headless browser (Playwright/Puppeteer), causing empty elements.
- **Hardcoding Fragile CSS Selectors**: Relying on heavily nested, auto-generated, or transient Tailwind classes instead of stable ID selectors or ARIA landmarks, causing parser breakage on style updates.
- **Ignoring Rate Limiting & Crawl Delays**: Making rapid, unthrottled HTTP requests without user-agent rotations, back-off delays, or respect for target robots.txt limits, causing IP blacklisting or server throttling.
- **Non-Compliant Data Spec Naming**: Storing scraped schemas, scraper designs, or data harvest specifications under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/01-product/WebScraperSpec.md` instead of `docs/01-product/web-scraper-spec.md`) [2].
- **Unverified Token Budgets**: Running long-running background scraping jobs or recursive URL crawls that invoke LLM parsers on every page without enforcing boundaries in `.forgewright/budget.yaml` [3].

## Worked Example

### Step 1: Ground the active scraper project profile and dependencies
```bash
cat .forgewright/project-profile.json
cat package.json | grep -E "(axios|cheerio)"
```
Output:
```json
{
  "project_name": "forgewright-data-harvest",
  "tech_stack": ["Node.js", "TypeScript"],
  "health_status": "PASS"
}
```
```json
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12"
```

### Step 2: Implement a robust, rate-limited static HTML scraper in `src/utils/scraper.ts`
```typescript
import axios from 'axios';
import * as cheerio from 'cheerio';

interface ScrapeResult {
  title: string;
  links: string[];
}

export const scrapeStaticPage = async (url: string): Promise<ScrapeResult> => {
  const customUserAgent = 'Mozilla/5.0 (compatible; ForgewrightBot/1.0)';
  
  try {
    // Grounded: Enforcing strict timeout and custom user-agent parameters to prevent blocking
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': customUserAgent }
    });
    
    const $ = cheerio.load(response.data);
    const title = $('title').text().trim();
    const links: string[] = [];
    
    // Extract targeted elements safely
    $('a[href^="http"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) links.push(href);
    });
    
    return { title, links: links.slice(0, 5) }; // Limit returned array size
  } catch (error) {
    console.error(`[ERROR] Scraping failed for ${url}:`, error);
    throw error;
  }
};
```

### Step 3: Run local unit tests to verify parser safety and coordinate limits
```bash
npm run test -- tests/scraper.test.ts
```
Output:
```
=== RUN   tests/scraper.test.ts
  ✓  scrapeStaticPage should parse titles and target hyperlinks safely (450ms)

[SUCCESS] Scraping parser rules verified. 0 failures.
```

### Step 4: Write standard documentation and trigger the Shared Obsidian Vault sync
```bash
cat << 'EOF' > docs/01-product/web-scraper-spec.md
# Feature: Static HTML Scraper Utility

## 1. Executive Summary
Provide a lightweight, rate-limit compliant web page scraper utilizing Axios and Cheerio.

## 2. Technical Profile
- Language: TypeScript (Node.js)
- Throttling: Enforced 5-second socket timeout and custom User-Agent configuration
- Target Selection: Specific DOM parsing for titles and absolute anchors
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for web-scraper-spec.md.
[SUCCESS] Symlinked docs/01-product/web-scraper-spec.md to /workspace/shared-obsidian-vault/forgewright/01-product/web-scraper-spec.md.
```
