import { EventEmitter } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import {
  buildAgyArgs,
  findValidAgyGlobalPolicyHook,
  findValidAgyPolicyHook,
  resolveContractPath,
  runAgyWorker,
} from "../src/delegation/agy-worker.js";

const roots: string[] = [];

function makeWorkspace(hook: unknown | undefined): {
  root: string;
  contractPath: string;
  gatePath: string;
} {
  const root = mkdtempSync(join(tmpdir(), "forgewright-agy-worker-"));
  roots.push(root);
  const contractPath = join(root, "tasks", "T1", "CONTRACT.json");
  const gatePath = join(
    root,
    "scripts",
    "lite",
    "antigravity-pre-tool-gate.sh",
  );
  mkdirSync(dirname(contractPath), { recursive: true });
  mkdirSync(dirname(gatePath), { recursive: true });
  writeFileSync(contractPath, "{}\n");
  writeFileSync(gatePath, "#!/bin/sh\n");
  if (hook !== undefined) {
    const agentsDirectory = join(root, ".agents");
    mkdirSync(agentsDirectory, { recursive: true });
    writeFileSync(join(agentsDirectory, "hooks.json"), JSON.stringify(hook));
  }
  return { root, contractPath, gatePath };
}

function validHook(enabled: boolean | undefined = true): unknown {
  return {
    "forgewright-policy": {
      ...(enabled === undefined ? {} : { enabled }),
      PreToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: "bash scripts/lite/antigravity-pre-tool-gate.sh",
              timeout: 5,
            },
          ],
        },
      ],
    },
  };
}

function writeGlobalHook(
  homeDirectory: string,
  gatePath: string,
  command = `bash ${gatePath}`,
): string {
  const configDirectory = join(homeDirectory, ".gemini", "config");
  mkdirSync(configDirectory, { recursive: true });
  const hooksPath = join(configDirectory, "hooks.json");
  writeFileSync(
    hooksPath,
    JSON.stringify({
      "forgewright-policy": {
        PreToolUse: [
          {
            matcher: "*",
            hooks: [{ type: "command", command, timeout: 5 }],
          },
        ],
      },
    }),
  );
  return hooksPath;
}

afterEach(() => {
  spawnMock.mockReset();
  while (roots.length > 0)
    rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Agy worker adapter", () => {
  it("uses sandboxed accept-edits mode and excludes bypass flags", () => {
    const args = buildAgyArgs({
      model: "Gemini 3.5 Flash (High)",
      contractFileName: "CONTRACT.json",
      sandbox: true,
    });

    const prompt =
      "Read WORKER_INSTRUCTIONS.md and CONTRACT.json, execute only the contracted task, run its verification commands, and write DELIVERY.json.";
    expect(args).toEqual([
      "--model",
      "Gemini 3.5 Flash (High)",
      "--sandbox",
      "--mode",
      "accept-edits",
      "--print",
      prompt,
    ]);
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("rejects disabled sandboxing and dangerous flag injection", () => {
    expect(() =>
      buildAgyArgs({
        model: "model",
        contractFileName: "CONTRACT.json",
        sandbox: false,
      }),
    ).toThrow("requires sandbox mode");
    expect(() =>
      buildAgyArgs({
        model: "--dangerously-skip-permissions",
        contractFileName: "CONTRACT.json",
        sandbox: true,
      }),
    ).toThrow("Invalid AGY model value");
  });

  it("rejects contracts outside the project root", () => {
    const projectRoot = resolve("/tmp/project");
    expect(() =>
      resolveContractPath(projectRoot, resolve("/tmp/other/CONTRACT.json")),
    ).toThrow("Contract must be inside the project workspace");
  });

  it("accepts contracts inside the project root", () => {
    const projectRoot = resolve("/tmp/project");
    expect(resolveContractPath(projectRoot, "tasks/T1/CONTRACT.json")).toBe(
      resolve(projectRoot, "tasks/T1/CONTRACT.json"),
    );
  });

  it("finds an enabled policy hook in a workspace ancestor", () => {
    const workspace = makeWorkspace(validHook(undefined));
    expect(
      findValidAgyPolicyHook(workspace.root, dirname(workspace.contractPath)),
    ).toBe(join(realpathSync(workspace.root), ".agents", "hooks.json"));
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-json"],
    ["disabled", validHook(false)],
    [
      "wrong matcher",
      {
        "forgewright-policy": {
          enabled: true,
          PreToolUse: [
            {
              matcher: "run_command",
              hooks: [
                {
                  command: "bash scripts/lite/antigravity-pre-tool-gate.sh",
                },
              ],
            },
          ],
        },
      },
    ],
    [
      "command wrapper that can override the gate result",
      {
        "forgewright-policy": {
          PreToolUse: [
            {
              matcher: "*",
              hooks: [
                {
                  command:
                    "true || bash scripts/lite/antigravity-pre-tool-gate.sh",
                },
              ],
            },
          ],
        },
      },
    ],
  ])("fails closed for a %s policy hook", (_name, hook) => {
    const workspace = makeWorkspace(hook === "not-json" ? undefined : hook);
    if (hook === "not-json") {
      const agentsDirectory = join(workspace.root, ".agents");
      mkdirSync(agentsDirectory, { recursive: true });
      writeFileSync(join(agentsDirectory, "hooks.json"), "{broken");
    }
    expect(() =>
      findValidAgyPolicyHook(workspace.root, dirname(workspace.contractPath)),
    ).toThrow(/(?:AGY policy hook|forgewright-policy PreToolUse hook)/);
  });

  it("spawns exactly agy with shell disabled after policy validation", async () => {
    const workspace = makeWorkspace(validHook());
    writeGlobalHook(workspace.root, workspace.gatePath);
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    });

    await expect(
      runAgyWorker({
        contractPath: workspace.contractPath,
        projectRoot: workspace.root,
        homeDirectory: workspace.root,
        model: "Gemini 3.5 Flash (High)",
        sandbox: true,
      }),
    ).resolves.toEqual({ exitCode: 0, signal: null });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      "agy",
      [
        "--model",
        "Gemini 3.5 Flash (High)",
        "--sandbox",
        "--mode",
        "accept-edits",
        "--print",
        "Read WORKER_INSTRUCTIONS.md and CONTRACT.json, execute only the contracted task, run its verification commands, and write DELIVERY.json.",
      ],
      {
        cwd: dirname(realpathSync(workspace.contractPath)),
        env: {
          ...process.env,
          FORGEWRIGHT_WORKSPACE: realpathSync(workspace.root),
        },
        shell: false,
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
  });

  it("does not spawn when the policy hook is missing", async () => {
    const workspace = makeWorkspace(undefined);
    await expect(
      runAgyWorker({
        contractPath: workspace.contractPath,
        projectRoot: workspace.root,
        homeDirectory: workspace.root,
        model: "model",
      }),
    ).rejects.toThrow("AGY delegation requires an enabled");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("does not spawn when the runtime-loaded global hook is missing", async () => {
    const workspace = makeWorkspace(validHook());
    await expect(
      runAgyWorker({
        contractPath: workspace.contractPath,
        projectRoot: workspace.root,
        homeDirectory: workspace.root,
        model: "model",
      }),
    ).rejects.toThrow("global forgewright-policy hook");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects a global hook command wrapper that can override the decision", () => {
    const workspace = makeWorkspace(validHook());
    writeGlobalHook(
      workspace.root,
      workspace.gatePath,
      `true || bash ${workspace.gatePath}`,
    );

    expect(() => findValidAgyGlobalPolicyHook(workspace.root)).toThrow(
      "Invalid AGY global policy hook configuration",
    );
  });
});
