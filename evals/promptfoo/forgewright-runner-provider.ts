/**
 * Custom Promptfoo TypeScript provider for Forgewright (RF01).
 *
 * Invokes the real isolated Forgewright runner (`scripts/runtime/skill_eval_receipt.py`)
 * and binds the outcome to the independent verifier receipt rather than grading
 * raw model text or accepting a self-reported "PASS".
 *
 * Reference: https://www.promptfoo.dev/docs/providers/custom-api/
 */

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface PromptfooProviderOptions {
  id?: string;
  config?: {
    arm?: string;
    modelRequested?: string;
    effortRequested?: string;
    hostKind?: string;
    hostVersion?: string;
    repoSha?: string;
    configDigest?: string;
    timeoutSeconds?: number;
    verifierTimeoutSeconds?: number;
    jsonlLogPath?: string;
    evidenceRootDir?: string;
    pythonExecutable?: string;
    runnerCommand?: string[];
    verifierCommand?: string[];
    verifierIndependent?: boolean;
    expectedJsonFields?: string[];
    deleteEvidenceAfterRun?: boolean;
  };
}

export interface PromptfooCallContext {
  vars?: Record<string, unknown>;
  test?: {
    description?: string;
    vars?: Record<string, unknown>;
  };
}

export interface PromptfooTokenUsage {
  total?: number;
  prompt?: number;
  completion?: number;
  cached?: number;
}

export interface PromptfooProviderResponse {
  output: string;
  error?: string;
  tokenUsage?: PromptfooTokenUsage;
  cost?: number;
  cached?: boolean;
  metadata: {
    schema: string;
    runId: string;
    taskId: string;
    arm: string;
    terminalOutcome: string;
    errorCategory: string;
    verifierPassed: boolean;
    verifierIndependent: boolean;
    cleanupComplete: boolean;
    wallTimeMs: number;
    usageRaw: Record<string, unknown>;
    model: Record<string, unknown>;
    host: Record<string, unknown>;
    evidencePaths: Record<string, string>;
    artifactDigests: Record<string, string>;
  };
}

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const RECEIPT_SCRIPT = resolve(REPO_ROOT, "scripts/runtime/skill_eval_receipt.py");

export default class ForgewrightRunnerProvider {
  private readonly providerId: string;
  private readonly config: NonNullable<PromptfooProviderOptions["config"]>;

  constructor(options: PromptfooProviderOptions = {}) {
    this.providerId = options.id ?? "forgewright:isolated-runner";
    this.config = options.config ?? {};
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    prompt: string,
    context?: PromptfooCallContext,
  ): Promise<PromptfooProviderResponse> {
    const vars = context?.vars ?? context?.test?.vars ?? {};
    const taskId =
      typeof vars.task_id === "string" && vars.task_id.trim()
        ? vars.task_id.trim()
        : "promptfoo-task";
    const arm =
      typeof vars.arm === "string" && vars.arm.trim()
        ? vars.arm.trim()
        : (this.config.arm ?? "current");
    const command = Array.isArray(vars.command)
      ? vars.command.map(String)
      : (this.config.runnerCommand ?? []);
    const verifierCommand = Array.isArray(vars.verifier_command)
      ? vars.verifier_command.map(String)
      : (this.config.verifierCommand ?? undefined);
    const expectedJsonFields = Array.isArray(vars.expected_json_fields)
      ? vars.expected_json_fields.map(String)
      : (this.config.expectedJsonFields ?? []);
    const blockedReason =
      typeof vars.blocked_reason === "string" ? vars.blocked_reason : undefined;
    const cancelAfterSeconds =
      typeof vars.cancel_after_seconds === "number"
        ? vars.cancel_after_seconds
        : undefined;
    const verifierIndependent =
      typeof vars.verifier_independent === "boolean"
        ? vars.verifier_independent
        : (this.config.verifierIndependent ?? true);
    const agentTimeout =
      typeof vars.timeout_seconds === "number"
        ? vars.timeout_seconds
        : (this.config.timeoutSeconds ?? 30);
    const verifierTimeout =
      typeof vars.verifier_timeout_seconds === "number"
        ? vars.verifier_timeout_seconds
        : (this.config.verifierTimeoutSeconds ?? agentTimeout);

    const stagingRoot = mkdtempSync(join(tmpdir(), "fw-promptfoo-spec-"));
    const specPath = join(stagingRoot, "spec.json");
    const durableBase = resolve(
      this.config.evidenceRootDir ??
        join(REPO_ROOT, ".forgewright/runtime/promptfoo-evidence"),
    );
    mkdirSync(durableBase, { recursive: true });
    const safeTaskSlug = taskId.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 48) || "task";
    const outputDir = join(durableBase, `${safeTaskSlug}-${randomUUID()}`);
    mkdirSync(outputDir, { recursive: true });

