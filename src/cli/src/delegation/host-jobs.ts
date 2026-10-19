import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function runtimeEntry(): string {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    const entry = join(root, "scripts/runtime/host_jobs.py");
    if (existsSync(entry)) return entry;
    const parent = dirname(root);
    if (parent === root) break;
    root = parent;
  }
  throw new Error("host_job_runtime_required");
}

/** Control-plane reads acquire no slots. Finite jobs are owned by Python's
 * supervisor, whose PID remains alive through queueing, PTY yields and drain.
 */
export function runHostAction(
  project: string,
  action:
    | "run"
    | "status"
    | "disk"
    | "disable"
    | "history"
    | "inspect"
    | "register-profile",
  options: {
    profile?: string;
    digest?: string;
    request?: string;
    file?: string;
    sha256?: string;
  } = {},
): Promise<number> {
  const entry = runtimeEntry();
  const argv = [
    "-I",
    "-B",
    "-c",
    'import runpy,sys;sys.argv.pop(0);sys.path.insert(0,sys.argv.pop(0));runpy.run_path(sys.argv[0],run_name="__main__")',
    dirname(entry),
    entry,
    action,
  ];
  if (action === "run") {
    if (!options.profile || !options.digest)
      throw new Error("host_job_profile_required");
    argv.push(
      "--project",
      project,
      "--profile",
      options.profile,
      "--digest",
      options.digest,
    );
  }
  if (action === "disable") argv.push("--project", project);
  if (action === "inspect") {
    if (!options.request) throw new Error("inspection_request_required");
    argv.push("--project", project, "--request", options.request);
  }
  if (action === "register-profile") {
    if (!options.file || !options.sha256)
      throw new Error("reviewed_profile_hash_required");
    argv.push(
      "--project",
      project,
      "--file",
      options.file,
      "--sha256",
      options.sha256,
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn("python3", argv, {
      cwd: project,
      stdio: "inherit",
      shell: false,
    });
    const interrupt = (signal: NodeJS.Signals) => {
      child.kill(signal);
    };
    const onInt = () => interrupt("SIGINT");
    const onTerm = () => interrupt("SIGTERM");
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    const cleanup = () => {
      process.off("SIGINT", onInt);
      process.off("SIGTERM", onTerm);
    };
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      resolve(code ?? (signal === "SIGINT" ? 130 : 125));
    });
  });
}
