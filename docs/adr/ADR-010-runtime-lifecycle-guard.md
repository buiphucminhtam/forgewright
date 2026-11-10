# ADR 010: Runtime Lifecycle Guard and finite build artifacts

- Status: accepted contract; finite supervision, artifact retention and opt-in recurrence implemented; activation requires current session proof
- Updated: 2026-11-10
- Scope: cooperating jobs on one user account and machine; explicit physical workspace enrollment
- Owners: Runtime maintainers

## Decision and authority

Projects sharing a machine must use the existing `HostAdmission` SQLite authority
in `~/.forgewright/runtime/admission` for worker and heavy capacity. There is one
heavy job globally. The standalone finite supervisor acquires its own worker and
heavy leases; it never borrows a Pi worker token. Nested managed ancestors are
rejected before enqueue. PID, birth identity, owner token and terminal state are
checked before release. Uncertain ownership or quiescence quarantines capacity.

The earlier July 2026 RLG design and deployment diary are historical. Their
machine snapshots, global enforcement assertions and JSON lease registry do not
establish current enrollment or replace SQLite admission. Existing RLG port and
resident lifecycle commands remain separate compatibility mechanisms. A legacy
`leases.jsonl` entry does not authorize this supervisor to signal or delete.

`host_jobs.py status` reports measured headroom, admission state, managed owners
and unmatched processes without loading the Pi SDK or taking capacity. An
explicit admission-home override is visible in inventory; separate homes do not
coordinate. Reservations are estimates, not OS limits. External processes and
uncovered tools remain unmanaged. The supervisor does not suspend or kill them.

## RLG installer provenance on Windows

Native Windows RLG compatibility is observe-only. `runtime-lease.sh acquire`
and `adopt`, `dev-run.sh`, and `runtime-reap.sh --execute` reject operations
without Job Object ownership, including explicit force or disabled-guard paths.
Git Bash background PIDs and native Windows PIDs are different namespaces;
liveness probes conservatively retain a process alive in either namespace.
An unavailable native probe never establishes death. Finite bootstrap/checker
jobs use their separate admitted Job Object supervisor; their authority does
not transfer to legacy RLG leases.

Framework escalation is an explicitly internal finite-maintenance lane:
`escalate.sh` retains its provider, confirmation, cost, opt-out and timeout gates
before supplying a validated provider descriptor to `windows_escalation.py`.
The adapter uses `run_job` with `profile=framework-escalation-v1` and
`profile_digest=None`, acquiring real shared HostAdmission worker/heavy capacity
and WindowsJobClient completion ownership. It is not public profile enrollment
or a generic execute CLI, and creates no legacy RLG lease. Prompt arguments stay
data and are not persisted in admission journals; provider output streams through
inherited stdout/stderr. Native `.exe` providers are required; batch launchers
are refused rather than interpreting prompt data through a shell. Confirmed
timeout returns 124; uncertain ownership/completion returns 125 without fallback
and retains quarantine. Unknown host pressure remains admission-blocking.
The shared worker protocol normalizes reserved/out-of-range provider exits to
124, so a quiescent worker reporting 124 is conservatively returned as 125
without fallback; only confirmed owner timeout maps to 124. Exact recovery of
those provider exit codes requires a separate shared-protocol extension.

`scripts/runtime/runtime-install.sh --link` prefers a real native symlink. On
Git Bash/MSYS/Cygwin it explicitly requests `MSYS=winsymlinks:nativestrict`;
a successful `ln` that leaves a plain copy is an installation failure. Only a
failed symlink attempt on Windows permits the `copy-native` fallback. Hardlinks
are never an installation mode. This bounded exception replaces the historical
symlink-only rule for Windows accounts without symlink privilege.

Each file in `INSTALLED_FROM` records `link_mode` as `symlink` or `copy-native`.
A missing mode retains the legacy meaning `symlink`; unknown modes fail closed.
The verifier rejects `copy-native` on non-Windows platforms. A native copy must
be a regular single-link file with no reparse point in its path. Its installed
hash, recorded hash and live source hash must all match. The source directory
must be exactly the recorded repository's `scripts/runtime` or `scripts/lite`,
as selected by the installer's manifest, without symlink/reparse redirection.
Windows records use native forward-slash paths; verification also understands
legacy Git Bash paths. JSON parsing does not pass CRLF-delimited fields through
a shell loop.