    const spec = {
      task_id: taskId,
      arm,
      prompt,
      command,
      verifier_command: verifierCommand ?? null,
      verifier_independent: verifierIndependent,
      expected_json_fields: expectedJsonFields,
      model_requested: this.config.modelRequested ?? "unknown",
      effort_requested: this.config.effortRequested ?? "unknown",
      host_kind: this.config.hostKind ?? "promptfoo-forgewright-runner",
      host_version: this.config.hostVersion ?? "1.0.0",
      repo_sha: this.config.repoSha ?? "unknown",
      config_digest: this.config.configDigest ?? "unknown",
      instruction_sources: Array.isArray(vars.instruction_sources)
        ? vars.instruction_sources.map(String)
        : [],
      tool_sources: Array.isArray(vars.tool_sources)
        ? vars.tool_sources.map(String)
        : [],
      timeout_seconds: agentTimeout,
      verifier_timeout_seconds: verifierTimeout,
      blocked_reason: blockedReason ?? null,
      cancel_after_seconds: cancelAfterSeconds ?? null,
    };

    try {
      writeFileSync(specPath, JSON.stringify(spec), "utf8");
      const pythonBin = this.config.pythonExecutable ?? process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
      const args = [
        "-X",
        "utf8",
        RECEIPT_SCRIPT,
        "--spec-json",
        "@" + specPath,
        "--output-dir",
        outputDir,
      ];
      if (this.config.jsonlLogPath) {
        args.push("--jsonl-log", this.config.jsonlLogPath);
      }

      // Total outer deadline covers both agent stage + verifier stage + cleanup allowance.
      const totalStageSeconds = agentTimeout + (verifierCommand ? verifierTimeout : 0) + 15;
      const startedAtMs = performance.now();
      const proc = spawnSync(pythonBin, args, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: Math.ceil(totalStageSeconds * 1000),
      });
      const measuredWallTimeMs = Math.round((performance.now() - startedAtMs) * 1000) / 1000;

