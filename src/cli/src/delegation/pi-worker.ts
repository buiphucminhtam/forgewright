import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

export interface PiOptions {
  worker?: string;
  provider?: string;
  model?: string;
  authSource?: string;
  endpoint?: string;
  json?: boolean;
}

/** A legacy worker without cross-process admission/cleanup cannot bypass caps.
 * Keep its lower-level compatibility library unchanged; public dispatch fails
 * explicitly until a managed adapter exists instead of spawning outside policy.
 */
export function requireManagedWorker(worker: string): void {
  if (worker !== "pi") throw new Error("pi_legacy_worker_not_managed");
}

export function readCanonicalDelegationMode(
  projectRoot: string,
): { enabled?: unknown; worker?: { cli?: "pi" | "agy" } } | undefined {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    const filename = join(root, "integrations/pi/project-config.cjs");
    if (existsSync(filename)) {
      const { readProjectYaml } = createRequire(import.meta.url)(filename);
      return readProjectYaml(projectRoot)
        .get("delegationMode", true)
        ?.toJSON?.();
    }
    const parent = dirname(root);
    if (parent === root) break;
    root = parent;
  }
  throw new Error("pi_package_runtime_required");
}

export function hasPiConfig(projectRoot: string): boolean {
  const mode = readCanonicalDelegationMode(projectRoot);
  const configured = mode?.worker?.cli;
  if (!configured && (mode?.enabled === false || mode?.enabled === "off"))
    return false;
  return configured
    ? configured === "pi"
    : existsSync(join(projectRoot, ".forgewright/pi-worker.json"));
}

/** Resolve the installed/submodule package from this module, never from consumer cwd. */
export async function loadPiRuntime(): Promise<any> {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    const entry = join(root, "integrations/pi/worker-runtime.mjs");
    if (existsSync(entry)) return import(pathToFileURL(entry).href);
    const parent = dirname(root);
    if (parent === root) break;
    root = parent;
  }
  throw new Error("pi_package_runtime_required");
}

export async function piAction(
  projectRoot: string,
  action: string,
  options: PiOptions & { contract?: string; runId?: string } = {},
): Promise<void> {
  try {
    const runtime = await loadPiRuntime();
    let result;
    if (action === "on" || action === "model")
      result = await runtime.configureWorker(projectRoot, options);
    else if (action === "off") {
      const { readWorkerConfig, writeWorkerConfig } = await import(
        pathToFileURL(
          join(runtime.packageRoot, "integrations/pi/runtime-state.mjs"),
        ).href
      );
      writeWorkerConfig(projectRoot, {
        ...readWorkerConfig(projectRoot),
        enabled: false,
      });
      result = await runtime.workerStatus(projectRoot);
    } else if (action === "auto")
      throw new Error("pi_explicit_enable_required");
    else if (action === "status")
      result = await runtime.workerStatus(projectRoot);
    else if (action === "resources") {
      const governor = await import(
        pathToFileURL(
          join(runtime.packageRoot, "integrations/pi/host-governor.mjs"),
        ).href
      );
      result = await governor.getHostAdmissionStatus();
    } else if (action === "cancel")
      result = runtime.cancelRun(projectRoot, options.runId);
    else if (action === "run") {
      const abort = new AbortController();
      const stop = () => abort.abort();
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      try {
        result = await runtime.runWorker({
          projectRoot,
          contractPath: options.contract,
          signal: abort.signal,
          onStarted: (run: unknown) =>
            process.stderr.write(`${JSON.stringify(run)}\n`),
        });
      } finally {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
      }
      if (result.status !== "finished") process.exitCode = 1;
    } else throw new Error("pi_unknown_action");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message =
      error instanceof Error && /^pi_[a-z0-9_]+$/.test(error.message)
        ? error.message
        : "pi_runtime_failed";
    console.error(JSON.stringify({ worker: "pi", error: message }));
    process.exitCode = 1;
  }
}
