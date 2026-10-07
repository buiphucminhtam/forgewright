---
title: Deep research workflow
description: Resolve material research questions using original sources and explicit evidence limits
status: active
owner: Forgewright maintainers
scope: Source discovery and decision-focused synthesis
last_reviewed: 2026-10-07
canonical: false
---

# Deep research workflow

Use the canonical [Research Gate](../skills/_shared/protocols/research-gate.md)
for source trust, instruction isolation, conflicts and decision requirements.
This workflow gathers and synthesizes evidence with tools actually available.
For changes to game skills or engineering judgment, continue through
[game skill evolution](game-skill-evolution.md), including impact review,
evaluation, README updates and authorized Git delivery.

## 1. Define the question and baseline

State the unknown and decision it can change. Inspect code, tests, configuration
and relevant earlier research before browsing. Record engine/package/version,
platform and acceptance. If local evidence resolves it, external research is
unnecessary.

## 2. Inspect original sources

Check current search, browsing and retrieval capabilities. Prefer official
documentation, source, specifications, release notes or primary research;
practitioner reports provide experience signals with limitations. Follow
provided network/authentication settings. Record source access failures and
their impact.

For each material claim retain original URL/path, publisher, applicable
version/date, access date and supporting excerpt/section. A URL list does not
prove its contents were read. Separate facts, inferences and recommendations;
seek contrary evidence for consequential decisions. Stop when evidence
supports the decision.

If search is unavailable, direct access to a known primary source may suffice.
If neither original sources nor current local evidence support a required
claim, mark it UNKNOWN and block the dependent decision. Model recollection
does not replace missing evidence.

## 3. Use synthesis tools when useful and available

NotebookLM or another assistant may organize authorized sources and expose
citations. Inspect current tool schemas and authentication before use; do not
assume tool names, quotas, session durations or arguments from old examples.
Honor observed rate limits, use bounded polling and communicate during long
operations.

Check every material conclusion against the original source. Grounded summaries
can be incomplete or wrong; no tool guarantees correct answers. Tool access
does not authorize uploading private files, secrets or transcripts, installing
a provider or initiating a paid fallback.

Without a synthesis tool, continue with inspected sources and the same evidence
standard. NotebookLM is optional, not a grounding gate.

## 4. Synthesize, decide and verify

Use the Research Gate's compact output:

```text
UNKNOWN: exact question and decision at stake
EVIDENCE: original source/section + authority/version/date + applicability
CONFLICT/DISCONFIRMATION: contrary findings and their effect on confidence
SYNTHESIS: 1–3 findings labeled FACT / INFERENCE / RECOMMENDATION / UNKNOWN
DECISION: supported next action, no change, or blocked with missing evidence
RESIDUAL UNCERTAINTY: explicit limitations
CHECK: next local test, measurement or review
```

Research alone does not authorize a code or skill change. Complete impact
review before applying a decision, then run project verification. Keep scratch
research in ignored task state; update canonical docs only for a durable,
source-supported decision under
[documentation governance](../skills/_shared/protocols/documentation-governance.md).
