/**
 * bench-comparable.test.ts
 *
 * Tests for comparable benchmark evaluation:
 *  1. Fake-binary integration test for the Gemini adapter (no paid calls).
 *  2. k≥3 aggregation and confidence margin validation.
 *  3. Regression: old mock-vs-live comparison must exit non-zero (incomparable).
 */
import { describe, expect, it } from "vitest";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { runBenchmarkSuite } from "../src/bench/runner.js";
import {
  validateComparableReports,
  type ComparableReport,
} from "../src/bench/compare.js";

// ---------------------------------------------------------------------------
// Helper: create a mock spawn that returns a fixed exit code / stdout / stderr.
// ---------------------------------------------------------------------------
function createMockSpawn(exitCode: number, stdoutText = "", stderrText = "") {
  const spawnCalls: { program: string; args: string[]; options: any }[] = [];
  const spawnFn = ((program: string, args: string[], options: any) => {
    spawnCalls.push({ program, args, options });
    const cp = new EventEmitter() as any;
    cp.stdout = Readable.from([stdoutText]);
    cp.stderr = Readable.from([stderrText]);
    cp.kill = () => {};
    setTimeout(() => {
      cp.emit("exit", exitCode, null);
    }, 5);
    return cp;
  }) as any;
  return { spawnFn, spawnCalls };
}

