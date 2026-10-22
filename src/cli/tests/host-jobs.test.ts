import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../src/utils/project-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/project-config.js")>()),
  findProjectRoot: () => "/tmp/project with space",
}));
vi.mock("../src/delegation/pi-worker.js", () => ({
  hasPiConfig: vi.fn(),
  readCanonicalDelegationMode: vi.fn(),
  piAction: vi.fn(),
}));
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Command } from "commander";
import { registerDelegateCommand } from "../src/commands/delegate.js";
import { piAction } from "../src/delegation/pi-worker.js";
import { runHostAction } from "../src/delegation/host-jobs.js";

describe("host job dispatch", () => {
  it("passes profile and digest as argv and keeps streams inherited", async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as any);
    const result = runHostAction("/tmp/project with space", "run", {
      profile: "build-v1",
      digest: "a".repeat(64),
    });
    child.emit("exit", 7, null);
    expect(await result).toBe(7);
    const [executable, argv, options] = vi.mocked(spawn).mock.calls[0];
    expect(executable).toBe("python3");
    expect(argv).toContain("/tmp/project with space");
    expect(options).toMatchObject({ stdio: "inherit", shell: false });
  });
  it("status is a control-plane read and has no worker contract", async () => {
    vi.mocked(spawn).mockClear();
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as any);
    const result = runHostAction("/tmp/project", "status");
    child.emit("exit", 0, null);
    expect(await result).toBe(0);
    expect(vi.mocked(spawn).mock.calls[0][1]?.slice(-1)).toEqual(["status"]);
  });
  it("keeps inspection JSON literal and uses no shell", async () => {
    vi.mocked(spawn).mockClear();
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as any);
    const request = JSON.stringify({ op: "read", path: "file;name.ts" });
    const result = runHostAction("/tmp/project", "inspect", { request });
    child.emit("exit", 0, null);
    expect(await result).toBe(0);
    expect(vi.mocked(spawn).mock.calls[0][1]?.slice(-2)).toEqual([
      "--request",
      request,
    ]);
    expect(vi.mocked(spawn).mock.calls[0][2]).toMatchObject({ shell: false });
  });
  it("keeps reviewed file and hash as separate arguments", async () => {
    vi.mocked(spawn).mockClear();
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    vi.mocked(spawn).mockReturnValue(child as any);
    const file = ".forgewright/recipes/job with space.json";
    const result = runHostAction("/tmp/project", "register-profile", {
      file,
      sha256: "a".repeat(64),
    });
    child.emit("exit", 0, null);
    expect(await result).toBe(0);
    expect(vi.mocked(spawn).mock.calls[0][1]?.slice(-4)).toEqual([
      "--file",
      file,
      "--sha256",
      "a".repeat(64),
    ]);
  });
});

