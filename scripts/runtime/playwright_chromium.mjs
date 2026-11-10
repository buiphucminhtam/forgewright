/**
 * Shared Playwright Chromium functional test profile (MAC-05 / C06).
 *
 * - Darwin default bundled headless shell uses ['--disable-frame-rate-limit'] so
 *   Chromium's viz root compositor selects a real-time BackToBackBeginFrameSource
 *   instead of throttling begin-frames on headless macOS.
 * - Windows and Linux default bundled headless shell remain unchanged ([]).
 * - Explicit PLAYWRIGHT_CHANNEL remains an explicit opt-in override and does not
 *   silently inherit the Darwin default headless-shell launch args.
 * - Functional verification only: physical device frame pacing/FPS remains
 *   ineligible (physicalPerformanceEligible: false, physicalPerformanceScore: 'unscored').
 */

export function resolveChromiumFunctionalProfile(options = {}) {
  const rawChannel =
    options.channel !== undefined ? options.channel : process.env.PLAYWRIGHT_CHANNEL;
  const explicitChannel = typeof rawChannel === "string" && rawChannel.trim() ? rawChannel.trim() : null;
  const platform = typeof options.platform === "string" && options.platform ? options.platform : process.platform;
  const isDarwinDefaultShell = !explicitChannel && platform === "darwin";
  const launchArgs = isDarwinDefaultShell ? ["--disable-frame-rate-limit"] : [];
  const profile = explicitChannel
    ? "explicit-channel-override"
    : isDarwinDefaultShell
      ? "darwin-default-headless-shell-unthrottled-beginframe"
      : "default-bundled-headless-shell";
  const channel = explicitChannel ?? "default-bundled-headless-shell";

  return {
    explicitChannel,
    platform,
    channel,
    profile,
    launchArgs,
    physicalPerformanceEligible: false,
    physicalPerformanceScore: "unscored",
    actualLaunchExecutable: "unknown",
    launchOptions: {
      headless: true,
      ...(explicitChannel ? { channel: explicitChannel } : {}),
      ...(launchArgs.length > 0 ? { args: [...launchArgs] } : {}),
    },
    playwrightProjectUse: {
      ...(explicitChannel ? { channel: explicitChannel } : {}),
      ...(launchArgs.length > 0 ? { launchOptions: { args: [...launchArgs] } } : {}),
    },
  };
}
