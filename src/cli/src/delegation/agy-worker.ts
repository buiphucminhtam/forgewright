import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

export interface AgyWorkerOptions {
  model: string;
  contractFileName: string;
  sandbox: boolean;
}

export interface AgyWorkerResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export function buildAgyArgs(options: AgyWorkerOptions): string[] {
  if (!options.sandbox) {
    throw new Error("AGY delegation requires sandbox mode");
  }
  if (
    options.model.startsWith("-") ||
    options.model.includes("--dangerously-skip-permissions")
  ) {
    throw new Error("Invalid AGY model value");
  }

  const args = ["--model", options.model];
  args.push("--sandbox", "--mode", "accept-edits");
  args.push(
    "--print",
    `Read WORKER_INSTRUCTIONS.md and ${options.contractFileName}, execute only the contracted task, run its verification commands, and write DELIVERY.json.`,
  );
  return args;
}

function isWithin(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
  );
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function commandPointsToGate(
  command: string,
  baseDirectory: string,
  containmentRoot: string,
): boolean {
  const match = command
    .trim()
    .match(
      /^(?:bash\s+)?(?:"([^"]*antigravity-pre-tool-gate\.sh)"|'([^']*antigravity-pre-tool-gate\.sh)'|([^\s"']*antigravity-pre-tool-gate\.sh))$/,
    );
  const configuredPath = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!configuredPath) return false;

  const gatePath = isAbsolute(configuredPath)
    ? resolve(configuredPath)
    : resolve(baseDirectory, configuredPath);
  if (!existsSync(gatePath)) return false;

  try {
    const realGatePath = realpathSync(gatePath);
    const realContainmentRoot = realpathSync(containmentRoot);
    return (
      isWithin(realContainmentRoot, realGatePath) &&
      statSync(realGatePath).isFile()
    );
  } catch {
    return false;
  }
}

function hasValidPolicyHook(
  document: Record<string, unknown> | undefined,
  baseDirectory: string,
  containmentRoot: string,
): boolean {
  const policy = readObject(document?.["forgewright-policy"]);
  const preToolUse = policy?.["PreToolUse"];
  return (
    policy !== undefined &&
    policy["enabled"] !== false &&
    Array.isArray(preToolUse) &&
    preToolUse.some((groupValue) => {
      const group = readObject(groupValue);
      if (group?.["matcher"] !== "*" || !Array.isArray(group["hooks"])) {
        return false;
      }
      return group["hooks"].some((handlerValue) => {
        const handler = readObject(handlerValue);
        const command = handler?.["command"];
        return (
          (handler?.["type"] === undefined || handler["type"] === "command") &&
          typeof command === "string" &&
          commandPointsToGate(command, baseDirectory, containmentRoot)
        );
      });
    })
  );
}

export function findValidAgyPolicyHook(
  workspaceRoot: string,
  contractDirectory: string,
): string {
  const resolvedRoot = realpathSync(resolve(workspaceRoot));
  let current = realpathSync(resolve(contractDirectory));
  if (!isWithin(resolvedRoot, current)) {
    throw new Error("Contract must be inside the project workspace");
  }

  while (isWithin(resolvedRoot, current)) {
    const hooksPath = join(current, ".agents", "hooks.json");
    if (existsSync(hooksPath)) {
      let document: Record<string, unknown> | undefined;
      try {
        const realHooksPath = realpathSync(hooksPath);
        if (!isWithin(resolvedRoot, realHooksPath)) {
          throw new Error("Hook configuration escapes the workspace");
        }
        document = readObject(JSON.parse(readFileSync(realHooksPath, "utf8")));
      } catch {
        throw new Error(`Invalid AGY policy hook configuration: ${hooksPath}`);
      }

      if (!hasValidPolicyHook(document, resolvedRoot, resolvedRoot)) {
        throw new Error(`Invalid AGY policy hook configuration: ${hooksPath}`);
      }
      return hooksPath;
    }
    if (current === resolvedRoot) break;
    current = dirname(current);
  }

  throw new Error(
    "AGY delegation requires an enabled forgewright-policy PreToolUse hook",
  );
}

export function findValidAgyGlobalPolicyHook(
  homeDirectory = homedir(),
): string {
  const resolvedHome = realpathSync(resolve(homeDirectory));
  const hooksPath = join(resolvedHome, ".gemini", "config", "hooks.json");
  if (!existsSync(hooksPath)) {
    throw new Error(
      "AGY delegation requires the global forgewright-policy hook",
    );
  }
  try {
    const realHooksPath = realpathSync(hooksPath);
    if (!isWithin(resolvedHome, realHooksPath)) {
      throw new Error("Global hook configuration escapes the home directory");
    }
    const document = readObject(
      JSON.parse(readFileSync(realHooksPath, "utf8")),
    );
    if (!hasValidPolicyHook(document, resolvedHome, resolvedHome)) {
      throw new Error("invalid global hook");
    }
    return realHooksPath;
  } catch {
    throw new Error(
      `Invalid AGY global policy hook configuration: ${hooksPath}`,
    );
  }
}

export function resolveContractPath(
  projectRoot: string,
  contractPath: string,
): string {
  const resolvedRoot = resolve(projectRoot);
  const resolvedContract = isAbsolute(contractPath)
    ? resolve(contractPath)
    : resolve(resolvedRoot, contractPath);
  const pathFromRoot = relative(resolvedRoot, resolvedContract);

  if (
    pathFromRoot === "" ||
    pathFromRoot.startsWith("..") ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error("Contract must be inside the project workspace");
  }
  return resolvedContract;
}

export async function runAgyWorker(input: {
  contractPath: string;
  model: string;
  projectRoot: string;
  homeDirectory?: string;
  sandbox?: boolean;
}): Promise<AgyWorkerResult> {
  const resolvedContract = realpathSync(input.contractPath);
  const resolvedRoot = realpathSync(input.projectRoot);
  if (!isWithin(resolvedRoot, resolvedContract)) {
    throw new Error("Contract must be inside the project workspace");
  }
  const worktreePath = dirname(resolvedContract);
  findValidAgyPolicyHook(resolvedRoot, worktreePath);
  findValidAgyGlobalPolicyHook(input.homeDirectory);
  const args = buildAgyArgs({
    model: input.model,
    contractFileName: basename(resolvedContract),
    sandbox: input.sandbox !== false,
  });

  return await new Promise<AgyWorkerResult>((resolveResult, reject) => {
    const worker = spawn("agy", args, {
      cwd: worktreePath,
      env: { ...process.env, FORGEWRIGHT_WORKSPACE: resolvedRoot },
      shell: false,
      stdio: ["ignore", "inherit", "inherit"],
    });
    worker.once("error", reject);
    worker.once("exit", (exitCode, signal) => {
      resolveResult({ exitCode, signal });
    });
  });
}
