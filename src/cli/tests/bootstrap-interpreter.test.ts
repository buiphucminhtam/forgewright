import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBootstrapPolicy,
  installBootstrapLauncher,
  saveBootstrapPolicy,
  resolveBootstrapPython,
} from "../src/bootstrap/state.js";

const oldHome = process.env.FORGEWRIGHT_BOOTSTRAP_HOME;
const oldPython = process.env.FORGEWRIGHT_BOOTSTRAP_PYTHON;
const roots: string[] = [];
afterEach(() => {
  if (oldHome === undefined) delete process.env.FORGEWRIGHT_BOOTSTRAP_HOME;
  else process.env.FORGEWRIGHT_BOOTSTRAP_HOME = oldHome;
  if (oldPython === undefined) delete process.env.FORGEWRIGHT_BOOTSTRAP_PYTHON;
  else process.env.FORGEWRIGHT_BOOTSTRAP_PYTHON = oldPython;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("bootstrap interpreter contract", () => {
  it.skipIf(process.platform !== "darwin")(
    "keeps the selected native Git available when the host replaces PATH",
    () => {
      const selected = spawnSync("/usr/bin/xcrun", ["--find", "git"], {
        encoding: "utf8",
      });
      expect(selected.status).toBe(0);
      const root = mkdtempSync(join(tmpdir(), "fw-git-pin-"));
      roots.push(root);
      const project = join(root, "project");
      const bin = join(root, "host-bin");
      mkdirSync(project);
      mkdirSync(bin);
      expect(spawnSync("git", ["init", "-q", project]).status).toBe(0);
      process.env.FORGEWRIGHT_BOOTSTRAP_HOME = join(root, "bootstrap");
      const policy = createBootstrapPolicy({
        mode: "automation",
        auto: true,
        forgewrightRoot: process.cwd(),
        mcpClients: [],
      });
      // Model the Apple Git shim selected at opt-in without changing other env.
      process.env.FORGEWRIGHT_BOOTSTRAP_PYTHON = resolveBootstrapPython();
      const priorPath = process.env.PATH;
      let launcher: string;
      try {
        process.env.PATH = "/usr/bin:/bin:" + priorPath;
        launcher = installBootstrapLauncher(policy);
      } finally {
        process.env.PATH = priorPath;
      }
      saveBootstrapPolicy(policy);
      const marker = join(root, "wrong-git-ran");
      const fake = join(bin, "git");
      writeFileSync(fake, '#!/bin/sh\ntouch "' + marker + '"\nexit 87\n');
      chmodSync(fake, 0o700);
      const result = spawnSync(
        launcher!,
        ["--json", "bootstrap", "preflight", project],
        {
          encoding: "utf8",
          timeout: 15_000,
          env: { ...process.env, PATH: bin + ":/usr/bin:/bin" },
        },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).data.action).toBe("ensure");
      const expected = spawnSync(
        selected.stdout.trim(),
        ["-C", policy.forgewright_root, "rev-parse", "HEAD"],
        { encoding: "utf8" },
      );
      expect(JSON.parse(result.stdout).data.source_commit).toBe(
        expected.stdout.trim(),
      );
      expect(existsSync(marker)).toBe(false);
    },
  );

  it("fails explicitly rather than falling back from a missing pinned interpreter", () => {
    process.env.FORGEWRIGHT_BOOTSTRAP_PYTHON = join(
      tmpdir(),
      "forgewright-no-such-python-executable",
    );
    expect(() => resolveBootstrapPython()).toThrow("Python 3.11+");
  });
  it.skipIf(process.platform === "win32")(
    "pins Python for manager commands when a native host replaces PATH",
    () => {
      const root = mkdtempSync(join(tmpdir(), "fw-python-pin-"));
      roots.push(root);
      const project = join(root, "project");
      const bin = join(root, "poison-bin");
      mkdirSync(project);
      mkdirSync(bin);
      expect(spawnSync("git", ["init", "-q", project]).status).toBe(0);
      process.env.FORGEWRIGHT_BOOTSTRAP_HOME = join(root, "bootstrap");
      const policy = createBootstrapPolicy({
        mode: "automation",
        auto: true,
        forgewrightRoot: process.cwd(),
        mcpClients: [],
      });
      const launcher = installBootstrapLauncher(policy);
      saveBootstrapPolicy(policy);
      const marker = join(root, "wrong-python-ran");
      const fake = join(bin, "python3");
      writeFileSync(fake, '#!/bin/sh\ntouch "' + marker + '"\nexit 87\n');
      chmodSync(fake, 0o700);
      const result = spawnSync(
        launcher,
        ["--json", "bootstrap", "status", project],
        {
          encoding: "utf8",
          timeout: 15_000,
          env: { ...process.env, PATH: bin + ":/usr/bin:/bin" },
        },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).data.status).toBe("unmanaged");
      expect(existsSync(marker)).toBe(false);
    },
  );
});
