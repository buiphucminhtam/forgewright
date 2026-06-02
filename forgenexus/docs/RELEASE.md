# ForgeNexus Anti-Hallucination GA — Release Notes

## v2.3.0 — General Availability

**Release Date:** June 2026
**Type:** Major Feature Release
**Status:** General Availability

---

## What's New

### Skeptic Verification Agent

The core anti-hallucination engine. Every claim made by Forgenexus is now verified against the indexed codebase before being surfaced.

```typescript
import { analyze } from 'forgenexus';
const result = await analyze('/path/to/repo', { verify: true });
// result.warnings  — claims below confidence threshold
// result.confidence — 0-1 score of output reliability
```

**Calibration modes:**
- `--strict` — Reject claims with confidence < 0.85
- Normal — Accept claims with confidence ≥ 0.60
- `--no-verify` — Bypass all verification (rollback mode)

### Confidence Scoring

ECE (Expected Calibration Error) < 0.10 — meaning the model's confidence matches its actual accuracy.

| Confidence Band | Target Accuracy | Calibration |
|-----------------|-----------------|-------------|
| 0.90 – 1.00 | 90 – 100% | ✅ Well calibrated |
| 0.70 – 0.89 | 70 – 89% | ✅ Acceptable |
| 0.50 – 0.69 | 50 – 69% | ⚠️ Review required |
| 0.00 – 0.49 | < 50% | ❌ Do not use |

### Citation Extraction + TokenShapley

Every factual claim is attributed to its source:

```
"The getUser function validates credentials [source:auth/login.ts:42]"
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                          Citation: file, line number
```

TokenShapley attribution scores every token, identifying which input tokens most influenced each output claim.

### Semantic Energy Uncertainty Quantification

Measures "semantic energy" — how surprising/unusual each output claim is relative to the training distribution. High energy = high uncertainty = flag for review.

### RAG-Grounded Wiki Generation

Generate documentation with citations and verification baked in:

```bash
forgenexus wiki "Authentication flow" --verify
# Outputs: wiki page with verified claims + confidence scores
```

### Evaluation Suite

```bash
forgenexus evaluate --dataset anti-hallucination-v1
# Runs 300 test cases, reports ECE, hallucination rate, citation accuracy
```

### Metrics Dashboard

```bash
forgenexus dashboard          # Terminal metrics TUI
forgenexus dashboard html     # HTML dashboard
forgenexus dashboard report   # Markdown report
forgenexus dashboard export   # JSON export
```

### CLI Commands Added

| Command | Description |
|---------|-------------|
| `forgenexus wiki [topic]` | Generate verified documentation |
| `forgenexus evaluate` | Run anti-hallucination evaluation |
| `forgenexus dashboard [subcommand]` | Metrics dashboard (metrics/html/report/export) |
| `forgenexus feedback` | Beta feedback collection |

### Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--no-verify` | `false` | Bypass skeptic verification |
| `--strict` | `false` | Reject confidence < 0.85 |

### CI/CD Pipeline

Five automated workflows (`.github/workflows/`):
- `test.yml` — Full test suite on every PR
- `benchmark.yml` — Performance regression detection
- `staged-rollout.yml` — Dev → Staging → Production
- `dependency-review.yml` — Dependency vulnerability scanning
- `benchmark-compare.yml` — Compare against baseline

---

## Breaking Changes

### Verification is Now Default

`forgenexus wiki`, `forgenexus impact`, and `forgenexus query` all enable skeptic verification by default. This may increase latency.

**Mitigation:**
```bash
forgenexus --no-verify wiki "auth"  # Fast mode, no verification
forgenexus --strict wiki "auth"     # Fail on low confidence
```

### Output Format Changes

| Field | v1.x | v2.3+ |
|-------|------|-------|
| `result.content` | Plain text | Plain text with citations |
| `result.confidence` | ❌ | ✅ Added |
| `result.warnings` | ❌ | ✅ Added |

---

## Migration

See [docs/MIGRATION.md](docs/MIGRATION.md) for the full upgrade guide.

**TL;DR:**
1. Update to v2.3.0 — `npm install forgenexus@latest`
2. Test with `--no-verify` first
3. Review new `confidence` and `warnings` fields
4. Enable verification incrementally per command

---

## Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Skeptic Latency | < 2000ms | ✅ |
| RAG Retrieval | < 500ms | ✅ |
| ECE | < 0.10 | ✅ |
| Hallucination Rate | < 10% | ✅ |
| Citation Accuracy | > 85% | ✅ |

---

## Beta Feedback

Thank you to all beta testers. Your feedback shaped:
- Threshold tuning (0.85 → 0.60 normal mode)
- Latency budget (skeptic: 2s, RAG: 500ms)
- Citation format (inline vs footnotes)
- Feature flag naming

---

## What's Next

- v2.4: Streaming verification (progress indicators)
- v2.5: Multi-repo context aggregation
- v3.0: Plugin architecture for custom skeptic prompts