Verification requires the complete known manifest and rejects empty, duplicate,
unknown or missing entries, unmanaged files (including hidden entries), missing
files, changed source and changed installed bytes. Symlink records continue to
require the exact source link; they never adopt an unrecorded copy. Installation
verifies before reporting success. This is provenance checking for cooperating
same-user jobs, not protection against a hostile same-user writer or the interval
between verification and execution. It changes no process ownership, admission,
quiescence, kill authority or shared-runtime receipt reconciliation rules.

Existing global copies are not automatically adopted. Any retirement or repair
of drifted managed assets remains a separate owner-controlled operation through
the shared-runtime installer. Legacy `--uninstall` removes symlinks only; it does
not infer deletion authority over native copies.

## Finite profiles and lifecycle

A reviewed `forgewright-finite-profile/v2` binds the physical project, working
directory, exact executable argv and command, source hashes, safe environment,
memory estimate, timeout, scratch allowance, declared volume devices and artifact
policy. Profile IDs are immutable. Source, profile and volume identity are checked
after waiting for admission and immediately before execution. The child starts in
an owned process group. Output streams are inherited rather than buffered in RAM.

The runner heartbeats leases and checks resource and disk policy while running.
Cancellation or a policy breach stops only the proven owned process group, then
proves quiescence before releasing heavy and worker capacity. Unknown descendants
or identity drift retain quarantine. Unsupported daemonization or writes outside
the reviewed output paths are not contained by this cooperative mechanism.
Separately, the MCP pipeline transition adapter (`ProcessPipelineTransitionGate.ts`)
starts POSIX group reclamation on cleanup request and polls the owned process
group with a monotonic bounded proof; only `ESRCH` confirms process-group
absence, while any unconfirmed cleanup fails closed and cannot be accepted. This
adapter covers process-group scope rather than containment of arbitrary `setsid`
descendants, and the Windows Job Object supervisor remains a separate mechanism.
In the Python evaluation runner (`scripts/runtime/skill_eval_receipt.py`), owned
file-backed POSIX stdin delivery ensures unread or duplex-heavy input cannot
block deadline enforcement.

Resident-to-build handoff in this version closes the owned resident, proves it
quiet and releases both leases before a build reacquires them. There is no
resident lease downgrade, automatic focus priority or adoption of foreign jobs.
Other sessions may checkpoint and cooperate with a user-authorized pause; that
request does not itself prove that their processes have stopped.

## Project disk and generated data

`disk-budget.sh --root <project> --json` delegates to `project_disk.py`. It counts
the bounded complete project tree rather than selected directory names at a
fixed depth. Logical and allocated bytes are separate. Entry, time and depth
limits, inaccessible paths or identity changes produce `UNVERIFIED`, null totals
and a nonzero result. Candidate cache/build directories are reported as unmanaged;
a familiar name never grants ownership or deletion authority.

The existing RLG `budget.yaml` disk section supplies host defaults. Policy and
project-index lookup respect nonempty `FORGEWRIGHT_RLG_HOME`, otherwise using
`~/.forgewright/runtime`. This selects RLG configuration independently of the
canonical admission database. Finite CLI execution preserves the operator's
selection; a profile cannot supply or override that environment setting. The
native code binding includes the existing RLG path resolver.

The disk section supports:
`warn_project_gb: 5`, `block_project_gb: 15`, `min_free_gb: 2` and
`artifact_ttl_days: 7`. Project policy may only tighten them. The common parser
accepts the documented numeric scalar subset and rejects malformed policy.
A reviewed profile declares every target volume. The runner also checks the
working directory and admission journal/WAL volume. Checks run after exclusive
heavy admission and on heartbeat; they do not reserve space against external
writers or promise a hard disk cap.

Every supervised build gets a private, newly created directory:

```
<project>/.forgewright/runtime/build-jobs/job-<id>/
  scratch/
  output/
```

The runner sets `TMPDIR`, `TMP`, `TEMP` and `FORGEWRIGHT_OUTPUT_DIR` to those owned
paths. A recipe must actually honor its reviewed output configuration. The CLI
build uses the output helper in `src/cli/scripts/build-output.mjs`; ordinary CLI
builds without the variable retain their established output location.

