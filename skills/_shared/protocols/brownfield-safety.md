---
id: brownfield-safety
title: Brownfield Safety Net Protocol
summary: Core protocol for brownfield safety.
status: deprecated
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---
# Brownfield Safety Net Protocol

Compatibility reference for protecting existing work. The active kernel,
guardrail, QA and session-lifecycle contracts govern execution; this file does
not add automatic mutations or a second approval/verification policy.

## Proportional Activation

Preserve existing work in every mode, including greenfield directories with
user files. Read-only review creates no branches, snapshots, tests or tracking
artifacts merely to satisfy this reference. QUICK edits need focused target and
impact checks plus the relevant verifier. Material write-capable or concurrent
work may need a baseline, isolated worktree and a rollback plan.

## Before Editing

1. Inspect the actual branch, status and affected files. Preserve staged hunks,
   unrelated dirty edits, untracked files, active jobs and other ownership.
2. Use a branch/worktree when isolation benefits the task; do not switch the
   user's branch, demand a clean tree, auto-stash, reset, or commit existing work
   as a generic prerequisite. Missing isolation is not proof that rollback is
   impossible; capture exact original bytes for an owned bounded edit when apt.
3. Record relevant existing failures when baseline checks are useful. Known
   failures remain failures; do not exclude them from reporting, silently add
   skips, or equate a higher passing-test count with no regression.
4. Check actual protected paths and required authorization before mutation.
   Secrets, credentials, existing migrations and release configuration retain
   their guardrail/review boundaries. A protection issue needs a safe scoped
   alternative or the applicable authority; never bypass it for convenience.

## During Work

Run affected behavior and adjacent regression checks at meaningful boundaries.
An introduced regression must be understood and fixed before claiming success.
When the same approach fails twice, follow the kernel Stuck rule; do not blindly
retry, discard a platform from scope, or stash the whole workspace.

Track changed paths and original state to the degree useful for review/recovery.
For small work, a focused diff is sufficient. Material tasks may use an explicit
change manifest, with task ownership and before/after hashes. Do not create a
second project-truth store or a mandatory per-operation artifact stream.

## Completion and Release

Inspect the final diff for unrelated changes and verify each applicable
acceptance condition. Finalize canonical task state before the last unchanged
verifier binds the tree. Numeric scores and aggregate pass counts cannot replace
observed evidence, required independent review, or a real approval boundary.

Run release/merge/deployment checks only when that action is in scope. Follow
its project contract, including a full suite where required. Do not automatically
merge, push, switch branches or ask to ship after a bounded local task.

## Recovery

Recover only the changes owned by the failed task, using inspected original
content and a reviewed scoped diff. Never restore files from main merely to
undo a task: that can erase pre-existing user work. A full rollback, destructive
cleanup or termination of a required/unowned service needs the applicable user
authority. Verify the recovered state before reporting recovery.

Do not delete branches or worktrees on an age timer. Reclaim only task-owned
resources with known ownership, or retain them deliberately with a clear reason.
