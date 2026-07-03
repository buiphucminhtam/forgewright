import { z } from "zod";

export const ProviderModelSettingsSchema = z.object({
  provider: z.string(),
  model: z.string(),
  options: z.record(z.unknown()).optional(),
});

export const BenchmarkTaskSchema = z.object({
  id: z.string(),
  category: z.string(),
  prompt: z.string(),
  providerSettings: ProviderModelSettingsSchema.optional(),
  attempts: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  workspace: z.string().optional(),
  verifierCommands: z.array(z.string().min(1)).min(1),
});

export const BenchmarkSuiteSchema = z
  .object({
    version: z.string(),
    name: z.string(),
    description: z.string().optional(),
    defaultProviderSettings: ProviderModelSettingsSchema,
    defaultAttempts: z.number().int().positive().default(1),
    defaultTimeoutMs: z.number().int().positive().default(60000),
    tasks: z
      .array(BenchmarkTaskSchema)
      .min(1, "Benchmark suite must include at least one task"),
  })
  .refine(
    (data) => {
      const ids = data.tasks.map((t) => t.id);
      const uniqueIds = new Set(ids);
      return uniqueIds.size === ids.length;
    },
    {
      message: "Task IDs must be unique within the benchmark suite",
      path: ["tasks"],
    },
  );

export type ProviderModelSettings = z.infer<typeof ProviderModelSettingsSchema>;
export type BenchmarkTask = z.infer<typeof BenchmarkTaskSchema>;
export type BenchmarkSuite = z.infer<typeof BenchmarkSuiteSchema>;

export interface VerifierResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  passed: boolean;
}

export interface AttemptResult {
  attemptIndex: number;
  durationMs: number;
  exitStatus: number | null;
  verifierResults: VerifierResult[];
  passed: boolean;
  provider: string;
  model: string;
  taskId: string;
  stdout?: string;
  stderr?: string;
}

export interface TaskResult {
  taskId: string;
  category: string;
  attempts: AttemptResult[];
  passed: boolean;
  passedAt1: boolean;
}

export interface CategoryMetric {
  category: string;
  totalTasks: number;
  passAt1Count: number;
  passAtKCount: number;
  passAt1Rate: number;
  passAtKRate: number;
}

export interface SuiteResultSummary {
  totalTasks: number;
  passAt1Count: number;
  passAtKCount: number;
  passAt1Rate: number;
  passAtKRate: number;
  categories: Record<string, CategoryMetric>;
}

export interface BenchmarkReport {
  suiteName: string;
  suiteVersion: string;
  timestamp: string;
  provider: string;
  model: string;
  totalAttemptsRun: number;
  summary: SuiteResultSummary;
  tasks: TaskResult[];
}
