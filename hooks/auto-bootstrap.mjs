#!/usr/bin/env node
import { existsSync, lstatSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { runBootstrapProcess } from "./bootstrap-process.mjs";

const MAX_INPUT = 128 * 1024;
const startedAt = Date.now();
const diagnostics = [];
process.once("exit", () => {
  if (diagnostics.length) {
    writeSync(1, JSON.stringify({
      systemMessage: "Forgewright bootstrap diagnostic: " + JSON.stringify(diagnostics),
    }) + "\n");
  }
});
function diagnostic(stage, reasonCode, detail = {}) {
  if (process.env.FORGEWRIGHT_BOOTSTRAP_DIAGNOSTICS !== "1") return;
  if (diagnostics.length >= 8) return;
  // Never include hook input, environment values, paths, or child output.
  const record = {
    schema: "forgewright-bootstrap-diagnostic/v1",
    stage, reason_code: reasonCode, elapsed_ms: Date.now() - startedAt,
    ...detail,
  };
  diagnostics.push(record);
  writeSync(2, JSON.stringify(record) + "\n");
}
function bootstrapHome() {
  const explicit = process.env.FORGEWRIGHT_BOOTSTRAP_HOME?.trim();
  if (explicit) return resolve(explicit);
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return xdg
    ? join(resolve(xdg), "forgewright")
    : join(homedir(), ".config", "forgewright");
}
function launcherPath() {
  return join(
    bootstrapHome(),
    "bin",
    process.platform === "win32" ? "forge.cmd" : "forge",
  );
}
async function runLauncher(launcher, args, timeout) {
  const stage = args[2];
  try {
    const result = await runBootstrapProcess(launcher, args, {
      timeout,
      env: { ...process.env, FORGE_DELEGATION_NOTICE: "0" },
    });
    if (result.status !== 0) {
      diagnostic(stage, "launcher_nonzero", { exit_status: result.status });
      return null;
    }
    for (const line of result.stdout.trim().split(/\r?\n/).reverse()) {
      try {
        const value = JSON.parse(line);
        if (value?.ok === true && value.data && typeof value.data === "object")
          return value;
      } catch {
        /* Ignore non-JSON progress, never infer success from it. */
      }
    }
    diagnostic(stage, "invalid_envelope");
  } catch {
    diagnostic(stage, "process_failed");
    /* Host coding remains available; never treat missing setup as ready. */
  }
  return null;
}
async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT) return null;
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
if (process.env.FORGEWRIGHT_AUTO_BOOTSTRAP_HOOK === "0") {
  diagnostic("input", "disabled");
  process.exit(0);
}
const inputTimer = setTimeout(() => {
  diagnostic("input", "input_timeout");
  process.exit(0);
}, 2_000);
const input = await readStdin();
clearTimeout(inputTimer);
if (!input || typeof input.cwd !== "string" || !input.cwd.trim()) {
  diagnostic("input", "invalid_input");
  process.exit(0);
}
const cwd = resolve(input.cwd);
const launcher = launcherPath();
if (!existsSync(launcher)) {
  diagnostic("launcher", "missing");
  process.exit(0);
}
const info = lstatSync(launcher);
if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) {
  diagnostic("launcher", "rejected");
  process.exit(0);
}
const preflight = await runLauncher(
  launcher,
  ["--json", "bootstrap", "preflight", cwd],
  3_000,
);
const decision = preflight?.data;
if (!decision || decision.action !== "ensure") {
  diagnostic("preflight", decision ? "noop" : "failed", {
    action: ["none", "blocked", "repair", "explain"].includes(decision?.action)
      ? decision.action : null,
  });
  process.exit(0);
}
const target =
  typeof decision.project_root === "string" ? decision.project_root : cwd;
diagnostic("ensure", "started");
const result = await runLauncher(
  launcher,
  ["--json", "bootstrap", "ensure", target, "--auto"],
  285_000,
);
if (result?.data?.status !== "ready") {
  diagnostic("ensure", "not_ready");
  process.stderr.write(
    "Forgewright auto-bootstrap did not confirm readiness. Inspect forge bootstrap status/explain before using local automation.\n",
  );
}
else diagnostic("ensure", "ready");
process.exit(0);