Artifact policy bounds scratch bytes, output bytes, total retained bytes,
retained generations, TTL and total project bytes. Active observations are
explicit lower bounds while files are changing; final seals require a strict
quiescent census. Scratch is reclaimed after success. Failed or oversized owned
output is reclaimed only after quiescence. Successful output is sealed and kept
within the reviewed generation and byte limits. Latest generations and explicit
consumer pins are protected. Protected or pending bytes remain charged; if the
next build cannot fit, admission to that build fails before child launch.

Cleanup uses a shared artifact lock, fresh authoritative pins, exact release
proof, nonce/device/inode bindings and a sealed tree fingerprint. It records
cleanup intent before staging an owned tombstone and deletes through pinned
file descriptors. A bounded sealed per-entry manifest and private staging map
are persisted before child moves. Unknown or replaced children remain pending.
Sealed inodes must stay immutable; existing writable descriptors held by an
unmanaged same-user writer are outside this guarantee.
Changed trees, links, foreign ownership, uncertain process
state or incomplete sensors preserve data. Partial failure reports
`cleanup_pending`; confirmed namespace absence is recoverable after a journal
write failure. Neither logical bytes removed nor allocated bytes imply unique
APFS physical space reclaimed. Terminal release witnesses preserve exact proof
when bounded admission history has been pruned. Private hashes prevent accidental
mixups; they do not authenticate a hostile writer using the same OS account.

Legacy `dist`, `.gradle`, `node_modules`, Android outputs and other preexisting
folders are inventory only. Cleanup requires a separately reviewed owner-driven
recipe and proven quiescence. This change does not recursively sweep them or add
a generic build cache. Existing native tool caches remain subject to their own
reviewed maintenance commands.

## Native coverage and rollback

`scripts/hooks/resource_admission.py` is a short Codex `PreToolUse` hook. It reads
bounded enrollment/profile state and either rewrites an exact reviewed command,
returns a control-plane inventory command, or denies uncovered execution in an
explicitly enforced workspace. It does not wait for capacity, scan disk or start
a job itself. Other tools and hosts require their own observed coverage.

Enrollment stages in canary mode and preserves existing hooks. Activation needs
an actual native denied marker and approved profile execution bound to the same
session/turn, exact tool events, a one-shot private request, profile digest,
config/source digest, nonce and the exact supervisor's terminal receipt. Unit
wire tests or unrelated manually started jobs cannot activate coverage. Native
trust, registration and delivery remain separate rollout gates. No global
protection is inferred from source presence.

Canary failures report advisory/unverified coverage without locking ordinary
diagnostics. Enforced enrollment remains fail-closed on binding failures.
Host trust may add the owned handler's `hooks.state` entry after staging.
Explicit `reconcile-trust` accepts only that handler's `trusted_hash` bookkeeping,
requires unchanged source and all other parsed config, binds the new exact raw
config and resets canary events. It neither grants host trust nor activates
enforcement. Other edits require reconciliation rather than automatic adoption.

Exact inventory, disk, history-maintenance and operator-off controls do not load
job profiles or depend on healthy enrollment bindings. Two bounded operator
controls keep an enrolled workspace usable: `forge delegate resources --inspect
'<json>'` reads/lists/searches project-contained files without a shell, and
`--register-profile <project-recipe.json> --sha256 <reviewed-file-sha256>` installs
an exact private `.forgewright/recipes/` file without running it. Inspection rejects
symlinks, traversal and private metadata, limits scan/read/output budgets and
reports truncation. Registration validates the project, source and artifact
policy before adding a digest under the existing enrollment lock; immutable
profile IDs, the eight-profile cap and all activation proofs remain in effect.
These local owner controls do not authenticate a hostile same-user writer.
Compound/unmapped shell execution still requires a reviewed finite profile. The
`forge delegate resources --disable` control first records an owner disable in
the private admission home's `operator-disable.json`, then removes the exact
owned hook only after quiescence. Its result distinguishes removed config from
pending reconciliation; operator-off alone does not prove rollback. The
`operator-disable.json` also works when the host has cached the hook or the
registry is unreadable. It blocks new native claims and activation without
releasing existing supervisors' leases or declaring their jobs quiet. Owner
deactivation can remove the exact owned hook from current config while preserving
user/trust edits; modified ownership, following hooks with positional state or
shared-hook drift require coordinated reconciliation.

