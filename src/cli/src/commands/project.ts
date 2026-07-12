/**
 * Project-local initialization and onboarding commands.
 *
 * These commands deliberately persist only deterministic filesystem facts so
 * their output is portable, reproducible, and safe to re-run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { EXIT_CODES } from "../exit-codes.js";
import { buildEnvelope } from "../types/index.js";
import { VERSION } from "../version.js";

const PROJECT_DIR = ".forgewright";
const PROJECT_MANIFEST = "project.json";
const PROJECT_PROFILE = "project-profile.json";
const LOCKFILES = [
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
] as const;

type ProjectOptions = { force?: boolean; json?: boolean };

export function registerProjectCommands(program: Command): void {
  program
    .command("init [target]")
    .description("Create a project-local Forgewright manifest")
    .option("-f, --force", "Overwrite an existing manifest")
    .option("-j, --json", "Output as JSON")
    .action((target: string | undefined, options: ProjectOptions) => {
      handleInit(target, options, Boolean(program.opts().json));
    });

  program
    .command("onboard [target]")
    .description("Record deterministic filesystem facts for a project")
    .option("-f, --force", "Overwrite an existing project profile")
    .option("-j, --json", "Output as JSON")
    .action((target: string | undefined, options: ProjectOptions) => {
      handleOnboard(target, options, Boolean(program.opts().json));
    });
}

function handleInit(
  targetInput: string | undefined,
  options: ProjectOptions,
  globalJson: boolean,
): void {
  const startedAt = Date.now();
  const target = resolve(targetInput ?? process.cwd());
  const manifestPath = join(target, PROJECT_DIR, PROJECT_MANIFEST);

  if (existsSync(manifestPath) && !options.force) {
    writeResult(
      "forge.init",
      { path: manifestPath, status: "already_exists" },
      options.json || globalJson,
      startedAt,
    );
    return;
  }

  mkdirSync(join(target, PROJECT_DIR), { recursive: true });
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ schema_version: 1 }, null, 2)}\n`,
  );
  writeResult(
    "forge.init",
    {
      path: manifestPath,
      status:
        existsSync(manifestPath) && options.force ? "overwritten" : "created",
    },
    options.json || globalJson,
    startedAt,
  );
}

function handleOnboard(
  targetInput: string | undefined,
  options: ProjectOptions,
  globalJson: boolean,
): void {
  const startedAt = Date.now();
  const target = resolve(targetInput ?? process.cwd());
  const manifestPath = join(target, PROJECT_DIR, PROJECT_MANIFEST);
  const profilePath = join(target, PROJECT_DIR, PROJECT_PROFILE);

  if (!existsSync(manifestPath)) {
    writeError(
      "forge.onboard",
      { path: manifestPath },
      options.json || globalJson,
      startedAt,
      "Project manifest is required; run forge init first.",
      "MANIFEST_REQUIRED",
    );
    return;
  }

  if (existsSync(profilePath) && !options.force) {
    writeResult(
      "forge.onboard",
      { path: profilePath, status: "already_exists" },
      options.json || globalJson,
      startedAt,
    );
    return;
  }

  const profile = buildProjectProfile(target);
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  writeResult(
    "forge.onboard",
    {
      path: profilePath,
      status: options.force ? "overwritten" : "created",
      facts: profile.facts,
    },
    options.json || globalJson,
    startedAt,
  );
}

function buildProjectProfile(target: string): {
  schema_version: number;
  facts: {
    git_present: boolean;
    package_json_present: boolean;
    lockfiles: string[];
    declared_test_script: string | null;
  };
} {
  const packagePath = join(target, "package.json");
  const packageJsonPresent = existsSync(packagePath);
  let declaredTestScript: string | null = null;

  if (packageJsonPresent) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "scripts" in parsed &&
        typeof parsed.scripts === "object" &&
        parsed.scripts !== null &&
        "test" in parsed.scripts &&
        typeof parsed.scripts.test === "string"
      ) {
        declaredTestScript = parsed.scripts.test;
      }
    } catch {
      // An unreadable package.json does not establish a declared test script.
    }
  }

  return {
    schema_version: 1,
    facts: {
      git_present: existsSync(join(target, ".git")),
      package_json_present: packageJsonPresent,
      lockfiles: LOCKFILES.filter((lockfile) =>
        existsSync(join(target, lockfile)),
      ),
      declared_test_script: declaredTestScript,
    },
  };
}

function writeResult(
  tool: "forge.init" | "forge.onboard",
  data: Record<string, unknown>,
  useJson: boolean | undefined,
  startedAt: number,
): void {
  const envelope = buildEnvelope(tool, data, {
    ok: true,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
  });
  if (useJson || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
  } else {
    process.stdout.write(`${pc.green("✓")} ${data.status}: ${data.path}\n`);
  }
}

function writeError(
  tool: "forge.onboard",
  data: Record<string, unknown>,
  useJson: boolean | undefined,
  startedAt: number,
  message: string,
  reason: string,
): void {
  const envelope = buildEnvelope(tool, data, {
    ok: false,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
    error: { code: EXIT_CODES.CONFIG_ERROR, message, details: { reason } },
  });
  if (useJson || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
  } else {
    process.stderr.write(`${pc.red("Error:")} ${message}\n`);
  }
  process.exitCode = EXIT_CODES.CONFIG_ERROR;
}
