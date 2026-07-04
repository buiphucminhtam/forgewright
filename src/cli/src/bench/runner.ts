import {
  readFileSync,
  existsSync,
  mkdtempSync,
  cpSync,
  rmSync,
  writeFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { BenchmarkSuiteSchema } from "./types.js";
import type {
  TaskResult,
  AttemptResult,
  VerifierResult,
  BenchmarkReport,
} from "./types.js";
import { calculateMetrics } from "./metrics.js";

export function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmpPath, filePath);
}

export function parseCommandString(cmdStr: string): {
  program: string;
  args: string[];
} {
  const matches = cmdStr.match(/"[^"]*"|'[^']*'|[^\s"']+/g);
  if (!matches) {
    return { program: cmdStr, args: [] };
  }
  const program = matches[0].replace(/^["']|["']$/g, "");
  const args = matches.slice(1).map((arg) => arg.replace(/^["']|["']$/g, ""));
  return { program, args };
}

export function sanitizeOutput(text: string): string {
  if (!text) {
    return "";
  }
  const maxLen = 2048;
  let sanitized =
    text.length > maxLen ? text.slice(0, maxLen) + "\n[TRUNCATED]" : text;
  sanitized = sanitized.replace(/(sk-[a-zA-Z0-9]{32,})/g, "[REDACTED_API_KEY]");
  sanitized = sanitized.replace(
    /(AIzaSy[a-zA-Z0-9-_]{33})/g,
    "[REDACTED_API_KEY]",
  );
  return sanitized;
}

export type ProcessAdapter = (
  input: {
    taskId: string;
    prompt: string;
    model: string;
    workspace: string;
    timeoutMs: number;
  },
  spawnFn: typeof spawn,
) => Promise<{
  exitStatus: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
}>;

export const ADAPTERS: Record<string, ProcessAdapter> = {
  agy: async (input, spawnFn) => {
    const contractContent = JSON.stringify(
      {
        contract_version: "1.0",
        task_id: input.taskId,
        task_name: `Benchmark Task ${input.taskId}`,
        acceptance_criteria: [],
        inputs: {
          prompt: input.prompt,
        },
      },
      null,
      2,
    );

    const instructionsContent = `# Instructions for ${input.taskId}
1. Implement the request in the contract:
${input.prompt}
2. Write DELIVERY.json. Do not commit.
`;

    writeFileSync(
      join(input.workspace, "CONTRACT.json"),
      contractContent,
      "utf8",
    );
    writeFileSync(
      join(input.workspace, "WORKER_INSTRUCTIONS.md"),
      instructionsContent,
      "utf8",
    );

    const args = [
      "--model",
      input.model,
      "--sandbox",
      "--print",
      "Read WORKER_INSTRUCTIONS.md and CONTRACT.json, execute only the contracted task, run its verification commands, and write DELIVERY.json.",
    ];

    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const child = spawnFn("agy", args, {
        cwd: input.workspace,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      let timer: NodeJS.Timeout | null = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr,
          });
        }, input.timeoutMs);
      }

      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });

      child.on("exit", (code) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve({
          exitStatus: code,
          durationMs: Date.now() - startTime,
          stdout,
          stderr,
        });
      });
    });
  },

  codex: async (input, spawnFn) => {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--model",
      input.model,
      "--sandbox",
      "workspace-write",
      "--ephemeral",
      input.prompt,
    ];

    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const child = spawnFn("codex", args, {
        cwd: input.workspace,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      let timer: NodeJS.Timeout | null = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr,
          });
        }, input.timeoutMs);
      }

      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });

      child.on("exit", (code) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve({
          exitStatus: code,
          durationMs: Date.now() - startTime,
          stdout,
          stderr,
        });
      });
    });
  },

  gemini: async (input, spawnFn) => {
    // Use actual Gemini CLI flags: -m/--model, -p/--prompt for non-interactive
    // headless stdout mode, -y/--yolo to auto-approve all actions (safe in CI).
    const args = ["-m", input.model, "-y", "-p", input.prompt];

    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      const child = spawnFn("gemini", args, {
        cwd: input.workspace,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      let timer: NodeJS.Timeout | null = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr,
          });
        }, input.timeoutMs);
      }

      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });

      child.on("exit", (code) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve({
          exitStatus: code,
          durationMs: Date.now() - startTime,
          stdout,
          stderr,
        });
      });
    });
  },
};

export async function runVerifierCommand(
  cmdStr: string,
  workspace: string,
  spawnFn: typeof spawn,
): Promise<VerifierResult> {
  const { program, args } = parseCommandString(cmdStr);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const child = spawnFn(program, args, {
      cwd: workspace,
      shell: false,
    });

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      resolve({
        command: cmdStr,
        exitCode: null,
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr + (stderr ? "\n" : "") + err.message),
        passed: false,
      });
    });

    child.on("exit", (code) => {
      resolve({
        command: cmdStr,
        exitCode: code,
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr),
        passed: code === 0,
      });
    });
  });
}

export interface RunOptions {
  run: boolean;
  spawnFn?: typeof spawn;
}

