import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  logTokenUsage,
  summarizeUsage,
  getDefaultUsageDir,
} from "../src/utils/token-tracking.js";

describe("CLI Token Tracking Utility", () => {
  const dummyProjectRoot = join(__dirname, "dummy-project");

  afterEach(() => {
    const usageDir = getDefaultUsageDir(dummyProjectRoot);
    if (existsSync(usageDir)) {
      rmSync(usageDir, { recursive: true, force: true });
    }
  });

  it("logTokenUsage appends entries and summarizeUsage parses log files", () => {
    const entry1 = {
      inputTokens: 100,
      outputTokens: 50,
      model: "gpt-4",
      provider: "openai",
      cost: 0.003,
      timestamp: new Date().toISOString(),
      skill: "software-engineer",
    };

    const entry2 = {
      inputTokens: 200,
      outputTokens: 80,
      model: "claude-3",
      provider: "anthropic",
      cost: 0.006,
      timestamp: new Date().toISOString(),
      skill: "product-manager",
    };

    // Log first entry
    logTokenUsage(dummyProjectRoot, entry1);
    const usageDir = getDefaultUsageDir(dummyProjectRoot);
    const logFile = join(usageDir, "usage.log");

    expect(existsSync(logFile)).toBe(true);

    // Log second entry
    logTokenUsage(dummyProjectRoot, entry2);

    const lines = readFileSync(logFile, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);

    const parsed1 = JSON.parse(lines[0]);
    const parsed2 = JSON.parse(lines[1]);

    expect(parsed1.model).toBe("gpt-4");
    expect(parsed2.model).toBe("claude-3");

    // Summarize usage
    const summary = summarizeUsage(dummyProjectRoot, 1);
    expect(summary.calls).toBe(2);
    expect(summary.inputTokens).toBe(300);
    expect(summary.outputTokens).toBe(130);
    expect(summary.estimatedCostUsd).toBe(0.009);
  });
});
