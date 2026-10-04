---
title: Game host upgrade handoff from Mac mini to Mac Air
status: historical-handoff
owner: ForgeWright maintainers
scope: Unmerged game-first upgrade and remaining native acceptance
last_reviewed: 2026-10-03
canonical: false
---

# Game host upgrade handoff

This is a user-requested historical handoff, not a release certificate or current
product truth. The user stopped native completion on the 8 GiB Mac mini and
authorized a dedicated WIP branch push for continuation on Mac Air. Publishing or
merging to `main` is not authorized by this handoff. Do not copy machine caches,
credentials, trust records, bootstrap journals or user configuration between hosts.

## Candidate and scope

- Remote: `https://github.com/buiphucminhtam/forgewright.git`
- Handoff branch: `handoff/game-host-upgrade-mac-air-20261003`
- Tested source commit: `de2d549e1002a07a962b5a0ee8f4db93d8f4dd29`
- Portable Git tree: `b8a7d96392b4ea7be83ea2118d9797a58af27958`
- Base main: `6b8215774339ae13232f57b287007576c267ee64`
- Candidate commits: `d6637db`, `1d40828`, `97c4d4e`, `de2d549`

The candidate adds host admission and owned idle cleanup, project/global byte
cache bounds, separate strict checking and emission, corrected game skills and a
playable Three.js fixture. Native fixes address hook transport/diagnostics,
bootstrap index preservation and registry ownership, MCP startup lock contention,
Stop validation and streaming evidence. Later commits fix fixture portability,
aggregate documentation selection and explicit full-verification timeouts.
The handoff documentation commit does not change that tested source tree.

## Evidence and qualifications

Raw evidence stays on Mini under `.forgewright/runtime/game-host-upgrade/` (`B`
below). It is deliberately not checked in. The records include machine-specific
paths and ownership state. The following are historical observations, not fresh
Mac Air evidence. Schema-v2 freshness has expired and must not be retimestamped.

| Surface | Observed result | Boundary |
| --- | --- | --- |
| Broad fullgate | 5/5, exit 0, 1815.131 seconds on candidate | `B/fullgate-timeout-20261003/result.json` and `.forgewright/reports/local-ci/20261003T074551Z.json` |
| Native-fix HARD v8 | Contract 13 pass, E2E 8 pass, RED 7 fail/11 pass, pre 18 pass, mutation 8 fail/10 pass, restored final 18 pass | `B/native-fixes-hard-v8-outcome-independent-review.json`, exact restoration of 3007 fingerprint records |
| Installed Mini cache | Version 8.7.1, 2004 file hashes verified, backup retained | `B/native-cache-closure-v5-installed-receipt.json`, installation is not native acceptance |
| Game fixture | Skill compile, build, unit mutation rejection/restoration and desktop Chromium pass | `B/game-current-20261003/result.json`, `B/game-host-current-20261003/result.json` |
| Actual native host | Trusted PreToolUse observed, MCP catalog 17 tools, runtime 18 pass and review in 1.358 seconds | Both Stop hooks started but did not finish before OS memory warning |
| Fresh native bootstrap | UNVERIFIED | Fresh child bootstrap, index, receipt and receipt-owned disable/rollback not executed |

Fullgate fingerprint was
`TREE:84e5cd11bf3e6faabedb7b4ab404aa5e42a0dc476f3662a22852caadd95b58c8`.
Subsequent manual root ensure and generated report changes altered only recorded
local evidence/receipt state. The final source HARD run bound
`TREE:bbf4c3ee770df663a59fa4ee61b20c2e5eb00aeefc8b52c7e0ac88585e29ad1b`.
These fingerprints include local non-Git state and will not reproduce from a clone.
Do not relabel the earlier fullgate as a later exact-tree gate.

Useful SHA-256 anchors for retained Mini evidence:

- `B/native-fixes-hard-v8-outcome-independent-review.json`: `af921d19e51772c9fe5d9ed1b96d094088aed3486045a4662f81f1eea55031aa`
- `.forgewright/verify/native-runtime-fixes-v8-final.json`: `38cda4ff8206dce9a512d0e25470cf2e1478960735d9e010cb93faaefb090c13`
- `B/native-cache-closure-v5-installed-receipt.json`: `1d1109a9f668935167bfacdaef7a2fda577feb9057cf35fbb9b1e51ede6807a3`
- Game served-byte build: `4545f5945914640ce1aec3c132ba53fb8b18404a2db555bdeab9fc086139361a`

