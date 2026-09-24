# Consent-Gated Project Auto-Bootstrap

Forgewright can bootstrap new repositories automatically after a **one-time explicit machine-level opt-in**. Plugin installation by itself remains non-mutating.

## Enable once

Build or update one shared Forgewright runtime, then enable the global policy:

```bash
git clone https://github.com/buiphucminhtam/forgewright.git
cd forgewright
npm run ci:bootstrap
npm run build
npm run build:cli
node src/cli/dist/index.js bootstrap policy set \
  --mode full \
  --auto on \
  --forgewright-root "$PWD"
```

The command writes the user-owned policy under `${FORGEWRIGHT_BOOTSTRAP_HOME:-~/.config/forgewright}/bootstrap-policy.json` and installs a reusable `forge` launcher under the same config root. On Windows the launcher is `forge.cmd`.

`plugin` keeps the plugin non-mutating, `automation` enables project-local Forgewright state/gates, and `full` also prepares the selected shared local runtime integrations. Use `--allow-root` and `--deny-root` to restrict eligible repositories. `--auto-update` is separate; without it, a source-version change is reported for manual migration instead of silently rewriting project state.

## Normal project flow

After policy opt-in:

1. Open any allowed Git repository.
2. Use the Forgewright plugin for normal engineering work.
3. The bounded `PreToolUse` hook runs a cheap local preflight.
4. If the project is unmanaged and policy allows it, `forge bootstrap ensure . --auto --json` runs the idempotent bootstrap transaction.
5. A valid `.forgewright/bootstrap.json` receipt marks the project ready. Later prompts do not repeat heavy setup.

No Forgewright submodule is required in the project. A submodule remains an option when the project intentionally wants to pin an exact framework revision.

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

Full mode can reuse the shared Runtime Lifecycle Guard, configure only the MCP clients selected by policy, and prepare Pi readiness. Pi stays optional and does not discover or enable a paid provider automatically when no exact permitted route is configured.

Auto-bootstrap never grants authority for credentials/auth changes, billing, deploy/publish/release, branch-protection changes, paid-provider fallback, or destructive cleanup outside Forgewright-owned receipts. External config edits use structured merges/receipts instead of whole-file overwrite.

## Recovery and concurrency

Each project has a lock and ownership receipt set. Failed stages roll back only Forgewright-owned state and leave unrelated project files untouched. Global host admission limits concurrent workers/heavy stages so multiple new repositories do not independently saturate a weak machine.

A `ready` receipt is bound to the canonical project root digest and Forgewright source commit. Stale/foreign state fails closed; degraded/blocked state is not auto-looped on every prompt.