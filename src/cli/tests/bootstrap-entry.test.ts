import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("bootstrap lightweight entry", () => {
  it("matches normal CLI envelopes and failures without loading the full CLI", () => {
    const root = mkdtempSync(join(tmpdir(), "fw-light-entry-"));
    const env = {
      ...process.env,
      FORGEWRIGHT_BOOTSTRAP_HOME: join(root, "policy"),
    };
    const run = (entry: string, args: string[]) => {
      const result = spawnSync(
        process.execPath,
        [join(cli, "dist", entry), ...args],
        {
          cwd: root,
          env,
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      expect(result.error).toBeUndefined();
      const envelope = JSON.parse(result.stdout);
      delete envelope.metadata.duration_ms;
      return { status: result.status, envelope };
    };
    try {
      expect(spawnSync("git", ["init", "-q", root]).status).toBe(0);
      const args = ["--json", "bootstrap", "preflight", root];
      expect(run("bootstrap-entry.js", args)).toEqual(run("index.js", args));
      mkdirSync(env.FORGEWRIGHT_BOOTSTRAP_HOME);
      writeFileSync(
        join(env.FORGEWRIGHT_BOOTSTRAP_HOME, "bootstrap-policy.json"),
        "broken",
      );
      const failed = run("bootstrap-entry.js", args);
      expect(failed).toEqual(run("index.js", args));
      expect(failed.status).not.toBe(0);
      // A bundle importing the full command graph would reintroduce startup cost.
      const bundle = readFileSync(join(cli, "dist/bootstrap-entry.js"), "utf8");
      expect(bundle).not.toContain("function buildProgram(");
      expect(bundle).not.toContain("registerDelegateCommand");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("retains full CLI argument handling for every other invocation", () => {
    for (const args of [
      ["--version"],
      ["bootstrap", "preflight", "--help"],
      ["--json", "bootstrap", "unknown-command"],
    ]) {
      const results = ["bootstrap-entry.js", "index.js"].map((entry) =>
        spawnSync(process.execPath, [join(cli, "dist", entry), ...args], {
          encoding: "utf8",
          timeout: 10_000,
        }),
      );
      expect(results[0].status).toBe(results[1].status);
      expect(results[0].stdout).toBe(results[1].stdout);
      expect(results[0].stderr).toBe(results[1].stderr);
    }
  });
});
