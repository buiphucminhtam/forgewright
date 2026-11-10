# Supervisor Review Package — FW-ARGON-REFACTOR-20261109

- **Status:** `PC_ACCEPTED` (Confirmed by ChatGPT supervisor in Round 3 — see `SUPERVISOR_REVIEW_CHATGPT_ROUND3.md` and `SUPERVISOR_EVIDENCE_CHATGPT_ROUND3.json`; macOS rows remain `NOT_RUN` / `DEFERRED_BY_USER`)
- **Manifest SHA-256 (45 refactored/test files):** `0c5f76b0d4f88b037495890fa6f98f0fa729dd691452713350b8d6dbd6c475f6`
- **Workspace:** `D:\Sources\Github\forgewright`
- **Base Commit:** `c1200d575d63e8851fa6023ae1e78c996376b902` (`main`)
- **Implementer & Verifier Model:** `Gemini 4 Argon` (`google-antigravity/gemini-4-argon` + native `agy.exe` `gemini-4-argon-high`)

## 1. Rollback Instructions

Each stage has an independent rollback path that preserves all 182 pre-existing modified/untracked files:
- **RF01 (Eval Receipt & Promptfoo Provider):** Remove `scripts/runtime/skill_eval_receipt.py` and `evals/promptfoo/`; existing `skill_eval_host.py` and `skill_quality.py` are untouched.
- **RF02 (Kernel & DocsHub Gate):** Revert `kernel/ENTRY.md`, `kernel/SOLVE.md`, `kernel/CLARIFY.md`, `scripts/lite/sync-kernel.py`, and `skills/_shared/protocols/pipeline-operating-contract.md`, then run `python scripts/lite/sync-kernel.py`.
- **RF03 (Native AGY Hooks):** Revert `.agents/hooks.json`, `scripts/lite/antigravity-stop-hook.sh`, and `scripts/runtime/runtime-hooks-install.sh`.
- **RF04 (Pi Capabilities & Google Opt-in):** Unset `FORGEWRIGHT_ENABLE_PI_GOOGLE_API` (default off) or revert `integrations/pi/provider.mjs`, `workspace.mjs`, `runtime-state.mjs`, and `worker-runtime.mjs`.
- **RF07 (markdown-it Parser):** Set `FORGEWRIGHT_DOCS_MARKDOWN_ENGINE=legacy` (or pass `{ engine: "legacy" }` to `renderMarkdown`) to use `renderMarkdownDocumentLegacy` immediately without code changes.
- **RF08 (Playwright E2E Runner):** Revert `playwright.config.ts`, `src/testing/e2e/playwright.config.ts`, `src/testing/e2e/healwright.config.ts`, and `src/testing/e2e/tests/`.
- **RF11 (Motion Director Skill):** Set `"motion-director": { "enabled": false }` in `.forgewright/skills-config.json` or remove `skills/motion-director/` and revert the skill count in `product-manifest.json` (`86 -> 85`).
- **RF05 (OpenSpec & Superpowers Review):** Remove `scripts/runtime/openspec_contract_adapter.py` and revert `skills/code-reviewer/LITE.md`.

## 2. Evidence Artifacts for Supervisor Inspection

- Plan & Stage Table: `docs/plans/FW-ARGON-REFACTOR-20261109.md`
- Checkpoint State: `.forgewright/runtime/fw-argon-refactor-20261109/checkpoint.json`
- Preflight Receipt: `.forgewright/runtime/fw-argon-refactor-20261109/rf00-preflight-receipt.json`
- RF01 Baseline JSONL: `.forgewright/runtime/fw-argon-refactor-20261109/rf01-baseline-runs.jsonl`
- RF08 Playwright Receipt & Trace: `.forgewright/runtime/fw-argon-refactor-20261109/rf08-artifacts/rf08-playwright-receipt.json`
- RF11 Motion Director Scenario Packet & Rubric Scores: `.forgewright/runtime/fw-argon-refactor-20261109/rf08-artifacts/rf11-motion-director-scenario.json`
- Superpowers Reviewer Packet (`forgewright-superpowers-review-packet/v1`): `.forgewright/runtime/fw-argon-refactor-20261109/superpowers-reviewer-packet.json`
- Native AGY Hook Canary Receipt (`PreToolUse` & `Stop` observed from `.agents/`): `.forgewright/runtime/fw-argon-refactor-20261109/rf03-agy-hook-canary.json`
- Windows Platform Matrix Report (`forgewright-native-platform/v1`): `.forgewright/runtime/fw-argon-refactor-20261109/rf12-windows-platform-report.json`
- Independent Argon High Verifier Receipt (`v2`, bound to `manifest_sha256` & `diff_sha256`): `.forgewright/runtime/fw-argon-refactor-20261109/independent-argon-verifier-receipt.json`

## 3. Next Action on macOS

When pulling this branch/tree to the Mac (`arm64`) host, run:
1. `python3 scripts/ci/verify-platform.py --browser --report .forgewright/runtime/fw-argon-refactor-20261109/rf12-macos-platform-report.json`
2. `npm --prefix integrations/pi run test:all` (to execute the Darwin `/usr/bin/sandbox-exec` verifier containment tests `VERIFIER-01/02/03` and `BOUNDARY-04/05/06` on native macOS)
3. `npm run test:e2e`
