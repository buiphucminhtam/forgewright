import { describe, it, expect } from "vitest";
import {
  realpathSync,
  readFileSync,
  symlinkSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMobile } from "../src/mobile/contracts.js";
import {
  createBetaIntent,
  runBetaRelease,
  FileBetaJournal,
  type BetaObservation,
  type BetaProvider,
} from "../src/mobile/beta.js";
function config() {
  const root = fileURLToPath(
    new URL(
      "../../../templates/game/mobile-monetization/examples/",
      import.meta.url,
    ),
  );
  return resolveMobile(
    ...(["studio.json", "phaser4-game.json", "strategy.json"].map((n) =>
      JSON.parse(readFileSync(join(root, n), "utf8")),
    ) as [unknown, unknown, unknown]),
  );
}
function artifact(c = config()) {
  return {
    schema: "mobile-artifact/v1",
    game_id: c.game.game_id,
    platform: "android",
    app_id: c.game.android.app_id,
    source_revision: "a".repeat(40),
    config_digest: resolveMobile(c.profile, c.game, c.strategy).digest,
    artifact_sha256: "b".repeat(64),
    version: 1,
    build_id: "build-1",
  };
}
describe("internal beta release coordinator", () => {
  it("denies wrong artifact identity and production before calling a provider", () => {
    const c = config();
    expect(() =>
      createBetaIntent(c, { ...artifact(c), app_id: "foreign" }),
    ).toThrow("artifact_binding_mismatch");
    expect(() =>
      createBetaIntent(c, { ...artifact(c), destination: "production" }),
    ).toThrow("invalid_mobile_contract");
  });
  it("resumes an ambiguous upload without creating another build, and keeps simulation separate", async () => {
    const c = config();
    c.game.android.track_id = "observed-internal";
    const a = artifact(c);
    const root = mkdtempSync(join(realpathSync(tmpdir()), "fw-beta-"));
    const journal = new FileBetaJournal(root);
    let submissions = 0;
    let remote = "absent";
    const provider: BetaProvider = {
      mode: "simulated",
      authorize: async () => true,
      submit: async () => {
        submissions++;
        remote = "processing";
        throw Error("lost response");
      },
      observe: async (intent) =>
        ({
          intent_id: intent.intent_id,
          app_id: intent.app_id,
          account: intent.account,
          destination: intent.destination,
          source_revision: intent.source_revision,
          config_digest: intent.config_digest,
          artifact_sha256: intent.artifact_sha256,
          version: intent.version,
          build_id: intent.build_id,
          state: remote,
          observed_at: new Date().toISOString(),
          device_install_launch_verified: false,
        }) as BetaObservation,
    };
    try {
      const first = await runBetaRelease(c, a, { provider, journal });
      expect(first.status).toBe("outcome_unknown");
      const second = await runBetaRelease(c, a, { provider, journal });
      expect(second.status).toBe("processing");
      expect(submissions).toBe(1);
      remote = "available";
      const ready = await runBetaRelease(c, a, { provider, journal });
      expect(ready.available_to_testers).toBe(false);
      expect(ready.simulated_available_to_testers).toBe(true);
      expect(ready.device_install_launch_verified).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects foreign observation and serializes concurrent attempts using the journal lock", async () => {
    const c = config();
    c.game.android.track_id = "observed-internal";
    const a = artifact(c);
    const root = mkdtempSync(join(realpathSync(tmpdir()), "fw-beta-"));
    const journal = new FileBetaJournal(root);
    let done: () => void = () => {};
    const pending = new Promise<void>((r) => {
      done = r;
    });
    const provider: BetaProvider = {
      mode: "simulated",
      authorize: async () => true,
      submit: async () => {},
      observe: async (intent) => {
        await pending;
        return {
          intent_id: intent.intent_id,
          app_id: "wrong",
        } as BetaObservation;
      },
    };
    try {
      const first = runBetaRelease(c, a, { provider, journal });
      await expect(runBetaRelease(c, a, { provider, journal })).rejects.toThrow(
        "beta_intent_locked",
      );
      done();
      await expect(first).rejects.toThrow("provider_observation_mismatch");
    } finally {
      done();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("blocks live adapters until native/account/strategy prerequisites are supplied by the project", async () => {
    const c = config();
    const root = mkdtempSync(join(realpathSync(tmpdir()), "fw-beta-"));
    let effects = 0;
    const provider: BetaProvider = {
      mode: "live",
      authorize: async () => {
        effects++;
        return true;
      },
      submit: async () => {
        effects++;
      },
      observe: async () => {
        effects++;
        throw Error("must not call");
      },
    };
    try {
      await expect(
        runBetaRelease(c, artifact(c), {
          provider,
          journal: new FileBetaJournal(root),
        }),
      ).rejects.toThrow("live_mobile_prerequisites_unverified");
      expect(effects).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("store version ownership", () => {
  it("reserves a version across different artifact/config intents", async () => {
    const c = config();
    c.game.android.track_id = "observed-internal";
    const a = artifact(c);
    const root = mkdtempSync(join(realpathSync(tmpdir()), "fw-version-"));
    const journal = new FileBetaJournal(root);
    const provider: BetaProvider = {
      mode: "simulated",
      authorize: async () => true,
      submit: async () => {},
      observe: async (intent) => ({
        ...intent,
        state: "processing",
        observed_at: new Date().toISOString(),
        device_install_launch_verified: false,
      }),
    };
    try {
      await runBetaRelease(c, a, { provider, journal });
      await expect(
        runBetaRelease(
          c,
          { ...a, artifact_sha256: "c".repeat(64) },
          { provider, journal },
        ),
      ).rejects.toThrow("beta_version_reserved_by_another_intent");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("independent review regressions", () => {
  it("I1: preserves successful submit uncertainty through delayed visibility and regression", async () => {
    const c = config();
    c.game.android.track_id = "observed-internal";
    const a = artifact(c);
    const root = mkdtempSync(join(realpathSync(tmpdir()), "fw-visibility-"));
    const journal = new FileBetaJournal(root);
    let submits = 0;
    let state: BetaObservation["state"] = "absent";
    const provider: BetaProvider = {
      mode: "simulated",
      authorize: async () => true,
      submit: async () => {
        submits++;
      },
      observe: async (intent) => ({
        ...intent,
        state,
        observed_at: new Date().toISOString(),
        device_install_launch_verified: false,
      }),
    };
    try {
      const first = await runBetaRelease(c, a, { provider, journal });
      expect(first.status).toBe("outcome_unknown");
      await runBetaRelease(c, a, { provider, journal });
      expect(submits).toBe(1);
      state = "processing";
      await runBetaRelease(c, a, { provider, journal });
      state = "absent";
      await runBetaRelease(c, a, { provider, journal });
      expect(submits).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("I4: pre-aborted and unauthorized runs do not reserve a version", async () => {
    for (const denied of ["abort", "authorization"]) {
      const c = config();
      c.game.android.track_id = "observed-internal";
      const a = artifact(c);
      const root = mkdtempSync(join(realpathSync(tmpdir()), "fw-preflight-"));
      const journal = new FileBetaJournal(root);
      const provider: BetaProvider = {
        mode: "simulated",
        authorize: async () => denied !== "authorization",
        submit: async () => {},
        observe: async (intent) => ({
          ...intent,
          state: "processing",
          observed_at: new Date().toISOString(),
          device_install_launch_verified: false,
        }),
      };
      try {
        await expect(
          runBetaRelease(c, a, {
            provider,
            journal,
            ...(denied === "abort" ? { signal: AbortSignal.abort() } : {}),
          }),
        ).rejects.toThrow();
        provider.authorize = async () => true;
        const valid = await runBetaRelease(
          c,
          { ...a, artifact_sha256: "d".repeat(64) },
          { provider, journal },
        );
        expect(valid.status).toBe("processing");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

describe("journal adoption", () => {
  it("I5: rejects a symlinked ancestor before creating a foreign directory", () => {
    const root = mkdtempSync(join(realpathSync(tmpdir()), "fw-adoption-"));
    const foreign = join(root, "foreign");
    mkdirSync(foreign);
    symlinkSync(foreign, join(root, "link"), "junction");
    try {
      expect(() => new FileBetaJournal(join(root, "link", "new-leaf"))).toThrow(
        "unsafe_beta_journal_root",
      );
      expect(existsSync(join(foreign, "new-leaf"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
