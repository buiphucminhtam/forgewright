// Godot HTML5 Export Visual Test Template
// Naming: godot_{screen}_{behavior}.midscene.ts
// Ref: GDD/Sections/{XX}.md

// =============================================================================
// SETUP
// =============================================================================
// Prerequisite: Midscene configured (see tests/game/visual/README.md)
//
// 1. Export your Godot project as HTML5:
//    Project → Export → HTML5 → Export Project
//    This creates index.html + .pck files in res://export_presets.cfg
//
// 2. Serve the export locally:
//    python3 -m http.server 8080 --directory export_presets/html5/
//
// 3. Run tests: source .env.midscene && npx tsx tests/game/visual/godot/_template.midscene.ts
//
// =============================================================================

import { PlaywrightAiFixture } from '@midscene/web/playwright';
import { test as base } from '@playwright/test';

// Extend Playwright with Midscene AI capabilities
const test = base.extend<PlaywrightAiFixture>(PlaywrightAiFixture());

// =============================================================================
// SMOKE TESTS — Run on every pre-flight
// Target: ≤10 actions, <60s total
// =============================================================================

/**
 * Main menu renders correctly.
 * Ref: GDD/Sections/01_Menu.md §1.1 — Main Menu Layout
 */
test('godot_main-menu_renders', async ({ page, ai, aiAssert }) => {
  await page.goto('http://localhost:8080/');

  // Visual assertions — no selectors needed
  await aiAssert('main menu is displayed with Play, Options, Quit buttons');
  await aiAssert('game logo is visible at top center');
});

/**
 * Options menu opens and closes correctly.
 * Ref: GDD/Sections/01_Menu.md §1.3 — Options Screen
 */
test('godot_options-menu_opens', async ({ page, ai, aiAssert }) => {
  await page.goto('http://localhost:8080/');

  await ai('click the Options button');
  await aiAssert('options menu appears with Graphics, Audio, Controls tabs');
  await ai('click the close button');
  await aiAssert('options menu is dismissed and main menu is visible');
});

// =============================================================================
// LEVEL SELECT TESTS
// =============================================================================

/**
 * Level select screen displays all available levels.
 * Ref: GDD/Sections/02_LevelSelect.md §2.1
 */
test('godot_level-select_displays-levels', async ({ page, ai, aiAssert }) => {
  await page.goto('http://localhost:8080/');

  await ai('click the Play button');
  await aiAssert('level select screen appears with at least 3 level cards');
  await aiAssert('locked levels are visually distinct from unlocked levels');
});

// =============================================================================
// PAUSE MENU TESTS
// =============================================================================

/**
 * Pause menu appears and allows resuming game.
 * Ref: GDD/Sections/03_Pause.md §3.1
 */
test('godot_pause-menu_resume', async ({ page, ai, aiAssert }) => {
  await page.goto('http://localhost:8080/game');
  await ai('press Escape to open pause menu');
  await aiAssert('pause menu is visible with Resume, Options, Quit buttons');
  await ai('click the Resume button');
  await aiAssert('pause menu is dismissed');
});

// =============================================================================
// SETTINGS TESTS
// =============================================================================

/**
 * Graphics settings change affects render.
 * Ref: GDD/Sections/04_Settings.md §4.1
 */
test('godot_settings_graphics-change', async ({ page, ai, aiAssert }) => {
  await page.goto('http://localhost:8080/');
  await ai('click the Options button');
  await ai('click the Graphics tab');
  await aiAssert('resolution dropdown is visible');
  await aiAssert('quality preset options are available (Low, Medium, High)');
});

// =============================================================================
// NOTE: Placeholder tests below — always pass in CI
// Replace each test with actual game-specific assertions
// =============================================================================

// TODO: Replace with actual main menu tests
// test('godot_main-menu_renders', async ({ page, ai, aiAssert }) => {
//   await page.goto('http://localhost:8080/');
//   await aiAssert('main menu is displayed');
// });

// TODO: Replace with actual options tests
// test('godot_options-menu_opens', async ({ page, ai, aiAssert }) => {
//   await page.goto('http://localhost:8080/');
//   await ai('click the Options button');
//   await aiAssert('options menu appears');
// });
