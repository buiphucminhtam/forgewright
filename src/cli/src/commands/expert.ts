/**
 * Expert Command - Optional Claude/Codex CLI escalation controls
 */
import type { Command } from "commander";
import pc from "picocolors";
import {
  findProjectRoot,
  getProductionConfigPath,
  getScalar,
  parseBoolean,
  parseNullableString,
  readProductionConfig,
  readTopLevelBlock,
  upsertTopLevelBlock,
  writeProductionConfig,
} from "../utils/project-config.js";
import { checkCli, checkSupportedClis } from "../utils/cli-detection.js";
import {
  getTokenTrackingEnabled,
  setTokenTrackingEnabled,
} from "../utils/token-tracking.js";
import { buildEnvelope } from "../types/index.js";
import { VERSION } from "../version.js";
import { EXIT_CODES } from "../exit-codes.js";

type SupportedExpertCli = "claude" | "codex";

interface ExpertUseFor {
  planning: boolean;
  failedPlanReview: boolean;
  gates: boolean;
  securityReview: boolean;
  architectureReview: boolean;
  codeReview: boolean;
}

interface ExpertConfig {
  enabled: boolean;
  activeCli: SupportedExpertCli;
  fallbackCli: SupportedExpertCli | null;
  useFor: ExpertUseFor;
  budget: {
    maxExpertCallsPerRun: number;
    requireConfirmationAbove: number;
  };
}

const DEFAULT_EXPERT_CONFIG: ExpertConfig = {
  enabled: false,
  activeCli: "claude",
  fallbackCli: null,
  useFor: {
    planning: false,
    failedPlanReview: true,
    gates: true,
    securityReview: true,
    architectureReview: true,
    codeReview: true,
  },
  budget: {
    maxExpertCallsPerRun: 5,
    requireConfirmationAbove: 3,
  },
};

export function registerExpertCommand(program: Command): void {
  const expert = program
    .command("expert")
    .description(
      "Optional expert-mode routing through Claude CLI or Codex CLI",
    );

  expert
    .command("status")
    .description("Show expert-mode configuration and CLI availability")
    .option("-j, --json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      await handleStatus(Boolean(options.json));
    });

  expert
    .command("on")
    .description("Enable optional expert mode")
    .option("--cli <claude|codex>", "CLI to use for expert checks")
    .option("--track-tokens", "Also enable token tracking")
    .option("-j, --json", "Output as JSON")
    .action(
      async (options: {
        cli?: string;
        trackTokens?: boolean;
        json?: boolean;
      }) => {
        await handleEnable(options);
      },
    );

  expert
    .command("off")
    .description("Disable optional expert mode")
    .option("-j, --json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      await handleDisable(Boolean(options.json));
    });

  expert
    .command("use")
    .description("Switch active expert CLI")
    .argument("<cli>", "claude or codex")
    .option("--track-tokens", "Also enable token tracking")
    .option("-j, --json", "Output as JSON")
    .action(
      async (
        cli: string,
        options: { trackTokens?: boolean; json?: boolean },
      ) => {
        await handleUse(cli, options);
      },
    );

  expert
    .command("test")
    .description("Check whether the configured expert CLI is available")
    .option(
      "--cli <claude|codex>",
      "CLI to test instead of the configured active CLI",
    )
    .option("-j, --json", "Output as JSON")
    .action(async (options: { cli?: string; json?: boolean }) => {
      await handleTest(options);
    });

  expert
    .command("budget")
    .description("Set expert-mode call budget")
    .option("--max-calls <count>", "Maximum expert calls per pipeline run")
    .option(
      "--confirm-above <count>",
      "Require confirmation above this call count",
    )
    .option("-j, --json", "Output as JSON")
    .action(
      async (options: {
        maxCalls?: string;
        confirmAbove?: string;
        json?: boolean;
      }) => {
        await handleBudget(options);
      },
    );

  expert
    .command("gates")
    .description("Enable or disable expert checks for pipeline gates")
    .argument("<state>", "on or off")
    .option("-j, --json", "Output as JSON")
    .action(async (state: string, options: { json?: boolean }) => {
      await handleGates(state, Boolean(options.json));
    });
}

async function handleStatus(useJson: boolean): Promise<void> {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    expertMode: config,
    tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot),
    clis: checkSupportedClis(),
  };

  writeOutput("expert.status", data, useJson, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}

