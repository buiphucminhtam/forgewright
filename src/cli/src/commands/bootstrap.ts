import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runBootstrapProcess } from "../bootstrap/process.mjs";
import { Option, type Command } from "commander";
import pc from "picocolors";
import {
  createBootstrapPolicy,
  getBootstrapPolicyPath,
  installBootstrapLauncher,
  loadBootstrapPolicy,
  preflightBootstrap,
  resolveBootstrapPython,
  saveBootstrapPolicy,
  setBootstrapPolicyOff,
  type BootstrapMode,
} from "../bootstrap/state.js";
import { EXIT_CODES } from "../exit-codes.js";
import { buildEnvelope } from "../types/index.js";
import { checkCli } from "../utils/cli-detection.js";
import { VERSION } from "../version.js";

interface JsonOptions {
  json?: boolean;
}

interface PolicySetOptions extends JsonOptions {
  mode: BootstrapMode;
  auto: "on" | "off";
  allowRoot?: string[];
  denyRoot?: string[];
  autoUpdate?: boolean;
  mcpClients?: string;
  piPolicy?: "existing-subscription-only" | "disabled";
  piModel?: string;
  forgewrightRoot?: string;
}

interface ProjectBootstrapOptions extends JsonOptions {
  mode?: "automation" | "full";
  auto?: boolean;
  keepProfile?: boolean;
}

function useJson(program: Command, options: JsonOptions): boolean {
  return Boolean(options.json || program.opts().json || !process.stdout.isTTY);
}

