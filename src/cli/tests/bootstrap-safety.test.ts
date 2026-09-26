import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  BOOTSTRAP_STATE_SCHEMA,
  createBootstrapPolicy,
  currentForgewrightCommit,
  getProjectBootstrapPath,
  installBootstrapLauncher,
  loadProjectBootstrapState,
  preflightBootstrap,
  projectRootDigest,
  saveBootstrapPolicy,
} from "../src/bootstrap/state.js";

const roots: string[] = [];
const originalHome = process.env.FORGEWRIGHT_BOOTSTRAP_HOME;
function setup(mode: "automation" | "full" = "full") {
  const root = mkdtempSync(join(tmpdir(), "fw-bootstrap-safety-"));
  roots.push(root);
  const home = join(root, "config");
  const project = join(root, "project");
  mkdirSync(home);
  mkdirSync(project);
  expect(spawnSync("git", ["init", "-q", project]).status).toBe(0);
  process.env.FORGEWRIGHT_BOOTSTRAP_HOME = home;
  const policy = createBootstrapPolicy({
    mode,
    auto: true,
    autoUpdate: true,
    forgewrightRoot: process.cwd(),
    allowedRoots: [project],
    mcpClients: [],
  });
  saveBootstrapPolicy(policy);
  const state = {
    schema: BOOTSTRAP_STATE_SCHEMA,
    mode,
    status: "ready",
    source_commit: currentForgewrightCommit(policy.forgewright_root),
    project_root_digest: projectRootDigest(project),
    owned_paths: [],
    external_config_receipts: [],
    components: {},
    last_verified_at: null,
    last_error: null,
  };
  mkdirSync(join(project, ".forgewright"));
  return { root, home, project, policy, state };
}
afterEach(() => {
  if (originalHome === undefined) delete process.env.FORGEWRIGHT_BOOTSTRAP_HOME;
  else process.env.FORGEWRIGHT_BOOTSTRAP_HOME = originalHome;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("bootstrap safety regressions", () => {
  it.each(["degraded", "blocked", "rolling_back", "bootstrapping"])(
    "does not retry %s after source or mode changes",
    (status) => {
      const { project, state } = setup();
      writeFileSync(
        getProjectBootstrapPath(project),
        JSON.stringify({
          ...state,
          mode: "automation",
          source_commit: "0".repeat(40),
          status,
        }),
      );
      expect(preflightBootstrap(project).action).not.toBe("ensure");
    },
  );
  it("rejects a ready receipt borrowed from another project", () => {
    const { project, state } = setup();
    writeFileSync(
      getProjectBootstrapPath(project),
      JSON.stringify({ ...state, project_root_digest: "0".repeat(64) }),
    );
    expect(() => loadProjectBootstrapState(project)).toThrow(/root|foreign/i);
  });
  it("honors a durable project opt-out without needing project state", () => {
    const { home, project } = setup();
    mkdirSync(join(home, "disabled"));
    writeFileSync(
      join(home, "disabled", projectRootDigest(project) + ".json"),
      JSON.stringify({
        schema: "forgewright-bootstrap-disabled/v1",
        project_root_digest: projectRootDigest(project),
        disabled_at: new Date().toISOString(),
      }),
    );
    expect(preflightBootstrap(project)).toMatchObject({
      action: "none",
      reason: "project_disabled",
    });
  });
  it("rejects linked project state ancestry", () => {
    const { root, project, state } = setup();
    const outside = join(root, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "bootstrap.json"), JSON.stringify(state));
    rmSync(join(project, ".forgewright"), { recursive: true });
    symlinkSync(outside, join(project, ".forgewright"), "dir");
    expect(() => loadProjectBootstrapState(project)).toThrow(/unsafe|symlink/i);
  });
  it("does not overwrite a symlinked global launcher", () => {
    const { root, home, policy } = setup();
    const victim = join(root, "victim");
    writeFileSync(victim, "KEEP");
    mkdirSync(join(home, "bin"));
    symlinkSync(victim, join(home, "bin", "forge"));
    expect(() => installBootstrapLauncher(policy)).toThrow(/unsafe|symlink/i);
    expect(readFileSync(victim, "utf8")).toBe("KEEP");
  });
  it("quotes shared runtime paths containing a single quote", () => {
    const { root, policy } = setup();
    const shared = join(root, "runtime'quoted");
    mkdirSync(join(shared, "src/cli/dist"), { recursive: true });
    writeFileSync(
      join(shared, "src/cli/dist/index.js"),
      'console.log("LAUNCHER_OK")',
    );
    const launcher = installBootstrapLauncher({
      ...policy,
      forgewright_root: shared,
    });
    const result = spawnSync(launcher, [], { encoding: "utf8", timeout: 5000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("LAUNCHER_OK");
  });
  it("auto ensure does not override a manual-only source migration decision", () => {
    const { root, project, policy, state } = setup("automation");
    const shared = join(root, "shared");
    mkdirSync(join(shared, "scripts/runtime"), { recursive: true });
    const marker = join(project, "unexpected-manager-invocation");
    writeFileSync(
      join(shared, "scripts/runtime/bootstrap_manager.py"),
      `from pathlib import Path\nimport json\nPath(${JSON.stringify(marker)}).write_text('INVOKED')\nprint(json.dumps({'ok':True,'data':{'changed':True},'error':None}))\n`,
    );
    expect(spawnSync("git", ["init", "-q", shared]).status).toBe(0);
    expect(
      spawnSync("git", [
        "-C",
        shared,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-qm",
        "test",
      ]).status,
    ).toBe(0);
    saveBootstrapPolicy({
      ...policy,
      forgewright_root: shared,
      auto_update: false,
    });
    writeFileSync(
      getProjectBootstrapPath(project),
      JSON.stringify({ ...state, source_commit: "0".repeat(40) }),
    );
    const before = readFileSync(getProjectBootstrapPath(project), "utf8");
    const cli = join(policy.forgewright_root, "src/cli/dist/index.js");
    const result = spawnSync(
      process.execPath,
      [cli, "--json", "bootstrap", "ensure", project, "--auto"],
      {
        encoding: "utf8",
        timeout: 8000,
        env: {
          ...process.env,
          FORGEWRIGHT_ADMISSION_HOME: join(project, "admission"),
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).data.changed).toBe(false);
    expect(readFileSync(getProjectBootstrapPath(project), "utf8")).toBe(before);
    expect(existsSync(join(project, "admission"))).toBe(false);
    expect(existsSync(marker)).toBe(false);
  });
});