export async function runBenchmarkSuite(
  suitePath: string,
  options: RunOptions,
): Promise<{
  report?: BenchmarkReport;
  plan: string;
}> {
  const absoluteSuitePath = resolve(suitePath);
  const suiteDir = dirname(absoluteSuitePath);

  if (!existsSync(absoluteSuitePath)) {
    throw new Error(`Suite file not found: ${suitePath}`);
  }

  const rawSuite = JSON.parse(readFileSync(absoluteSuitePath, "utf8"));
  const parsedSuite = BenchmarkSuiteSchema.parse(rawSuite);

  let plan = `Benchmark Suite: ${parsedSuite.name} (v${parsedSuite.version})\n`;
  plan += `Default Settings: Provider=${parsedSuite.defaultProviderSettings.provider}, Model=${parsedSuite.defaultProviderSettings.model}, Attempts=${parsedSuite.defaultAttempts}, Timeout=${parsedSuite.defaultTimeoutMs}ms\n`;
  plan += `Tasks to run:\n`;

  const tasksToRun = parsedSuite.tasks.map((task) => {
    const provider =
      task.providerSettings?.provider ??
      parsedSuite.defaultProviderSettings.provider;
    const model =
      task.providerSettings?.model ?? parsedSuite.defaultProviderSettings.model;
    const attempts = task.attempts ?? parsedSuite.defaultAttempts;
    const timeoutMs = task.timeoutMs ?? parsedSuite.defaultTimeoutMs;
    const resolvedWorkspace = task.workspace
      ? resolve(suiteDir, task.workspace)
      : "";

    plan += ` - Task ID: ${task.id}\n`;
    plan += `   Category: ${task.category}\n`;
    plan += `   Provider: ${provider}, Model: ${model}\n`;
    plan += `   Attempts: ${attempts}, Timeout: ${timeoutMs}ms\n`;
    plan += `   Workspace: ${resolvedWorkspace || "None (current directory)"}\n`;
    plan += `   Verifier commands: ${task.verifierCommands.join(", ") || "None"}\n`;

    return {
      task,
      provider,
      model,
      attempts,
      timeoutMs,
      resolvedWorkspace,
    };
  });

  if (!options.run) {
    return { plan };
  }

  const spawnFn = options.spawnFn ?? spawn;
  const taskResults: TaskResult[] = [];
  let totalAttemptsRun = 0;

  for (const {
    task,
    provider,
    model,
    attempts,
    timeoutMs,
    resolvedWorkspace,
  } of tasksToRun) {
    if (task.workspace) {
      if (
        !existsSync(resolvedWorkspace) ||
        !statSync(resolvedWorkspace).isDirectory()
      ) {
        throw new Error(
          `Workspace for task ${task.id} must exist and be a directory: ${task.workspace}`,
        );
      }
    }

    const adapter = ADAPTERS[provider];
    if (!adapter) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const attemptResults: AttemptResult[] = [];
    for (let k = 1; k <= attempts; k++) {
      let attemptWorkspace = resolvedWorkspace;
      let cleanupFn = () => {};

      if (resolvedWorkspace && existsSync(resolvedWorkspace)) {
        const tempBase = join(tmpdir(), `forge-bench-${task.id}-`);
        attemptWorkspace = mkdtempSync(tempBase);
        cpSync(resolvedWorkspace, attemptWorkspace, { recursive: true });
        cleanupFn = () => {
          try {
            rmSync(attemptWorkspace, { recursive: true, force: true });
          } catch (e) {
            // Ignore cleanup errors
          }
        };
      } else {
        const tempBase = join(tmpdir(), `forge-bench-empty-${task.id}-`);
        attemptWorkspace = mkdtempSync(tempBase);
        cleanupFn = () => {
          try {
            rmSync(attemptWorkspace, { recursive: true, force: true });
          } catch (e) {
            // Ignore cleanup errors
          }
        };
      }

      totalAttemptsRun++;
      let runResult: {
        exitStatus: number | null;
        durationMs: number;
        stdout: string;
        stderr: string;
      };
      try {
        runResult = await adapter(
          {
            taskId: task.id,
            prompt: task.prompt,
            model,
            workspace: attemptWorkspace,
            timeoutMs,
          },
          spawnFn,
        );
      } catch (err) {
        runResult = {
          exitStatus: null,
          durationMs: 0,
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
        };
      }

      const verifierResults: VerifierResult[] = [];
      let allVerifiersPassed = task.verifierCommands.length > 0;
      for (const cmd of task.verifierCommands) {
        const res = await runVerifierCommand(cmd, attemptWorkspace, spawnFn);
        verifierResults.push(res);
        if (!res.passed) {
          allVerifiersPassed = false;
        }
      }

      attemptResults.push({
        attemptIndex: k,
        durationMs: runResult.durationMs,
        exitStatus: runResult.exitStatus,
        verifierResults,
        passed: runResult.exitStatus === 0 && allVerifiersPassed,
        provider,
        model,
        taskId: task.id,
        stdout: sanitizeOutput(runResult.stdout),
        stderr: sanitizeOutput(runResult.stderr),
      });

      cleanupFn();
    }

    const passedAt1 = attemptResults.length > 0 && attemptResults[0].passed;
    const passed = attemptResults.some((r) => r.passed);

    taskResults.push({
      taskId: task.id,
      category: task.category,
      attempts: attemptResults,
      passed,
      passedAt1,
    });
  }

  const summary = calculateMetrics(taskResults);

  const report: BenchmarkReport = {
    suiteName: parsedSuite.name,
    suiteVersion: parsedSuite.version,
    timestamp: new Date().toISOString(),
    provider: parsedSuite.defaultProviderSettings.provider,
    model: parsedSuite.defaultProviderSettings.model,
    totalAttemptsRun,
    summary,
    tasks: taskResults,
  };

  return { report, plan };
}
