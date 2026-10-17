/** Engine-neutral client boundary. A native SDK plugin must implement bridge;
 * this module does not implement or certify a store/ads SDK. No local grants. */
const keys = ["game_id", "app_id", "environment", "user_id"];
function matches(expected, actual) {
  return (
    actual &&
    Object.keys(expected).every((key) => actual[key] === expected[key])
  );
}
export async function createMobileRuntime({
  context,
  bridge,
  simulation = false,
  verifyPurchase,
  canRequestAds = () => false,
  host = { pause() {}, resume() {} },
}) {
  if (
    !context ||
    keys.some((key) => typeof context[key] !== "string" || !context[key])
  )
    throw Error("invalid_native_context");
  const scope = Object.freeze({ ...context });
  const caps = await bridge.capabilities();
  if (!matches(scope, caps.context)) throw Error("native_context_mismatch");
  if (caps.mode !== "native" && !(simulation && caps.mode === "simulated"))
    throw Error("native_bridge_required");
  let destroyed = false;
  let fullscreen = false;
  async function request(operation, payload) {
    if (destroyed) throw Error("runtime_destroyed");
    if (!Array.isArray(caps.operations) || !caps.operations.includes(operation))
      throw Error("native_operation_unsupported");
    const id = globalThis.crypto.randomUUID();
    const response = await bridge.request({
      schema: "mobile-native-request/v1",
      id,
      context: scope,
      operation,
      payload,
    });
    if (destroyed) throw Error("runtime_destroyed");
    if (
      response?.id !== id ||
      !matches(scope, response.context) ||
      !response.result
    )
      throw Error("native_response_mismatch");
    return response.result;
  }
  return {
    mode: caps.mode,
    async purchase(product_id) {
      const result = await request("purchase", { product_id });
      if (result.state !== "purchased") {
        if (
          !["pending", "cancelled", "failed", "unavailable"].includes(
            result.state,
          )
        )
          throw Error("invalid_native_purchase_state");
        return { state: result.state };
      }
      if (!verifyPurchase) return { state: "verification_required" };
      // App's authenticated backend/native verified strategy owns this function.
      // Never implement it as `return {state: 'verified'}` around a JS callback.
      const projection = await verifyPurchase({
        context: scope,
        product_id,
        proof: result.proof,
      });
      if (destroyed) throw Error("runtime_destroyed");
      if (
        projection?.state !== "verified" ||
        projection.product_id !== product_id ||
        !matches(scope, projection.context)
      )
        throw Error("purchase_verification_failed");
      return projection;
    },
    async restore() {
      // Native restores are signals; every returned proof still needs verification.
      const signal = await request("restore", {});
      return { state: "verification_required", signal };
    },
    async showRewarded(placement_id) {
      if (destroyed) throw Error("runtime_destroyed");
      if (fullscreen) throw Error("fullscreen_operation_active");
      if (!canRequestAds()) return { state: "ineligible" };
      fullscreen = true;
      try {
        host.pause();
        // Privacy/entitlement may change in the pause callback.
        if (!canRequestAds()) return { state: "ineligible" };
        return await request("showRewarded", { placement_id });
      } finally {
        fullscreen = false;
        if (!destroyed) host.resume();
      }
    },
    async destroy() {
      if (!destroyed) {
        destroyed = true;
        await bridge.dispose();
      }
    },
  };
}
