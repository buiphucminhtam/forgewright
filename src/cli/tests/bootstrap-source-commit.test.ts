import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { currentForgewrightCommit } from "../src/bootstrap/state.js";

const roots: string[] = [];
const originalGitDir = process.env.GIT_DIR;

function temporaryRepository(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `forgewright-source-${name}-`));
  roots.push(root);
  expect(spawnSync("git", ["init", "-q", root]).status).toBe(0);
  expect(
    spawnSync("git", [
      "-C",
      root,
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      "initial",
    ]).status,
  ).toBe(0);
  return root;
}

function gitCommit(root: string): string {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

afterEach(() => {
  if (originalGitDir === undefined) delete process.env.GIT_DIR;
  else process.env.GIT_DIR = originalGitDir;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("bootstrap source commit", () => {
  it("reads and advances a normal loose branch ref", () => {
    const root = temporaryRepository("loose");
    expect(currentForgewrightCommit(root)).toBe(gitCommit(root));
    expect(
      spawnSync("git", [
        "-C",
        root,
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-qm",
        "advance",
      ]).status,
    ).toBe(0);
    expect(currentForgewrightCommit(root)).toBe(gitCommit(root));
  });

  it("reads detached HEAD and linked-worktree common refs", () => {
    const root = temporaryRepository("worktree");
    expect(
      spawnSync("git", ["-C", root, "checkout", "--detach", "-q"]).status,
    ).toBe(0);
    expect(currentForgewrightCommit(root)).toBe(gitCommit(root));
    const worktree = join(root, "linked");
    expect(
      spawnSync("git", [
        "-C",
        root,
        "worktree",
        "add",
        "-qb",
        "linked",
        worktree,
      ]).status,
    ).toBe(0);
    expect(currentForgewrightCommit(worktree)).toBe(gitCommit(worktree));
  });

  it("falls back for packed refs, unsupported Git overrides, and unborn HEAD", () => {
    const packed = temporaryRepository("packed");
    expect(
      spawnSync("git", ["-C", packed, "pack-refs", "--all", "--prune"]).status,
    ).toBe(0);
    expect(currentForgewrightCommit(packed)).toBe(gitCommit(packed));

    process.env.GIT_DIR = join(packed, "missing-git-directory");
    expect(currentForgewrightCommit(packed)).toBeNull();
    delete process.env.GIT_DIR;

    const unborn = mkdtempSync(join(tmpdir(), "forgewright-source-unborn-"));
    roots.push(unborn);
    expect(spawnSync("git", ["init", "-q", unborn]).status).toBe(0);
    writeFileSync(join(unborn, "file"), "uncommitted\n");
    expect(currentForgewrightCommit(unborn)).toBeNull();
  });

  it("does not follow a traversal-shaped symbolic ref", () => {
    const root = temporaryRepository("unsafe-ref");
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/../../victim\n");
    expect(currentForgewrightCommit(root)).toBeNull();
  });

  it("falls back instead of accepting fabricated or malformed repositories", () => {
    const fabricated = mkdtempSync(join(tmpdir(), "forgewright-source-fake-"));
    roots.push(fabricated);
    mkdirSync(join(fabricated, ".git"));
    writeFileSync(join(fabricated, ".git", "HEAD"), "a".repeat(40) + "\n");
    expect(currentForgewrightCommit(fabricated)).toBeNull();

    const malformed = temporaryRepository("malformed-config");
    writeFileSync(join(malformed, ".git", "config"), "[core\n");
    expect(currentForgewrightCommit(malformed)).toBeNull();
  });

  it("bounds loose-object inflation and falls back for a compressed bomb", () => {
    const root = temporaryRepository("compressed-object");
    const branch = spawnSync(
      "git",
      ["-C", root, "symbolic-ref", "--short", "HEAD"],
      {
        encoding: "utf8",
      },
    ).stdout.trim();
    const oid = "b".repeat(40);
    const objectDirectory = join(root, ".git", "objects", oid.slice(0, 2));
    mkdirSync(objectDirectory, { recursive: true });
    writeFileSync(
      join(objectDirectory, oid.slice(2)),
      deflateSync(Buffer.alloc(64 * 1024, 65)),
    );
    writeFileSync(join(root, ".git", "refs", "heads", branch), oid + "\n");

    expect(currentForgewrightCommit(root)).toBe(oid);
  });
});