async function handleEnable(options: {
  cli?: string;
  trackTokens?: boolean;
  json?: boolean;
}): Promise<void> {
  const startTime = Date.now();
  const useJson = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);

  if (options.cli) {
    config.activeCli = parseSupportedCli(options.cli, useJson);
  }
  config.enabled = true;

  writeExpertConfig(projectRoot, config);
  if (options.trackTokens) {
    setTokenTrackingEnabled(projectRoot, true);
  }

  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    expertMode: config,
    tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot),
  };
  writeOutput("expert.on", data, useJson, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}

async function handleDisable(useJson: boolean): Promise<void> {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  config.enabled = false;
  writeExpertConfig(projectRoot, config);

  writeOutput(
    "expert.off",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config,
    },
    useJson,
    Date.now() - startTime,
  );
  process.exit(EXIT_CODES.OK);
}

async function handleUse(
  cli: string,
  options: { trackTokens?: boolean; json?: boolean },
): Promise<void> {
  const startTime = Date.now();
  const useJson = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);

  config.enabled = true;
  config.activeCli = parseSupportedCli(cli, useJson);
  writeExpertConfig(projectRoot, config);

  if (options.trackTokens) {
    setTokenTrackingEnabled(projectRoot, true);
  }

  const availability = checkCli(config.activeCli);
  writeOutput(
    "expert.use",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config,
      tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot),
      availability,
    },
    useJson,
    Date.now() - startTime,
  );
  process.exit(EXIT_CODES.OK);
}

async function handleTest(options: {
  cli?: string;
  json?: boolean;
}): Promise<void> {
  const startTime = Date.now();
  const useJson = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  const cli = options.cli
    ? parseSupportedCli(options.cli, useJson)
    : config.activeCli;
  const availability = checkCli(cli);

  if (useJson) {
    const envelope = buildEnvelope(
      "expert.test",
      { cli, availability },
      {
        ok: availability.available,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: availability.available
          ? undefined
          : {
              code: EXIT_CODES.MISSING_DEPENDENCY,
              message: `${cli} CLI is not available`,
            },
      },
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else if (availability.available) {
    console.log(pc.green(`OK: ${cli} CLI available`));
    console.log(pc.dim(availability.version || "No version output"));
  } else {
    console.error(pc.red(`Missing: ${cli} CLI is not available`));
    if (availability.error) {
      console.error(pc.dim(availability.error));
    }
  }

  process.exit(
    availability.available ? EXIT_CODES.OK : EXIT_CODES.MISSING_DEPENDENCY,
  );
}

async function handleBudget(options: {
  maxCalls?: string;
  confirmAbove?: string;
  json?: boolean;
}): Promise<void> {
  const startTime = Date.now();
  const useJson = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);

  if (options.maxCalls !== undefined) {
    config.budget.maxExpertCallsPerRun = parsePositiveInteger(
      options.maxCalls,
      "max-calls",
      useJson,
    );
  }
  if (options.confirmAbove !== undefined) {
    config.budget.requireConfirmationAbove = parsePositiveInteger(
      options.confirmAbove,
      "confirm-above",
      useJson,
    );
  }

  writeExpertConfig(projectRoot, config);
  writeOutput(
    "expert.budget",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config,
    },
    useJson,
    Date.now() - startTime,
  );
  process.exit(EXIT_CODES.OK);
}

async function handleGates(state: string, useJson: boolean): Promise<void> {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  const enabled = parseOnOff(state, useJson);

  config.useFor.gates = enabled;
  writeExpertConfig(projectRoot, config);

  writeOutput(
    "expert.gates",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      gatesEnabled: enabled,
      expertMode: config,
    },
    useJson,
    Date.now() - startTime,
  );
  process.exit(EXIT_CODES.OK);
}

