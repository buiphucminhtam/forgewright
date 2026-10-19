import { describe, it, expect, vi } from "vitest";
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
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
