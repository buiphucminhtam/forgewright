import { test } from "node:test";
import assert from "node:assert/strict";
import { createMobileRuntime } from "../../../templates/game/mobile-monetization/runtime.mjs";
const context = {
  game_id: "puzzle",
  app_id: "com.test.puzzle",
  environment: "sandbox",
  user_id: "player-1",
};
function bridge(
  handler = async () => ({ state: "cancelled" }),
  mode = "simulated",
) {
  return {
    capabilities: async () => ({
      schema: "mobile-native-capabilities/v1",
      context,
      mode,
      operations: ["purchase", "restore", "showRewarded"],
    }),
    request: async (r) => ({
      id: r.id,
      context: r.context,
      result: await handler(r),
    }),
    dispose: async () => {},
  };
}
test("AC02: a simulated bridge cannot qualify as native or impersonate another app", async () => {
  await assert.rejects(
    () => createMobileRuntime({ context, bridge: bridge() }),
    /native_bridge_required/,
  );
  const wrong = bridge();
  wrong.capabilities = async () => ({
    context: { ...context, app_id: "another" },
    mode: "native",
  });
  await assert.rejects(
    () => createMobileRuntime({ context, bridge: wrong }),
    /native_context_mismatch/,
  );
});
test("AC03: purchased native result remains unverified without authoritative verifier", async () => {
  const runtime = await createMobileRuntime({
    context,
    bridge: bridge(async () => ({ state: "purchased", proof: "opaque" })),
    simulation: true,
  });
  assert.equal(
    (await runtime.purchase("remove_ads")).state,
    "verification_required",
  );
  await runtime.destroy();
});
test("AC04: verify purchase through injected trusted boundary; reject mismatched response", async () => {
  let calls = 0;
  const runtime = await createMobileRuntime({
    context,
    bridge: bridge(async () => ({ state: "purchased", proof: "opaque" })),
    simulation: true,
    verifyPurchase: async () => {
      calls++;
      return {
        context,
        state: "verified",
        product_id: "remove_ads",
        entitlements: ["remove_ads"],
      };
    },
  });
  assert.equal((await runtime.purchase("remove_ads")).state, "verified");
  assert.equal(calls, 1);
  await runtime.destroy();
  const bad = bridge();
  bad.request = async (r) => ({
    id: "foreign-request",
    context,
    result: { state: "purchased" },
  });
  const other = await createMobileRuntime({
    context,
    bridge: bad,
    simulation: true,
  });
  await assert.rejects(
    () => other.purchase("remove_ads"),
    /native_response_mismatch/,
  );
  await other.destroy();
});
test("AC05: deny ad before any native effect, and restore host after error", async () => {
  const events = [];
  let eligible = false;
  const runtime = await createMobileRuntime({
    context,
    bridge: bridge(async () => {
      events.push("show");
      throw Error("sdk_error");
    }),
    simulation: true,
    canRequestAds: () => eligible,
    host: {
      pause: () => events.push("pause"),
      resume: () => events.push("resume"),
    },
  });
  assert.equal((await runtime.showRewarded("revive")).state, "ineligible");
  assert.deepEqual(events, []);
  eligible = true;
  await assert.rejects(() => runtime.showRewarded("revive"), /sdk_error/);
  assert.deepEqual(events, ["pause", "show", "resume"]);
  await runtime.destroy();
});
test("AC05: one fullscreen operation; closing/resuming does not fabricate a reward", async () => {
  let finish;
  const wait = new Promise((r) => {
    finish = r;
  });
  let requests = 0;
  const runtime = await createMobileRuntime({
    context,
    bridge: bridge(async () => {
      requests++;
      await wait;
      return { state: "closed" };
    }),
    simulation: true,
    canRequestAds: () => true,
  });
  const first = runtime.showRewarded("revive");
  await assert.rejects(
    () => runtime.showRewarded("revive"),
    /fullscreen_operation_active/,
  );
  finish();
  assert.equal((await first).state, "closed");
  assert.equal(requests, 1);
  await runtime.destroy();
  await assert.rejects(() => runtime.purchase("x"), /runtime_destroyed/);
});

test("I2: a bridge cannot manufacture verifier-only purchase states", async () => {
  const runtime = await createMobileRuntime({
    context,
    bridge: bridge(async () => ({
      state: "verified",
      entitlements: ["remove_ads"],
    })),
    simulation: true,
  });
  try {
    await assert.rejects(
      () => runtime.purchase("remove_ads"),
      /invalid_native_purchase_state/,
    );
  } finally {
    await runtime.destroy();
  }
});
test("I3: a verified projection must identify the requested product", async () => {
  const runtime = await createMobileRuntime({
    context,
    bridge: bridge(async () => ({ state: "purchased", proof: "opaque" })),
    simulation: true,
    verifyPurchase: async () => ({
      context,
      state: "verified",
      product_id: "cheaper_product",
      entitlements: ["cheaper_product"],
    }),
  });
  try {
    await assert.rejects(
      () => runtime.purchase("remove_ads"),
      /purchase_verification_failed/,
    );
  } finally {
    await runtime.destroy();
  }
});

test("I2 restore: raw bridge restore state never becomes verified entitlement", async () => {
  const runtime = await createMobileRuntime({
    context,
    bridge: bridge(async () => ({
      state: "verified",
      entitlements: ["remove_ads"],
    })),
    simulation: true,
  });
  try {
    assert.equal((await runtime.restore()).state, "verification_required");
  } finally {
    await runtime.destroy();
  }
});
