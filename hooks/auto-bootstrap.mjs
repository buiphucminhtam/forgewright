#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

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

function runLauncher(launcher, args, timeout) {
  const result = spawnSync(launcher, args, {
    encoding: "utf8",
    shell: false,
    timeout,
    env: { ...process.env, FORGE_DELEGATION_NOTICE: "0" },
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return null;
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      if (value && typeof value === "object") return value;
    } catch {
      // Ignore non-JSON progress output.
    }
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
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

if (process.env.FORGEWRIGHT_AUTO_BOOTSTRAP_HOOK === "0") {
  process.exit(0);
}

const input = await readStdin();
if (!input || typeof input.cwd !== "string" || !input.cwd.trim())
  process.exit(0);
const cwd = resolve(input.cwd);
const launcher = launcherPath();
if (!existsSync(launcher)) process.exit(0);

let decision = null;
try {
  const policyPath = join(bootstrapHome(), "bootstrap-policy.json");
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (policy?.enabled && typeof policy.forgewright_root === "string") {
    const modulePath = join(
      resolve(policy.forgewright_root),
      "src",
      "cli",
      "dist",
      "bootstrap",
      "state.js",
    );
    if (existsSync(modulePath)) {
      const module = await import(pathToFileURL(modulePath).href);
      if (typeof module.preflightBootstrap === "function") {
        decision = module.preflightBootstrap(cwd);
      }
    }
  }
} catch {
  // Fall back to the launcher contract below. Invalid policy remains fail-open.
}
if (!decision) {
  const preflight = runLauncher(
    launcher,
    ["--json", "bootstrap", "preflight", cwd],
    3000,
  );
  decision = preflight?.data ?? null;
}
if (!decision || decision.action !== "ensure") process.exit(0);

runLauncher(
  launcher,
  ["--json", "bootstrap", "ensure", cwd, "--auto"],
  300_000,
);
process.exit(0);
