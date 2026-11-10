# FW-ARGON-REFACTOR-20261109 — Implementation & Verification Plan

- **Task ID:** `FW-ARGON-REFACTOR-20261109`
- **Workspace:** `D:\Sources\Github\forgewright`
- **Upstream:** `https://github.com/buiphucminhtam/forgewright`
- **Reference Base Commit:** `c1200d575d63e8851fa6023ae1e78c996376b902` (`main`)
- **Active Implementer / Verifier Model:** `google-antigravity/gemini-4-argon` (via Codex bridge + native `agy.exe` 1.4.12 CLI for isolated verification runs)
- **External Supervisor:** ChatGPT (external review; never self-marked as approved)

## 1. Architectural Invariants & Ownership Boundaries

| Responsibility | Single Owner |
|---|---|
| Requirements, acceptance criteria & revisions | Versioned task contract |
| Task execution state, checkpoints & terminal outcome | Forgewright state repository (CAS / locking) |
| Model conversation & tool-call loop | Native host or Pi worker within its bounded session |
| Authorization, scope, budget, cancellation & admission | Forgewright verified host/runtime gates |
| Accepted verdict | Independent verifier checking product state & exact-tree evidence |
| DocsHub HTML, dashboards & external telemetry | Presentation / exporter layer |

## 2. RF00 Preflight & Baseline Findings

1. **Working Tree Preservation:** 182 pre-existing modified/untracked files from the Windows compatibility & Claude adaptive rollout are recorded with SHA-256 digests in `.forgewright/runtime/fw-argon-refactor-20261109/preexisting-working-tree-manifest.json` and preserved intact.
2. **Toolchain & Host Verification (Windows 11 x64 `10.0.26200`):**
   - Node `v24.11.1`, Python `3.12.10`, Git `2.51.2.windows.1`, Git Bash `5.2.37(1)-release`, Codex CLI `0.167.0-alpha.3.2`, Antigravity CLI `1.4.12` (`C:/Users/buiph/AppData/Local/agy/bin/agy.exe`).
   - Native `agy.exe models` exposes `gemini-4-argon-low`, `gemini-4-argon-medium`, and `gemini-4-argon-high`; `--effort` accepts `low|medium|high|xhigh|max`.
   - OpenCodex bridge exposes `google-antigravity/gemini-4-argon` with reasoning levels `low|medium|high|ultra`.
3. **Native AGY Canary Observation:**
   - Running `agy.exe --model gemini-4-argon-medium --effort medium --output-format json --disable-slash-commands -p ...` succeeded at the model/session level (`conversation_id: 503a2ed5-591a-404c-bd4c-99cd441e6616`, `total_tokens: 22153`) and proved that `agy.exe` actively executes `.agents/hooks.json` `PreToolUse`.
   - Defect uncovered by canary: `.agents/hooks.json` invoked `bash scripts/lite/antigravity-pre-tool-gate.sh` with a relative path that failed with exit 127 under MSYS bash on Windows (`/usr/bin/bash: scripts/lite/antigravity-pre-tool-gate.sh: No such file or directory`). This will be fixed and verified in **RF03**.
4. **Baseline Test Results:**
   - `test_skill_quality.py`, `test_cli_provider_probe.py`, `test_cli_provider_native.py`: **36 passed, 0 failed**.
   - `src/cli` Docs Hub suite (`docs-renderer.test.ts`, `docs-core.test.ts`, `docs-change-gate.test.ts`): **44 passed, 6 skipped, 0 failed**.
   - `integrations/pi` bridge & SDK suites (after `npm --prefix integrations/pi ci`): **117 passed, 0 failed**.
   - `integrations/pi` worker suite on Windows: **23 passed, 16 failed, 1 skipped** due to POSIX path separator regex in `integrations/pi/workspace.mjs`, hardcoded `/private/tmp` in `finalization-regressions.test.mjs`, unprivileged `symlinkSync` in `worker-runtime.test.mjs`, and Darwin/Linux-only sandbox assumptions in `verifier-runtime.test.mjs`. These will be addressed in **RF04** & **RF12**.

## 3. Stage Roadmap & Status

| Stage | Scope | Status |
|---|---|---|
| **RF00** | Preflight, toolchain/route canary & baseline capture | `LOCALLY_VERIFIED` |
| **RF01** | Standardized run receipt, Windows/POSIX runner support & Promptfoo custom TypeScript provider | `LOCALLY_VERIFIED` |
| **RF02** | Kernel consolidation, routing precedence & DocsHub HTML gate decoupling | `LOCALLY_VERIFIED` |
| **RF03** | Native AGY integration, `.agents/hooks.json` & `.gemini/settings.json` path/hook fixes & live canary | `LOCALLY_VERIFIED` |
| **RF04** | Pi upgrade evaluation (`0.85.1` vs `1.5.0`), Windows worker portability & opt-in Google API boundary | `LOCALLY_VERIFIED` |
| **RF07** | Replace DocsHub Markdown parser with `markdown-it` behind existing safe interface | `LOCALLY_VERIFIED` |
| **RF08** | Unify Playwright E2E runner with clean browser context, trace/screenshot binding & deterministic cleanup | `LOCALLY_VERIFIED` |
| **RF11** | Vendor & integrate `motion-director` skill (`713a8680f975cabc7f9fc9e462ebfd9532694f85`, CC0-1.0) with lazy routing & UI scenario QA | `LOCALLY_VERIFIED` |
| **RF05** | Pilot OpenSpec task contract mapping & Superpowers protocols (`systematic-debugging`, `requesting-code-review`) | `LOCALLY_VERIFIED` |
| **RF06** | Evaluate XState pure transition reducer pilot vs `PipelineService.ts` (287 LOC, 4 states) | `EXCLUDED_BY_DECISION` |
| **RF09** | Evaluate optional Langfuse telemetry server stack vs local JSONL receipts | `EXCLUDED_BY_DECISION` |
| **RF12** | Windows & macOS portability acceptance matrix (`windows_native_x64: PASS`, `macos_native_arm64: NOT_RUN`, `macos_native_x64: NOT_RUN`) | `BLOCKED` (pending macOS host execution) |
| **RF10** | Final comparison, rollback check, independent Argon verifier pass & supervisor handoff bundle | `LOCALLY_VERIFIED` (`READY_FOR_SUPERVISOR_REVIEW`) |
