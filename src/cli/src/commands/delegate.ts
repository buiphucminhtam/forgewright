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
import { runHostAction } from "../delegation/host-jobs.js";
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
    .description("Show shared admission, pressure and queued work")
    .option(
      "--inventory",
      "Include bounded process coverage and live disk telemetry",
    )
    .option(
      "--disk",
      "Measure complete project footprint and nested build/cache candidates",
    )
    .option(
      "--disable",
      "Disable new native jobs; remove owned config when quiescent",
    )
    .option(
      "--prune-history",
      "Retire proven terminal metadata; preserve artifact data and leases",
    )
    .option(
      "--inspect <json>",
      "Bounded project read/list/search; no shell execution",
    )
    .option(
      "--register-profile <file>",
      "Install an exact owner-reviewed project recipe without running it",
    )
    .option(
      "--restage-shared <manifest>",
      "Stage an exact owner-reviewed shared runtime manifest",
    )
    .option(
      "--reconcile-quarantined <plan>",
      "Inspect or apply an owner-reviewed quarantine reconciliation plan",
    )
    .option(
      "--apply",
      "Apply the reviewed quarantine reconciliation plan after fresh census",
    )
    .option(
      "--activate",
      "Activate staged host resource controls for this project",
    )
    .option(
      "--sha256 <digest>",
      "SHA256 of the reviewed recipe or shared manifest",
    )
    .action(
      async (options: {
        inventory?: boolean;
        disk?: boolean;
        disable?: boolean;
        pruneHistory?: boolean;
        inspect?: string;
        registerProfile?: string;
        restageShared?: string;
        reconcileQuarantined?: string;
        apply?: boolean;
        activate?: boolean;
        sha256?: string;
      }) => {
        const selected = [
          options.inventory,
          options.disk,
          options.disable,
          options.pruneHistory,
          options.inspect,
          options.registerProfile,
          options.restageShared,
          options.reconcileQuarantined,
          options.activate,
        ].filter((value) => value !== undefined);
        const requiresHash =
          options.registerProfile !== undefined ||
          options.restageShared !== undefined ||
          options.reconcileQuarantined !== undefined;
        if (
          selected.length > 1 ||
          selected.includes("") ||
          (options.apply !== undefined &&
            options.reconcileQuarantined === undefined) ||
          (options.sha256 !== undefined) !== requiresHash ||
          (requiresHash && !options.sha256)
        ) {
          throw new Error("select_one_resource_action_with_required_hash");
        }
        if (options.inspect)
          process.exitCode = await runHostAction(findProjectRoot(), "inspect", {
            request: options.inspect,
          });
        else if (options.registerProfile)
          process.exitCode = await runHostAction(
            findProjectRoot(),
            "register-profile",
            { file: options.registerProfile, sha256: options.sha256 },
          );
        else if (options.restageShared)
          process.exitCode = await runHostAction(
            findProjectRoot(),
            "restage-shared",
            { manifest: options.restageShared, sha256: options.sha256 },
          );
        else if (options.reconcileQuarantined)
          process.exitCode = await runHostAction(
            findProjectRoot(),
            "reconcile-quarantined",
            {
              plan: options.reconcileQuarantined,
              sha256: options.sha256,
              apply: Boolean(options.apply),
            },
          );
        else if (options.activate)
          process.exitCode = await runHostAction(findProjectRoot(), "activate");
        else if (options.disable)
          process.exitCode = await runHostAction(findProjectRoot(), "disable");
        else if (options.pruneHistory)
          process.exitCode = await runHostAction(findProjectRoot(), "history");
        else if (options.disk)
          process.exitCode = await runHostAction(findProjectRoot(), "disk");
        else if (options.inventory)
          process.exitCode = await runHostAction(findProjectRoot(), "status");
        else await piAction(findProjectRoot(), "resources");
      },
    );

  delegate
    .command("exec")
    .description(
      "Run an explicitly installed finite profile through host admission",
    )
    .requiredOption("--profile <id>", "Reviewed finite profile ID")
    .requiredOption("--digest <sha256>", "Exact installed profile digest")
    .action(async (options: { profile: string; digest: string }) => {
      process.exitCode = await runHostAction(findProjectRoot(), "run", options);
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
