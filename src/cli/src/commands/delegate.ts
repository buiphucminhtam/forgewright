import { Option, type Command } from "commander";
import pc from "picocolors";
import {
  buildDelegationBlock,
  readDelegationConfig,
  resolveDelegationActivation,
  type DelegationActivation,
  type DelegationEnabled,
} from "../delegation/auto-activation.js";
import { EXIT_CODES } from "../exit-codes.js";
import { buildEnvelope } from "../types/index.js";
import { checkCli } from "../utils/cli-detection.js";
import {
  findProjectRoot,
  getProductionConfigPath,
  readProductionConfig,
  upsertTopLevelBlock,
  writeProductionConfig,
} from "../utils/project-config.js";
import { VERSION } from "../version.js";
import {
  hasPiConfig,
  readCanonicalDelegationMode,
  piAction,
  type PiOptions,
} from "../delegation/pi-worker.js";

export function registerDelegateCommand(program: Command): void {
  const delegate = program
    .command("delegate")
    .description("Delegate approved work to an explicitly configured worker");

  delegate
    .command("status")
    .description("Show auto-delegation state")
    .option("-j, --json", "Output as JSON")
    .addOption(new Option("--worker <worker>", "Worker").choices(["pi", "agy"]))
    .action(async (options: PiOptions) => {
      const startTime = Date.now();
      const projectRoot = findProjectRoot();
      if (
        options.worker === "pi" ||
        (!options.worker && hasPiConfig(projectRoot))
      ) {
        await piAction(projectRoot, "status", options);
        return;
      }
      const activation = resolveCurrentDelegation(projectRoot);
      writeStatusOutput(
        activation,
        projectRoot,
        Boolean(options.json),
        Date.now() - startTime,
      );
      process.exit(EXIT_CODES.OK);
    });

  for (const mode of ["auto", "on", "off"] as const) {
    delegate
      .command(mode)
      .description(
        `${mode === "auto" ? "Auto-detect and enable" : mode === "on" ? "Force enable" : "Disable"} delegation mode`,
      )
      .option("-j, --json", "Output as JSON")
      .addOption(
        new Option("--worker <worker>", "Worker").choices(["pi", "agy"]),
      )
      .addOption(
        new Option("--provider <provider>", "Pi provider").choices([
          "current",
          "openai-codex",
          "local",
        ]),
      )
      .addOption(
        new Option("--auth-source <source>", "Read-only OAuth source").choices([
          "codex",
          "pi",
        ]),
      )
      .option("--model <model>", "Exact provider model ID")
      .option("--endpoint <url>", "Explicit loopback /v1 local endpoint")
      .action(async (options: PiOptions) => {
        const root = findProjectRoot();
        if (options.worker === "pi" || (!options.worker && hasPiConfig(root))) {
          await piAction(root, mode, options);
          return;
        }
        handleSetMode(mode, Boolean(options.json));
      });
  }

  delegate
    .command("model")
    .description("Set the selected worker model")
    .argument("<model>", "Exact model name")
    .option("-j, --json", "Output as JSON")
    .addOption(new Option("--worker <worker>", "Worker").choices(["pi", "agy"]))
    .action(async (model: string, options: PiOptions) => {
      if (
        options.worker === "pi" ||
        (!options.worker && hasPiConfig(findProjectRoot()))
      ) {
        await piAction(findProjectRoot(), "model", { model });
        return;
      }
      handleSetModel(model, Boolean(options.json));
    });

  delegate
    .command("resources")
    .description("Show machine-wide Pi admission, pressure and queued work")
    .action(async () => {
      await piAction(findProjectRoot(), "resources");
    });

  delegate
    .command("cancel")
    .description("Close Pi run admission and request cancellation")
    .argument("<runId>", "Pi run ID")
    .action(async (runId: string) => {
      await piAction(findProjectRoot(), "cancel", { runId });
    });

  delegate
    .command("run")
    .description("Run an approved Task Contract with the auto-detected worker")
    .requiredOption("--contract <path>", "Path to CONTRACT.json")
    .addOption(
      new Option("--worker <worker>", "Explicit worker, no fallback").choices([
        "pi",
        "agy",
      ]),
    )
    .action(async (options: { contract: string; worker?: string }) => {
      if (
        options.worker === "pi" ||
        (!options.worker && hasPiConfig(findProjectRoot()))
      ) {
        await piAction(findProjectRoot(), "run", options);
        return;
      }
      // This governed entrypoint must not silently spawn a legacy worker outside
      // host admission. The legacy adapter remains available for its existing
      // integrations, but lacks the descendant/quiescence contract required here.
      console.error(
        JSON.stringify({
          worker: "agy",
          ready: false,
          error: "worker_host_admission_unsupported",
          message:
            "The governed delegate run entrypoint currently supports Pi. Configure --worker pi; no ungoverned fallback was started.",
        }),
      );
      process.exitCode = EXIT_CODES.MISSING_DEPENDENCY;
    });
}

