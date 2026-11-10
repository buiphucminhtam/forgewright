/**
 * RF11 Interactive UI Motion Scenario Verification for motion-director.
 *
 * Verifies:
 * - Immediate keyboard focus and input without entrance delay
 * - Rapid repeated toggles / mid-transition interruption in both directions
 *   settling deterministically to the final requested state
 * - Desktop (1280x800) and mobile (390x844) viewports
 * - Keyboard (Enter/Space/Escape) and touch tap interactions
 * - prefers-reduced-motion: reduce path (0s transition duration, preserved state/content)
 * - Bundled motion-quality-rubric evaluation with unobserved categories marked 'unscored'
 */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { resolveChromiumFunctionalProfile } from '../../../../scripts/runtime/playwright_chromium.mjs';

const REPO_ROOT = resolve(process.cwd());

const SCENARIO_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Forgewright Motion Director Scenario</title>
  <style>
    :root {
      --motion-duration: 180ms;
      --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
      --surface: #0f172a;
      --panel: #1e293b;
      --text: #f8fafc;
      --accent: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 1.5rem;
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--surface);
      color: var(--text);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }
    .btn, .quick-input {
      min-height: 44px;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      border: 1px solid #475569;
      background: var(--panel);
      color: var(--text);
      font-size: 1rem;
    }
    .btn:focus-visible, .quick-input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    @media (hover: hover) and (pointer: fine) {
      .btn {
        transition: transform var(--motion-duration) var(--motion-ease), background-color var(--motion-duration) var(--motion-ease);
      }
      .btn:hover {
        transform: translateY(-1px);
        background: #334155;
      }
    }
    .drawer {
      margin-top: 1rem;
      padding: 1.25rem;
      border-radius: 12px;
      background: var(--panel);
      border: 1px solid #334155;
      opacity: 0;
      transform: translateY(-8px);
      pointer-events: none;
      visibility: hidden;
      transition: opacity var(--motion-duration) var(--motion-ease), transform var(--motion-duration) var(--motion-ease), visibility var(--motion-duration);
    }
    .drawer[data-state="open"] {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
      visibility: visible;
    }
    @media (prefers-reduced-motion: reduce) {
      :root {
        --motion-duration: 0s;
      }
      .btn, .drawer {
        transition-duration: 0s !important;
        transform: none !important;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>Inspector Command Bar</h1>
    <div class="toolbar">
      <input id="command-input" class="quick-input" type="text" placeholder="Type command immediately..." aria-label="Command input">
      <button id="drawer-toggle" class="btn" type="button" aria-expanded="false" aria-controls="inspector-drawer">Toggle Inspector</button>
      <button id="after-toggle" class="btn" type="button">Next Action</button>
    </div>
    <section id="inspector-drawer" class="drawer" role="region" aria-label="Inspector details" data-state="closed" aria-hidden="true" inert>
      <h2>Active Telemetry</h2>
      <p id="drawer-status">State: closed · Toggles: 0</p>
      <button id="drawer-close" class="btn" type="button">Close Inspector</button>
    </section>
  </main>
  <script>
    (() => {
      const toggleBtn = document.getElementById('drawer-toggle');
      const closeBtn = document.getElementById('drawer-close');
      const drawer = document.getElementById('inspector-drawer');
      const status = document.getElementById('drawer-status');
      let isOpen = false;
      let count = 0;
      let transitionCancelledCount = 0;
      let activeTimer = 0;

      drawer.addEventListener('transitioncancel', () => {
        transitionCancelledCount += 1;
      });

      function applyState(nextOpen) {
        if (activeTimer) {
          clearInterval(activeTimer);
          activeTimer = 0;
        }
        isOpen = Boolean(nextOpen);
        count += 1;
        const stateLabel = isOpen ? 'open' : 'closed';
        drawer.setAttribute('data-state', stateLabel);
        drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        if (isOpen) {
          drawer.removeAttribute('inert');
          activeTimer = window.setInterval(() => {}, 500);
        } else {
          drawer.setAttribute('inert', '');
        }
        toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        status.textContent = 'State: ' + stateLabel + ' · Toggles: ' + count;
      }

      toggleBtn.addEventListener('click', () => applyState(!isOpen));
      closeBtn.addEventListener('click', () => {
        applyState(false);
        toggleBtn.focus();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
          applyState(false);
          toggleBtn.focus();
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && activeTimer) {
          clearInterval(activeTimer);
          activeTimer = 0;
        }
      });
      window.__getMotionTelemetry = () => ({
        isOpen,
        count,
        transitionCancelledCount,
        hasActiveTimer: activeTimer !== 0,
      });
      window.__cleanupMotion = () => {
        if (activeTimer) {
          clearInterval(activeTimer);
          activeTimer = 0;
        }
        return true;
      };
    })();
  </script>
</body>
</html>`;

test.describe('Motion Director Interactive UI Scenario (RF11)', () => {
  let server: Server | null = null;
  let url = '';
  const runId = `rf11-motion-${randomUUID()}`;

  test.beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(SCENARIO_HTML);
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    url = `http://127.0.0.1:${port}/`;
  });

  test.afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  test('verifies keyboard, touch, desktop/mobile viewports, rapid interruption, reduced-motion, and rubric packet', async ({ browser }) => {
    const evidenceBaseDir = resolve(
      REPO_ROOT,
      process.env.FORGEWRIGHT_E2E_EVIDENCE_DIR ?? '.forgewright/runtime/fw-argon-macfix-20261110/e2e-artifacts',
    );
    const evidenceDir = join(evidenceBaseDir, runId);
    mkdirSync(evidenceDir, { recursive: true });
    const tracePath = join(evidenceDir, `${runId}-trace.zip`);
    const mobileTracePath = join(evidenceDir, `${runId}-mobile-trace.zip`);
    const desktopShot = join(evidenceDir, `${runId}-desktop.png`);
    const mobileShot = join(evidenceDir, `${runId}-mobile.png`);

    // 0. Route through real no-mode skill_routing.py caller and verify motion-director is selected
    const pythonBin = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    const routedRaw = execFileSync(
      pythonBin,
      [
        '-X',
        'utf8',
        join(REPO_ROOT, 'scripts/runtime/skill_routing.py'),
        '--project-root',
        REPO_ROOT,
        '--prompt',
        'Design the UI transition choreography, timing/easing tokens, and prefers-reduced-motion behavior for our interactive drawer component.',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    const routed = JSON.parse(routedRaw);
    expect(routed.status).toBe('ok');
    expect(routed.skills.map((s: { name: string }) => s.name)).toContain('motion-director');

    // 1. Desktop viewport + keyboard focus + generation-matched mid-transition reversal in both directions + rapid toggle
    const desktopCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'no-preference',
    });
    await desktopCtx.tracing.start({ screenshots: true, snapshots: true });
    const page = await desktopCtx.newPage();
    let observedReversals: Array<{
      phase: string;
      activeAtInput: boolean;
      sameGenerationCancelledOrReversed: boolean;
      activeAnimations: Array<{
        id: number;
        property: string;
        currentTimeAtInput: number;
        progressAtInput: number;
        finishedOutcome: string;
        interruptedBeforeCompletion: boolean;
      }>;
    }> = [];
    try {
      await page.goto(url);
      await page.evaluate(async () => {
        const drawer = document.querySelector('#inspector-drawer') as HTMLElement | null;
        const relevantProps = new Set(['opacity', 'transform']);
        const ids = new WeakMap<Animation, number>();
        const metaById = new Map<
          number,
          {
            id: number;
            anim: Animation;
            property: string;
            finishedOutcome: string;
            settledAt: number | null;
          }
        >();
        let seq = 0;
        const win = window as unknown as Record<string, unknown>;
        win.__fwMotionProbe = {
          phase: 'setup',
          events: [] as Array<Record<string, unknown>>,
          cancels: [] as Array<{ phase: string; property: string; at: number }>,
        };
        const ensureTracked = (anim: Animation) => {
          let id = ids.get(anim);
          if (!id) {
            id = ++seq;
            ids.set(anim, id);
            const prop = (anim as unknown as { transitionProperty?: string }).transitionProperty || '';
            const rec = {
              id,
              anim,
              property: prop,
              finishedOutcome: 'pending',
              settledAt: null as number | null,
            };
            metaById.set(id, rec);
            anim.finished.then(
              () => {
                if (rec.finishedOutcome === 'pending') {
                  rec.finishedOutcome = 'fulfilled';
                  rec.settledAt = performance.now();
                }
              },
              () => {
                if (rec.finishedOutcome === 'pending') {
                  rec.finishedOutcome = 'aborted';
                  rec.settledAt = performance.now();
                }
              },
            );
          }
          return metaById.get(id)!;
        };
        win.__fwSampleDrawerAnimations = (onlyRelevant = true) => {
          if (!drawer) return [];
          return drawer
            .getAnimations()
            .filter((a) => {
              if ((a.effect as KeyframeEffect | null)?.target !== drawer) return false;
              const prop = (a as unknown as { transitionProperty?: string }).transitionProperty || '';
              if (onlyRelevant && prop && !relevantProps.has(prop)) return false;
              return true;
            })
            .map((a) => {
              const rec = ensureTracked(a);
              const timing = (a.effect as KeyframeEffect).getComputedTiming();
              return {
                id: rec.id,
                pending: Boolean(a.pending),
                state: String(a.playState),
                currentTime: typeof a.currentTime === 'number' ? a.currentTime : 0,
                progress: typeof timing.progress === 'number' ? timing.progress : null,
                duration: typeof timing.duration === 'number' ? timing.duration : 0,
                property: rec.property,
              };
            });
        };
        window.addEventListener(
          'keydown',
          (event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              const probe = win.__fwMotionProbe as {
                phase: string;
                events: Array<Record<string, unknown>>;
              };
              const sample = (win.__fwSampleDrawerAnimations as (r?: boolean) => Array<Record<string, unknown>>)(true);
              probe.events.push({
                phase: probe.phase,
                key: event.key,
                at: performance.now(),
                animations: sample,
              });
            }
          },
          true,
        );
        drawer?.addEventListener('transitioncancel', (event) => {
          if (event.target !== drawer) return;
          (win.__fwSampleDrawerAnimations as (r?: boolean) => unknown)(false);
          const probe = win.__fwMotionProbe as {
            phase: string;
            cancels: Array<{ phase: string; property: string; at: number }>;
          };
          probe.cancels.push({
            phase: probe.phase,
            property: event.propertyName,
            at: performance.now(),
          });
        });
        win.__fwEvaluateReversals = (phases = ['opening-to-closing', 'closing-to-opening']) => {
          const probe = win.__fwMotionProbe as {
            events: Array<{
              phase: string;
              at: number;
              animations: Array<{
                id: number;
                pending: boolean;
                state: string;
                currentTime: number;
                progress: number | null;
                property: string;
              }>;
            }>;
            cancels: Array<{ phase: string; property: string; at: number }>;
          };
          return phases.map((phase) => {
            const ev = probe.events.find((e) => e.phase === phase);
            const active = (ev?.animations ?? []).filter(
              (a) =>
                relevantProps.has(a.property) &&
                !a.pending &&
                a.state === 'running' &&
                a.currentTime > 0 &&
                typeof a.progress === 'number' &&
                a.progress > 0 &&
                a.progress < 1,
            );
            const matched = active.map((snap) => {
              const rec = metaById.get(snap.id);
              const finishedOutcome = rec ? rec.finishedOutcome : 'unknown';
              const finalPlayState = rec ? String(rec.anim.playState) : 'unknown';
              const settledAt = rec ? rec.settledAt : null;
              const cancelCount = probe.cancels.filter(
                (c) => c.phase === phase && c.property === snap.property && ev && c.at >= ev.at,
              ).length;
              const interruptedBeforeCompletion =
                finishedOutcome === 'aborted' &&
                finalPlayState === 'idle' &&
                settledAt !== null &&
                Boolean(ev && settledAt >= ev.at) &&
                cancelCount > 0;
              return {
                id: snap.id,
                property: snap.property,
                currentTimeAtInput: snap.currentTime,
                progressAtInput: snap.progress ?? 0,
                finishedOutcome,
                interruptedBeforeCompletion,
              };
            });
            return {
              phase,
              interruptionContract: 'captured-css-transition-generation-aborted-and-transitioncancel',
              activeAtInput: matched.length > 0,
              sameGenerationCancelled:
                matched.length > 0 && matched.every((m) => m.interruptedBeforeCompletion),
              sameGenerationCancelledOrReversed:
                matched.length > 0 && matched.every((m) => m.interruptedBeforeCompletion),
              activeAnimations: matched,
            };
          });
        };
      });
      const waitForFramesBounded = async (count = 2, flushStyle = true) => {
        const ok = await page.evaluate(
          ({ frameCount, shouldFlush }) =>
            new Promise<boolean>((resolveFrame) => {
              if (shouldFlush) {
                const d = document.querySelector('#inspector-drawer');
                if (d) {
                  void getComputedStyle(d).opacity;
                  void getComputedStyle(d).transform;
                }
              }
              let remaining = frameCount;
              let done = false;
              const timer = setTimeout(() => {
                if (!done) {
                  done = true;
                  resolveFrame(false);
                }
              }, 1500);
              const step = () => {
                if (done) return;
                remaining -= 1;
                if (remaining <= 0) {
                  done = true;
                  clearTimeout(timer);
                  resolveFrame(true);
                } else {
                  requestAnimationFrame(step);
                }
              };
              requestAnimationFrame(step);
            }),
          { frameCount: count, shouldFlush: flushStyle },
        );
        expect(ok).toBe(true);
      };
      await waitForFramesBounded(2, true);

      // Immediate input & focus without entrance block
      const input = page.locator('#command-input');
      await input.focus();
      await input.fill('status --fast');
      await expect(input).toHaveValue('status --fast');

      // Sequential Tab when drawer is closed MUST skip #drawer-close (inert + visibility:hidden)
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('drawer-toggle');
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('after-toggle');

      const toggle = page.locator('#drawer-toggle');
      const drawer = page.locator('#inspector-drawer');

      const waitActiveAndSetPhase = (nextPhase: string, blurToggle = false) =>
        page.waitForFunction(
          ({ phaseAfter, shouldBlur }) => {
            const win = window as unknown as {
              __fwSampleDrawerAnimations: (r?: boolean) => Array<{
                pending: boolean;
                state: string;
                currentTime: number;
                progress: number | null;
              }>;
              __fwMotionProbe: { phase: string };
            };
            const active = win.__fwSampleDrawerAnimations(true).some(
              (a) =>
                !a.pending &&
                a.state === 'running' &&
                a.currentTime > 0 &&
                typeof a.progress === 'number' &&
                a.progress > 0 &&
                a.progress < 1,
            );
            if (active) {
              if (shouldBlur && document.activeElement?.id === 'drawer-toggle') {
                (document.activeElement as HTMLElement).blur();
              }
              win.__fwMotionProbe.phase = phaseAfter;
            }
            return active;
          },
          { phaseAfter: nextPhase, shouldBlur: blurToggle },
          { polling: 'raf', timeout: 3000 },
        );
      const waitSettled = (wantOpen: boolean) =>
        page.waitForFunction(
          (expectedOpen) => {
            const d = document.querySelector('#inspector-drawer');
            if (!d) return false;
            if (getComputedStyle(d).opacity !== (expectedOpen ? '1' : '0')) return false;
            const win = window as unknown as {
              __fwSampleDrawerAnimations: (r?: boolean) => Array<{ pending: boolean; state: string }>;
            };
            return win.__fwSampleDrawerAnimations(false).every((a) => a.state !== 'running' && !a.pending);
          },
          wantOpen,
          { polling: 'raf', timeout: 3000 },
        );

      // 1a. Real capture-phase mid-transition reversal: opening -> closing (Enter then Escape) + focus restore
      await toggle.focus();
      await waitForFramesBounded(2, true);
      await page.evaluate(() => {
        (window as unknown as { __fwMotionProbe: { phase: string } }).__fwMotionProbe.phase = 'start-open';
      });
      await page.keyboard.press('Enter');
      await waitActiveAndSetPhase('opening-to-closing', true);
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveAttribute('data-state', 'closed');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('drawer-toggle');
      await waitSettled(false);
      await waitForFramesBounded(2, true);

      // 1b. Reopen to completion, then real capture-phase mid-transition reversal: closing -> opening (Escape then Enter)
      await toggle.focus();
      await page.evaluate(() => {
        (window as unknown as { __fwMotionProbe: { phase: string } }).__fwMotionProbe.phase = 'reopen-complete';
      });
      await page.keyboard.press('Enter');
      await expect(drawer).toHaveAttribute('data-state', 'open');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await waitSettled(true);
      await toggle.focus();
      await waitForFramesBounded(2, true);
      await page.evaluate(() => {
        (window as unknown as { __fwMotionProbe: { phase: string } }).__fwMotionProbe.phase = 'start-close';
      });
      await page.keyboard.press('Escape');
      await waitActiveAndSetPhase('closing-to-opening', false);
      await page.keyboard.press('Enter');
      await expect(drawer).toHaveAttribute('data-state', 'open');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await waitSettled(true);
      await waitForFramesBounded(2, true);

      observedReversals = await page.evaluate(() =>
        (window as unknown as { __fwEvaluateReversals: (p?: string[]) => typeof observedReversals }).__fwEvaluateReversals(['opening-to-closing', 'closing-to-opening']),
      );
      expect(observedReversals).toHaveLength(2);
      for (const rev of observedReversals) {
        expect(rev.activeAtInput).toBe(true);
        expect(rev.sameGenerationCancelledOrReversed).toBe(true);
        expect(rev.activeAnimations.length).toBeGreaterThanOrEqual(2);
        for (const anim of rev.activeAnimations) {
          expect(anim.currentTimeAtInput).toBeGreaterThan(0);
          expect(anim.progressAtInput).toBeGreaterThan(0);
          expect(anim.progressAtInput).toBeLessThan(1);
          expect(anim.finishedOutcome).toBe('aborted');
          expect(anim.interruptedBeforeCompletion).toBe(true);
        }
      }
      const telemetryAfterReversals = await page.evaluate(() =>
        (window as unknown as { __getMotionTelemetry: () => { transitionCancelledCount: number; count: number } }).__getMotionTelemetry(),
      );
      expect(telemetryAfterReversals.transitionCancelledCount).toBeGreaterThanOrEqual(4);
      expect(telemetryAfterReversals.count).toBe(5);

      // 1c. Separate rapid-toggle final-state check (open -> closed -> open -> closed via 3 rapid toggles)
      await page.keyboard.press('Escape');
      await waitForFramesBounded(1, false);
      await toggle.focus();
      await page.keyboard.press('Enter');
      await waitForFramesBounded(1, false);
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveAttribute('data-state', 'closed');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#drawer-status')).toContainText('State: closed · Toggles: 8');
      await waitSettled(false);

      // 1d. Settled keyboard open -> screenshot -> Escape close + focus restoration
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(drawer).toHaveAttribute('data-state', 'open');
      await waitSettled(true);
      await page.screenshot({ path: desktopShot });
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveAttribute('data-state', 'closed');
      const focusedId = await page.evaluate(() => document.activeElement?.id);
      expect(focusedId).toBe('drawer-toggle');
    } finally {
      await desktopCtx.tracing.stop({ path: tracePath });
      await desktopCtx.close();
    }

    // 2. Mobile touch viewport + prefers-reduced-motion: reduce
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
       isMobile: true,
      reducedMotion: 'reduce',
    });
    await mobileCtx.tracing.start({ screenshots: true, snapshots: true });
    const mobilePage = await mobileCtx.newPage();
    try {
      await mobilePage.goto(url);
      const toggle = mobilePage.locator('#drawer-toggle');
      const drawer = mobilePage.locator('#inspector-drawer');
      const closeBtn = mobilePage.locator('#drawer-close');
      const duration = await drawer.evaluate((el) => getComputedStyle(el).transitionDuration);
      expect(duration).toBe('0s');
      await toggle.tap();
      await expect(drawer).toHaveAttribute('data-state', 'open');
      const beforeCleanup = await mobilePage.evaluate(() => (window as unknown as { __getMotionTelemetry: () => { hasActiveTimer: boolean } }).__getMotionTelemetry());
      expect(beforeCleanup.hasActiveTimer).toBe(true);
      const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
      await closeBtn.tap();
      await expect(drawer).toHaveAttribute('data-state', 'closed');
      await toggle.tap();
      await expect(drawer).toHaveAttribute('data-state', 'open');
      const cleaned = await mobilePage.evaluate(() => (window as unknown as { __cleanupMotion: () => boolean }).__cleanupMotion());
      expect(cleaned).toBe(true);
      const afterCleanup = await mobilePage.evaluate(() => (window as unknown as { __getMotionTelemetry: () => { hasActiveTimer: boolean } }).__getMotionTelemetry());
      expect(afterCleanup.hasActiveTimer).toBe(false);
      await mobilePage.screenshot({ path: mobileShot });
    } finally {
      await mobileCtx.tracing.stop({ path: mobileTracePath });
      await mobileCtx.close();
    }

    const skillMdPath = join(REPO_ROOT, 'skills/motion-director/SKILL.md');
    const liteMdPath = join(REPO_ROOT, 'skills/motion-director/LITE.md');
    const rubricPath = join(REPO_ROOT, 'skills/motion-director/references/motion-quality-rubric.md');
    const verifierScriptPath = join(REPO_ROOT, 'scripts/runtime/verify_motion_drawer_artifact.mjs');
    const chromiumHelperPath = join(REPO_ROOT, 'scripts/runtime/playwright_chromium.mjs');
    const selfSpecPath = join(REPO_ROOT, 'src/testing/e2e/tests/motion-director.spec.ts');
    expect(existsSync(rubricPath)).toBe(true);
    const chromiumProfile = resolveChromiumFunctionalProfile();
    const packet = {
      schema: 'forgewright-motion-packet/v1',
      artifactKind: 'scenario-fixture-and-routing-verification',
      taskId: 'FW-ARGON-MACFIX-20261110',
      stage: 'RF11',
      runId,
      baseRevision: 'c1200d575d63e8851fa6023ae1e78c996376b902',
      sourceBindings: {
        skillMdSha256: createHash('sha256').update(readFileSync(skillMdPath)).digest('hex'),
        liteMdSha256: createHash('sha256').update(readFileSync(liteMdPath)).digest('hex'),
        rubricMdSha256: createHash('sha256').update(readFileSync(rubricPath)).digest('hex'),
        verifierScriptSha256: createHash('sha256').update(readFileSync(verifierScriptPath)).digest('hex'),
        playwrightChromiumHelperSha256: createHash('sha256').update(readFileSync(chromiumHelperPath)).digest('hex'),
        specFileSha256: createHash('sha256').update(readFileSync(selfSpecPath)).digest('hex'),
        routedMode: routed.mode,
        routedSkills: routed.skills.map((s: { name: string }) => s.name),
      },
      skill: 'motion-director',
      rubricReference: 'skills/motion-director/references/motion-quality-rubric.md',
      motionGoal: 'Provide immediate state feedback for the inspector drawer without delaying command input or focus.',
      recommendedStack: 'Native CSS transitions (transform, opacity) — zero external runtime dependencies added.',
      choreography: 'Single-surface disclosure (translateY -8px -> 0, opacity 0 -> 1); hover lift gated behind (hover: hover) and (pointer: fine).',
      tokens: { duration: '180ms', easing: 'cubic-bezier(0.22, 1, 0.36, 1)', reducedMotionDuration: '0s' },
      reducedMotionPath: 'Instant opacity/visibility state change with transition-duration: 0s and transform: none.',
      interruptionAndCleanup: 'Generation-bound mid-transition interruption verified in both directions via capture-phase input, Animation.finished abort, and transitioncancel; separate rapid-toggle final state, Escape focus restoration, mobile touch open/close, and active timer cleanup verified.',
      reversals: observedReversals,
      environment: {
        browserVersion: browser.version(),
        channel: chromiumProfile.channel,
        profile: chromiumProfile.profile,
        requestedLaunchArgs: chromiumProfile.launchArgs,
        physicalPerformanceEligible: chromiumProfile.physicalPerformanceEligible,
        physicalPerformanceScore: chromiumProfile.physicalPerformanceScore,
        actualLaunchExecutable: chromiumProfile.actualLaunchExecutable,
        desktopViewport: '1280x800',
        mobileViewport: '390x844 (hasTouch: true, isMobile: true, reducedMotion: reduce)',
      },
      evidence: {
        traceZip: tracePath,
        traceSha256: createHash('sha256').update(readFileSync(tracePath)).digest('hex'),
        mobileTraceZip: mobileTracePath,
        mobileTraceSha256: createHash('sha256').update(readFileSync(mobileTracePath)).digest('hex'),
        desktopScreenshot: desktopShot,
        mobileScreenshot: mobileShot,
      },
      rubricScores: {
        Purpose: { score: 3, basis: 'Supports state comprehension without delaying command input.' },
        Timing: { score: 3, basis: '180ms cubic-bezier(0.22, 1, 0.36, 1) with instant 0s reduced-motion path.' },
        Hierarchy: { score: 3, basis: 'Single coordinated drawer surface; no competing moving text.' },
        'Brand Fit': { score: 'unscored', basis: 'Isolated functional verification fixture; brand identity not claimed.' },
        Accessibility: { score: 3, basis: 'Designed reduced-motion path, Escape focus restoration, 44px touch target, and immediate input focus.' },
        Performance: { score: 'unscored', basis: 'Deterministic headless Chromium trace/DOM verification only; physical target-device frame pacing not claimed from screenshots.' },
        Implementation: { score: 3, basis: 'Tokenized CSS custom properties, explicit transform/opacity properties, deterministic interruption and cleanup.' },
      },
    };
    writeFileSync(join(evidenceDir, 'rf11-motion-director-scenario.json'), JSON.stringify(packet, null, 2) + '\n', 'utf8');
  });
});
