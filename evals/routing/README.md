# Routing Evaluation Corpus

`corpus.py` is the canonical frozen P2.1 routing fixture. Version 2 contains exactly 100 unique tasks across ten balanced categories, including every category required by the active roadmap: debug, feature, review, refactor, security, docs, and operations.

The canonical JSON payload is sorted and serialized deterministically. The approved version-2 digest is independently pinned in the regression test as `bcb83e2ed5f4a9ccf2a7ef6d01fca38346b14f026381826f1cb51eaafc879da4`. It freezes prompts, expected tiers, risk signals, category names, order, and task IDs.

Version 2 deliberately resets the former `documentation-*` and `verification-*` IDs to `docs-*` and `review-*`. Version-1 decision sets are historical and must not be mixed with version-2 reports; the evaluator fails them as unknown or missing rather than silently translating incompatible categories. Any future corpus change requires a new corpus version and an independently reviewed digest update.

Print the canonical fixture:

```bash
python3 evals/routing/corpus.py
```

Evaluate a complete router decision set:

```bash
python3 evals/routing/evaluate.py decisions.json
```

The report contains the corpus SHA-256, overall routing metrics, and per-category accuracy with two-sided Wilson 95% confidence intervals. Missing, duplicate, unknown, or invalid decisions fail closed.
