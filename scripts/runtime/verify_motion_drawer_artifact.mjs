#!/usr/bin/env node
/**
 * Behavioral Chromium verifier for generated drawer-motion.html artifacts (RF01 / RF11 / V2-05 / MAC-04 / MAC-05).
 *
 * Verifies in real headless Chromium (default bundled headless shell; PLAYWRIGHT_CHANNEL only when explicitly set):
 * 1. Tokenized CSS (--motion-duration, --motion-ease, transform, opacity, prefers-reduced-motion: reduce)
 * 2. Desktop (1280x800, reducedMotion: 'no-preference'):
 *    - real keyboard Enter open
 *    - real Escape close + focus restoration to #drawer-toggle WITHOUT click fallback
 *    - real capture-phase mid-transition reversal in BOTH directions (opening->closing and closing->opening)
 *      with owner-drawer animation non-pending, playState === 'running', currentTime > 0, progress in (0, 1),
 *      and prior transition cancelled before completion
 *    - separate rapid-toggle final-state check
 * 3. Mobile (390x844, isMobile: true, hasTouch: true, reducedMotion: 'reduce'):
 *    - computed transitionDuration === '0s'
 *    - touch tap opens drawer
 *    - touch tap closes drawer (must not leave user stranded with #drawer-toggle covered and no close button)
 * 4. Emits exactly ONE terminal JSON line ONLY AFTER independent context/browser/server cleanup.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { resolveChromiumFunctionalProfile } from "./playwright_chromium.mjs";

const require = createRequire(import.meta.url);
const SELF_PATH = fileURLToPath(import.meta.url);
const SELF_SHA256 = createHash("sha256").update(readFileSync(SELF_PATH)).digest("hex");
const HELPER_PATH = resolve(SELF_PATH, "../playwright_chromium.mjs");
const HELPER_SHA256 = existsSync(HELPER_PATH) ? createHash("sha256").update(readFileSync(HELPER_PATH)).digest("hex") : "unknown";
const SKILL_MD_PATH = resolve(SELF_PATH, "../../../skills/motion-director/SKILL.md");
const LITE_MD_PATH = resolve(SELF_PATH, "../../../skills/motion-director/LITE.md");
const SKILL_SHA256 = existsSync(SKILL_MD_PATH) ? createHash("sha256").update(readFileSync(SKILL_MD_PATH)).digest("hex") : "unknown";
const LITE_SHA256 = existsSync(LITE_MD_PATH) ? createHash("sha256").update(readFileSync(LITE_MD_PATH)).digest("hex") : "unknown";
const PLAYWRIGHT_VERSION = (() => {
  try {
    return require("@playwright/test/package.json").version;
  } catch {
    return "unknown";
  }
})();

class VerifierCheckError extends Error {
  constructor(failedCheck, details = {}) {
    super(details.error ? failedCheck + ": " + details.error : failedCheck);
    this.name = "VerifierCheckError";
    this.failedCheck = failedCheck;
    this.details = details;
  }
}

async function withDeadline(promiseOrFactory, timeoutMs, label) {
  let timer = null;
  try {
    const p = typeof promiseOrFactory === "function" ? promiseOrFactory() : promiseOrFactory;
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(label + "_timeout_after_" + timeoutMs + "ms"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

export async function waitForAnimationFramesBounded(
  page,
  frameCount = 2,
  timeoutMs = 1500,
  flushDrawerStyle = false,
) {
  const completed = await withDeadline(
    () =>
      page.evaluate(
        ({ count, deadlineMs, shouldFlush }) =>
          new Promise((resolveFrame) => {
            if (shouldFlush) {
              const d = document.querySelector("#inspector-drawer");
              if (d) {
                void getComputedStyle(d).opacity;
                void getComputedStyle(d).transform;
              }
            }
            let remaining = Math.max(1, Number(count) || 1);
            let settled = false;
            const timer = setTimeout(() => {
              if (!settled) {
                settled = true;
                resolveFrame(false);
              }
            }, deadlineMs);
            const step = () => {
              if (settled) return;
              remaining -= 1;
              if (remaining <= 0) {
                settled = true;
                clearTimeout(timer);
                resolveFrame(true);
              } else {
                requestAnimationFrame(step);
              }
            };
            requestAnimationFrame(step);
          }),
        { count: frameCount, deadlineMs: timeoutMs, shouldFlush: flushDrawerStyle },
      ),
    timeoutMs + 500,
    "raf_wait",
  ).catch(() => false);

  if (!completed) {
    throw new VerifierCheckError("raf_starvation_timeout", {
      frameCount,
      timeoutMs,
    });
  }
}

async function isDrawerOpen(page) {
  return page.evaluate(() => {
    const toggle = document.querySelector("#drawer-toggle");
    const drawer = document.querySelector("#inspector-drawer");
    if (!toggle || !drawer) return false;
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    const notInert = !drawer.hasAttribute("inert") && !drawer.inert;
    const notHidden = drawer.getAttribute("aria-hidden") !== "true";
    return expanded && notInert && notHidden;
  });
}

export async function installDrawerMotionProbe(page, rafTimeoutMs = 1500) {
  await page.evaluate(() => {
    const drawer = document.querySelector("#inspector-drawer");
    const RELEVANT_PROPS = new Set(["opacity", "transform"]);
    const ids = new WeakMap();
    const metaById = new Map();
    let seq = 0;
    window.__fwMotionProbe = {
      phase: "setup",
      events: [],
      transitions: { run: [], start: [], cancel: [], end: [] },
      initialPaint: null,
    };

    function ensureTracked(anim) {
      let id = ids.get(anim);
      if (!id) {
        id = ++seq;
        ids.set(anim, id);
        const prop = anim.transitionProperty || "";
        const rec = {
          id,
          anim,
          property: prop,
          createdPhase: window.__fwMotionProbe.phase,
          createdAt: performance.now(),
          finishedOutcome: "pending",
          settledAt: null,
          capturedByPhase: {},
        };
        metaById.set(id, rec);
        if (anim.finished && typeof anim.finished.then === "function") {
          anim.finished.then(
            () => {
              if (rec.finishedOutcome === "pending") {
                rec.finishedOutcome = "fulfilled";
                rec.settledAt = performance.now();
              }
            },
            () => {
              if (rec.finishedOutcome === "pending") {
                rec.finishedOutcome = "aborted";
                rec.settledAt = performance.now();
              }
            },
          );
        }
      }
      return metaById.get(id);
    }

    window.__fwSampleDrawerAnimations = (onlyRelevant = true) => {
      if (!drawer || typeof drawer.getAnimations !== "function") return [];
      return drawer
        .getAnimations()
        .filter((a) => {
          if (a.effect?.target !== drawer) return false;
          const prop = a.transitionProperty || "";
          if (onlyRelevant && prop && !RELEVANT_PROPS.has(prop)) return false;
          return true;
        })
        .map((a) => {
          const rec = ensureTracked(a);
          const timing = a.effect.getComputedTiming();
          return {
            id: rec.id,
            pending: Boolean(a.pending),
            state: String(a.playState),
            currentTime: typeof a.currentTime === "number" ? a.currentTime : 0,
            progress: typeof timing.progress === "number" ? timing.progress : null,
            duration: typeof timing.duration === "number" ? timing.duration : 0,
            playbackRate: typeof a.playbackRate === "number" ? a.playbackRate : 1,
            property: rec.property,
            finishedOutcome: rec.finishedOutcome,
          };
        });
    };

    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
          const now = performance.now();
          const phase = window.__fwMotionProbe.phase;
          const toggle = document.querySelector("#drawer-toggle");
          const animations = window.__fwSampleDrawerAnimations(true);
          for (const snap of animations) {
            if (
              !snap.pending &&
              snap.state === "running" &&
              snap.currentTime > 0 &&
              typeof snap.progress === "number" &&
              snap.progress > 0 &&
              snap.progress < 1
            ) {
              const rec = metaById.get(snap.id);
              if (rec) {
                rec.capturedByPhase[phase] = {
                  at: now,
                  currentTimeAtInput: snap.currentTime,
                  progressAtInput: snap.progress,
                  playbackRateAtInput: snap.playbackRate,
                };
              }
            }
          }
          window.__fwMotionProbe.events.push({
            phase,
            key: event.key,
            at: now,
            focused: document.activeElement?.id || "",
            ariaExpandedBefore: toggle ? toggle.getAttribute("aria-expanded") : null,
            animations,
          });
        }
      },
      true,
    );

    if (drawer) {
      for (const [eventName, bucket] of [
        ["transitionrun", "run"],
        ["transitionstart", "start"],
        ["transitioncancel", "cancel"],
        ["transitionend", "end"],
      ]) {
        drawer.addEventListener(eventName, (event) => {
          if (event.target !== drawer) return;
          window.__fwSampleDrawerAnimations(false);
          window.__fwMotionProbe.transitions[bucket].push({
            phase: window.__fwMotionProbe.phase,
            property: event.propertyName,
            elapsedTime: event.elapsedTime,
            at: performance.now(),
          });
        });
      }
    }

    window.__fwEvaluateReversals = (phases = ["opening-to-closing", "closing-to-opening"]) =>
      phases.map((phase) => {
        const event = window.__fwMotionProbe.events.find((e) => e.phase === phase);
        const activeAnimations = (event?.animations ?? []).filter(
          (a) =>
            (!a.property || RELEVANT_PROPS.has(a.property)) &&
            !a.pending &&
            a.state === "running" &&
            a.currentTime > 0 &&
            typeof a.progress === "number" &&
            a.progress > 0 &&
            a.progress < 1,
        );
        const matchedAnimations = activeAnimations.map((snap) => {
          const rec = metaById.get(snap.id);
          const finalPlayState = rec?.anim ? String(rec.anim.playState) : "unknown";
          const finishedOutcome = rec ? rec.finishedOutcome : "unknown";
          const settledAt = rec ? rec.settledAt : null;
          const matchingCancelEvents = window.__fwMotionProbe.transitions.cancel.filter(
            (c) =>
              c.phase === phase &&
              c.property === snap.property &&
              typeof event?.at === "number" &&
              c.at >= event.at,
          );
          const abortedBeforeFinish =
            finishedOutcome === "aborted" &&
            finalPlayState === "idle" &&
            settledAt !== null &&
            typeof event?.at === "number" &&
            settledAt >= event.at &&
            matchingCancelEvents.length > 0;
          return {
            id: snap.id,
            property: snap.property,
            currentTimeAtInput: snap.currentTime,
            progressAtInput: snap.progress,
            duration: snap.duration,
            finishedOutcome,
            finalPlayState,
            settledAt,
            matchingCancelCount: matchingCancelEvents.length,
            interruptedBeforeCompletion: abortedBeforeFinish,
          };
        });
        const activeAtInput = matchedAnimations.length > 0;
        const everyCapturedInterrupted =
          activeAtInput && matchedAnimations.every((m) => m.interruptedBeforeCompletion);
        const cancelledEvents = window.__fwMotionProbe.transitions.cancel.filter(
          (c) => c.phase === phase && RELEVANT_PROPS.has(c.property),
        );
        return {
          phase,
          interruptionContract: "captured-css-transition-generation-aborted-and-transitioncancel",
          inputAt: event?.at ?? null,
          activeAtInput,
          cancelled: everyCapturedInterrupted,
          sameGenerationCancelled: everyCapturedInterrupted,
          sameGenerationCancelledOrReversed: everyCapturedInterrupted,
          activeAnimations: matchedAnimations,
          cancelledEvents,
        };
      });

    if (drawer) {
      const beforeStyle = getComputedStyle(drawer);
      window.__fwMotionProbe.initialPaint = {
        before: {
          opacity: beforeStyle.opacity,
          transform: beforeStyle.transform,
          transitionDuration: beforeStyle.transitionDuration,
          now: performance.now(),
        },
        after: null,
      };
    }
  });
  await waitForAnimationFramesBounded(page, 2, rafTimeoutMs, true);
  await page.evaluate(() => {
    if (window.__fwMotionProbe?.initialPaint) {
      window.__fwMotionProbe.initialPaint.after = performance.now();
    }
  });
}

export async function runMotionDrawerVerification(rawHtmlPath, options = {}) {
  const htmlPath = resolve(rawHtmlPath ?? "drawer-motion.html");
  const chromiumProfile = resolveChromiumFunctionalProfile({
    channel: options.channel !== undefined ? options.channel : process.env.PLAYWRIGHT_CHANNEL,
    platform: options.platform,
  });
  const faultInject = (options.faultInject ?? process.env.FORGEWRIGHT_MOTION_VERIFIER_FAULT_INJECT ?? "").trim();
  const rafTimeoutMs = Number(
    options.rafTimeoutMs ?? process.env.FORGEWRIGHT_MOTION_VERIFIER_RAF_TIMEOUT_MS ?? 1500,
  );
  const closeTimeoutMs = Number(
    options.closeTimeoutMs ?? process.env.FORGEWRIGHT_MOTION_VERIFIER_CLOSE_TIMEOUT_MS ?? 3000,
  );
  const mobileTapTimeoutMs = Number(
    options.mobileTapTimeoutMs ?? process.env.FORGEWRIGHT_MOTION_VERIFIER_MOBILE_TAP_TIMEOUT_MS ?? 1500,
  );

  let htmlSha256 = null;
  let server = null;
  let rawHttpServerClose = null;
  let realServerClose = null;
  let serverListening = false;
  let browser = null;
  let realBrowserClose = null;
  const contexts = [];
  const cleanupErrors = [];
  const checks = {
    desktopKeyboardOpenClose: "NOT_RUN",
    desktopEscapeFocusRestore: "NOT_RUN",
    desktopMidTransitionReversal: "NOT_RUN",
    desktopRapidInterruption: "NOT_RUN",
    mobileReducedMotionDuration: "NOT_RUN",
    mobileTouchOpen: "NOT_RUN",
    mobileTouchClose: "NOT_RUN",
    buttonsInsideDrawer: null,
  };
  let reversalSummary = [];
  let browserInfo = {
    playwrightVersion: PLAYWRIGHT_VERSION,
    channel: chromiumProfile.channel,
    profile: chromiumProfile.profile,
    requestedLaunchArgs: chromiumProfile.launchArgs,
    physicalPerformanceEligible: chromiumProfile.physicalPerformanceEligible,
    physicalPerformanceScore: chromiumProfile.physicalPerformanceScore,
    browserVersion: null,
    bundledChromiumCandidatePath: null,
    actualLaunchExecutable: chromiumProfile.actualLaunchExecutable,
  };
  let primaryFailure = null;

  try {
    try {
      browserInfo.bundledChromiumCandidatePath = chromium.executablePath();
    } catch {
      browserInfo.bundledChromiumCandidatePath = null;
    }

    if (!existsSync(htmlPath)) {
      throw new VerifierCheckError("file_missing", { htmlPath });
    }
    const htmlBytes = readFileSync(htmlPath);
    htmlSha256 = createHash("sha256").update(htmlBytes).digest("hex");
    const htmlText = htmlBytes.toString("utf8");

    for (const token of [
      "--motion-duration",
      "--motion-ease",
      "prefers-reduced-motion",
      "transform",
      "opacity",
      "aria-expanded",
      "inert",
    ]) {
      if (!htmlText.includes(token)) {
        throw new VerifierCheckError("missing_static_token:" + token);
      }
    }

    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(htmlBytes);
    });
    rawHttpServerClose = server.close.bind(server);
    realServerClose = rawHttpServerClose;
    try {
      await new Promise((resolveListen, rejectListen) => {
        server.once("error", rejectListen);
        server.listen(0, "127.0.0.1", () => {
          server.removeListener("error", rejectListen);
          resolveListen();
        });
      });
      serverListening = true;
    } catch (err) {
      throw new VerifierCheckError("server_listen_failed", {
        error: String(err?.message ?? err).slice(0, 300),
      });
    }
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const baseUrl = "http://127.0.0.1:" + port + "/";

    try {
      browser = await chromium.launch(chromiumProfile.launchOptions);
      realBrowserClose = browser.close.bind(browser);
      browserInfo.browserVersion = browser.version();
    } catch (err) {
      throw new VerifierCheckError("browser_launch_failed", {
        error: String(err?.message ?? err).slice(0, 400),
      });
    }

    // 1. Desktop keyboard open, Escape close + focus restoration, mid-transition reversals, and rapid toggle
    const desktopCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "no-preference",
    });
    desktopCtx.__realClose = desktopCtx.close.bind(desktopCtx);
    contexts.push(desktopCtx);
    const desktopPage = await desktopCtx.newPage();
    await desktopPage.route("**/*", (route) => {
      if (route.request().url().startsWith(baseUrl)) return route.continue();
      return route.abort();
    });
    await desktopPage.goto(baseUrl);

    const hasRequiredNodes = await desktopPage.evaluate(
      () => Boolean(document.querySelector("#drawer-toggle") && document.querySelector("#inspector-drawer")),
    );
    if (!hasRequiredNodes) {
      throw new VerifierCheckError("missing_required_elements");
    }

    if (faultInject === "raf_starvation") {
      await desktopPage.evaluate(() => {
        window.requestAnimationFrame = () => 0;
      });
    }
    if (faultInject === "context_close_hang") {
      desktopCtx.close = () => new Promise(() => {});
    }

    await installDrawerMotionProbe(desktopPage, rafTimeoutMs);

    const desktopDuration = await desktopPage
      .locator("#inspector-drawer")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    if (/^0s(?:\s*,\s*0s)*$/.test(desktopDuration.trim())) {
      throw new VerifierCheckError("desktop_no_motion", { observedDuration: desktopDuration });
    }

    const toggle = desktopPage.locator("#drawer-toggle");
    const setPhase = (phaseName) =>
      desktopPage.evaluate((p) => {
        window.__fwMotionProbe.phase = p;
      }, phaseName);
    const flushComputedStyleAndTwoRafs = () =>
      waitForAnimationFramesBounded(desktopPage, 2, rafTimeoutMs, true);
    const waitForActiveDrawerAnimation = (nextPhase = null, blurToggleOnActive = false, timeoutMs = 3000) =>
      desktopPage.waitForFunction(
        ({ phaseAfterActive, shouldBlurToggle }) => {
          const active = window.__fwSampleDrawerAnimations(true).some(
            (a) =>
              !a.pending &&
              a.state === "running" &&
              a.currentTime > 0 &&
              typeof a.progress === "number" &&
              a.progress > 0 &&
              a.progress < 1,
          );
          if (active) {
            if (shouldBlurToggle && document.activeElement?.id === "drawer-toggle") {
              document.activeElement.blur();
            }
            if (phaseAfterActive) {
              window.__fwMotionProbe.phase = phaseAfterActive;
            }
          }
          return active;
        },
        { phaseAfterActive: nextPhase, shouldBlurToggle: blurToggleOnActive },
        { polling: "raf", timeout: timeoutMs },
      );
    const waitForDrawerSettled = (expectedOpen, timeoutMs = 3000) =>
      desktopPage.waitForFunction(
        (wantOpen) => {
          const d = document.querySelector("#inspector-drawer");
          if (!d) return false;
          const targetOpacity = wantOpen ? "1" : "0";
          if (getComputedStyle(d).opacity !== targetOpacity) return false;
          return window.__fwSampleDrawerAnimations(false).every(
            (a) => a.state !== "running" && !a.pending,
          );
        },
        expectedOpen,
        { polling: "raf", timeout: timeoutMs },
      );

    // 1a. Keyboard open (Enter) + mid-transition opening->closing reversal via Escape + focus restoration
    await toggle.focus();
    await flushComputedStyleAndTwoRafs();
    await setPhase("start-open");
    await desktopPage.keyboard.press("Enter");
    try {
      await waitForActiveDrawerAnimation("opening-to-closing", true);
    } catch {
      if (!(await isDrawerOpen(desktopPage))) {
        throw new VerifierCheckError("desktop_keyboard_open");
      }
      throw new VerifierCheckError("desktop_no_motion", {
        reason: "opening_animation_not_observable",
      });
    }
    await desktopPage.keyboard.press("Escape");
    if (await isDrawerOpen(desktopPage)) {
      const closedLate = await desktopPage
        .waitForFunction(
          () => document.querySelector("#drawer-toggle")?.getAttribute("aria-expanded") === "false",
          null,
          { polling: 10, timeout: 450 },
        )
        .then(() => true)
        .catch(() => false);
      if (!closedLate) {
        throw new VerifierCheckError("desktop_escape_close");
      }
      throw new VerifierCheckError("desktop_mid_transition_reversal", {
        direction: "opening-to-closing",
        reason: "deferred_until_transitionend",
      });
    }
    const focusAfterEscape = await desktopPage.evaluate(() => document.activeElement?.id || "");
    if (focusAfterEscape !== "drawer-toggle") {
      throw new VerifierCheckError("desktop_escape_focus_restore", {
        focusAfterEscape,
      });
    }
    checks.desktopKeyboardOpenClose = "PASS";
    checks.desktopEscapeFocusRestore = "PASS";
    await waitForDrawerSettled(false);
    await flushComputedStyleAndTwoRafs();

    // 1b. Reopen to completion, then mid-transition closing->opening reversal
    await toggle.focus();
    await setPhase("reopen-to-completion");
    await desktopPage.keyboard.press("Enter");
    if (!(await isDrawerOpen(desktopPage))) {
      throw new VerifierCheckError("desktop_keyboard_open", { phase: "reopen-to-completion" });
    }
    await waitForDrawerSettled(true);
    await toggle.focus();
    await flushComputedStyleAndTwoRafs();

    await setPhase("start-close");
    await desktopPage.keyboard.press("Escape");
    try {
      await waitForActiveDrawerAnimation("closing-to-opening", false);
    } catch {
      throw new VerifierCheckError("desktop_closing_animation_not_observable");
    }
    await desktopPage.keyboard.press("Enter");
    if (!(await isDrawerOpen(desktopPage))) {
      throw new VerifierCheckError("desktop_mid_transition_reversal", {
        direction: "closing-to-opening",
        reason: "state_not_immediately_reversed_on_input",
      });
    }
    await waitForDrawerSettled(true);
    await flushComputedStyleAndTwoRafs();

    reversalSummary = await desktopPage.evaluate(() =>
      window.__fwEvaluateReversals(["opening-to-closing", "closing-to-opening"]),
    );

    for (const rev of reversalSummary) {
      if (!rev.activeAtInput || !rev.sameGenerationCancelledOrReversed) {
        throw new VerifierCheckError("desktop_mid_transition_reversal", {
          direction: rev.phase,
          activeAtInput: rev.activeAtInput,
          cancelled: rev.sameGenerationCancelledOrReversed,
          reversals: reversalSummary,
        });
      }
    }
    checks.desktopMidTransitionReversal = "PASS";

    // Return drawer to closed state before rapid-toggle check
    await setPhase("reset-before-rapid-toggle");
    await desktopPage.keyboard.press("Escape");
    await waitForDrawerSettled(false);

    // 1d. Separate rapid-toggle final-state check (closed -> open -> closed -> open)
    await toggle.focus();
    await setPhase("rapid-toggle-final-state");
    await desktopPage.keyboard.press("Enter");
    await waitForAnimationFramesBounded(desktopPage, 1, rafTimeoutMs, false);
    await desktopPage.keyboard.press("Escape");
    await waitForAnimationFramesBounded(desktopPage, 1, rafTimeoutMs, false);
    await toggle.focus();
    await desktopPage.keyboard.press("Enter");
    await waitForDrawerSettled(true);
    if (!(await isDrawerOpen(desktopPage))) {
      throw new VerifierCheckError("desktop_rapid_interruption");
    }
    await desktopPage.keyboard.press("Escape");
    await waitForDrawerSettled(false);
    if (await isDrawerOpen(desktopPage)) {
      throw new VerifierCheckError("desktop_rapid_interruption", {
        reason: "failed_to_close_after_rapid_toggle",
      });
    }
    checks.desktopRapidInterruption = "PASS";

    contexts.pop();
    try {
      await withDeadline(() => desktopCtx.close(), closeTimeoutMs, "desktop_context_close");
    } catch (err) {
      cleanupErrors.push("context:" + String(err?.message ?? err));
      try {
        await withDeadline(
          () => desktopCtx.__realClose(),
          Math.max(closeTimeoutMs, 2000),
          "desktop_context_force_reclaim",
        );
      } catch {
        // Reclaimed by browser close in finally
      }
      throw new VerifierCheckError("cleanup_failed", {
        error: cleanupErrors.join("; "),
      });
    }

    // 2. Mobile touch open/close & prefers-reduced-motion check
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    mobileCtx.__realClose = mobileCtx.close.bind(mobileCtx);
    contexts.push(mobileCtx);
    const mobilePage = await mobileCtx.newPage();
    await mobilePage.route("**/*", (route) => {
      if (route.request().url().startsWith(baseUrl)) return route.continue();
      return route.abort();
    });
    await mobilePage.goto(baseUrl);
    await waitForAnimationFramesBounded(mobilePage, 2, rafTimeoutMs, true);
    const duration = await mobilePage
      .locator("#inspector-drawer")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    if (duration !== "0s" && duration !== "0s, 0s" && !/^0s(?:\s*,\s*0s)*$/.test(duration.trim())) {
      throw new VerifierCheckError("reduced_motion_duration", { observedDuration: duration });
    }
    checks.mobileReducedMotionDuration = duration;

    const mobileToggle = mobilePage.locator("#drawer-toggle");
    try {
      await mobileToggle.tap({ timeout: mobileTapTimeoutMs });
    } catch (err) {
      throw new VerifierCheckError("mobile_touch_open", {
        error: String(err?.message ?? err).slice(0, 300),
      });
    }
    if (!(await isDrawerOpen(mobilePage))) {
      throw new VerifierCheckError("mobile_touch_open");
    }
    checks.mobileTouchOpen = "PASS";

    const innerButtons = mobilePage.locator("#inspector-drawer button");
    const innerCount = await innerButtons.count();
    checks.buttonsInsideDrawer = innerCount;
    try {
      if (innerCount > 0) {
        await innerButtons.first().tap({ timeout: mobileTapTimeoutMs });
      } else {
        await mobileToggle.tap({ timeout: mobileTapTimeoutMs });
      }
    } catch (err) {
      throw new VerifierCheckError("mobile_touch_close_timeout_or_covered", {
        buttonsInsideDrawer: innerCount,
        error: String(err?.message ?? err).slice(0, 300),
      });
    }
    if (await isDrawerOpen(mobilePage)) {
      throw new VerifierCheckError("mobile_touch_close_remained_open", {
        buttonsInsideDrawer: innerCount,
      });
    }
    checks.mobileTouchClose = "PASS";

    if (faultInject === "context_close") {
      mobileCtx.close = async () => {
        throw new Error("injected_context_close_failure");
      };
    } else if (faultInject === "context_close_hang") {
      mobileCtx.close = () => new Promise(() => {});
    } else if (faultInject === "browser_close") {
      browser.close = async () => {
        throw new Error("injected_browser_close_failure");
      };
    } else if (faultInject === "browser_close_hang") {
      browser.close = () => new Promise(() => {});
    } else if (faultInject === "server_close") {
      server.close = (cb) => {
        if (cb) cb(new Error("injected_server_close_failure"));
        return server;
      };
    } else if (faultInject === "server_close_hang") {
      server.close = () => server;
      realServerClose = () => server;
    } else if (faultInject === "cleanup_multi_fault") {
      mobileCtx.close = async () => {
        throw new Error("injected_context_close_failure");
      };
      browser.close = () => new Promise(() => {});
      server.close = () => server;
      realServerClose = () => server;
    } else {
      contexts.pop();
      try {
        await withDeadline(() => mobileCtx.close(), closeTimeoutMs, "mobile_context_close");
      } catch (err) {
        cleanupErrors.push("context:" + String(err?.message ?? err));
        try {
          await withDeadline(
            () => mobileCtx.__realClose(),
            Math.max(closeTimeoutMs, 2000),
            "mobile_context_force_reclaim",
          );
        } catch {
          // Reclaimed by browser close in finally
        }
      }
    }
  } catch (err) {
    if (err instanceof VerifierCheckError) {
      primaryFailure = {
        failedCheck: err.failedCheck,
        ...err.details,
      };
    } else {
      primaryFailure = {
        failedCheck: "unhandled_error",
        error: String(err?.message ?? err).slice(0, 400),
      };
    }
  } finally {
    while (contexts.length > 0) {
      const ctx = contexts.pop();
      try {
        await withDeadline(() => ctx.close(), closeTimeoutMs, "context_close");
      } catch (err) {
        cleanupErrors.push("context:" + String(err?.message ?? err));
        if (typeof ctx?.__realClose === "function") {
          try {
            await withDeadline(
              () => ctx.__realClose(),
              Math.max(closeTimeoutMs, 2000),
              "context_force_reclaim",
            );
          } catch {
            // Reclaimed by browser close below
          }
        }
      }
    }
    if (browser) {
      try {
        await withDeadline(() => browser.close(), closeTimeoutMs, "browser_close");
      } catch (err) {
        cleanupErrors.push("browser:" + String(err?.message ?? err));
        if (typeof realBrowserClose === "function") {
          try {
            await withDeadline(
              () => realBrowserClose(),
              Math.max(closeTimeoutMs, 2000),
              "browser_force_reclaim",
            );
          } catch {
            // Best-effort reclaim
          }
        }
      }
    }
    if (server && (serverListening || server.listening)) {
      try {
        server.closeAllConnections();
        await withDeadline(
          () =>
            new Promise((resolveClose, rejectClose) =>
              server.close((err) => (err ? rejectClose(err) : resolveClose())),
            ),
          closeTimeoutMs,
          "server_close",
        );
      } catch (err) {
        cleanupErrors.push("server:" + String(err?.message ?? err));
        if (typeof realServerClose === "function") {
          try {
            server.closeAllConnections();
            await withDeadline(
              () =>
                new Promise((resolveFallback, rejectFallback) =>
                  realServerClose((fallbackErr) =>
                    fallbackErr ? rejectFallback(fallbackErr) : resolveFallback(),
                  ),
                ),
              closeTimeoutMs,
              "server_force_reclaim",
            );
          } catch (fallbackErr) {
            cleanupErrors.push("server_fallback:" + String(fallbackErr?.message ?? fallbackErr));
            if (typeof rawHttpServerClose === "function" && rawHttpServerClose !== realServerClose) {
              try {
                server.closeAllConnections();
                await withDeadline(
                  () => new Promise((r) => rawHttpServerClose(() => r())),
                  Math.max(closeTimeoutMs, 1000),
                  "server_test_socket_reclaim",
                );
              } catch {
                // Best-effort socket reclaim after fault injection
              }
            }
          }
        }
      }
    }
  }

  const passed = primaryFailure === null && cleanupErrors.length === 0;
  const payload = {
    passed,
    ...(primaryFailure ? primaryFailure : {}),
    ...(!primaryFailure && cleanupErrors.length > 0
      ? { failedCheck: "cleanup_failed", error: cleanupErrors.join("; ") }
      : {}),
    htmlPath,
    htmlSha256,
    verifierSha256: SELF_SHA256,
    playwrightChromiumHelperSha256: HELPER_SHA256,
    skillMdSha256: SKILL_SHA256,
    liteMdSha256: LITE_SHA256,
    browserInfo,
    checks,
    reversals: reversalSummary,
    cleanupErrors,
  };
  return payload;
}

async function main() {
  const outcome = await runMotionDrawerVerification(process.argv[2]);
  const serialized = JSON.stringify(outcome);
  if (outcome.passed) {
    console.log(serialized);
    process.exitCode = 0;
  } else {
    console.error(serialized);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) {
  main().catch((err) => {
    console.error(
      JSON.stringify({
        passed: false,
        failedCheck: "unhandled_error",
        error: String(err?.message ?? err),
      }),
    );
    process.exitCode = 1;
  });
}