The game used actual keyboard and touch-emulated input for boot, start, win/loss,
three restarts, pause/resume and resize, with screenshots and no console errors or
horizontal overflow. A unit mutation failed the same oracle and exact restoration
passed. Browser mutation, Unity editor/bridge, physical mobile performance, GPU
byte reclamation and thermals remain UNVERIFIED. Keyless review-2 bindings do not
authenticate reviewer identity against forgery by the same local user.

## Native blocker and performance

Mini has 8 GiB. The last spawned native acceptance sampled about 1007 MiB summed
owned-process RSS and stopped on a real OS memory warning. Cleanup was verified.
A later attempt timed out before dispatch with no native process spawned. All
task jobs were reclaimed at handoff. Preserve the user's connection proxy and
active applications. Do not close them to force admission.

The 1216 MiB and 832 MiB figures discussed during development were policy sums,
not measured minimum RAM requirements. Free pages alone are not available memory.
Keep pressure, reclaimable estimate, reservations, swap activity and uncertainty
distinct. No whole-build before/after comparison has established an improvement.
A compiler peak around 612 MiB and a narrow catalog timing pair do not establish
overall performance or lower heat. Measure comparable workloads safely on Air.

## Continue on Mac Air

1. Verify host/account, tool access, RAM/pressure, existing jobs, Git status and
   worktrees before writing. Read `AGENTS.md` and relevant local skills. Use an
   isolated checkout if another task owns the existing workspace. Preserve changes.
2. Fetch the named branch from the verified remote. Inspect the fetched commit and
   its ancestry rather than assuming any path or cached Mini state.
3. Verify Node and Python locally. The package requires Node 22+, isolated native
   runtime fixtures require Node 24, and automation requires Python 3.11+ with
   `tomllib`. Inspect `scripts/ci/local-ci.py` and the lockfiles before using
   `npm run ci:bootstrap`. Do not install external tools or enable providers blindly.
4. Use the repository's strict build and verification commands below, one workload
   at a time. Reuse valid source evidence only for the exact covered source and
   scope. Refresh expired evidence and all checks affected by edits. Do not repeat
   unrelated benchmarks just to reproduce a test count.
5. Follow `docs/guides/auto-bootstrap.md` for a fresh verified installation and
   receipt-bound rollback. Discover the supported host plugin install/update route.
   Do not copy Mini cache directories or execute its absolute-path task helpers.
6. Configure only the explicitly approved automation scope on the actual Air
   checkout and its descendants. Keep Pi disabled, no MCP client configuration and
   no extra project roots. Do not run the guide's broader `full` example. Obtain
   native review/trust for the installed hook hash through `/hooks` as required.
   Mini trust is not transferable and no bypass is permitted.
7. Prove actual native PreToolUse dispatch on a fresh owned child fixture, bootstrap
   readiness, receipt/journal ownership and readable nonempty index. A manual
   `ensure`, completed no-op hook or index metadata alone is insufficient. Preserve
   native started/completed events and redacted diagnostics. Verify project Stop
   returns `allow_stop`, `verified`, `validation_passed`, `retry_suppressed=false`.
   Complete supported disable/rollback on that fixture and reclaim owned jobs.
8. Finish remaining browser mutation and comparable performance measurements when
   safe. Leave unavailable Unity/mobile checks explicitly UNVERIFIED. Run final
   affected gates and independent review on the actual final tree. Main publication
   requires a separate explicit user instruction.

Repository commands, after dependencies and safe local execution are established:

```bash
npm run build
npm run build:cli
FORGEWRIGHT_TEST_WORKERS=1 npm run ci:local -- --timeout 3600
bash scripts/ci/verify-auto-bootstrap-local.sh contract
FORGEWRIGHT_RUN_AUTO_BOOTSTRAP_RUNTIME=1 bash scripts/ci/verify-auto-bootstrap-local.sh runtime
FORGEWRIGHT_RUN_AUTO_BOOTSTRAP_RUNTIME=1 bash scripts/ci/verify-auto-bootstrap-local.sh e2e
```

Use `tests/game/fixtures/threejs-lifecycle/README.md` for game commands. Its offline
dependency install needs an existing npm cache and browser tests need the pinned
Chromium revision. Check availability before downloads. Hooks use opt-in redacted
`FORGEWRIGHT_BOOTSTRAP_DIAGNOSTICS=1` and `FORGEWRIGHT_STOP_DIAGNOSTICS=1` for a
diagnostic host invocation only. Never print credentials or session transcripts.

Private Mini pause receipts and restoration instructions remain with the operator.
Do not resume schedules on Air or alter Mini services as part of this handoff.