Explicit shared recovery uses `forge delegate resources --restage-shared
<private-manifest.json> --sha256 <reviewed-file-sha256>`. The versioned manifest
pins the entire registry, exact shared membership, current config, previous and
reviewed replacement code binding, and each fresh canary selection. This narrow
transition supports modifying `model` and `model_reasoning_effort` and removing
`service_tier`; all other parsed fields and the owned hook bytes must match the
historical candidate. It does not automatically accept unrelated preferences,
trust changes or code drift. Candidate, immediate publication predecessor and
original backup are checked separately. Historical publications stay immutable.
The manifest explicitly lists retired profile IDs and their old digests; their
immutable files and receipts remain historical. Selected existing profiles retain
their exact digests. Each new canary has a private project recipe pinned by file
hash and canonical profile digest. Recovery validates every recipe first, then
installs it through the existing immutable-profile loader after durable intent.
An interruption can leave an inactive installed profile; it cannot authorize
execution or silently refresh an old source/device binding.

Recovery holds the enrollment lock and requires every shared member to be
quiescent, including claimed native requests without a proven terminal journal.
When a managed run ends in `quarantined` after an observed process-group escape
and the owner/group are subsequently verified absent, `forge delegate resources
--reconcile-quarantined <private-plan.json> --sha256 <digest> [--apply]`
releases the heavy then worker leases through `HostAdmission.reconcile_quarantined`
and writes a `forgewright-failed-safe-closure/v1` receipt under `reconciliations/`.
That receipt satisfies only the claimed-request quiescence fence in
`require_quiescent_enrollment` while keeping the original failed journal and
quarantined storage intact; it never satisfies `activate()` or `native_proof`.
Nested `LocalCI.run` invocations inside a verified managed job retain the outer
supervisor's process group rather than calling `setsid`/`killpg`.
Private exact registry/config/manifest snapshots precede one atomic replacement
of all members. Retrying the same committed manifest preserves later canary
events and activation. A concurrent config edit remains untouched and invalidates
subsequent binding checks. The recovery canary rejects uncovered shell paths and
binding errors; exact operator diagnostics remain available. Fresh nonces,
markers, selected profiles, events and proof context replace the old activation
context. `forge delegate resources --activate` still requires actual current
native deny/rewrite events and the exact owned terminal job receipt.

Resource evidence also depends on the interpreter that imports these modules.
Global startup customization must not rewrite profile digests, process identity,
pressure observations, scheduler state, admission decisions or disk totals.
Check this boundary in a fresh ordinary interpreter as well as fixture tests;
test-only suppression of an override cannot establish runtime coverage. Restoring
startup paths never authorizes reactivation from historical native receipts.

Config publication atomically exchanges revisions and keeps the captured
predecessor. Durable publication intent supports interrupted stage/rollback
recovery. A concurrent edit is preserved and reported as a conflict. Rollback
requires no active, queued or quarantined enrolled jobs and resolves claimed
native requests from exact terminal or no-spawn proof. It restores the original
config only when expected identity/content still match. No foreign process is
signalled during rollback.

Pre-spawn cancellation and preflight rejection carry a durable no-spawn witness
for zero, one or two acquired leases. Every acquired lease must be released;
child presence, pending spawn or uncertain release cannot authorize removal.
Failure to acquire the artifact lock after child exit leaves owned storage
`cleanup_pending`, charged to retention and blocking a subsequent same-profile
build, while proven quiet CPU/RAM reservations are released.

## Bounded metadata history

The supervisor performs bounded metadata retirement before admission.
`forge delegate resources --prune-history` provides the same explicit maintenance
outside the short native hook. Issue, claim and retirement share the enrollment
lock. A busy or incomplete pass reports its state without granting capacity.

A pass keeps the newest 128 eligible records and removes at most 128 metadata
files. It preserves enrollment proof references, live or unobserved owners,
retained/pending/quarantined artifacts and unknown journal states. Claimed requests
need exact context, terminal release proof and positive owner absence; expired
unclaimed requests cannot be replayed after removal. Request-directory fsync must
succeed before journals become unreferenced. Orphan request lock files have the
same bounded cleanup. This mechanism never deletes artifact data or SQLite rows.
At the native request cap, the hook reports `history-maintenance-required` rather
than attempting process observation or garbage collection inside its deadline.

## Verification and rollout