      const receiptFile = join(outputDir, "receipt.json");
      if (!existsSync(receiptFile)) {
        const timedOut = (proc.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
        const outcome = timedOut ? "timeout" : "environment_error";
        const runId = `run-missing-${randomUUID()}`;
        const stdoutFile = join(outputDir, "agent.stdout");
        const stderrFile = join(outputDir, "agent.stderr");
        const eventsFile = join(outputDir, "events.jsonl");
        if (!existsSync(stdoutFile)) writeFileSync(stdoutFile, proc.stdout ?? "", "utf8");
        if (!existsSync(stderrFile)) writeFileSync(stderrFile, proc.stderr ?? "", "utf8");
        const fallbackEvents = [
          { schema: "forgewright-eval-event/v1", run_id: runId, task_id: taskId, seq: 1, kind: "admitted", elapsed_ms: 0, admitted: true },
          { schema: "forgewright-eval-event/v1", run_id: runId, task_id: taskId, seq: 2, kind: "terminal", elapsed_ms: measuredWallTimeMs, outcome, error_category: outcome },
        ];
        if (!existsSync(eventsFile)) {
          writeFileSync(eventsFile, fallbackEvents.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
        }
        const evidencePaths = {
          receipt: receiptFile,
          events: eventsFile,
          agent_stdout: stdoutFile,
          agent_stderr: stderrFile,
        };
        const sha256File = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
        const fallbackReceipt = {
          schema: "forgewright-eval-run-receipt/v1",
          run_id: runId,
          task_id: taskId,
          arm,
          repo_sha: spec.repo_sha,
          config_digest: spec.config_digest,
          instruction_sources: spec.instruction_sources,
          tool_sources: spec.tool_sources,
          commands: { agent: spec.command, verifier: spec.verifier_command },
          terminal_outcome: outcome,
          error_category: outcome,
          verifier: { executed: false, independent: false, passed: false, reason: "receipt_missing" },
          cleanup: { complete: false },
          wall_time_ms: measuredWallTimeMs,
          usage: { input_tokens: "unknown", output_tokens: "unknown", total_tokens: "unknown", cost_usd: "unknown" },
          model: { requested: spec.model_requested, resolved: "unknown" },
          host: { kind: spec.host_kind, version: spec.host_version },
          events: fallbackEvents,
          evidence_paths: evidencePaths,
          artifact_digests: {
            events: sha256File(eventsFile),
            agent_stdout: sha256File(stdoutFile),
            agent_stderr: sha256File(stderrFile),
          },
        };
        writeFileSync(receiptFile, JSON.stringify(fallbackReceipt, null, 2) + "\n", "utf8");
        if (this.config.jsonlLogPath) {
          mkdirSync(resolve(this.config.jsonlLogPath, ".."), { recursive: true });
          appendFileSync(this.config.jsonlLogPath, JSON.stringify(fallbackReceipt) + "\n", "utf8");
        }
      }
      const rawReceipt = JSON.parse(readFileSync(receiptFile, "utf8")) as Record<
        string,
        any
      >;
      const stdoutFile = join(outputDir, "agent.stdout");
      const agentStdout = existsSync(stdoutFile)
        ? readFileSync(stdoutFile, "utf8").trim()
        : "";

      // Token and cost remain undefined in Promptfoo when unknown so Promptfoo
      // never coerces unknown usage into 0 tokens or $0.00.
      const usage = rawReceipt.usage ?? {};
      const tokenUsage: PromptfooTokenUsage | undefined =
        typeof usage.total_tokens === "number"
          ? {
              total: usage.total_tokens,
              ...(typeof usage.input_tokens === "number"
                ? { prompt: usage.input_tokens }
                : {}),
              ...(typeof usage.output_tokens === "number"
                ? { completion: usage.output_tokens }
                : {}),
              ...(typeof usage.cached_input_tokens === "number"
                ? { cached: usage.cached_input_tokens }
                : {}),
            }
          : undefined;

      const cost =
        typeof usage.cost_usd === "number" ? usage.cost_usd : undefined;

      const accepted = rawReceipt.terminal_outcome === "accepted";
      return {
        output: agentStdout,
        ...(accepted
          ? {}
          : {
              error: String(rawReceipt.terminal_outcome) + ":" + String(rawReceipt.error_category),
            }),
        ...(tokenUsage ? { tokenUsage } : {}),
        ...(cost !== undefined ? { cost } : {}),
        metadata: {
          schema: rawReceipt.schema,
          runId: rawReceipt.run_id,
          taskId: rawReceipt.task_id,
          arm: rawReceipt.arm,
          terminalOutcome: rawReceipt.terminal_outcome,
          errorCategory: rawReceipt.error_category,
          verifierPassed: Boolean(rawReceipt.verifier?.passed),
          verifierIndependent: Boolean(rawReceipt.verifier?.independent),
          cleanupComplete: Boolean(rawReceipt.cleanup?.complete),
          wallTimeMs: Number(rawReceipt.wall_time_ms ?? 0),
          usageRaw: usage,
          model: rawReceipt.model ?? {},
          host: rawReceipt.host ?? {},
          evidencePaths: rawReceipt.evidence_paths ?? {},
          artifactDigests: rawReceipt.artifact_digests ?? {},
        },
      };
    } finally {
      rmSync(stagingRoot, { recursive: true, force: true });
      if (this.config.deleteEvidenceAfterRun) {
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  }
}
