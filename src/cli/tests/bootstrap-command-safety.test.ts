import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function invokeManager(response: unknown, exitCode: number) {
  const temp = mkdtempSync(join(tmpdir(), "fw-command-safety-"));
  try {
    const root = join(temp, "shared");
    const home = join(temp, "bootstrap");
    const project = join(temp, "project");
    mkdirSync(join(root, "scripts/runtime"), { recursive: true });
    mkdirSync(home);
    mkdirSync(project);
    writeFileSync(
      join(root, "scripts/runtime/bootstrap_manager.py"),
      `import sys\nprint(${JSON.stringify(JSON.stringify(response))})\nsys.exit(${exitCode})\n`,
    );
    writeFileSync(
      join(home, "bootstrap-policy.json"),
      JSON.stringify({
        schema: "forgewright-bootstrap-policy/v1",
        enabled: true,
        auto: true,
        mode: "automation",
        forgewright_root: root,
        allowed_roots: [project],
        deny_roots: [],
        auto_update: false,
        mcp_clients: [],
        pi_policy: "disabled",
        pi_model: null,
        created_at: "2026-09-24",
        updated_at: "2026-09-24",
      }),
    );
    return spawnSync(
      process.execPath,
      [resolve("dist/index.js"), "--json", "bootstrap", "verify", project],
      {
        encoding: "utf8",
        timeout: 10000,
        env: { ...process.env, HOME: temp, FORGEWRIGHT_BOOTSTRAP_HOME: home },
      },
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
describe("bootstrap verification command truthfulness", () => {
  it("returns failure for a degraded data verdict even when transport succeeded", () => {
    const result = invokeManager(
      {
        ok: true,
        data: { ok: false, status: "degraded", issues: ["missing"] },
        error: null,
      },
      0,
    );
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(false);
  });
  it("rejects successful JSON emitted before a nonzero process exit", () => {
    const result = invokeManager(
      { ok: true, data: { ok: true, status: "ready" }, error: null },
      2,
    );
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(false);
  });
});
