#!/usr/bin/env node
/**
 * Behavioral Chromium verifier for generated drawer-motion.html artifacts (RF01 / RF11 / V2-05).
 *
 * Verifies in real headless Chromium (channel: 'chrome'):
 * 1. Tokenized CSS (--motion-duration, --motion-ease, transform, opacity, prefers-reduced-motion: reduce)
 * 2. Desktop (1280x800): keyboard open, rapid mid-transition interruption, and Escape close
 * 3. Mobile (390x844, isMobile: true, hasTouch: true, reducedMotion: 'reduce'):
 *    - computed transitionDuration === '0s'
 *    - touch tap opens drawer
 *    - touch tap closes drawer (must not leave user stranded with #drawer-toggle covered and no close button)
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const SELF_PATH = fileURLToPath(import.meta.url);
const SELF_SHA256 = createHash("sha256").update(readFileSync(SELF_PATH)).digest("hex");
const SKILL_MD_PATH = resolve(SELF_PATH, "../../../skills/motion-director/SKILL.md");
const LITE_MD_PATH = resolve(SELF_PATH, "../../../skills/motion-director/LITE.md");
const SKILL_SHA256 = existsSync(SKILL_MD_PATH) ? createHash("sha256").update(readFileSync(SKILL_MD_PATH)).digest("hex") : "unknown";
const LITE_SHA256 = existsSync(LITE_MD_PATH) ? createHash("sha256").update(readFileSync(LITE_MD_PATH)).digest("hex") : "unknown";

async function isDrawerOpen(page) {
  return page.evaluate(() => {
    const toggle = document.querySelector("#drawer-toggle");
    const drawer = document.querySelector("#inspector-drawer");
    if (!toggle || !drawer) return false;
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    const notInert = !drawer.hasAttribute("inert");
    const notHidden = drawer.getAttribute("aria-hidden") !== "true";
    return expanded && notInert && notHidden;
  });
}

async function main() {
  const htmlPath = resolve(process.argv[2] ?? "drawer-motion.html");
  if (!existsSync(htmlPath)) {
    console.error(JSON.stringify({ passed: false, failedCheck: "file_missing", htmlPath }));
    process.exit(1);
  }
  const htmlBytes = readFileSync(htmlPath);
  const htmlSha256 = createHash("sha256").update(htmlBytes).digest("hex");
  const htmlText = htmlBytes.toString("utf8");

  for (const token of ["--motion-duration", "--motion-ease", "prefers-reduced-motion", "transform", "opacity", "aria-expanded", "inert"]) {
    if (!htmlText.includes(token)) {
      console.error(JSON.stringify({ passed: false, failedCheck: "missing_static_token:" + token, htmlSha256, verifierSha256: SELF_SHA256 }));
      process.exit(1);
    }
  }

  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(htmlBytes);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const baseUrl = "http://127.0.0.1:" + port + "/";

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });

    // 1. Desktop keyboard & interruption check
    const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopCtx.newPage();
    await desktopPage.route("**/*", (route) => {
      if (route.request().url().startsWith(baseUrl)) return route.continue();
      return route.abort();
    });
    await desktopPage.goto(baseUrl);
    const toggle = desktopPage.locator("#drawer-toggle");
    await toggle.focus();
    await desktopPage.keyboard.press("Enter");
    await desktopPage.waitForTimeout(80);
    if (!(await isDrawerOpen(desktopPage))) {
      console.error(JSON.stringify({ passed: false, failedCheck: "desktop_keyboard_open", htmlSha256, verifierSha256: SELF_SHA256 }));
      process.exit(1);
    }
    await desktopPage.keyboard.press("Escape");
    await desktopPage.waitForTimeout(80);
    if (await isDrawerOpen(desktopPage)) {
      console.error(JSON.stringify({ passed: false, failedCheck: "desktop_escape_close", htmlSha256, verifierSha256: SELF_SHA256 }));
      process.exitCode = 1;
      return;
    }
    // Rapid mid-transition interruption (closed -> open -> closed -> open at 35ms intervals while transition is active)
    const interruptionRes = await desktopPage.evaluate(async () => {
      const tBtn = document.querySelector("#drawer-toggle");
      const drw = document.querySelector("#inspector-drawer");
      const cBtn = document.querySelector("#inspector-drawer button") || tBtn;
      if (!tBtn || !drw) return { ok: false, reason: "missing_elements" };
      let cancelCount = 0;
      drw.addEventListener("transitioncancel", () => { cancelCount += 1; });
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      tBtn.click();
      await sleep(35);
      const runningMid = drw.getAnimations ? drw.getAnimations().length : 0;
      cBtn.click();
      await sleep(35);
      tBtn.click();
      return { ok: true, runningMid, cancelCount };
    });
    await desktopPage.waitForTimeout(250);
    if (!interruptionRes.ok || !(await isDrawerOpen(desktopPage))) {
      console.error(JSON.stringify({ passed: false, failedCheck: "desktop_rapid_interruption", interruptionRes, htmlSha256, verifierSha256: SELF_SHA256 }));
      process.exitCode = 1;
      return;
    }
    await desktopCtx.close();

    // 2. Mobile touch open/close & prefers-reduced-motion check
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const mobilePage = await mobileCtx.newPage();
    await mobilePage.route("**/*", (route) => {
      if (route.request().url().startsWith(baseUrl)) return route.continue();
      return route.abort();
    });
    await mobilePage.goto(baseUrl);
    const duration = await mobilePage.locator("#inspector-drawer").evaluate((el) => getComputedStyle(el).transitionDuration);
    if (duration !== "0s" && duration !== "0s, 0s" && !/^0s(?:\s*,\s*0s)*$/.test(duration)) {
      console.error(JSON.stringify({ passed: false, failedCheck: "reduced_motion_duration", observedDuration: duration, htmlSha256, verifierSha256: SELF_SHA256 }));
      process.exit(1);
    }

    const mobileToggle = mobilePage.locator("#drawer-toggle");
    await mobileToggle.tap({ timeout: 2500 });
    await mobilePage.waitForTimeout(50);
    if (!(await isDrawerOpen(mobilePage))) {
      console.error(JSON.stringify({ passed: false, failedCheck: "mobile_touch_open", htmlSha256, verifierSha256: SELF_SHA256 }));
      process.exit(1);
    }

    const innerButtons = mobilePage.locator("#inspector-drawer button");
    const innerCount = await innerButtons.count();
    try {
      if (innerCount > 0) {
        await innerButtons.first().tap({ timeout: 2500 });
      } else {
        await mobileToggle.tap({ timeout: 2500 });
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          passed: false,
          failedCheck: "mobile_touch_close_timeout_or_covered",
          buttonsInsideDrawer: innerCount,
          error: String(err?.message ?? err).slice(0, 300),
          htmlSha256,
          verifierSha256: SELF_SHA256,
        }),
      );
      process.exit(1);
    }
    await mobilePage.waitForTimeout(50);
    if (await isDrawerOpen(mobilePage)) {
      console.error(
        JSON.stringify({
          passed: false,
          failedCheck: "mobile_touch_close_remained_open",
          buttonsInsideDrawer: innerCount,
          htmlSha256,
          verifierSha256: SELF_SHA256,
        }),
      );
      process.exit(1);
    }
    await mobileCtx.close();

    console.log(
      JSON.stringify({
        passed: true,
        htmlPath,
        htmlSha256,
        verifierSha256: SELF_SHA256,
        skillMdSha256: SKILL_SHA256,
        liteMdSha256: LITE_SHA256,
        checks: {
          desktopKeyboardOpenClose: "PASS",
          desktopRapidInterruption: "PASS",
          mobileReducedMotionDuration: duration,
          mobileTouchOpen: "PASS",
          mobileTouchClose: "PASS",
          buttonsInsideDrawer: innerCount,
        },
      }),
    );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(() => r()));
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ passed: false, failedCheck: "unhandled_error", error: String(err?.message ?? err) }));
  process.exit(1);
});

