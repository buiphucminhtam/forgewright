---
name: auto-publish
description: >
  Use when configuring, adopting or executing Android/iOS build and store
  distribution for Expo/RN or packaged Phaser 4/Three.js projects.
version: 2.0.0
author: forgewright
tags: [auto-publish, mobile, play-store, testflight, xcode-cloud, credentials-security]
---

# Auto-Publish — Mobile Build and Distribution

## Select the actual project route first

Read manifests/native projects and existing automation. Expo/React Native keeps
its EAS recipe; Phaser 4/Three.js web games follow
[Mobile Monetization](../_shared/protocols/mobile-monetization.md). Preserve custom
publish scripts and existing Xcode Cloud workflows. A CLI template is not an
installed SDK or a working store adapter.

For a packaged web game:

```sh
bash scripts/release/auto-publish-setup.sh /path/to/game --runtime web-game --engine phaser4
```

This calls `forge mobile init` and creates labelled hypothetical setup inputs
without EAS files or live actions. Run `mobile doctor` with the reviewed shared
studio profile and per-game strategy, then resolve its native/store blockers.
Do not apply the legacy EAS production submit default to an internal-beta task.

## Credentials and authority

Keep only account identities and secure binding references in shared profiles.
Reuse existing runtime/vault/OS credentials and scoped standing authorization;
inspect names/readiness, never values in chat or logs. Do not persist raw keys,
passwords, keystores or receipts in Forgewright, generic CLI config or memory.
If a tool needs a credential file, use its supported secure injection with
restricted lifetime/permissions and owned cleanup. Existing Expo project-local
credential layouts may remain where required, gitignored and access-controlled.
No global plaintext key cache is introduced.

Actual app records, legal agreements, signing, product catalogs, network
onboarding, API permissions, compliance and testing cohorts are prerequisites to
verify, not assumed inherited approvals. Ask only for genuine unresolved deltas.

## Expo/RN compatibility

The existing one-argument setup invocation remains available for Expo projects:

```sh
bash scripts/release/auto-publish-setup.sh /path/to/expo-app
```

It preserves existing publish scripts/configs. Inspect the selected EAS version,
submit profile, artifact and destination before execution; legacy production
settings do not authorize a production release. Determine signing/bootstrap
needs from the current project/provider rather than forcing an interactive
build for every app or replacing an existing CI workflow. EAS-specific local
build requirements apply only to that branch, not Xcode Cloud web-game builds.

## Packaged web-game release contract

The current `forge mobile plan` emits a dry-run identity only. The exported beta
coordinator consumes trusted **project-owned** build/store adapters; this repo
has not supplied an authenticated Play/Xcode Cloud implementation for an actual
game. Resolve the real wrapper and SDK compatibility, implement those adapters,
and prove sandbox correctness before enabling live submissions.

- Bind studio/account/app/source/config/artifact/version and allowed internal
  destination; deny production, unknown or ambiguous target mapping.
- Reuse Xcode Cloud source/workflow/actions; correlate exact run/build/group.
  Avoid triggering both branch events and API submission for one intent.
- Journal before effects. On timeout/lost response, reconcile the original
  provider operation; do not build/upload again blindly. Retain uncertain locks.
- Verify Google license testers separately from track membership and use each
  ad network's supported test mode. Ordinary test-track users may be charged.
- Report processing, provider availability and actual device installation
  separately. Simulator/mock success cannot certify store/native readiness.
- Real browser/emulator/simulator checks use the existing managed game-test
  session, bounded admission and owned cleanup.

External TestFlight/production distribution, paid campaigns and new account
permissions require their own requested scope. Repeat in-scope beta actions
under the existing standing policy without adding per-command confirmation.
