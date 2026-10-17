/** SERVER ONLY. Context/catalog come from authenticated server state, never the
 * WebView request body. verify must actually verify provider facts; ledger must
 * atomically persist uniqueness and grant. All implementations are explicit. */
const bindingKeys = ["owner", "platform", "app_id", "environment", "user_id"];
export async function deliverPurchase(
  { context, product, proof },
  { verify, ledger, finalize },
) {
  if (
    !context ||
    bindingKeys.some((k) => typeof context[k] !== "string" || !context[k])
  )
    throw Error("invalid_purchase_context");
  if (
    !product ||
    !["consumable", "non_consumable"].includes(product.kind) ||
    !Number.isSafeInteger(product.quantity) ||
    product.quantity < 1
  )
    throw Error("invalid_purchase_catalog");
  const facts = await verify({ context, product_id: product.id, proof });
  if (facts?.verification !== "server_verified" || facts.state !== "purchased")
    throw Error("purchase_not_verified_or_pending");
  if (
    bindingKeys.some((k) => facts[k] !== context[k]) ||
    facts.product_id !== product.id ||
    typeof facts.transaction_id !== "string" ||
    !facts.transaction_id
  )
    throw Error("purchase_binding_mismatch");
  const grant = await ledger.claimAndGrant(facts, product);
  // Retry finalization even for a duplicate grant, including after process death.
  // The provider adapter implements acknowledge/consume/finish, with its own
  // product-type semantics and reconciliation. No token/JWS appears in results.
  let finalization = "complete";
  try {
    await finalize({ context, facts, proof });
  } catch {
    finalization = "pending";
  }
  return {
    state: "verified",
    product_id: product.id,
    new_grant: grant.new_grant,
    grant_id: grant.grant_id,
    finalization,
  };
}
