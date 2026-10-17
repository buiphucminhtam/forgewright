import { afterEach, describe, expect, it } from "vitest";
import {
  realpathSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// AC01/10: loss of scope, provenance or assumption labels can make an unsafe
// integration appear ready. Exercise the shipped command, not a duplicate resolver.
const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })),
);
function invoke(...args: string[]) {
  return spawnSync(
    process.execPath,
    [resolve("dist/index.js"), "--json", "mobile", ...args],
    { encoding: "utf8", timeout: 15000 },
  );
}
function input() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "fw-mobile-"));
  roots.push(root);
  const fixtures = resolve("../../templates/game/mobile-monetization/examples");
  for (const name of ["studio.json", "phaser4-game.json", "strategy.json"]) {
    writeFileSync(join(root, name), readFileSync(join(fixtures, name)));
  }
  return {
    root,
    profile: join(root, "studio.json"),
    game: join(root, "phaser4-game.json"),
    strategy: join(root, "strategy.json"),
  };
}
describe("mobile studio shipped CLI", () => {
  it("exposes an actionable mobile setup command", () => {
    const result = invoke("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: forge mobile");
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("init");
  });
  it("accepts explicitly hypothetical inputs for simulation while retaining live blockers", () => {
    const f = input();
    const result = invoke(
      "doctor",
      f.game,
      "--profile",
      f.profile,
      "--strategy",
      f.strategy,
    );
    expect(result.status).toBe(0);
    const data = JSON.parse(result.stdout).data;
    expect(data.simulation_ready).toBe(true);
    expect(data.live_ready).toBe(false);
    expect(data.assumptions.length).toBeGreaterThan(0);
    expect(data.live_blockers).toContain("native_host_unverified");
    expect(data.config_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(data).not.toHaveProperty("secret_refs");
  });
  it("rejects production and leaked raw credentials without echoing the value", () => {
    const f = input();
    const profile = JSON.parse(readFileSync(f.profile, "utf8"));
    profile.release_policy.allowed_destinations.push("google_play_production");
    profile.secret_refs.play_publisher = {
      resolver: "runtime_binding",
      name: "PLAY",
      value: "DO-NOT-ECHO-SECRET",
    };
    writeFileSync(f.profile, JSON.stringify(profile));
    const result = invoke(
      "doctor",
      f.game,
      "--profile",
      f.profile,
      "--strategy",
      f.strategy,
    );
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(false);
    expect(result.stdout + result.stderr).not.toContain("DO-NOT-ECHO-SECRET");
  });
  it("rejects a second game borrowing another app catalogue identity", () => {
    const f = input();
    const game = JSON.parse(readFileSync(f.game, "utf8"));
    game.studio_profile_ref.revision = "different";
    writeFileSync(f.game, JSON.stringify(game));
    const result = invoke(
      "doctor",
      f.game,
      "--profile",
      f.profile,
      "--strategy",
      f.strategy,
    );
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout).error.message).toContain(
      "profile_revision_mismatch",
    );
  });
  it("never overwrites game customization when initializing twice", () => {
    const f = input();
    const target = join(f.root, "game");
    const first = invoke("init", target, "--engine", "threejs");
    expect(first.status).toBe(0);
    const path = join(target, "mobile", "game.json");
    writeFileSync(path, '{"owner":"custom"}\n');
    const second = invoke("init", target, "--engine", "phaser4");
    expect(second.status).not.toBe(0);
    expect(readFileSync(path, "utf8")).toBe('{"owner":"custom"}\n');
  });
});

describe("cross-game profile bindings", () => {
  it("rejects a permitted game that substitutes another game package", () => {
    const f = input();
    const game = JSON.parse(readFileSync(f.game, "utf8"));
    game.android.package = "example.assumed.three";
    writeFileSync(f.game, JSON.stringify(game));
    const result = invoke(
      "doctor",
      f.game,
      "--profile",
      f.profile,
      "--strategy",
      f.strategy,
    );
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout).error.message).toContain(
      "app_binding_mismatch",
    );
  });
});

describe("publishing adoption boundary", () => {
  it("routes an explicitly selected web game without scaffolding Expo", () => {
    const f = input();
    writeFileSync(
      join(f.root, "package.json"),
      JSON.stringify({ dependencies: { phaser: "4.2.1" } }),
    );
    const script = resolve("../../scripts/release/auto-publish-setup.sh");
    const result = spawnSync(
      "bash",
      [script, f.root, "--runtime", "web-game", "--engine", "phaser4"],
      { encoding: "utf8", timeout: 15000 },
    );
    expect(result.status).toBe(0);
    expect(readFileSync(join(f.root, "mobile/game.json"), "utf8")).toContain(
      "phaser4",
    );
    expect(() => readFileSync(join(f.root, "eas.json"))).toThrow();
  });
});

describe("legacy entry safety", () => {
  it("refuses to apply default Expo production templates to a detected web game", () => {
    const f = input();
    writeFileSync(
      join(f.root, "package.json"),
      JSON.stringify({ dependencies: { three: "0.183.2" } }),
    );
    const result = spawnSync(
      "bash",
      [resolve("../../scripts/release/auto-publish-setup.sh"), f.root],
      { encoding: "utf8", timeout: 15000 },
    );
    expect(result.status).not.toBe(0);
    expect(() => readFileSync(join(f.root, "eas.json"))).toThrow();
  });
});
