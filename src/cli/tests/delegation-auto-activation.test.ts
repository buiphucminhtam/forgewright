import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELEGATION_CONFIG,
  buildDelegationBlock,
  detectControllerCli,
  formatDelegationNotice,
  readDelegationConfig,
  resolveDelegationActivation,
} from "../src/delegation/auto-activation.js";

describe("delegation auto-activation", () => {
  it("defaults to auto activation with the requested Agy model", () => {
    expect(DEFAULT_DELEGATION_CONFIG).toEqual({
      enabled: "auto",
      controller: "auto",
      workerCli: "agy",
      model: "Gemini 3.5 Flash (High)",
      notify: true,
    });
  });

  it("reads delegation settings from the production config", () => {
    const config = readDelegationConfig(`
delegationMode:
  enabled: off
  controller: claude
  worker:
    cli: agy
    model: "Gemini 3.5 Flash (Medium)"
  notify: false
`);

    expect(config).toEqual({
      enabled: "off",
      controller: "claude",
      workerCli: "agy",
      model: "Gemini 3.5 Flash (Medium)",
      notify: false,
    });
  });

  it("writes an auto-enabled configuration block", () => {
    expect(buildDelegationBlock(DEFAULT_DELEGATION_CONFIG)).toContain(
      [
        "delegationMode:",
        "  enabled: auto",
        "  controller: auto",
        "  worker:",
        "    cli: agy",
        '    model: "Gemini 3.5 Flash (High)"',
        "  notify: true",
      ].join("\n"),
    );
  });

  it("detects Codex from stable Codex environment signals", () => {
    expect(detectControllerCli({ CODEX_THREAD_ID: "thread-1" })).toBe("codex");
  });

  it("detects Claude Code from stable Claude environment signals", () => {
    expect(detectControllerCli({ CLAUDECODE: "1" })).toBe("claude");
  });

  it("uses the explicit controller override", () => {
    expect(
      detectControllerCli({
        FORGE_CONTROLLER_CLI: "claude",
        CODEX_THREAD_ID: "thread-1",
      }),
    ).toBe("claude");
  });

  it("does not guess when Codex and Claude signals conflict", () => {
    expect(
      detectControllerCli({
        CODEX_THREAD_ID: "thread-1",
        CLAUDECODE: "1",
      }),
    ).toBe("unknown");
  });

  it("auto-enables when both controller and Agy are available", () => {
    const result = resolveDelegationActivation({
      config: DEFAULT_DELEGATION_CONFIG,
      environment: { CODEX_THREAD_ID: "thread-1" },
      workerAvailable: true,
    });

    expect(result).toMatchObject({
      active: true,
      autoEnabled: true,
      controller: "codex",
      workerCli: "agy",
      model: "Gemini 3.5 Flash (High)",
      reason: "auto-enabled",
    });
  });

  it("stays inactive when Agy is unavailable", () => {
    const result = resolveDelegationActivation({
      config: DEFAULT_DELEGATION_CONFIG,
      environment: { CODEX_THREAD_ID: "thread-1" },
      workerAvailable: false,
    });

    expect(result).toMatchObject({
      active: false,
      autoEnabled: false,
      reason: "worker-unavailable",
    });
  });

  it("stays inactive when the controller cannot be detected", () => {
    const result = resolveDelegationActivation({
      config: DEFAULT_DELEGATION_CONFIG,
      environment: {},
      workerAvailable: true,
    });

    expect(result).toMatchObject({
      active: false,
      autoEnabled: false,
      reason: "controller-undetected",
    });
  });

  it("honors an explicit off setting", () => {
    const result = resolveDelegationActivation({
      config: { ...DEFAULT_DELEGATION_CONFIG, enabled: "off" },
      environment: { CODEX_THREAD_ID: "thread-1" },
      workerAvailable: true,
    });

    expect(result).toMatchObject({
      active: false,
      autoEnabled: false,
      reason: "disabled",
    });
  });

  it("formats a concise notification without asking for approval", () => {
    const result = resolveDelegationActivation({
      config: DEFAULT_DELEGATION_CONFIG,
      environment: { CODEX_THREAD_ID: "thread-1" },
      workerAvailable: true,
    });

    expect(formatDelegationNotice(result)).toBe(
      "Delegation auto-enabled: codex controller -> agy / Gemini 3.5 Flash (High) worker",
    );
  });
});