describe("delegate resource controls", () => {
  const digest = "a".repeat(64);
  const manifest = "reviewed dir/manifest;$(literal).json";
  const actions = [
    ["--inventory"],
    ["--disk"],
    ["--disable"],
    ["--prune-history"],
    ["--inspect", '{"op":"read","path":"a.ts"}'],
    ["--register-profile", "recipe.json", "--sha256", digest],
    ["--restage-shared", manifest, "--sha256", digest],
    ["--reconcile-quarantined", manifest, "--sha256", digest],
    ["--activate"],
  ];
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    savedExitCode = process.exitCode;
    vi.clearAllMocks();
    vi.mocked(spawn).mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      queueMicrotask(() => child.emit("exit", 7, null));
      return child as any;
    });
  });
  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  async function parse(args: string[]) {
    const program = new Command().exitOverride();
    program.configureOutput({ writeErr: () => {} });
    registerDelegateCommand(program);
    await program.parseAsync(["delegate", "resources", ...args], {
      from: "user",
    });
  }

  it.each([
    {
      args: ["--restage-shared", manifest, "--sha256", digest],
      tail: [
        "restage-shared",
        "--project",
        "/tmp/project with space",
        "--manifest",
        manifest,
        "--sha256",
        digest,
      ],
    },
    {
      args: ["--activate"],
      tail: ["activate", "--project", "/tmp/project with space"],
    },
    {
      args: ["--register-profile", manifest, "--sha256", digest],
      tail: [
        "register-profile",
        "--project",
        "/tmp/project with space",
        "--file",
        manifest,
        "--sha256",
        digest,
      ],
    },
    {
      args: [
        "--reconcile-quarantined",
        manifest,
        "--sha256",
        digest,
        "--apply",
      ],
      tail: [
        "reconcile-quarantined",
        "--project",
        "/tmp/project with space",
        "--plan",
        manifest,
        "--sha256",
        digest,
        "--apply",
      ],
    },
  ])("dispatches $args as literal Python argv", async ({ args, tail }) => {
    await parse(args);
    expect(spawn).toHaveBeenCalledTimes(1);
    const [executable, argv, options] = vi.mocked(spawn).mock.calls[0];
    expect(executable).toBe("python3");
    expect(argv?.slice(-tail.length)).toEqual(tail);
    expect(options).toMatchObject({
      cwd: "/tmp/project with space",
      shell: false,
      stdio: "inherit",
    });
    expect(process.exitCode).toBe(7);
    expect(piAction).not.toHaveBeenCalled();
  });

  const pairs = actions.flatMap((first, index) =>
    actions.slice(index + 1).map((second) => [...first, ...second]),
  );
  it.each(pairs.map((args) => ({ args })))(
    "rejects conflicting actions $args before dispatch",
    async ({ args }) => {
      await expect(parse(args)).rejects.toThrow(
        "select_one_resource_action_with_required_hash",
      );
      expect(spawn).not.toHaveBeenCalled();
      expect(piAction).not.toHaveBeenCalled();
    },
  );

  it.each(
    [
      ["--register-profile", "recipe.json"],
      ["--restage-shared", manifest],
      ["--sha256", digest],
      ["--register-profile", "recipe.json", "--sha256", ""],
      ["--restage-shared", manifest, "--sha256", ""],
      ["--activate", "--sha256", ""],
      ...actions
        .filter((args) => !args.includes("--sha256"))
        .map((args) => [...args, "--sha256", digest]),
    ].map((args) => ({ args })),
  )("rejects invalid hash pairing $args before dispatch", async ({ args }) => {
    await expect(parse(args)).rejects.toThrow(
      "select_one_resource_action_with_required_hash",
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(piAction).not.toHaveBeenCalled();
  });

  it("preserves the default advisory resources path", async () => {
    await parse([]);
    expect(piAction).toHaveBeenCalledWith(
      "/tmp/project with space",
      "resources",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(["--inspect", "--register-profile", "--restage-shared"])(
    "rejects an empty %s value instead of dispatching another action",
    async (action) => {
      await expect(parse([action, "", "--activate"])).rejects.toThrow(
        "select_one_resource_action_with_required_hash",
      );
      expect(spawn).not.toHaveBeenCalled();
      expect(piAction).not.toHaveBeenCalled();
    },
  );

  it.each([{ manifest }, { sha256: digest }, {}])(
    "requires both reviewed manifest and hash at the dispatch boundary: %j",
    (options) => {
      expect(() =>
        runHostAction("/tmp/project", "restage-shared", options),
      ).toThrow("reviewed_manifest_hash_required");
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it.each([{ plan: manifest }, { sha256: digest }, {}])(
    "requires both reviewed reconcile plan and hash at the dispatch boundary: %j",
    (options) => {
      expect(() =>
        runHostAction("/tmp/project", "reconcile-quarantined", options),
      ).toThrow("reviewed_reconcile_plan_hash_required");
      expect(spawn).not.toHaveBeenCalled();
    },
  );
});
