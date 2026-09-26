# Consent-Gated Project Auto-Bootstrap

Forgewright can bootstrap new repositories automatically after a **one-time explicit machine-level opt-in**. Plugin installation by itself remains non-mutating.

## Enable once

Build or update one shared Forgewright source checkout, then enable the global policy. The CLI owns the shared process-supervision source so clean CLI builds do not require the repository-level hook entrypoints; plugin source packages include that same module.

```bash
git clone https://github.com/buiphucminhtam/forgewright.git
cd forgewright
npm run ci:bootstrap
npm run build
npm run build:cli

node src/cli/dist/index.js bootstrap policy set \
  --mode full \
  --auto on \
  --mcp-clients codex,claude-code \
  --forgewright-root "$PWD"
```

The command writes the user-owned policy under `${FORGEWRIGHT_BOOTSTRAP_HOME:-~/.config/forgewright}/bootstrap-policy.json` and installs a reusable `forge` launcher under the same config root. On Windows the launcher is `forge.cmd`. Automation/full policy setup verifies Python 3.11+ with `tomllib` and pins its executable alongside Node in the launcher. When macOS selects the Apple Git shim, setup also resolves the selected native Git once to avoid repeating developer-tool discovery on each preflight. Git itself remains the authority for source revisions. Re-run policy setup from the shared-runtime environment after moving or replacing these tools; a missing pinned interpreter fails explicitly rather than selecting an incompatible one.

Select only the clients you actually use; the example selects Codex and Claude Code. Keep the shared checkout available at the configured path. After explicit `full` opt-in, the first full bootstrap installs missing shared guard/MCP assets through a bounded transaction and later projects reuse the verified installation. This first installation can fetch dependencies from the checked-in lockfile. It does not rewrite the shared source checkout or require a separate setup command in each project. A conflicting, modified, or unverifiable installation fails closed and is reported instead of being overwritten.

Selected native client profiles follow their host settings: Codex uses `$CODEX_HOME/config.toml` when `CODEX_HOME` is set, otherwise `~/.codex/config.toml`; Claude uses `$CLAUDE_CONFIG_DIR/.claude.json` when that override is set, otherwise `~/.claude.json`. Overrides must be absolute and pass the same path-safety checks as default config paths.

Codex also requires review and trust of the current plugin hook definition through `/hooks`. Installing a plugin or setting Forgewright policy does not grant that host-level trust. Re-review changed hook definitions after upgrades; do not use a hook-trust bypass flag. The installed native compatibility path is tested separately from any remote-plugin execution path.

`plugin` keeps the plugin non-mutating, `automation` enables project-local Forgewright state/gates, and `full` also installs or verifies the selected shared local runtime integrations. Use `--allow-root` and `--deny-root` to restrict eligible repositories. `--auto-update` is separate; without it, a source-version change is reported for manual migration instead of silently rewriting project state.

## Normal project flow

After policy opt-in:

1. Open any allowed Git repository.
2. Use the Forgewright plugin for normal engineering work.
3. The bounded `PreToolUse` hook runs a cheap local preflight.
4. If the project is unmanaged and policy allows it, `forge bootstrap ensure . --auto --json` runs the idempotent bootstrap transaction.
5. A valid `.forgewright/bootstrap.json` receipt marks the project ready. Later prompts do not repeat heavy setup.

No Forgewright submodule is required in the project. A submodule remains an option when the project intentionally wants to pin an exact framework revision.

An isolated macOS Codex acceptance has observed this normal-prompt path through a trusted current `PreToolUse` hook to a full ready receipt. Its default MCP catalog connected with 16 tools; that check did not assert a deferred skill overlay or a model MCP invocation. Claude native execution remains deferred by user, and native Windows, physical power-loss, and remote-host acceptance remain unverified.

The installed launcher uses a small entrypoint for the hook's JSON preflight and loads the full CLI for other commands. Preflight does not invoke a model, contact a provider, install packages, or scan the project. Re-run policy setup after rebuilding an older shared runtime to refresh its launcher.

## Lifecycle

```bash
~/.config/forgewright/bin/forge bootstrap policy status
~/.config/forgewright/bin/forge bootstrap preflight . --json
~/.config/forgewright/bin/forge bootstrap status . --json
~/.config/forgewright/bin/forge bootstrap verify . --json
~/.config/forgewright/bin/forge bootstrap repair . --json
~/.config/forgewright/bin/forge bootstrap explain . --json
~/.config/forgewright/bin/forge bootstrap disable . --keep-profile
~/.config/forgewright/bin/forge bootstrap policy off
```

`repair` only rewrites state Forgewright still owns; user-modified owned bytes are reported as drift instead of being overwritten. `disable` removes receipt-owned integration and preserves shared runtime state; `--keep-profile` retains the project manifest/profile.

## Full-mode boundaries

