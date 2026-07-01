import { spawn } from "node:child_process";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

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
  const args = ["--print", "--model", options.model];
  if (options.sandbox) {
    args.push("--sandbox");
  }
  args.push(
    `Read WORKER_INSTRUCTIONS.md and ${options.contractFileName}, execute only the contracted task, run its verification commands, and write DELIVERY.json.`,
  );
  return args;
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
  sandbox?: boolean;
}): Promise<AgyWorkerResult> {
  const worktreePath = dirname(input.contractPath);
  const args = buildAgyArgs({
    model: input.model,
    contractFileName: basename(input.contractPath),
    sandbox: input.sandbox !== false,
  });

  return await new Promise<AgyWorkerResult>((resolveResult, reject) => {
    const worker = spawn("agy", args, {
      cwd: worktreePath,
      shell: false,
      stdio: ["ignore", "inherit", "inherit"],
    });
    worker.once("error", reject);
    worker.once("exit", (exitCode, signal) => {
      resolveResult({ exitCode, signal });
    });
  });
}