function writeSuccess(
  tool: string,
  data: unknown,
  json: boolean,
  startedAt: number,
): void {
  const envelope = buildEnvelope(tool, data, {
    ok: true,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
  });
  if (json) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    process.stdout.write(pc.green("✓") + " " + tool + "\n");
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

function writeFailure(
  tool: string,
  message: string,
  data: unknown,
  json: boolean,
  startedAt: number,
  code: number = EXIT_CODES.TOOL_ERROR,
): void {
  const envelope = buildEnvelope(tool, data, {
    ok: false,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
    error: { code, message },
  });
  if (json) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
  } else {
    process.stderr.write(pc.red("Error:") + " " + message + "\n");
  }
  process.exitCode = code;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function defaultMcpClients(
  mode: BootstrapMode,
): Array<"codex" | "claude-code"> {
  if (mode !== "full") return [];
  const clients: Array<"codex" | "claude-code"> = [];
  if (checkCli("codex").available) clients.push("codex");
  if (checkCli("claude").available) clients.push("claude-code");
  return clients;
}

function managerPath(): string {
  const root = loadBootstrapPolicy()?.forgewright_root;
  if (!root) {
    throw new Error(
      "Global bootstrap policy is not configured; run forge bootstrap policy set first.",
    );
  }
  const path = resolve(root, "scripts/runtime/bootstrap_manager.py");
  if (!existsSync(path)) {
    throw new Error(
      "Bootstrap manager is missing from the configured Forgewright root.",
    );
  }
  return path;
}

async function runManager(
  command: "ensure" | "repair" | "verify" | "disable" | "explain" | "status",
  target: string,
  options: ProjectBootstrapOptions,
): Promise<{
  ok: boolean;
  data: unknown;
  error: { code: string; message: string } | null;
}> {
  const args = [managerPath(), command, target];
  if (
    options.mode &&
    (command === "ensure" || command === "repair" || command === "explain")
  ) {
    args.push("--mode", options.mode);
  }
  if (command === "disable" && options.keepProfile) {
    args.push("--keep-profile");
  }
  if (command === "ensure" && options.auto) args.push("--auto");
  const result = await runBootstrapProcess(resolveBootstrapPython(), args, {
    timeout: 260_000,
    env: {
      ...process.env,
      FORGEWRIGHT_CLI_ENTRY: resolve(process.argv[1]),
      FORGEWRIGHT_NODE: process.execPath,
    },
  });
  const output = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const last = output.at(-1);
  if (!last) {
    throw new Error(
      result.stderr.trim() || "Bootstrap manager returned no JSON result.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(last);
  } catch {
    throw new Error(
      "Bootstrap manager returned invalid JSON: " +
        (result.stderr.trim() || last.slice(-1000)),
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("ok" in parsed) ||
    !("data" in parsed) ||
    !("error" in parsed)
  ) {
    throw new Error("Bootstrap manager response contract mismatch.");
  }
  const response = parsed as {
    ok: boolean;
    data: unknown;
    error: { code: string; message: string } | null;
  };
  if (result.status !== 0 || response.ok !== true) {
    return {
      ...response,
      ok: false,
      error: response.error ?? {
        code: "manager_failed",
        message: "Bootstrap manager failed",
      },
    };
  }
  if (
    command === "verify" &&
    (typeof response.data !== "object" ||
      response.data === null ||
      (response.data as Record<string, unknown>).ok !== true ||
      (response.data as Record<string, unknown>).status !== "ready")
  ) {
    return {
      ...response,
      ok: false,
      error: {
        code: "verification_failed",
        message: "Bootstrap verification did not confirm readiness",
      },
    };
  }
  return response;
}

export function registerBootstrapCommand(program: Command): void {
  const bootstrap = program
    .command("bootstrap")
    .description(
      "Manage one-time global auto-bootstrap policy and project automation/full runtime state",
    );

  const policy = bootstrap
    .command("policy")
    .description("Manage global project auto-bootstrap consent");

  const set = policy
    .command("set")
    .description("Enable or update the one-time global bootstrap policy")
    .addOption(
      new Option("--mode <mode>", "Desired default mode")
        .choices(["plugin", "automation", "full"])
        .makeOptionMandatory(),
    )
    .addOption(
      new Option("--auto <on|off>", "Automatic project bootstrap")
        .choices(["on", "off"])
        .makeOptionMandatory(),
    )
    .option(
      "--allow-root <path...>",
      "Only bootstrap projects under these roots",
    )
    .option(
      "--deny-root <path...>",
      "Never bootstrap projects under these roots",
    )
    .option("--auto-update", "Allow source-version migration during ensure")
    .option(
      "--mcp-clients <csv>",
      "Full-mode clients to configure: codex,claude-code",
    )
    .addOption(
      new Option("--pi-policy <policy>", "Pi bootstrap policy").choices([
        "existing-subscription-only",
        "disabled",
      ]),
    )
    .option("--pi-model <model>", "Optional exact OpenAI-Codex model for Pi")
    .option("--forgewright-root <path>", "Full Forgewright runtime root")
    .option("-j, --json", "Output as JSON");

  set.action((options: PolicySetOptions) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const requestedClients = parseCsv(options.mcpClients);
      const clients = (requestedClients ??
        defaultMcpClients(options.mode)) as Array<"codex" | "claude-code">;
      if (
        clients.some((client) => client !== "codex" && client !== "claude-code")
      ) {
        throw new Error("mcp-clients supports only codex,claude-code");
      }
      const next = createBootstrapPolicy({
        mode: options.mode,
        auto: options.auto === "on",
        forgewrightRoot: options.forgewrightRoot,
        allowedRoots: options.allowRoot,
        denyRoots: options.denyRoot,
        autoUpdate: options.autoUpdate,
        mcpClients: clients,
        piPolicy: options.piPolicy,
        piModel: options.piModel ?? undefined,
      });
      const launcher = installBootstrapLauncher(next);
      saveBootstrapPolicy(next);
      writeSuccess(
        "forge.bootstrap.policy.set",
        { path: getBootstrapPolicyPath(), launcher, policy: next },
        json,
        startedAt,
      );
    } catch (error) {
      writeFailure(
        "forge.bootstrap.policy.set",
        error instanceof Error ? error.message : String(error),
        null,
        json,
        startedAt,
        EXIT_CODES.CONFIG_ERROR,
      );
    }
  });

  policy
    .command("status")
    .description("Show the global bootstrap policy")
    .option("-j, --json", "Output as JSON")
    .action((options: JsonOptions) => {
      const startedAt = Date.now();
      const json = useJson(program, options);
      try {
        const loaded = loadBootstrapPolicy();
        writeSuccess(
          "forge.bootstrap.policy.status",
          {
            path: getBootstrapPolicyPath(),
            configured: loaded !== null,
            policy: loaded,
          },
          json,
          startedAt,
        );
      } catch (error) {
        writeFailure(
          "forge.bootstrap.policy.status",
          error instanceof Error ? error.message : String(error),
          null,
          json,
          startedAt,
          EXIT_CODES.CONFIG_ERROR,
        );
      }
    });

  policy
    .command("off")
    .description("Disable automatic bootstrap without deleting project state")
    .option("-j, --json", "Output as JSON")
    .action((options: JsonOptions) => {
      const startedAt = Date.now();
      const json = useJson(program, options);
      try {
        const next = setBootstrapPolicyOff();
        writeSuccess(
          "forge.bootstrap.policy.off",
          {
            path: getBootstrapPolicyPath(),
            configured: next !== null,
            policy: next,
          },
          json,
          startedAt,
        );
      } catch (error) {
        writeFailure(
          "forge.bootstrap.policy.off",
          error instanceof Error ? error.message : String(error),
          null,
          json,
          startedAt,
          EXIT_CODES.CONFIG_ERROR,
        );
      }
    });

  bootstrap
    .command("preflight [target]")
    .description("Run the cheap local auto-bootstrap decision without mutation")
    .option("-j, --json", "Output as JSON")
    .action((target: string | undefined, options: JsonOptions) => {
      const startedAt = Date.now();
      const json = useJson(program, options);
      try {
        const data = preflightBootstrap(target ?? process.cwd());
        writeSuccess("forge.bootstrap.preflight", data, json, startedAt);
      } catch (error) {
        writeFailure(
          "forge.bootstrap.preflight",
          error instanceof Error ? error.message : String(error),
          null,
          json,
          startedAt,
          EXIT_CODES.CONFIG_ERROR,
        );
      }
    });

  for (const command of [
    "status",
    "verify",
    "explain",
    "ensure",
    "repair",
  ] as const) {
    const builder = bootstrap
      .command(command + " [target]")
      .description(
        command === "status"
          ? "Show project bootstrap state"
          : command === "verify"
            ? "Verify owned project bootstrap state and source version"
            : command === "explain"
              ? "Show planned bootstrap actions without mutation"
              : command === "repair"
                ? "Re-run owned bootstrap stages to repair drift"
                : "Ensure a project reaches automation/full mode idempotently",
      )
      .option("-j, --json", "Output as JSON");
    if (command === "ensure" || command === "repair" || command === "explain") {
      builder.addOption(
        new Option("--mode <mode>", "Override policy mode").choices([
          "automation",
          "full",
        ]),
      );
    }
    if (command === "ensure") {
      builder.option(
        "--auto",
        "Require global auto-bootstrap consent for this invocation",
      );
    }
    builder.action(
      async (target: string | undefined, options: ProjectBootstrapOptions) => {
        const startedAt = Date.now();
        const json = useJson(program, options);
        try {
          if (command === "ensure" && options.auto) {
            const decision = preflightBootstrap(target ?? process.cwd());
            if (!decision.policy_enabled || !decision.auto_enabled) {
              throw new Error(
                "Auto-bootstrap is not enabled by the global policy; explicit ensure without --auto is still available.",
              );
            }
            if (decision.action === "blocked") {
              throw new Error(
                "Auto-bootstrap is blocked by root policy: " + decision.reason,
              );
            }
            if (options.mode && options.mode !== decision.desired_mode) {
              throw new Error(
                "Automatic bootstrap cannot override the globally consented mode",
              );
            }
            if (decision.action === "none") {
              writeSuccess(
                "forge.bootstrap.ensure",
                { status: decision.state, changed: false, preflight: decision },
                json,
                startedAt,
              );
              return;
            }
          }
          const result = await runManager(
            command,
            resolve(target ?? process.cwd()),
            options,
          );
          if (!result.ok) {
            writeFailure(
              "forge.bootstrap." + command,
              result.error?.message ?? "Bootstrap operation failed",
              result.data,
              json,
              startedAt,
              EXIT_CODES.TOOL_ERROR,
            );
            return;
          }
          writeSuccess(
            "forge.bootstrap." + command,
            result.data,
            json,
            startedAt,
          );
        } catch (error) {
          writeFailure(
            "forge.bootstrap." + command,
            error instanceof Error ? error.message : String(error),
            null,
            json,
            startedAt,
            EXIT_CODES.TOOL_ERROR,
          );
        }
      },
    );
  }

  bootstrap
    .command("disable [target]")
    .description(
      "Remove project-owned Forgewright integration while preserving shared runtime",
    )
    .option("--keep-profile", "Keep project manifest/profile facts")
    .option("-j, --json", "Output as JSON")
    .action(
      async (target: string | undefined, options: ProjectBootstrapOptions) => {
        const startedAt = Date.now();
        const json = useJson(program, options);
        try {
          const result = await runManager(
            "disable",
            resolve(target ?? process.cwd()),
            options,
          );
          if (!result.ok) {
            writeFailure(
              "forge.bootstrap.disable",
              result.error?.message ?? "Bootstrap disable failed",
              result.data,
              json,
              startedAt,
            );
            return;
          }
          writeSuccess("forge.bootstrap.disable", result.data, json, startedAt);
        } catch (error) {
          writeFailure(
            "forge.bootstrap.disable",
            error instanceof Error ? error.message : String(error),
            null,
            json,
            startedAt,
          );
        }
      },
    );
}
