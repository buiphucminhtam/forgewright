import {
  getScalar,
  parseBoolean,
  readTopLevelBlock,
} from "../utils/project-config.js";

export type ControllerCli = "codex" | "claude" | "unknown";
export type ConfiguredController = Exclude<ControllerCli, "unknown"> | "auto";
export type DelegationEnabled = "auto" | "on" | "off";

export interface DelegationConfig {
  enabled: DelegationEnabled;
  controller: ConfiguredController;
  workerCli: "agy";
  model: string;
  notify: boolean;
}

export type DelegationReason =
  | "auto-enabled"
  | "enabled"
  | "disabled"
  | "controller-undetected"
  | "worker-unavailable";

export interface DelegationActivation {
  active: boolean;
  autoEnabled: boolean;
  controller: ControllerCli;
  workerCli: "agy";
  model: string;
  notify: boolean;
  reason: DelegationReason;
}

export const DEFAULT_DELEGATION_CONFIG: DelegationConfig = {
  enabled: "auto",
  controller: "auto",
  workerCli: "agy",
  model: "Gemini 3.5 Flash (High)",
  notify: true,
};

export function readDelegationConfig(content: string): DelegationConfig {
  const block = readTopLevelBlock(content, "delegationMode");
  if (!block) {
    return { ...DEFAULT_DELEGATION_CONFIG };
  }

  return {
    enabled: parseEnabled(getScalar(block, "enabled")),
    controller: parseController(getScalar(block, "controller")),
    workerCli: "agy",
    model: getScalar(block, "model") || DEFAULT_DELEGATION_CONFIG.model,
    notify: parseBoolean(
      getScalar(block, "notify"),
      DEFAULT_DELEGATION_CONFIG.notify,
    ),
  };
}

export function buildDelegationBlock(config: DelegationConfig): string {
  return [
    "delegationMode:",
    `  enabled: ${config.enabled}`,
    `  controller: ${config.controller}`,
    "  worker:",
    `    cli: ${config.workerCli}`,
    `    model: "${config.model.replaceAll('"', '\\"')}"`,
    `  notify: ${config.notify ? "true" : "false"}`,
  ].join("\n");
}

export function detectControllerCli(
  environment: Record<string, string | undefined> = process.env,
): ControllerCli {
  const explicit = environment.FORGE_CONTROLLER_CLI?.toLowerCase();
  if (explicit === "codex" || explicit === "claude") {
    return explicit;
  }

  const hasCodexSignal = Boolean(
    environment.CODEX_THREAD_ID ||
    environment.CODEX_CI ||
    environment.CODEX_SANDBOX,
  );
  const hasClaudeSignal = Boolean(
    environment.CLAUDECODE ||
    environment.CLAUDE_CODE_ENTRYPOINT ||
    environment.CLAUDE_SESSION_ID ||
    environment.CLAUDE_PROJECT_DIR,
  );

  if (hasCodexSignal === hasClaudeSignal) {
    return "unknown";
  }
  return hasCodexSignal ? "codex" : "claude";
}

export function resolveDelegationActivation(input: {
  config: DelegationConfig;
  environment?: Record<string, string | undefined>;
  workerAvailable: boolean;
}): DelegationActivation {
  const controller =
    input.config.controller === "auto"
      ? detectControllerCli(input.environment)
      : input.config.controller;
  const base = {
    controller,
    workerCli: input.config.workerCli,
    model: input.config.model,
    notify: input.config.notify,
  } as const;

  if (input.config.enabled === "off") {
    return {
      ...base,
      active: false,
      autoEnabled: false,
      reason: "disabled",
    };
  }
  if (controller === "unknown") {
    return {
      ...base,
      active: false,
      autoEnabled: false,
      reason: "controller-undetected",
    };
  }
  if (!input.workerAvailable) {
    return {
      ...base,
      active: false,
      autoEnabled: false,
      reason: "worker-unavailable",
    };
  }

  const autoEnabled = input.config.enabled === "auto";
  return {
    ...base,
    active: true,
    autoEnabled,
    reason: autoEnabled ? "auto-enabled" : "enabled",
  };
}

export function formatDelegationNotice(
  activation: DelegationActivation,
): string | null {
  if (!activation.active || !activation.notify) {
    return null;
  }
  const activationLabel = activation.autoEnabled ? "auto-enabled" : "enabled";
  return `Delegation ${activationLabel}: ${activation.controller} controller -> ${activation.workerCli} / ${activation.model} worker`;
}

function parseEnabled(value: string | null): DelegationEnabled {
  if (value === null) {
    return DEFAULT_DELEGATION_CONFIG.enabled;
  }
  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "on") {
    return "on";
  }
  if (normalized === "false" || normalized === "off") {
    return "off";
  }
  return normalized === "auto" ? "auto" : DEFAULT_DELEGATION_CONFIG.enabled;
}

function parseController(value: string | null): ConfiguredController {
  const normalized = value?.toLowerCase();
  if (normalized === "codex" || normalized === "claude") {
    return normalized;
  }
  return "auto";
}
