# ADR-009: Detached live routing evidence

**Status:** Accepted for evidence collection; no live rollout is authorized by this ADR.

## Decision

`evals/routing/live_evidence.py` is the canonical producer for P2 shadow, canary, and rollout evidence. It is opt-in through `FORGEWRIGHT_LIVE_ROUTING=1` and invokes four independently configured JSON-over-stdin adapters:

- router: returns `initial_tier`, `selected_tier`, and the mechanically matching `escalation_count`;
- provider: returns output, run identity, policy/model snapshot, finite positive cost, and cost unit;
- verifier: returns pass/safety results plus verifier identity, snapshot, and execution identity;
- attester: independently validates the unsigned envelope and returns its detached HMAC-SHA256 attestation.

The producer must not receive `FORGEWRIGHT_ROUTING_EVIDENCE_KEY`. A separate gatekeeper runs `control_plane.py` with that verification key. This separation prevents the evidence-producing process from approving its own result. Production attesters must independently resolve execution IDs and hashes against immutable provider/verifier artifacts before signing; the deterministic test attester is only a test fixture and is not acceptable live evidence.

The receipt stores task IDs, run IDs, resolved snapshots, costs, results, and SHA-256 digests. It does not store prompts or model outputs. Canary selection is deterministic, exactly 10% of the frozen corpus, and proportionally stratified by category. Any metadata, cost-unit, verifier-snapshot, or routing-invariant drift fails closed.

## Operation

Pass each adapter command as a JSON string array and write the producer result to a restricted local path. Then move the receipt to the separately controlled gatekeeper and run:

```bash
FORGEWRIGHT_ROUTING_EVIDENCE_KEY="$GATEKEEPER_KEY" \
  python3 evals/routing/control_plane.py path/to/evidence.json
```

A non-zero producer or gatekeeper exit is a failed evidence run. Synthetic fixtures, unsigned files, and locally edited receipts never satisfy P2 live gates.

## Rollback and revocation

1. Disable routing/canary traffic and restore strong-model-only execution.
2. Revoke the attester credential and rotate the gatekeeper verification key.
3. Quarantine receipts signed by the revoked key and record their run IDs.
4. Restore the last accepted routing-policy snapshot.
5. Re-run the strong baseline and shadow gate before authorizing another canary.

No failed, revoked, or pre-rotation receipt may be reused as rollout evidence.
