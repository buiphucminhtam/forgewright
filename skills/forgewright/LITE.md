---
name: forgewright
description: "Use for substantive software engineering, debugging, testing, review, release, or multi-step product work when the Forgewright workflow should govern execution."
version: 1.0.0
---

# Forgewright (LITE)

For substantive repository work, first run `forge bootstrap preflight . --json` using `forge` from PATH or the one-time bootstrap launcher under `${FORGEWRIGHT_BOOTSTRAP_HOME:-$HOME/.config/forgewright}/bin/forge` when available. The trusted native hook owns automatic mutation. If preflight returns `action=ensure`, do not invoke setup yourself or bypass missing/revoked hook trust; continue plugin-only when safe. Explicit user-requested setup remains separate. Never loop on degraded/blocked/busy states or improvise setup when policy/CLI is unavailable. Then frame objective + acceptance, ground current evidence, choose QUICK/STANDARD/DEEP, load one relevant specialist, preserve requirement-locked tests, execute in bounded scope, verify current behavior, and audit the final diff. If the same approach fails twice, classify the failure (`hypothesis_wrong`, `implementation_wrong`, `environment_wrong`, `architecture_wrong`) before replanning.
