import {
  linkSync,
  mkdtempSync,
  mkdirSync,
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
  BOOTSTRAP_POLICY_SCHEMA,
  BOOTSTRAP_STATE_SCHEMA,
  createBootstrapPolicy,
  currentForgewrightCommit,
  getBootstrapLauncherPath,
  getBootstrapPolicyPath,
  getProjectBootstrapPath,
  installBootstrapLauncher,
  loadBootstrapPolicy,
  preflightBootstrap,
  projectRootDigest,
  saveBootstrapPolicy,
  setBootstrapPolicyOff,
} from "../src/bootstrap/state.js";

const tempRoots: string[] = [];
const originalBootstrapHome = process.env.FORGEWRIGHT_BOOTSTRAP_HOME;

function tempRoot(name: string): string {
  const root = mkdtempSync(
    join(tmpdir(), "forgewright-bootstrap-" + name + "-"),
  );
  tempRoots.push(root);
  return root;
}

function gitProject(name: string): string {
  const root = tempRoot(name);
  const result = spawnSync("git", ["init", "-q"], { cwd: root });
  if (result.status !== 0) throw new Error("git init failed");
  return root;
}

afterEach(() => {
  if (originalBootstrapHome === undefined) {
    delete process.env.FORGEWRIGHT_BOOTSTRAP_HOME;
  } else {
    process.env.FORGEWRIGHT_BOOTSTRAP_HOME = originalBootstrapHome;
  }
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("bootstrap global policy and preflight", () => {
  it("keeps plugin installation side-effect free until policy exists", () => {
    const home = tempRoot("home-none");
    process.env.FORGEWRIGHT_BOOTSTRAP_HOME = home;
    const project = gitProject("repo-none");

    const preflight = preflightBootstrap(project);

    expect(preflight.action).toBe("none");
    expect(preflight.reason).toBe("policy_missing");
    expect(() => readFileSync(getBootstrapPolicyPath(), "utf8")).toThrow();
  });

  it("persists global consent atomically and forces plugin mode to auto-off", () => {
    const home = tempRoot("home-policy");
    process.env.FORGEWRIGHT_BOOTSTRAP_HOME = home;
    const policy = createBootstrapPolicy({
      mode: "plugin",
      auto: true,
      forgewrightRoot: process.cwd(),
      mcpClients: [],
    });
    saveBootstrapPolicy(policy);

    const loaded = loadBootstrapPolicy();
    expect(loaded?.schema).toBe(BOOTSTRAP_POLICY_SCHEMA);
    expect(loaded?.mode).toBe("plugin");
    expect(loaded?.auto).toBe(false);

    const off = setBootstrapPolicyOff();
    expect(off?.enabled).toBe(false);
    expect(off?.auto).toBe(false);
  });

  it("installs a reusable launcher that works without forge on PATH", () => {
    const home = tempRoot("home-launcher");
    process.env.FORGEWRIGHT_BOOTSTRAP_HOME = home;
    const policy = createBootstrapPolicy({
      mode: "automation",
      auto: true,
      forgewrightRoot: process.cwd(),
      mcpClients: [],
    });
    const launcher = installBootstrapLauncher(policy);
    saveBootstrapPolicy(policy);
    expect(launcher).toBe(getBootstrapLauncherPath());

    const result = spawnSync(
      launcher,
      ["--json", "bootstrap", "policy", "status"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: "/usr/bin:/bin",
          FORGEWRIGHT_BOOTSTRAP_HOME: home,
        },
        encoding: "utf8",
        shell: false,
        timeout: 10_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.configured).toBe(true);
    expect(envelope.data.policy.mode).toBe("automation");
  });

  it("returns ensure for a new allowed repository and ready after a valid receipt", () => {
    const home = tempRoot("home-ready");
    process.env.FORGEWRIGHT_BOOTSTRAP_HOME = home;
    const project = gitProject("repo-ready");
    const source = process.cwd();
    const sourceCommit = currentForgewrightCommit(source);
    expect(sourceCommit).toMatch(/^[0-9a-f]{40}$/);

    saveBootstrapPolicy(
      createBootstrapPolicy({
        mode: "automation",
        auto: true,
        autoUpdate: true,
        forgewrightRoot: source,
        allowedRoots: [project],
        mcpClients: [],
      }),
    );

    const first = preflightBootstrap(project);
    expect(first).toMatchObject({
      action: "ensure",
      reason: "project_unmanaged",
      desired_mode: "automation",
    });

    mkdirSync(join(project, ".forgewright"), { recursive: true });
    writeFileSync(
      getProjectBootstrapPath(project),
      JSON.stringify(
        {
          schema: BOOTSTRAP_STATE_SCHEMA,
          mode: "automation",
          status: "ready",
          source_commit: sourceCommit,
          project_root_digest: projectRootDigest(project),
          owned_paths: [],
          external_config_receipts: [],
          components: {},
          last_verified_at: new Date().toISOString(),
          last_error: null,
        },
        null,
        2,
      ) + "\n",
    );

    const second = preflightBootstrap(project);
    expect(second).toMatchObject({
      action: "none",
      reason: "ready",
      current_mode: "automation",
    });
  });

  it("never auto-retries degraded or blocked projects on every prompt", () => {
    const home = tempRoot("home-state");
    process.env.FORGEWRIGHT_BOOTSTRAP_HOME = home;
    const project = gitProject("repo-state");
    const source = process.cwd();
    const sourceCommit = currentForgewrightCommit(source)!;
    saveBootstrapPolicy(
      createBootstrapPolicy({
        mode: "full",
        auto: true,
        forgewrightRoot: source,
        allowedRoots: [project],
        mcpClients: [],
      }),
    );
    mkdirSync(join(project, ".forgewright"), { recursive: true });

    const base = {
      schema: BOOTSTRAP_STATE_SCHEMA,
      mode: "full",
      source_commit: sourceCommit,
      project_root_digest: projectRootDigest(project),
      owned_paths: [],
      external_config_receipts: [],
      components: {},
      last_verified_at: null,
      last_error: null,
    };

    writeFileSync(
      getProjectBootstrapPath(project),
      JSON.stringify({ ...base, status: "degraded" }) + "\n",
    );
    expect(preflightBootstrap(project)).toMatchObject({
      action: "none",
      reason: "state_degraded",
    });

    writeFileSync(
      getProjectBootstrapPath(project),
      JSON.stringify({ ...base, status: "blocked" }) + "\n",
    );
    expect(preflightBootstrap(project)).toMatchObject({
      action: "blocked",
      reason: "state_blocked",
    });
  });

  it("respects deny roots and does not auto-migrate when auto_update is false", () => {
    const home = tempRoot("home-deny");
    process.env.FORGEWRIGHT_BOOTSTRAP_HOME = home;
    const project = gitProject("repo-deny");
    const source = process.cwd();
    saveBootstrapPolicy(
      createBootstrapPolicy({
        mode: "automation",
        auto: true,
        autoUpdate: false,
        forgewrightRoot: source,
        denyRoots: [project],
        mcpClients: [],
      }),
    );
    expect(preflightBootstrap(project)).toMatchObject({
      action: "blocked",
      reason: "root_denied",
    });

    saveBootstrapPolicy(
      createBootstrapPolicy({
        mode: "automation",
        auto: true,
        autoUpdate: false,
        forgewrightRoot: source,
        allowedRoots: [project],
        denyRoots: [],
        mcpClients: [],
      }),
    );
    mkdirSync(join(project, ".forgewright"), { recursive: true });
    writeFileSync(
      getProjectBootstrapPath(project),
      JSON.stringify({
        schema: BOOTSTRAP_STATE_SCHEMA,
        mode: "automation",
        status: "ready",
        source_commit: "0".repeat(40),
        project_root_digest: projectRootDigest(project),
        owned_paths: [],
        external_config_receipts: [],
        components: {},
        last_verified_at: null,
        last_error: null,
      }) + "\n",
    );
    expect(preflightBootstrap(project)).toMatchObject({
      action: "none",
      reason: "source_changed_manual",
    });
  });

  it("rejects symlinked or hard-linked global policy files", () => {
    const home = tempRoot("home-links");
    process.env.FORGEWRIGHT_BOOTSTRAP_HOME = home;
    mkdirSync(home, { recursive: true });
    const external = join(home, "external.json");
    writeFileSync(external, "{}");
    const policyPath = getBootstrapPolicyPath();

    if (process.platform !== "win32") {
      symlinkSync(external, policyPath);
      expect(() => loadBootstrapPolicy()).toThrow(
        /Unsafe bootstrap state file/,
      );
      rmSync(policyPath);
    }

    linkSync(external, policyPath);
    expect(() => loadBootstrapPolicy()).toThrow(/Unsafe bootstrap state file/);
  });
});
