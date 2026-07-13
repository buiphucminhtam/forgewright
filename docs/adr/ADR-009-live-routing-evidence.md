# ADR-009: Provider-native live routing evidence

**Status:** Accepted for evidence collection; no live rollout is authorized by this ADR.

## Decision

`evals/routing/live_evidence.py` is the canonical producer for P2 shadow, canary, and rollout evidence. It is opt-in through `FORGEWRIGHT_LIVE_ROUTING=1` and exposes four JSON-over-stdin roles:

- router: returns `initial_tier`, `selected_tier`, and the mechanically matching `escalation_count`;
- provider: returns output, run identity, policy/model snapshot, finite positive cost, and cost unit;
- verifier: returns pass/safety results plus verifier identity, snapshot, and execution identity;
- attester: validates the provider-native run identities and returns the ecosystem's receipt attestation.

All four roles must belong to one selected provider ecosystem for a run. Router, provider, and verifier may share one adapter executable that dispatches on `ADAPTER_KIND`; cross-provider services are neither required nor used by default. The attester must independently resolve immutable provider audit/usage receipts, or the local gatekeeper must query those receipts through a separately authenticated provider API. An adapter cannot satisfy live evidence by signing only the fields it just produced. Providers without a native receipt/audit boundary remain eligible for local use but cannot satisfy the live rollout gate.

The adapter owns capability discovery, model mapping, provider credentials, native verifier calls, run lookup, and usage/cost normalization. Forgewright owns only the stable envelope and gates. Adding a provider means implementing this contract, not adding the provider's model names to core routing logic.

The producer must not receive `FORGEWRIGHT_ROUTING_EVIDENCE_KEY`. A separate local gatekeeper runs `control_plane.py` with that verification key. The provider-native attester must resolve execution IDs and hashes against its own provider/verifier artifacts before signing; the deterministic test adapter is only a fixture and is not acceptable live evidence.

The receipt stores task IDs, run IDs, resolved snapshots, costs, results, and SHA-256 digests. It does not store prompts or model outputs. Canary selection is deterministic, exactly 10% of the frozen corpus, and proportionally stratified by category. Any metadata, cost-unit, verifier-snapshot, or routing-invariant drift fails closed.

## Operation

Pass the selected provider adapter command as a JSON string array for each role (the same command is allowed) and write the producer result to a restricted local path. Then run the local gatekeeper:

```bash
FORGEWRIGHT_ROUTING_EVIDENCE_KEY="$GATEKEEPER_KEY" \
  python3 evals/routing/control_plane.py path/to/evidence.json
```

A non-zero producer or gatekeeper exit is a failed evidence run. Synthetic fixtures, unsigned files, and locally edited receipts never satisfy P2 live gates.

## Rollback and revocation

1. Disable routing/canary traffic and restore strong-model-only execution.
2. Revoke the provider-native receipt credential and rotate the local gatekeeper verification key.
3. Quarantine receipts signed by the revoked key and record their run IDs.
4. Restore the last accepted routing-policy snapshot.
5. Re-run the strong baseline and shadow gate before authorizing another canary.

No failed, revoked, or pre-rotation receipt may be reused as rollout evidence.