export function resolveCurrentDelegation(
  projectRoot = findProjectRoot(),
): DelegationActivation {
  const config = readDelegationConfig(readProductionConfig(projectRoot));
  const canonical = readCanonicalDelegationMode(projectRoot);
  if (canonical?.enabled === false || canonical?.enabled === "off")
    config.enabled = "off";
  if (hasPiConfig(projectRoot))
    return resolveDelegationActivation({
      config: { ...config, enabled: "off" },
      workerAvailable: false,
    });
  return resolveDelegationActivation({
    config,
    // Retained legacy settings do not confer readiness for managed execution.
    workerAvailable: false,
  });
}

export function maybeNotifyAutoDelegation(
  _argv: string[] = process.argv,
  environment: Record<string, string | undefined> = process.env,
): DelegationActivation {
  // Startup notices are advisory, not worker admission. A standalone/relocated
  // core CLI must not load the optional Pi runtime just to run init or bench.
  // Explicit delegate commands perform their own selected-worker checks.
  return resolveDelegationActivation({
    config: {
      ...readDelegationConfig(readProductionConfig(findProjectRoot())),
      enabled: "off",
    },
    environment,
    workerAvailable: false,
  });
}

function handleSetMode(mode: DelegationEnabled, useJson: boolean): never {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readDelegationConfig(readProductionConfig(projectRoot));
  config.enabled = mode;
  persistConfig(projectRoot, config);
  const activation = resolveCurrentDelegation(projectRoot);
  writeStatusOutput(activation, projectRoot, useJson, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}

function handleSetModel(model: string, useJson: boolean): never {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readDelegationConfig(readProductionConfig(projectRoot));
  config.model = model;
  persistConfig(projectRoot, config);
  const activation = resolveCurrentDelegation(projectRoot);
  writeStatusOutput(activation, projectRoot, useJson, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}

function persistConfig(
  projectRoot: string,
  config: ReturnType<typeof readDelegationConfig>,
): void {
  writeProductionConfig(
    projectRoot,
    upsertTopLevelBlock(
      readProductionConfig(projectRoot),
      "delegationMode",
      buildDelegationBlock(config),
    ),
  );
}

function writeStatusOutput(
  activation: DelegationActivation,
  projectRoot: string,
  useJson: boolean,
  durationMs: number,
): void {
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    delegationMode: activation,
    worker: checkCli("agy"),
    ready: false,
    readinessReason: "worker_host_admission_unsupported",
    readinessScope:
      "Legacy settings remain configurable; governed delegate run requires the Pi worker.",
  };

  if (useJson || !process.stdout.isTTY) {
    console.log(
      JSON.stringify(
        buildEnvelope("delegate.status", data, {
          ok: true,
          duration_ms: durationMs,
          version: VERSION,
        }),
        null,
        2,
      ),
    );
    return;
  }

  const state = activation.active ? pc.green("ACTIVE") : pc.yellow("INACTIVE");
  console.log(`Delegation: ${state}`);
  console.log(`Controller: ${activation.controller}`);
  console.log(`Worker: ${activation.workerCli} / ${activation.model}`);
  console.log(`Reason: ${activation.reason}`);
}
