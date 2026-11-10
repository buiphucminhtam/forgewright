/**
 * Canonical Playwright E2E Suite for Forgewright Docs Hub (RF08).
 * Runs against a real rendered Docs Hub static site served over an isolated
 * loopback HTTP server with clean browser contexts and deterministic teardown.
 */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { defaultConfig as healwrightConfig } from '../healwright.config.js';

const REPO_ROOT = resolve(process.cwd());

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function seedDemoProject(root: string): void {
  mkdirSync(join(root, '.forgewright'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(
    join(root, '.forgewright/docs-manifest.json'),
    JSON.stringify(
      {
        schema_version: 1,
        project: { id: 'forgewright-e2e', title: 'Forgewright E2E Demo' },
        sources: [{ path: 'docs/Guide.md', type: 'architecture' }],
        truth: ['docs/Guide.md'],
        adapters: { git: false, gitnexus: false, evidence_summary: false },
        privacy: { mode: 'allowlist', allow: ['docs/Guide.md'], exclude: [] },
      },
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(
    join(root, 'docs/Guide.md'),
    '# Architecture Guide\n\n## Security Invariants\n\nVerified **runtime** boundary. <script>window.__xssExecuted = true;</script> [unsafe](javascript:window.__xssExecuted=true)\n',
    'utf8',
  );
}

test.describe('Docs Hub Critical User Flow & Error Boundaries (RF08)', () => {
  let tempRoot = '';
  let siteDir = '';
  let server: Server | null = null;
  let baseUrl = '';
  const runId = `rf08-e2e-${randomUUID()}`;

  test.beforeAll(async () => {
    execFileSync("npm", ["--prefix", "src/cli", "run", "build"], {
      cwd: REPO_ROOT,
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    tempRoot = mkdtempSync(join(tmpdir(), 'fw-playwright-e2e-'));
    siteDir = join(tempRoot, 'site');
    seedDemoProject(tempRoot);
    execFileSync(
      process.execPath,
      [join(REPO_ROOT, 'src/cli/dist/index.js'), 'docs', 'build', tempRoot, '--output', siteDir, '--json'],
      { cwd: REPO_ROOT, stdio: 'pipe' },
    );
    server = createServer((req, res) => {
      const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
      const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const candidate = resolve(siteDir, normalize(relative));
      if (!candidate.startsWith(siteDir) || !existsSync(candidate)) {
        const notFound = join(siteDir, '404.html');
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end(existsSync(notFound) ? readFileSync(notFound) : 'Not found');
        return;
      }
      const ext = extname(candidate).toLowerCase();
      res.writeHead(200, { 'content-type': MIME_TYPES[ext] ?? 'application/octet-stream' });
      res.end(readFileSync(candidate));
    });
    await new Promise<void>((resolveListen) => server!.listen(0, '127.0.0.1', resolveListen));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  test.afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
      server = null;
    }
    if (tempRoot && existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('navigates project hub, filters search, and records revision-bound screenshot/trace evidence', async ({ browser }) => {
    expect(healwrightConfig.healing.allowOracleMutation).toBe(false);
    expect(healwrightConfig.healing.preserveAcceptanceOracle).toBe(true);

    const evidenceDir = join(REPO_ROOT, '.forgewright/runtime/fw-argon-refactor-20261109/rf08-artifacts');
    mkdirSync(evidenceDir, { recursive: true });
    const tracePath = join(evidenceDir, `${runId}-trace.zip`);
    const screenshotPath = join(evidenceDir, `${runId}-hub.png`);

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/index.html`);
      await expect(page.locator('h1')).toContainText('Documentation projects');
      await expect(page.getByRole('link', { name: 'Forgewright E2E Demo' })).toBeVisible();

      // Navigate to rendered Markdown document and verify XSS / unsafe URL protection
      await page.goto(`${baseUrl}/projects/forgewright-e2e/docs/docs/Guide.md.html`);
      await expect(page.locator('#security-invariants')).toHaveText('Security Invariants');
      const xssExecuted = await page.evaluate(() => (window as unknown as Record<string, unknown>).__xssExecuted === true);
      expect(xssExecuted).toBe(false);
      await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);

      // Navigate to Search page and exercise interactive query filtering
      await page.goto(`${baseUrl}/search.html`);
      const searchInput = page.locator('[data-search]');
      await expect(searchInput).toBeVisible();
      await searchInput.fill('Security Invariants');
      await expect(page.locator('[data-results]')).toContainText('Architecture Guide');
      await searchInput.fill('nonexistent-query-xyz');
      await expect(page.locator('[data-results]')).toContainText('No matching documents.');

      await page.screenshot({ path: screenshotPath, fullPage: true });
    } finally {
      await context.tracing.stop({ path: tracePath });
      await context.close();
    }

    const shotBytes = readFileSync(screenshotPath);
    const traceBytes = readFileSync(tracePath);
    const cliDistPath = join(REPO_ROOT, 'src/cli/dist/index.js');
    const markdownSrcPath = join(REPO_ROOT, 'src/cli/src/docs/markdown.ts');
    const normalizeSrcPath = join(REPO_ROOT, 'src/cli/src/docs/normalize.ts');
    const renderSrcPath = join(REPO_ROOT, 'src/cli/src/docs/render.ts');
    const receipt = {
      schema: 'forgewright-playwright-e2e-receipt/v1',
      runId,
      taskId: 'FW-ARGON-REFACTOR-20261109',
      stage: 'RF08',
      baseRevision: 'c1200d575d63e8851fa6023ae1e78c996376b902',
      sourceBindings: {
        cliDistSha256: createHash('sha256').update(readFileSync(cliDistPath)).digest('hex'),
        markdownTsSha256: createHash('sha256').update(readFileSync(markdownSrcPath)).digest('hex'),
        normalizeTsSha256: createHash('sha256').update(readFileSync(normalizeSrcPath)).digest('hex'),
        renderTsSha256: createHash('sha256').update(readFileSync(renderSrcPath)).digest('hex'),
      },
      screenshot: { path: screenshotPath, sha256: createHash('sha256').update(shotBytes).digest('hex'), bytes: shotBytes.length },
      trace: { path: tracePath, sha256: createHash('sha256').update(traceBytes).digest('hex'), bytes: traceBytes.length },
    };
    writeFileSync(join(evidenceDir, 'rf08-playwright-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  });

  test('returns 404 and renders error boundary for missing routes', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    try {
      const response = await page.goto(`${baseUrl}/projects/forgewright-e2e/does-not-exist.html`);
      expect(response?.status()).toBe(404);
      await expect(page.locator('body')).toContainText('Page not found');
    } finally {
      await context.close();
    }
  });
});
