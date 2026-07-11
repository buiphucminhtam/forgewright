# Cheap-model evaluation metadata

`run-evals.py` writes schema version 2 reports. A report is eligible for
comparison only when it records a live run, the exact ordered task IDs, attempt
count, verifier version and fingerprint, provider identifier, model identifier,
and the provider-resolved model snapshot.

Run a live report with evidence supplied by the configured provider:

```bash
FORGEWRIGHT_PROVIDER=<provider-id> \
FORGEWRIGHT_MODEL_SNAPSHOT=<provider-resolved-snapshot> \
python3 evals/cheap-model/run-evals.py --live --legacy --model <model-id>
```

Use the same provider, model, snapshot, task set, attempt count, and verifier
metadata for the paired `--lite` run. `--compare` rejects every mismatch.

## Historical files

`results-legacy.json` and `results-lite.json` predate schema version 2. The
former records a model label but not provider, resolved snapshot, task-set
fingerprint, or verifier fingerprint; the latter is a mock run. They are kept
as historical harness output only. They are deliberately rejected as routing
or quality evidence and must not be relabelled as live evidence.
