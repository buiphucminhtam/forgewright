import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deliverPurchase } from "../../../templates/game/mobile-monetization/delivery.mjs";
import { SqlitePurchaseLedger } from "../../../templates/game/mobile-monetization/sqlite-ledger.mjs";
const context = {
  owner: "studio",
  platform: "google_play",
  app_id: "com.test.puzzle",
  environment: "sandbox",
  user_id: "player-1",
};
const catalog = { id: "remove_ads", kind: "non_consumable", quantity: 1 };
const facts = {
  ...context,
  transaction_id: "txn-1",
  product_id: "remove_ads",
  state: "purchased",
  verification: "server_verified",
};
test("AC04: durable concurrent replay grants once, retries finalization after restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "fw-ledger-"));
  const path = join(root, "ledger.sqlite");
  let finalized = 0;
  const store = new SqlitePurchaseLedger(path);
  try {
    const deps = {
      verify: async () => facts,
      ledger: store,
      finalize: async () => {
        finalized++;
        if (finalized === 1) throw Error("provider_offline");
      },
    };
    const first = await deliverPurchase(
      { context, product: catalog, proof: "private" },
      deps,
    );
    assert.equal(first.finalization, "pending");
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        deliverPurchase({ context, product: catalog, proof: "private" }, deps),
      ),
    );
    assert.equal(results.filter((r) => r.new_grant).length, 0);
    assert.equal(store.grantCount(), 1);
    store.close();
    const reopened = new SqlitePurchaseLedger(path);
    try {
      const r = await deliverPurchase(
        { context, product: catalog, proof: "private" },
        { ...deps, ledger: reopened },
      );
      assert.equal(r.new_grant, false);
      assert.equal(r.finalization, "complete");
    } finally {
      reopened.close();
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("AC04: forged, pending, foreign-app and replay-to-another-user cannot grant", async () => {
  const store = new SqlitePurchaseLedger(":memory:");
  const deps = { ledger: store, finalize: async () => {} };
  try {
    for (const changed of [
      { verification: "unverified" },
      { state: "pending" },
      { app_id: "wrong" },
      { environment: "production" },
    ]) {
      await assert.rejects(() =>
        deliverPurchase(
          { context, product: catalog, proof: "opaque" },
          { ...deps, verify: async () => ({ ...facts, ...changed }) },
        ),
      );
    }
    assert.equal(store.grantCount(), 0);
    await deliverPurchase(
      { context, product: catalog, proof: "opaque" },
      { ...deps, verify: async () => facts },
    );
    const other = { ...context, user_id: "player-2" };
    await assert.rejects(
      () =>
        deliverPurchase(
          { context: other, product: catalog, proof: "opaque" },
          { ...deps, verify: async () => ({ ...facts, ...other }) },
        ),
      /purchase_owner_mismatch/,
    );
    assert.equal(store.grantCount(), 1);
    const changedOwner = { ...context, owner: "another-studio" };
    await assert.rejects(
      () =>
        deliverPurchase(
          { context: changedOwner, product: catalog, proof: "opaque" },
          { ...deps, verify: async () => ({ ...facts, ...changedOwner }) },
        ),
      /purchase_owner_mismatch/,
    );
    assert.equal(store.grantCount(), 1);
  } finally {
    store.close();
  }
});