Lifecycle fault fixtures that deliberately start independent process groups do
not satisfy a finite native profile's reviewed workload contract. They use the
existing same-owner `HostCapacityLease` capacity pattern in a trusted verifier,
with pytest in a separate process, bounded owned scratch, heartbeat and positive
fixture teardown before release. This does not create a native command exemption
or change the finite supervisor's quarantine behavior. The Pi single-process
verifier sandbox is a separate execution contract.

Focused tests cover profile drift after queue wait, cancellation, nested jobs,
lease release/quarantine, mutable and final census, pin/cleanup races, partial
deletion recovery, retained-byte exhaustion, source/config binding and native
request replay. The rollout sequence is fixture checks, one enrolled project,
competing projects, then an actual bounded build and rollback. Each stage records
current evidence and limitations; source tests do not establish native dispatch,
host-wide isolation or performance improvement.
The browser verification lane pins exact `@playwright/test` `1.60.0` with its
matching default bundled headless shell via `scripts/runtime/playwright_chromium.mjs`
(shared by the standalone motion verifier and root Playwright configuration): on
Darwin the default bundled headless Chromium profile launches with
`--disable-frame-rate-limit`, while Windows/Linux defaults remain unchanged and
explicit `PLAYWRIGHT_CHANNEL` selection stays opt-in without inheriting that Darwin
default profile. The earlier `1.49.1` browser extraction hung on native Node 26,
whereas `1.60.0` cold-installed cleanly on native macOS Node 26.7.0 and Windows
Node 24.11.1 without a Node 20 prerequisite via the
lockfile-tied local `npm run test:e2e:install` (`npx playwright install chromium`,
optionally scoped by `PLAYWRIGHT_BROWSERS_PATH`) rather than global browser or
Node mutations. This is a functional browser test profile that records configured
launch arguments and profile metadata while treating actual launched executable as
unknown unless directly observed and keeping physical FPS/performance unscored and
ineligible. The strict motion oracle verifies actual captured keyboard input during
a running, non-pending drawer-owned animation (`0 < progress < 1`) with captured
`Animation.finished` abort/idle and property-matched cancellation; on macOS, a
bounded harness-owned `/usr/bin/caffeinate -u` user-activity assertion is reaped by
the harness without touching unowned processes or global power settings.

The current rollout status is tracked by `host-resource-artifact-control` in
`docs/project-state.json`. Pi worker permissions and verifier
sandboxing remain governed by [the Pi runtime ADR](ADR-pi-worker-runtime.md).

## Opted-in recurrence prevention

A private project `.forgewright/recurrence.json` maps exact reviewed profile
digests to applicability metadata. The existing native PreToolUse adapter can
retrieve at most three current project lessons within 2,000 characters before
that exact recipe. A missing/stale lesson permits work. Source, lockfile, platform,
recipe/toolchain and session mismatches exclude context; legacy manual records
remain preserved and do not qualify as verified lessons.

After supervisor teardown, the CLI can persist bounded, deduplicated diagnostic
events without raw commands/output. Selected opt-in summaries require passing
current-tree schema-v2 evidence, an independent keyless review-2 binding and an
actual canonical quiescent job receipt with released leases. Failures remain
diagnostic; tool success alone cannot become acceptance. Project memory is
context only and never changes policy, executes a suggested command or promotes
a shared skill. Optional adapter failure preserves the actual job result.

An owner may select at most three summaries in the private fixed path
`.forgewright/runtime/memory/recurrence/selected.json` with schema
`forgewright-recurrence-selected/v1` and a `captures` array using the opt-in
capture shape. This runtime projection keeps evidence/job references outside
source configuration; it grants no authority. Every capture revalidates the
referenced evidence and released job. The existing memory flow handles dedup.
Lookup has an aggregate work budget; exhaustion returns no context. Neither an
optional import failure nor invalid callback data changes a job's exit code.

Use `forge delegate exec --profile <id> --digest <reviewed-digest>` to invoke a
registered recipe. The native lane accepts that exact single-line form and
rejects shell operators, multiline commands and digest mismatch. Selecting one
profile does not load unrelated profiles with stale inputs. A changed recipe
needs a new reviewed version; control-plane inspection and registration remain
available independently of recipe execution.

Reviewed typecheck recipes verify declared dirty/untracked source inputs and
toolchain content before invoking a fresh compiler. They do not reinstall
dependencies, download a browser or cache an acceptance result. Resource
readiness and live pressure/disk telemetry remain uncached.