// ---------------------------------------------------------------------------
// 1. Fake-binary integration test for the Gemini adapter.
//    Creates a real executable on disk and uses a real spawn() wrapper so
//    the actual process-spawning code path is exercised (not a constant mock).
// ---------------------------------------------------------------------------
describe("Gemini adapter — fake-binary integration", () => {
  it("invokes gemini binary with -m <model> -y -p <prompt> and captures stdout", async () => {
    const tempDir = join(tmpdir(), `test-gemini-fakebin-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Fake 'gemini' binary: echoes its argv to stdout then exits 0.
    const fakeBinDir = join(tempDir, "bin");
    mkdirSync(fakeBinDir, { recursive: true });
    const fakeBin = join(fakeBinDir, "gemini");
    writeFileSync(
      fakeBin,
      [
        "#!/usr/bin/env node",
        // Print all argv after "node <script>" as comma-separated.
        "process.stdout.write('fake-gemini-args:' + process.argv.slice(2).join(',') + '\\n');",
        "process.exit(0);",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    // Verifier that always passes.
    writeFileSync(join(tempDir, "verify.js"), "process.exit(0);\n", "utf8");

    const suitePath = join(tempDir, "suite.json");
    writeFileSync(
      suitePath,
      JSON.stringify({
        version: "1.0",
        name: "Gemini Fake Binary Suite",
        defaultProviderSettings: {
          provider: "gemini",
          model: "gemini-2.5-flash",
        },
        defaultAttempts: 1,
        defaultTimeoutMs: 5000,
        tasks: [
          {
            id: "gemini-fake-1",
            category: "smoke",
            prompt: "hello world",
            verifierCommands: ["node verify.js"],
          },
        ],
      }),
      "utf8",
    );

    // Inject the fake bin directory at the front of PATH.
    const patchedPath = `${fakeBinDir}:${process.env.PATH ?? ""}`;

    const { spawn: realSpawn } = await import("node:child_process");
    const patchedSpawn: typeof realSpawn = (program, args, options) => {
      const merged = {
        ...(options ?? {}),
        env: { ...(options as any)?.env, PATH: patchedPath },
      };
      return realSpawn(program, args as string[], merged as any) as any;
    };

    const { report } = await runBenchmarkSuite(suitePath, {
      run: true,
      spawnFn: patchedSpawn as any,
    });

    expect(report).toBeDefined();
    const attempt = report!.tasks[0].attempts[0];

    // Process must have exited cleanly.
    expect(attempt.exitStatus).toBe(0);

    // stdout must contain the argv proving the correct flags were forwarded.
    const stdout = attempt.stdout ?? "";
    expect(stdout).toContain("-m");
    expect(stdout).toContain("gemini-2.5-flash");
    expect(stdout).toContain("-y");
    expect(stdout).toContain("-p");
    expect(stdout).toContain("hello world");

    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// 2. k≥3 aggregation and confidence margin validation.
// ---------------------------------------------------------------------------
describe("k≥3 aggregation and confidence margin", () => {
  it("records pass@k=true when only the third attempt succeeds", async () => {
    const tempDir = join(tmpdir(), `test-k3-late-pass-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const suitePath = join(tempDir, "suite.json");

    writeFileSync(
      suitePath,
      JSON.stringify({
        version: "1.0",
        name: "K3 Late Pass Suite",
        defaultProviderSettings: { provider: "agy", model: "test-model" },
        defaultAttempts: 3,
        defaultTimeoutMs: 10000,
        tasks: [
          {
            id: "task-k3-late",
            category: "smoke",
            prompt: "Do the thing.",
            verifierCommands: ["node verify.js"],
          },
        ],
      }),
      "utf8",
    );

    writeFileSync(join(tempDir, "verify.js"), "process.exit(0);\n", "utf8");

    let callCount = 0;
    // agy fails on attempts 1 and 2, succeeds on attempt 3.
    const customSpawn = ((program: string, _args: string[], _options: any) => {
      const cp = new EventEmitter() as any;
      cp.stdout = Readable.from([""]);
      cp.stderr = Readable.from([""]);
      cp.kill = () => {};
      process.nextTick(() => {
        if (program === "agy") {
          callCount++;
          cp.emit("exit", callCount <= 2 ? 1 : 0, null);
        } else {
          cp.emit("exit", 0, null);
        }
      });
      return cp;
    }) as any;

    const { report } = await runBenchmarkSuite(suitePath, {
      run: true,
      spawnFn: customSpawn,
    });

    expect(report).toBeDefined();
    const task = report!.tasks[0];

    expect(task.attempts.length).toBe(3);
    expect(task.attempts[0].passed).toBe(false); // k=1 failed
    expect(task.attempts[1].passed).toBe(false); // k=2 failed
    expect(task.attempts[2].passed).toBe(true);  // k=3 passed

    expect(task.passedAt1).toBe(false); // pass@1 is false
    expect(task.passed).toBe(true);     // pass@k is true

    // Aggregate metrics.
    expect(report!.summary.passAt1Count).toBe(0);
    expect(report!.summary.passAt1Rate).toBe(0);
    expect(report!.summary.passAtKCount).toBe(1);
    expect(report!.summary.passAtKRate).toBe(1);

    // The delta (pass@k − pass@1) must be strictly positive.
    const delta = report!.summary.passAtKRate - report!.summary.passAt1Rate;
    expect(delta).toBeGreaterThan(0);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports correct per-category k=3 aggregation across multiple tasks", async () => {
    const tempDir = join(tmpdir(), `test-k3-multi-cat-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    const suitePath = join(tempDir, "suite.json");

    writeFileSync(
      suitePath,
      JSON.stringify({
        version: "1.0",
        name: "K3 Multi Category Suite",
        defaultProviderSettings: { provider: "agy", model: "test-model" },
        defaultAttempts: 3,
        defaultTimeoutMs: 10000,
        tasks: [
          {
            id: "cat-a-1",
            category: "cat-a",
            prompt: "Task A1",
            verifierCommands: ["node verify.js"],
          },
          {
            id: "cat-a-2",
            category: "cat-a",
            prompt: "Task A2",
            verifierCommands: ["node verify.js"],
          },
          {
            id: "cat-b-1",
            category: "cat-b",
            prompt: "Task B1",
            verifierCommands: ["node verify.js"],
          },
        ],
      }),
      "utf8",
    );

    writeFileSync(join(tempDir, "verify.js"), "process.exit(0);\n", "utf8");

    // All agy calls succeed on first attempt.
    const { spawnFn } = createMockSpawn(0);

    const { report } = await runBenchmarkSuite(suitePath, {
      run: true,
      spawnFn,
    });

    expect(report).toBeDefined();
    expect(report!.summary.totalTasks).toBe(3);
    expect(report!.summary.passAt1Count).toBe(3);
    expect(report!.summary.passAtKCount).toBe(3);
    expect(report!.summary.passAt1Rate).toBeCloseTo(1.0);
    expect(report!.summary.passAtKRate).toBeCloseTo(1.0);

    // Per-category checks.
    expect(report!.summary.categories["cat-a"].totalTasks).toBe(2);
    expect(report!.summary.categories["cat-a"].passAt1Count).toBe(2);
    expect(report!.summary.categories["cat-a"].passAt1Rate).toBeCloseTo(1.0);
    expect(report!.summary.categories["cat-b"].totalTasks).toBe(1);
    expect(report!.summary.categories["cat-b"].passAt1Count).toBe(1);

    // Every task must have exactly 3 attempt records.
    for (const task of report!.tasks) {
      expect(task.attempts.length).toBe(3);
    }

    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// 3. Regression: comparable-report validation rejects incomparable pairs.
// ---------------------------------------------------------------------------
describe("comparable-report validation (regression)", () => {
  const baseReport: ComparableReport = {
    mode: "live",
    model: "gemini-2.5-flash",
    provider: "gemini",
    suiteVersion: "1.0",
    suiteName: "Test Suite",
    defaultAttempts: 3,
    totalTasks: 5,
    verifierVersion: "1",
    timestamp: "2026-07-04T00:00:00Z",
  };

  it("rejects a mock report compared to a live report", () => {
    const mockReport: ComparableReport = { ...baseReport, mode: "mock", model: "mocked" };
    const result = validateComparableReports(mockReport, baseReport);
    expect(result.comparable).toBe(false);
    expect(result.reason).toMatch(/mock/i);
  });

  it("rejects reports with mismatched providers", () => {
    const otherProvider: ComparableReport = { ...baseReport, provider: "codex" };
    const result = validateComparableReports(baseReport, otherProvider);
    expect(result.comparable).toBe(false);
    expect(result.reason).toMatch(/provider/i);
  });

  it("rejects reports with mismatched models", () => {
    const otherModel: ComparableReport = { ...baseReport, model: "gemini-2.0-flash" };
    const result = validateComparableReports(baseReport, otherModel);
    expect(result.comparable).toBe(false);
    expect(result.reason).toMatch(/model/i);
  });

  it("rejects reports with mismatched task counts", () => {
    const fewerTasks: ComparableReport = { ...baseReport, totalTasks: 3 };
    const result = validateComparableReports(baseReport, fewerTasks);
    expect(result.comparable).toBe(false);
    expect(result.reason).toMatch(/task/i);
  });

  it("rejects reports with mismatched attempts", () => {
    const fewerAttempts: ComparableReport = { ...baseReport, defaultAttempts: 1 };
    const result = validateComparableReports(baseReport, fewerAttempts);
    expect(result.comparable).toBe(false);
    expect(result.reason).toMatch(/attempt/i);
  });

  it("rejects reports with mismatched verifier versions", () => {
    const otherVerifier: ComparableReport = { ...baseReport, verifierVersion: "2" };
    const result = validateComparableReports(baseReport, otherVerifier);
    expect(result.comparable).toBe(false);
    expect(result.reason).toMatch(/verifier/i);
  });

  it("rejects reports with mismatched suite names", () => {
    const otherSuite: ComparableReport = { ...baseReport, suiteName: "Other Suite" };
    const result = validateComparableReports(baseReport, otherSuite);
    expect(result.comparable).toBe(false);
    expect(result.reason).toMatch(/suite/i);
  });

  it("accepts two live reports with identical metadata", () => {
    const legacyReport: ComparableReport = { ...baseReport };
    const liteReport: ComparableReport = { ...baseReport };
    const result = validateComparableReports(legacyReport, liteReport);
    expect(result.comparable).toBe(true);
  });
});