Full mode installs missing Runtime Lifecycle Guard and shared MCP assets in private staging, verifies them, and publishes only receipt-owned targets that are safe to create. It reuses verified shared installations, configures only clients selected by policy, and checks existing Pi readiness. Explicit Pi activation remains a separate operation. A saved ready component label or config file alone is not native MCP handshake evidence. Pi stays optional and does not discover or enable a paid provider automatically when no exact permitted route is configured.

The shared MCP installation includes a regular copy of the canonical skills and the policy-checker/telemetry scripts needed at startup. It owns those individual scripts while preserving other files in the shared script directory. An explicit `ensure` or `repair` can migrate an unchanged, owned installation to the selected source revision after verifying runtime quiescence. Automatic migration additionally requires `--auto-update`. Migration preserves mutable guard state, including leases, project registrations, mode and logs; foreign or modified assets block replacement.

Existing shared MCP files without a verifiable bootstrap asset receipt are preserved and reported as unverified; bootstrap does not adopt them automatically. The source revision is a Git commit: uncommitted edits at the same commit do not trigger a runtime migration. Local development verification therefore also records the exact worktree and installed asset digests.

Auto-bootstrap never grants authority for credentials/auth changes, billing, deploy/publish/release, branch-protection changes, paid-provider fallback, or destructive cleanup outside Forgewright-owned receipts. External config edits use structured merges/receipts instead of whole-file overwrite.

## Verification on constrained hosts

Use `FORGEWRIGHT_TEST_WORKERS=1 npm run ci:local` to serialize MCP test files on a memory-constrained verification host. Only `1` and `2` are accepted; the default remains two isolated workers. This changes test scheduling only: production execution-policy deadlines, runtime admission, assertions and coverage thresholds are unchanged. A lower test-worker count does not certify native bootstrap readiness when the real host lacks memory headroom.

For local bootstrap acceptance, `bash scripts/ci/verify-auto-bootstrap-local.sh contract` runs the ownership, recovery and admission contracts. Its `runtime` and `e2e` scopes require `FORGEWRIGHT_RUN_AUTO_BOOTSTRAP_RUNTIME=1`, Node 24 and the local CI Python dependencies. Each provisions a separate profile with a restricted environment; runtime checks installation and the real MCP protocol/skill overlay, while E2E also checks five simultaneous projects. These checks do not authenticate a native host or call a model. Profiles and raw results are retained for diagnosis, and task-owned processes must be reclaimed. `scripts/ci/verify-auto-bootstrap-preflight.py` separately measures the installed launcher, including process startup and the first sample.

## Recovery and concurrency

Each project has a lock and an ownership journal in the user-owned global bootstrap store, outside the repository. A project-local `bootstrap.json` hash is not deletion authority: cleanup receipts must match that trusted journal. Failed stages roll back only confirmed Forgewright-owned effects and leave unrelated project files untouched. Global host admission limits concurrent workers/heavy stages so multiple new repositories do not independently saturate a weak machine.

Queued worker and heavy-stage requests can wait up to 60 seconds for capacity within the existing 90-second operation budget. This allows concurrent projects to take turns without raising the memory or concurrency limits. A host that cannot supply capacity within that budget still fails explicitly and releases its queued reservation.

Explicit `repair` can reconcile completed rollback and recorded interrupted transactions under the project lock. It establishes owner/child-process quiescence before cleanup; a missing process group is not proof that its former process has exited. Admission intent is journaled before enqueue. A quarantined reservation is reconciled only when its token, project, run, owner identity, and child leases match the trusted journal and all owners have stopped. Unknown reservations and unrecorded process launches remain operator-reconciliation cases. Automatic prompts never clear these uncertainties or loop through repair.

File rollback checks the expected current hash before an atomic replacement. Directory rollback records a transaction and renames the owned directory to a sibling tombstone before removing only unchanged manifest members. Added or edited user files are retained, and ambiguous cleanup is reported instead of deleting the whole tree. Journal paths and manifests cannot authorize traversal outside the owned directory.

Selected MCP clients share a write-ahead transaction. A later client conflict rolls back earlier owned insertions; explicit recovery handles a process stopping before or after a config write. The journal stores inserted bytes and hashes, not a copy of unrelated client configuration or credentials. Recovery restores original bytes when possible and preserves unrelated edits. A changed or reformatted owned insertion blocks cleanup when exact ownership can no longer be established. Expected-hash checks detect observed preimage changes; portable file replacement is not an atomic compare-and-swap against an external writer racing after that check.

Readiness checks are independent of ownership: preserved policy and project/profile files must pass their canonical validators, usable index metadata and the live Docs registry entry must exist, and preserved documentation must pass Docs doctor. A saved `ready` label does not override invalid, missing, or modified live components. Failed worker-lease release cannot publish successful completion.

A `ready` receipt is bound to the canonical project root digest and Forgewright source commit. Stale/foreign state fails closed; degraded/blocked state is not auto-looped on every prompt. Admission may refuse setup before project state exists when real host memory is under pressure. Restore host headroom rather than bypassing the guard; this is not a ready/bootstrap-success result. An already removed, globally owned Docs registry entry is treated as `already_missing` during cleanup so interrupted removal remains retryable.
