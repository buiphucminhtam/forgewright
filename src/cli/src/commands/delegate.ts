import { existsSync } from "node:fs";
import type { Command } from "commander";
import pc from "picocolors";
import {
  buildDelegationBlock,
  formatDelegationNotice,
  readDelegationConfig,
  resolveDelegationActivation,
  type DelegationActivation,
  type DelegationEnabled,
} from "../delegation/auto-activation.js";
import { resolveContractPath, runAgyWorker } from "../delegation/agy-worker.js";
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

export function registerDelegateCommand(program: Command): void {
  const delegate = program
    .command("delegate")
    .description("Auto-detect controller and delegate implementation to Agy");

  delegate
    .command("status")
    .description("Show auto-delegation state")
    .option("-j, --json", "Output as JSON")
    .action((options: { json?: boolean }) => {
      const startTime = Date.now();
      const projectRoot = findProjectRoot();
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
      .action((options: { json?: boolean }) => {
        handleSetMode(mode, Boolean(options.json));
      });
  }

  delegate
    .command("model")
    .description("Set the Agy worker model")
    .argument("<model>", "Agy model name")
    .option("-j, --json", "Output as JSON")
    .action((model: string, options: { json?: boolean }) => {
      handleSetModel(model, Boolean(options.json));
    });

  delegate
    .command("run")
    .description("Run an approved Task Contract with the auto-detected worker")
    .requiredOption("--contract <path>", "Path to CONTRACT.json")
    .action(async (options: { contract: string }) => {
      await handleRun(options.contract);
    });
}

export function resolveCurrentDelegation(
  projectRoot = findProjectRoot(),
): DelegationActivation {
  const config = readDelegationConfig(readProductionConfig(projectRoot));
  return resolveDelegationActivation({
    config,
    workerAvailable: checkCli(config.workerCli).available,
  });
}

export function maybeNotifyAutoDelegation(
  argv: string[] = process.argv,
  environment: Record<string, string | undefined> = process.env,
): DelegationActivation {
  const activation = resolveCurrentDelegation();
  const isModeMutation =
    argv.includes("delegate") &&
    argv.some((argument) => ["auto", "on", "off", "model"].includes(argument));
  const notice = formatDelegationNotice(activation);

  if (
    notice &&
    !isModeMutation &&
    environment.FORGE_DELEGATION_NOTICE !== "0"
  ) {
    process.stderr.write(`${pc.cyan("ℹ")} ${notice}\n`);
  }
  return activation;
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

async function handleRun(contract: string): Promise<never> {
  const projectRoot = findProjectRoot();
  const activation = resolveCurrentDelegation(projectRoot);
  if (!activation.active) {
    process.stderr.write(
      `${pc.yellow("Delegation inactive:")} ${activation.reason}. Running on the controller is required.\n`,
    );
    process.exit(EXIT_CODES.MISSING_DEPENDENCY);
  }

  let contractPath: string;
  try {
    contractPath = resolveContractPath(projectRoot, contract);
  } catch (error) {
    process.stderr.write(`${pc.red("Invalid contract:")} ${String(error)}\n`);
    process.exit(EXIT_CODES.USAGE_ERROR);
  }
  if (!existsSync(contractPath)) {
    process.stderr.write(`${pc.red("Missing contract:")} ${contractPath}\n`);
    process.exit(EXIT_CODES.USAGE_ERROR);
  }

  process.stderr.write(
    `${pc.cyan("ℹ")} Delegating approved contract to ${activation.workerCli} / ${activation.model}\n`,
  );
  try {
    const result = await runAgyWorker({
      contractPath,
      model: activation.model,
      sandbox: true,
    });
    process.exit(result.exitCode ?? EXIT_CODES.TOOL_ERROR);
  } catch (error) {
    process.stderr.write(`${pc.red("Worker failed:")} ${String(error)}\n`);
    process.exit(EXIT_CODES.TOOL_ERROR);
  }
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
