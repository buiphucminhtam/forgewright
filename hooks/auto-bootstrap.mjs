#!/usr/bin/env node
import { existsSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { runBootstrapProcess } from "./bootstrap-process.mjs";

const MAX_INPUT = 128 * 1024;
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
  try {
    const result = await runBootstrapProcess(launcher, args, {
      timeout,
      env: { ...process.env, FORGE_DELEGATION_NOTICE: "0" },
    });
    if (result.status !== 0) return null;
    for (const line of result.stdout.trim().split(/\r?\n/).reverse()) {
      try {
        const value = JSON.parse(line);
        if (value?.ok === true && value.data && typeof value.data === "object")
          return value;
      } catch {
        /* Ignore non-JSON progress, never infer success from it. */
      }
    }
  } catch {
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
if (process.env.FORGEWRIGHT_AUTO_BOOTSTRAP_HOOK === "0") process.exit(0);
const inputTimer = setTimeout(() => process.exit(0), 2_000);
const input = await readStdin();
clearTimeout(inputTimer);
if (!input || typeof input.cwd !== "string" || !input.cwd.trim())
  process.exit(0);
const cwd = resolve(input.cwd);
const launcher = launcherPath();
if (!existsSync(launcher)) process.exit(0);
const info = lstatSync(launcher);
if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) process.exit(0);
const preflight = await runLauncher(
  launcher,
  ["--json", "bootstrap", "preflight", cwd],
  3_000,
);
const decision = preflight?.data;
if (!decision || decision.action !== "ensure") process.exit(0);
const target =
  typeof decision.project_root === "string" ? decision.project_root : cwd;
const result = await runLauncher(
  launcher,
  ["--json", "bootstrap", "ensure", target, "--auto"],
  285_000,
);
if (result?.data?.status !== "ready") {
  process.stderr.write(
    "Forgewright auto-bootstrap did not confirm readiness. Inspect forge bootstrap status/explain before using local automation.\n",
  );
}
process.exit(0);
