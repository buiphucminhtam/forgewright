#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { previousReleaseTag } from './release-supply-chain-policy.mjs';

const root = process.cwd();
const currentTag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!currentTag) throw new Error('usage: verify-rollback-rehearsal.mjs vX.Y.Z');
const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const prior = previousReleaseTag(tags, currentTag);
const worktree = mkdtempSync(join(tmpdir(), 'forgewright-rollback-'));
try {
  execFileSync('git', ['worktree', 'add', '--detach', worktree, prior], { cwd: root, stdio: 'pipe' });
  execFileSync('git', ['-C', worktree, 'rev-parse', '--verify', `${prior}^{commit}`], { stdio: 'pipe' });
  console.log(`rollback rehearsal: isolated worktree resolved ${prior}; no rollback invoked`);
} finally {
  execFileSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'pipe' });
  rmSync(worktree, { recursive: true, force: true });
}