function readExpertConfig(projectRoot: string): ExpertConfig {
  const content = readProductionConfig(projectRoot);
  const block = readTopLevelBlock(content, "expertMode");

  if (!block) {
    return cloneDefaultConfig();
  }

  const activeCli = parseNullableString(getScalar(block, "activeCli"));
  const fallbackCli = parseNullableString(getScalar(block, "fallbackCli"));

  return {
    enabled: parseBoolean(
      getScalar(block, "enabled"),
      DEFAULT_EXPERT_CONFIG.enabled,
    ),
    activeCli: isSupportedCli(activeCli)
      ? activeCli
      : DEFAULT_EXPERT_CONFIG.activeCli,
    fallbackCli: isSupportedCli(fallbackCli) ? fallbackCli : null,
    useFor: {
      planning: parseBoolean(
        getScalar(block, "planning"),
        DEFAULT_EXPERT_CONFIG.useFor.planning,
      ),
      failedPlanReview: parseBoolean(
        getScalar(block, "failedPlanReview"),
        DEFAULT_EXPERT_CONFIG.useFor.failedPlanReview,
      ),
      gates: parseBoolean(
        getScalar(block, "gates"),
        DEFAULT_EXPERT_CONFIG.useFor.gates,
      ),
      securityReview: parseBoolean(
        getScalar(block, "securityReview"),
        DEFAULT_EXPERT_CONFIG.useFor.securityReview,
      ),
      architectureReview: parseBoolean(
        getScalar(block, "architectureReview"),
        DEFAULT_EXPERT_CONFIG.useFor.architectureReview,
      ),
      codeReview: parseBoolean(
        getScalar(block, "codeReview"),
        DEFAULT_EXPERT_CONFIG.useFor.codeReview,
      ),
    },
    budget: {
      maxExpertCallsPerRun: parseInteger(
        getScalar(block, "maxExpertCallsPerRun"),
        DEFAULT_EXPERT_CONFIG.budget.maxExpertCallsPerRun,
      ),
      requireConfirmationAbove: parseInteger(
        getScalar(block, "requireConfirmationAbove"),
        DEFAULT_EXPERT_CONFIG.budget.requireConfirmationAbove,
      ),
    },
  };
}

function writeExpertConfig(projectRoot: string, config: ExpertConfig): void {
  const content = readProductionConfig(projectRoot);
  const block = buildExpertBlock(config);
  writeProductionConfig(
    projectRoot,
    upsertTopLevelBlock(content, "expertMode", block),
  );
}

function buildExpertBlock(config: ExpertConfig): string {
  return [
    "expertMode:",
    `  enabled: ${config.enabled ? "true" : "false"}`,
    `  activeCli: "${config.activeCli}"`,
    `  fallbackCli: ${config.fallbackCli ? `"${config.fallbackCli}"` : "null"}`,
    "  useFor:",
    `    planning: ${config.useFor.planning ? "true" : "false"}`,
    `    failedPlanReview: ${config.useFor.failedPlanReview ? "true" : "false"}`,
    `    gates: ${config.useFor.gates ? "true" : "false"}`,
    `    securityReview: ${config.useFor.securityReview ? "true" : "false"}`,
    `    architectureReview: ${config.useFor.architectureReview ? "true" : "false"}`,
    `    codeReview: ${config.useFor.codeReview ? "true" : "false"}`,
    "  budget:",
    `    maxExpertCallsPerRun: ${config.budget.maxExpertCallsPerRun}`,
    `    requireConfirmationAbove: ${config.budget.requireConfirmationAbove}`,
  ].join("\n");
}

function writeOutput<T>(
  tool: string,
  data: T,
  useJson: boolean,
  durationMs: number,
): void {
  if (useJson || !process.stdout.isTTY) {
    const envelope = buildEnvelope(tool, data, {
      ok: true,
      duration_ms: durationMs,
      version: VERSION,
    });
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  console.log();
  console.log(pc.bold(`  ${tool}`));
  console.log(pc.gray("  " + "-".repeat(50)));
  console.log(JSON.stringify(data, null, 2));
  console.log();
}

function parseSupportedCli(
  value: string,
  useJson: boolean,
): SupportedExpertCli {
  if (isSupportedCli(value)) {
    return value;
  }

  fail(`Invalid CLI "${value}". Use "claude" or "codex".`, useJson);
}

function isSupportedCli(value: string | null): value is SupportedExpertCli {
  return value === "claude" || value === "codex";
}

function parsePositiveInteger(
  value: string,
  label: string,
  useJson: boolean,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`Invalid ${label}: ${value}. Use a non-negative integer.`, useJson);
  }
  return parsed;
}

function parseInteger(value: string | null, defaultValue: number): number {
  if (value === null) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function parseOnOff(value: string, useJson: boolean): boolean {
  if (value === "on") {
    return true;
  }
  if (value === "off") {
    return false;
  }
  fail(`Invalid state "${value}". Use "on" or "off".`, useJson);
}

function cloneDefaultConfig(): ExpertConfig {
  return JSON.parse(JSON.stringify(DEFAULT_EXPERT_CONFIG)) as ExpertConfig;
}

function fail(message: string, useJson: boolean): never {
  if (useJson || !process.stdout.isTTY) {
    const envelope = buildEnvelope("expert.error", null, {
      ok: false,
      duration_ms: 0,
      version: VERSION,
      error: { code: EXIT_CODES.USAGE_ERROR, message },
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.error(pc.red(`Error: ${message}`));
  }
  process.exit(EXIT_CODES.USAGE_ERROR);
}
