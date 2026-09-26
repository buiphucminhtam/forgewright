import { spawn } from "node:child_process";

/** Supervise only the process group created for this invocation. */
export function runBootstrapProcess(command, args, options = {}) {
  const timeout = options.timeout ?? 260_000;
  const maximum = options.maximum ?? 8 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      cwd: options.cwd,
      shell: false,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let failure = null;
    let killTimer;
    let closed = false;
    const signalGroup = (signal) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") failure ??= error;
      }
    };
    const stop = (reason) => {
      if (closed || failure) return;
      failure = new Error(reason);
      signalGroup("SIGTERM");
      // Give the manager time to terminate its separately supervised adapters.
      killTimer = setTimeout(() => signalGroup("SIGKILL"), 8_000);
    };
    const onTerm = () => stop("Bootstrap interrupted by SIGTERM");
    const onInt = () => stop("Bootstrap interrupted by SIGINT");
    process.on("SIGTERM", onTerm);
    process.on("SIGINT", onInt);
    const timer = setTimeout(
      () => stop("Bootstrap process timed out"),
      timeout,
    );
    const collect = (chunk, isError) => {
      bytes += chunk.length;
      if (bytes > maximum) {
        stop("Bootstrap output exceeded safety bound");
        return;
      }
      if (isError) stderr += chunk.toString("utf8");
      else stdout += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => collect(chunk, false));
    child.stderr.on("data", (chunk) => collect(chunk, true));
    child.once("error", (error) => {
      failure = error;
    });
    child.once("close", async (status) => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      process.removeListener("SIGTERM", onTerm);
      process.removeListener("SIGINT", onInt);
      if (child.pid && process.platform !== "win32") {
        const alive = () => {
          try {
            process.kill(-child.pid, 0);
            return true;
          } catch (error) {
            return error.code !== "ESRCH";
          }
        };
        if (alive()) {
          failure ??= new Error(
            "Bootstrap adapter left an unsettled process group",
          );
          signalGroup("SIGTERM");
          const deadline = Date.now() + 2_000;
          while (alive() && Date.now() < deadline)
            await new Promise((r) => setTimeout(r, 25));
          if (alive()) {
            signalGroup("SIGKILL");
            const finalDeadline = Date.now() + 2_000;
            while (alive() && Date.now() < finalDeadline)
              await new Promise((r) => setTimeout(r, 25));
            if (alive())
              failure = new Error("Bootstrap process cleanup unconfirmed");
          }
        }
      }
      if (failure) reject(failure);
      else resolve({ status, stdout, stderr });
    });
  });
}
