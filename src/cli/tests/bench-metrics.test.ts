import { describe, expect, it } from "vitest";
import { calculateMetrics } from "../src/bench/metrics.js";
import type { TaskResult } from "../src/bench/types.js";

describe("Benchmark metrics calculator", () => {
  it("handles empty task results gracefully", () => {
    const metrics = calculateMetrics([]);
    expect(metrics).toEqual({
      totalTasks: 0,
      passAt1Count: 0,
      passAtKCount: 0,
      passAt1Rate: 0,
      passAtKRate: 0,
      categories: {},
    });
  });

  it("calculates pass@1 and pass@k rates correctly", () => {
    const taskResults: TaskResult[] = [
      {
        taskId: "task-1",
        category: "basic",
        passedAt1: true,
        passed: true,
        attempts: [
          {
            attemptIndex: 1,
            durationMs: 100,
            exitStatus: 0,
            passed: true,
            taskId: "task-1",
            provider: "test-prov",
            model: "test-model",
            verifierResults: [],
          },
        ],
      },
      {
        taskId: "task-2",
        category: "basic",
        passedAt1: false,
        passed: true,
        attempts: [
          {
            attemptIndex: 1,
            durationMs: 100,
            exitStatus: 1,
            passed: false,
            taskId: "task-2",
            provider: "test-prov",
            model: "test-model",
            verifierResults: [],
          },
          {
            attemptIndex: 2,
            durationMs: 100,
            exitStatus: 0,
            passed: true,
            taskId: "task-2",
            provider: "test-prov",
            model: "test-model",
            verifierResults: [],
          },
        ],
      },
      {
        taskId: "task-3",
        category: "advanced",
        passedAt1: false,
        passed: false,
        attempts: [
          {
            attemptIndex: 1,
            durationMs: 100,
            exitStatus: 1,
            passed: false,
            taskId: "task-3",
            provider: "test-prov",
            model: "test-model",
            verifierResults: [],
          },
        ],
      },
    ];

    const metrics = calculateMetrics(taskResults);

    expect(metrics.totalTasks).toBe(3);
    expect(metrics.passAt1Count).toBe(1); // task-1
    expect(metrics.passAtKCount).toBe(2); // task-1, task-2
    expect(metrics.passAt1Rate).toBeCloseTo(1 / 3);
    expect(metrics.passAtKRate).toBeCloseTo(2 / 3);

    expect(metrics.categories["basic"]).toEqual({
      category: "basic",
      totalTasks: 2,
      passAt1Count: 1,
      passAtKCount: 2,
      passAt1Rate: 0.5,
      passAtKRate: 1.0,
    });

    expect(metrics.categories["advanced"]).toEqual({
      category: "advanced",
      totalTasks: 1,
      passAt1Count: 0,
      passAtKCount: 0,
      passAt1Rate: 0.0,
      passAtKRate: 0.0,
    });
  });
});
