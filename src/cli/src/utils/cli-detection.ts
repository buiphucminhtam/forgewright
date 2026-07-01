import { spawnSync } from "child_process";

export interface CliAvailability {
  name: string;
  available: boolean;
  version?: string;
  error?: string;
}

export type SupportedCli = "claude" | "codex" | "agy";

export function checkCli(name: SupportedCli): CliAvailability {
  const result = spawnSync(name, ["--version"], {
    encoding: "utf-8",
    shell: process.platform === "win32",
    timeout: 5000,
  });

  if (result.error) {
    return {
      name,
      available: false,
      error: result.error.message,
    };
  }

  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status === 0) {
    return {
      name,
      available: true,
      version: output || "available",
    };
  }

  return {
    name,
    available: false,
    error: output || `Exited with status ${result.status}`,
  };
}

export function checkSupportedClis(): CliAvailability[] {
  return [checkCli("claude"), checkCli("codex")];
}
