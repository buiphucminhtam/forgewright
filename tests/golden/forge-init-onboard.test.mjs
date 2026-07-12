import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliPath = join(repoRoot, "src/cli/dist/index.js");
const fixtureRoot = mkdtempSync(join(tmpdir(), "forgewright-golden-"));
const startedAt = Date.now();

function runForge(...args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...process.env, FORGE_DELEGATION_NOTICE: "0" },
  });
  assert.equal(result.stderr, "", result.stderr);
  assert.notEqual(result.stdout, "", "forge must emit a JSON envelope");
  return { ...result, envelope: JSON.parse(result.stdout) };
}

function assertEnvelope(result, tool, ok = true) {
  const expectedStatus = ok ? 0 : result.envelope.error.code;
  assert.equal(result.status, expectedStatus, result.stdout);
  assert.equal(result.envelope.ok, ok);
  assert.equal(result.envelope.tool, tool);
  assert.equal(typeof result.envelope.metadata.duration_ms, "number");
  assert.equal(typeof result.envelope.metadata.version, "string");
}

try {
  execFileSync("npm", ["--prefix", "src/cli", "run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });

  const target = join(fixtureRoot, "sample-app");
  mkdirSync(target, { recursive: true });

  const init = runForge("--json", "init", target);
  assertEnvelope(init, "forge.init");
  assert.equal(init.envelope.data.status, "created");
  assert.deepEqual(readdirSync(join(target, ".forgewright")), ["project.json"]);
  const manifestPath = join(target, ".forgewright", "project.json");
  const manifestBytes = readFileSync(manifestPath, "utf8");

  const initAgain = runForge("--json", "init", target);
  assertEnvelope(initAgain, "forge.init");
  assert.equal(initAgain.envelope.data.status, "already_exists");
  assert.equal(readFileSync(manifestPath, "utf8"), manifestBytes);

  writeFileSync(manifestPath, "{\"sentinel\":true}\n");
  const forcedInit = runForge("--json", "init", target, "--force");
  assertEnvelope(forcedInit, "forge.init");
  assert.equal(forcedInit.envelope.data.status, "overwritten");
  assert.equal(readFileSync(manifestPath, "utf8"), manifestBytes);

  const missingManifestTarget = join(fixtureRoot, "missing-manifest");
  mkdirSync(missingManifestTarget, { recursive: true });
  const missingManifest = runForge("--json", "onboard", missingManifestTarget);
  assertEnvelope(missingManifest, "forge.onboard", false);
  assert.equal(missingManifest.envelope.error.code, 3);
  assert.equal(missingManifest.envelope.error.details.reason, "MANIFEST_REQUIRED");

  mkdirSync(join(target, ".git"));
  writeFileSync(
    join(target, "package.json"),
    JSON.stringify({ name: "sample-app", scripts: { test: "vitest run" } }),
  );
  writeFileSync(join(target, "package-lock.json"), "{}\n");

  const onboard = runForge("--json", "onboard", target);
  assertEnvelope(onboard, "forge.onboard");
  assert.equal(onboard.envelope.data.status, "created");
  const profilePath = join(target, ".forgewright", "project-profile.json");
  const profileBytes = readFileSync(profilePath, "utf8");
  assert.deepEqual(JSON.parse(profileBytes), {
    schema_version: 1,
    facts: {
      git_present: true,
      package_json_present: true,
      lockfiles: ["package-lock.json"],
      declared_test_script: "vitest run",
    },
  });

  const onboardAgain = runForge("--json", "onboard", target);
  assertEnvelope(onboardAgain, "forge.onboard");
  assert.equal(onboardAgain.envelope.data.status, "already_exists");
  assert.equal(readFileSync(profilePath, "utf8"), profileBytes);

  writeFileSync(profilePath, "{\"sentinel\":true}\n");
  const protectedOnboard = runForge("--json", "onboard", target);
  assertEnvelope(protectedOnboard, "forge.onboard");
  assert.equal(protectedOnboard.envelope.data.status, "already_exists");
  assert.equal(readFileSync(profilePath, "utf8"), "{\"sentinel\":true}\n");

  const forcedOnboard = runForge("--json", "onboard", target, "--force");
  assertEnvelope(forcedOnboard, "forge.onboard");
  assert.equal(forcedOnboard.envelope.data.status, "overwritten");
  assert.equal(readFileSync(profilePath, "utf8"), profileBytes);

  assert.equal(existsSync(manifestPath), true);
  const guide = readFileSync(
    join(repoRoot, "docs/guides/forge-init-onboard.md"),
    "utf8",
  );
  assert.match(guide, /forge --json init \./);
  assert.match(guide, /forge --json onboard \./);
  assert.ok(Date.now() - startedAt < 10 * 60 * 1000, "golden path exceeded 10 minutes");
  console.log("golden path passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
