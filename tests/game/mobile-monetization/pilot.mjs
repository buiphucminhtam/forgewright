/** Synthetic replay only. No browser, native SDK, store or player is exercised. */
import { realpathSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  resolveMobile,
  doctorMobile,
  FileBetaJournal,
  runBetaRelease,
} from "../../../src/cli/dist/mobile-entry.js";
import { createMobileRuntime } from "../../../templates/game/mobile-monetization/runtime.mjs";
import { deliverPurchase } from "../../../templates/game/mobile-monetization/delivery.mjs";
import { SqlitePurchaseLedger } from "../../../templates/game/mobile-monetization/sqlite-ledger.mjs";
const fixture = new URL(
  "../../../templates/game/mobile-monetization/examples/",
  import.meta.url,
);
const read = (name) => JSON.parse(readFileSync(new URL(name, fixture), "utf8"));
const profile = read("studio.json");
const workspace = mkdtempSync(
  join(realpathSync(tmpdir()), "fw-mobile-pilots-"),
);
const ledger = new SqlitePurchaseLedger(join(workspace, "purchases.sqlite"));
const report = {
  scope: "synthetic_control_plane_replay",
  profile_inputs: 1,
  pilots: [],
  real_sdk_verified: false,
  real_store_verified: false,
  player_or_revenue_uplift: "unmeasured",
};
try {
  for (const engine of ["phaser4", "threejs"]) {
    const game = read(`${engine}-game.json`);
    const strategy = read("strategy.json");
    strategy.game_id = game.game_id;
    game.android.track_id = `synthetic-internal-${engine}`;
    game.ios.group_id = `synthetic-group-${engine}`;
    game.ios.workflow_id = `synthetic-workflow-${engine}`;
    const config = resolveMobile(profile, game, strategy);
    assert.equal(doctorMobile(config).live_ready, false);
    const context = {
      game_id: game.game_id,
      app_id: game.android.app_id,
      environment: "sandbox",
      user_id: "synthetic-player",
    };
    const facts = {
      owner: profile.profile_id,
      platform: "google_play",
      app_id: context.app_id,
      environment: "sandbox",
      user_id: context.user_id,
      transaction_id: `synthetic-${engine}-purchase`,
      product_id: "remove_ads",
      verification: "server_verified",
      state: "purchased",
    };
    const runtime = await createMobileRuntime({
      context,
      simulation: true,
      bridge: {
        capabilities: async () => ({
          context,
          mode: "simulated",
          operations: ["purchase"],
        }),
        request: async (r) => ({
          id: r.id,
          context,
          result: { state: "purchased", proof: "synthetic-proof" },
        }),
        dispose: async () => {},
      },
      verifyPurchase: async () => {
        const delivered = await deliverPurchase(
          {
            context: {
              owner: facts.owner,
              platform: facts.platform,
              ...context,
            },
            product: { id: "remove_ads", kind: "non_consumable", quantity: 1 },
            proof: "synthetic-proof",
          },
          { verify: async () => facts, ledger, finalize: async () => {} },
        );
        return { ...delivered, context };
      },
    });
    try {
      assert.equal((await runtime.purchase("remove_ads")).state, "verified");
      assert.equal((await runtime.purchase("remove_ads")).new_grant, false);
    } finally {
      await runtime.destroy();
    }
    const channels = [];
    for (const platform of ["android", "ios"]) {
      let state = "absent";
      let submissions = 0;
      const artifact = {
        schema: "mobile-artifact/v1",
        game_id: game.game_id,
        platform,
        app_id: game[platform].app_id,
        source_revision: "0".repeat(40),
        config_digest: config.digest,
        artifact_sha256: createHash("sha256")
          .update(`synthetic-${game.game_id}-${platform}`)
          .digest("hex"),
        version: 1,
        build_id: `synthetic-${engine}-${platform}`,
      };
      const provider = {
        mode: "simulated",
        authorize: async () => true,
        submit: async () => {
          submissions++;
          state = "processing";
          throw Error("synthetic-lost-response");
        },
        observe: async (intent) => ({
          ...intent,
          state,
          observed_at: new Date().toISOString(),
          device_install_launch_verified: false,
        }),
      };
      const journal = new FileBetaJournal(
        join(workspace, "shared-release-journal"),
      );
      const unknown = await runBetaRelease(config, artifact, {
        provider,
        journal,
      });
      assert.equal(unknown.status, "outcome_unknown");
      const resumed = await runBetaRelease(config, artifact, {
        provider,
        journal,
      });
      assert.equal(resumed.status, "processing");
      state = "available";
      const available = await runBetaRelease(config, artifact, {
        provider,
        journal,
      });
      assert.equal(submissions, 1);
      assert.equal(available.available_to_testers, false);
      assert.equal(available.simulated_available_to_testers, true);
      channels.push({ platform, submissions, ...available });
    }
    report.pilots.push({
      engine,
      game_id: game.game_id,
      config_digest: config.digest,
      channels,
    });
  }
  assert.equal(ledger.grantCount(), 2);
  report.durable_purchase_grants = ledger.grantCount();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} finally {
  ledger.close();
  rmSync(workspace, { recursive: true, force: true });
}
