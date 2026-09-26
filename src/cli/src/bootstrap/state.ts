import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

export const BOOTSTRAP_POLICY_SCHEMA = "forgewright-bootstrap-policy/v1";
export const BOOTSTRAP_STATE_SCHEMA = "forgewright-project-bootstrap/v1";
export const BOOTSTRAP_MODES = ["plugin", "automation", "full"] as const;
export type BootstrapMode = (typeof BOOTSTRAP_MODES)[number];
export type BootstrapStatus =
  | "unmanaged"
  | "pending"
  | "bootstrapping"
  | "ready"
  | "degraded"
  | "blocked"
  | "rolling_back";

export interface BootstrapPolicy {
  schema: typeof BOOTSTRAP_POLICY_SCHEMA;
  enabled: boolean;
  auto: boolean;
  mode: BootstrapMode;
  forgewright_root: string;
  allowed_roots: string[];
  deny_roots: string[];
  auto_update: boolean;
  mcp_clients: Array<"codex" | "claude-code">;
  pi_policy: "existing-subscription-only" | "disabled";
  pi_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface OwnershipReceipt {
  path: string;
  stage: string;
  before_exists: boolean;
  before_sha256: string | null;
  before_base64: string | null;
  after_sha256: string;
}

export interface ExternalReceipt {
  kind: string;
  id?: string;
  status: string;
  detail?: string;
}

export interface BootstrapProjectState {
  schema: typeof BOOTSTRAP_STATE_SCHEMA;
  mode: BootstrapMode;
  status: BootstrapStatus;
  source_commit: string;
  project_root_digest: string;
  owned_paths: OwnershipReceipt[];
  external_config_receipts: ExternalReceipt[];
  components: Record<string, string>;
  last_verified_at: string | null;
  last_error: string | null;
}

export interface BootstrapPreflight {
  project_root: string;
  is_repository: boolean;
  policy_enabled: boolean;
  auto_enabled: boolean;
  desired_mode: BootstrapMode | null;
  current_mode: BootstrapMode | null;
  state: BootstrapStatus;
  action: "none" | "ensure" | "blocked";
  reason:
    | "not_repository"
    | "policy_missing"
    | "policy_disabled"
    | "plugin_mode"
    | "auto_disabled"
    | "root_denied"
    | "root_not_allowed"
    | "project_unmanaged"
    | "project_disabled"
    | "mode_upgrade_required"
    | "source_changed"
    | "source_changed_manual"
    | "state_degraded"
    | "state_blocked"
    | "state_busy"
    | "state_not_ready"
    | "ready";
  source_commit: string | null;
  target_command: string | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRoot(input: string): string {
  const absolute = resolve(input);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  return parent === absolute
    ? absolute
    : join(normalizeRoot(parent), basename(absolute));
}

// Canonicalize the trusted root before calling this; do not resolve links inside it.
function assertSafeBootstrapPath(path: string): void {
  let current = path;
  while (true) {
    try {
      const info = lstatSync(current);
      if (
        info.isSymbolicLink() ||
        (current !== path && !info.isDirectory()) ||
        (current === path && (!info.isFile() || info.nlink > 1))
      ) {
        throw new Error(
          "Unsafe bootstrap state file or symlink ancestry: " + path,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function isUnder(root: string, parent: string): boolean {
  const normalizedRoot = normalizeRoot(root);
  const normalizedParent = normalizeRoot(parent);
  return (
    normalizedRoot === normalizedParent ||
    normalizedRoot.startsWith(
      normalizedParent + (process.platform === "win32" ? "\\" : "/"),
    )
  );
}

export function getBootstrapHome(): string {
  const explicit = process.env.FORGEWRIGHT_BOOTSTRAP_HOME?.trim();
  if (explicit) return normalizeRoot(explicit);
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return xdg
    ? normalizeRoot(join(xdg, "forgewright"))
    : normalizeRoot(join(homedir(), ".config", "forgewright"));
}

export function getBootstrapPolicyPath(): string {
  return join(getBootstrapHome(), "bootstrap-policy.json");
}

export function getBootstrapRegistryPath(): string {
  return join(getBootstrapHome(), "registry.json");
}

export function getBootstrapLauncherPath(): string {
  return join(
    getBootstrapHome(),
    "bin",
    process.platform === "win32" ? "forge.cmd" : "forge",
  );
}

function shellSingleQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

export function resolveBootstrapPython(): string {
  const configured = process.env.FORGEWRIGHT_BOOTSTRAP_PYTHON?.trim();
  const candidates = configured ? [configured] : ["python3", "python"];
  for (const candidate of candidates) {
    const probe = spawnSync(
      candidate,
      [
        "-I",
        "-c",
        "import json,sys; import tomllib; assert sys.version_info >= (3,11); print(json.dumps(sys.executable))",
      ],
      { encoding: "utf8", shell: false, timeout: 3_000 },
    );
    if (probe.error || probe.status !== 0) continue;
    try {
      const executable: unknown = JSON.parse(probe.stdout.trim());
      if (
        typeof executable === "string" &&
        isAbsolute(executable) &&
        existsSync(executable) &&
        !/[\r\n\0]/.test(executable)
      )
        return executable;
    } catch {
      /* Never infer a usable interpreter from invalid probe output. */
    }
  }
  throw new Error(
    "Python 3.11+ with tomllib is required. Re-run bootstrap policy set from the configured shared-runtime environment.",
  );
}

function bootstrapGitDirectory(): string | null {
  // Apple's /usr/bin/git is a developer-tool shim. Resolve its selected Git
  // once at opt-in, just as the launcher pins Node/Python, not on each prompt.
  if (process.platform !== "darwin") return null;
  const selected = (process.env.PATH ?? "")
    .split(":")
    .map((directory) => join(directory, "git"))
    .find((candidate) => existsSync(candidate));
  if (!selected || realpathSync(selected) !== "/usr/bin/git") return null;
  const probe = spawnSync("/usr/bin/xcrun", ["--find", "git"], {
    encoding: "utf8",
    shell: false,
    timeout: 3000,
  });
  const executable = probe.status === 0 ? probe.stdout.trim() : "";
  return isAbsolute(executable) &&
    !/[\r\n\0]/.test(executable) &&
    existsSync(executable)
    ? dirname(executable)
    : null;
}

export function installBootstrapLauncher(policy: BootstrapPolicy): string {
  const cliEntry = join(
    policy.forgewright_root,
    "src",
    "cli",
    "dist",
    "index.js",
  );
  if (!existsSync(cliEntry)) {
    throw new Error(
      "Built Forge CLI is required at " +
        cliEntry +
        "; run npm run build:cli once in the shared Forgewright runtime.",
    );
  }
  const lightEntry = join(dirname(cliEntry), "bootstrap-entry.js");
  // Older shared runtimes remain usable until their CLI is rebuilt.
  const launcherEntry = existsSync(lightEntry) ? lightEntry : cliEntry;
  const python = policy.mode === "plugin" ? null : resolveBootstrapPython();
  const gitDirectory = bootstrapGitDirectory();
  const pinnedPath = [
    dirname(process.execPath),
    ...(python ? [dirname(python)] : []),
    ...(gitDirectory ? [gitDirectory] : []),
  ].join(process.platform === "win32" ? ";" : ":");
  const launcher = getBootstrapLauncherPath();
  assertSafeBootstrapPath(launcher);
  mkdirSync(dirname(launcher), { recursive: true, mode: 0o700 });
  const content =
    process.platform === "win32"
      ? "@echo off\r\nsetlocal DisableDelayedExpansion\r\n" +
        (python
          ? 'set "FORGEWRIGHT_BOOTSTRAP_PYTHON=' +
            python.replaceAll("%", "%%") +
            '"\r\n'
          : "") +
        'set "PATH=' +
        pinnedPath.replaceAll("%", "%%") +
        ';%PATH%"\r\n' +
        '"' +
        process.execPath.replaceAll("%", "%%") +
        '" "' +
        launcherEntry.replaceAll("%", "%%") +
        '" %*\r\n'
      : "#!/bin/sh\n" +
        (python
          ? "export FORGEWRIGHT_BOOTSTRAP_PYTHON=" +
            shellSingleQuote(python) +
            "\n"
          : "") +
        "export PATH=" +
        shellSingleQuote(pinnedPath) +
        ':"${PATH:-/usr/bin:/bin}"\nexec ' +
        shellSingleQuote(process.execPath) +
        " " +
        shellSingleQuote(launcherEntry) +
        ' "$@"\n';
  assertSafeBootstrapPath(launcher);
  const temporary = launcher + "." + randomBytes(8).toString("hex") + ".tmp";
  writeFileSync(temporary, content, {
    encoding: "utf8",
    mode: 0o700,
    flag: "wx",
  });
  renameSync(temporary, launcher);
  if (process.platform !== "win32") chmodSync(launcher, 0o700);
  return launcher;
}

export function getProjectBootstrapPath(projectRoot: string): string {
  return join(normalizeRoot(projectRoot), ".forgewright", "bootstrap.json");
}

function ancestorForgewrightRoot(input: string): string | null {
  let current = normalizeRoot(input);
  while (true) {
    if (
      existsSync(join(current, "package.json")) &&
      existsSync(join(current, "skills")) &&
      existsSync(join(current, "scripts"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveForgewrightRoot(input?: string): string {
  const candidates = [
    input,
    process.env.FORGEWRIGHT_ROOT,
    dirname(fileURLToPath(import.meta.url)),
    process.cwd(),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const root = ancestorForgewrightRoot(candidate);
    if (root) return root;
  }
  throw new Error(
    "Forgewright root not found. Set FORGEWRIGHT_ROOT or run from a full Forgewright installation.",
  );
}

export function currentForgewrightCommit(root: string): string | null {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
    timeout: 1500,
    shell: false,
  });
  const value = result.status === 0 ? result.stdout.trim() : "";
  return /^[0-9a-f]{40}$/.test(value) ? value : null;
}

function safeJsonRead(path: string, maximum = 1024 * 1024): unknown {
  assertSafeBootstrapPath(path);
  if (!existsSync(path)) return null;
  const info = lstatSync(path);
  if (
    info.isSymbolicLink() ||
    info.nlink > 1 ||
    !info.isFile() ||
    info.size > maximum
  ) {
    throw new Error("Unsafe bootstrap state file: " + path);
  }
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(field + " must be an array of strings");
  }
  return value;
}

function parseMode(value: unknown): BootstrapMode {
  if (
    typeof value !== "string" ||
    !BOOTSTRAP_MODES.includes(value as BootstrapMode)
  ) {
    throw new Error("Invalid bootstrap mode: " + String(value));
  }
  return value as BootstrapMode;
}

export function loadBootstrapPolicy(
  path = getBootstrapPolicyPath(),
): BootstrapPolicy | null {
  const raw = safeJsonRead(path, 128 * 1024);
  if (raw === null) return null;
  if (typeof raw !== "object" || raw === null)
    throw new Error("Bootstrap policy must be an object");
  const value = raw as Record<string, unknown>;
  if (value.schema !== BOOTSTRAP_POLICY_SCHEMA)
    throw new Error("Bootstrap policy schema mismatch");
  if (typeof value.enabled !== "boolean" || typeof value.auto !== "boolean") {
    throw new Error("Bootstrap policy enabled/auto must be booleans");
  }
  const clients = stringArray(value.mcp_clients, "mcp_clients");
  if (clients.some((item) => item !== "codex" && item !== "claude-code")) {
    throw new Error("Unsupported MCP client in bootstrap policy");
  }
  if (
    value.pi_policy !== "existing-subscription-only" &&
    value.pi_policy !== "disabled"
  ) {
    throw new Error("Unsupported Pi policy");
  }
  if (
    typeof value.forgewright_root !== "string" ||
    !isAbsolute(value.forgewright_root)
  ) {
    throw new Error("forgewright_root must be absolute");
  }
  if (
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string" ||
    typeof value.auto_update !== "boolean" ||
    !(typeof value.pi_model === "string" || value.pi_model === null)
  ) {
    throw new Error("Bootstrap policy fields are malformed");
  }
  return {
    schema: BOOTSTRAP_POLICY_SCHEMA,
    enabled: value.enabled,
    auto: value.auto,
    mode: parseMode(value.mode),
    forgewright_root: normalizeRoot(value.forgewright_root),
    allowed_roots: stringArray(value.allowed_roots, "allowed_roots").map(
      normalizeRoot,
    ),
    deny_roots: stringArray(value.deny_roots, "deny_roots").map(normalizeRoot),
    auto_update: value.auto_update,
    mcp_clients: clients as Array<"codex" | "claude-code">,
    pi_policy: value.pi_policy,
    pi_model: value.pi_model,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

export function loadProjectBootstrapState(
  projectRoot: string,
): BootstrapProjectState | null {
  const path = getProjectBootstrapPath(projectRoot);
  const raw = safeJsonRead(path);
  if (raw === null) return null;
  if (typeof raw !== "object" || raw === null)
    throw new Error("Bootstrap state must be an object");
  const value = raw as Record<string, unknown>;
  if (value.schema !== BOOTSTRAP_STATE_SCHEMA)
    throw new Error("Bootstrap state schema mismatch");
  parseMode(value.mode);
  const statuses: BootstrapStatus[] = [
    "unmanaged",
    "pending",
    "bootstrapping",
    "ready",
    "degraded",
    "blocked",
    "rolling_back",
  ];
  if (
    typeof value.status !== "string" ||
    !statuses.includes(value.status as BootstrapStatus)
  ) {
    throw new Error("Invalid bootstrap project status");
  }
  if (
    typeof value.source_commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.source_commit) ||
    typeof value.project_root_digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.project_root_digest) ||
    !Array.isArray(value.owned_paths) ||
    !Array.isArray(value.external_config_receipts) ||
    typeof value.components !== "object" ||
    value.components === null ||
    !(
      typeof value.last_verified_at === "string" ||
      value.last_verified_at === null
    ) ||
    !(typeof value.last_error === "string" || value.last_error === null)
  ) {
    throw new Error("Malformed bootstrap project state");
  }
  if (value.project_root_digest !== projectRootDigest(projectRoot)) {
    throw new Error("Foreign bootstrap state: project root digest mismatch");
  }
  return value as unknown as BootstrapProjectState;
}

function atomicWriteJson(path: string, value: unknown): void {
  assertSafeBootstrapPath(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (existsSync(path)) {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || info.nlink > 1 || !info.isFile()) {
      throw new Error("Refusing unsafe bootstrap path: " + path);
    }
  }
  const temporary = join(
    dirname(path),
    "." +
      basename(path) +
      "." +
      process.pid +
      "." +
      randomBytes(6).toString("hex") +
      ".tmp",
  );
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n", "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  try {
    const directoryFd = openSync(dirname(path), "r");
    try {
      fsyncSync(directoryFd);
    } finally {
      closeSync(directoryFd);
    }
  } catch {
    // Directory fsync is not supported uniformly; file fsync + rename remains atomic.
  }
}

export function saveBootstrapPolicy(policy: BootstrapPolicy): void {
  atomicWriteJson(getBootstrapPolicyPath(), policy);
}

export function createBootstrapPolicy(input: {
  mode: BootstrapMode;
  auto: boolean;
  forgewrightRoot?: string;
  allowedRoots?: string[];
  denyRoots?: string[];
  autoUpdate?: boolean;
  mcpClients?: Array<"codex" | "claude-code">;
  piPolicy?: "existing-subscription-only" | "disabled";
  piModel?: string | null;
  previous?: BootstrapPolicy | null;
}): BootstrapPolicy {
  const now = new Date().toISOString();
  const root = resolveForgewrightRoot(input.forgewrightRoot);
  const previous = input.previous ?? loadBootstrapPolicy();
  return {
    schema: BOOTSTRAP_POLICY_SCHEMA,
    enabled: true,
    auto: input.mode === "plugin" ? false : input.auto,
    mode: input.mode,
    forgewright_root: root,
    allowed_roots: (input.allowedRoots ?? previous?.allowed_roots ?? []).map(
      normalizeRoot,
    ),
    deny_roots: (input.denyRoots ?? previous?.deny_roots ?? []).map(
      normalizeRoot,
    ),
    auto_update: input.autoUpdate ?? previous?.auto_update ?? false,
    mcp_clients: input.mcpClients ?? previous?.mcp_clients ?? [],
    pi_policy:
      input.piPolicy ?? previous?.pi_policy ?? "existing-subscription-only",
    pi_model:
      input.piModel === undefined
        ? (previous?.pi_model ?? null)
        : input.piModel,
    created_at: previous?.created_at ?? now,
    updated_at: now,
  };
}

export function setBootstrapPolicyOff(): BootstrapPolicy | null {
  const previous = loadBootstrapPolicy();
  if (!previous) return null;
  const next = {
    ...previous,
    enabled: false,
    auto: false,
    updated_at: new Date().toISOString(),
  };
  saveBootstrapPolicy(next);
  return next;
}

function findRepositoryRoot(start: string): string | null {
  let current = normalizeRoot(start);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function rank(mode: BootstrapMode): number {
  return mode === "plugin" ? 0 : mode === "automation" ? 1 : 2;
}

export function projectRootDigest(projectRoot: string): string {
  return sha256(normalizeRoot(projectRoot));
}

export function preflightBootstrap(target = process.cwd()): BootstrapPreflight {
  const repository = findRepositoryRoot(target);
  if (!repository) {
    return {
      project_root: normalizeRoot(target),
      is_repository: false,
      policy_enabled: false,
      auto_enabled: false,
      desired_mode: null,
      current_mode: null,
      state: "unmanaged",
      action: "none",
      reason: "not_repository",
      source_commit: null,
      target_command: null,
    };
  }
  const policy = loadBootstrapPolicy();
  const base = {
    project_root: repository,
    is_repository: true,
    policy_enabled: Boolean(policy?.enabled),
    auto_enabled: Boolean(policy?.auto),
    desired_mode: policy?.mode ?? null,
  };
  if (!policy) {
    return {
      ...base,
      current_mode: null,
      state: "unmanaged",
      action: "none",
      reason: "policy_missing",
      source_commit: null,
      target_command: null,
    };
  }
  const state = loadProjectBootstrapState(repository);
  const sourceCommit = currentForgewrightCommit(policy.forgewright_root);
  if (!policy.enabled) {
    return {
      ...base,
      current_mode: state?.mode ?? null,
      state: state?.status ?? "unmanaged",
      action: "none",
      reason: "policy_disabled",
      source_commit: sourceCommit,
      target_command: null,
    };
  }
  if (policy.deny_roots.some((root) => isUnder(repository, root))) {
    return {
      ...base,
      current_mode: state?.mode ?? null,
      state: "blocked",
      action: "blocked",
      reason: "root_denied",
      source_commit: sourceCommit,
      target_command: null,
    };
  }
  if (
    policy.allowed_roots.length > 0 &&
    !policy.allowed_roots.some((root) => isUnder(repository, root))
  ) {
    return {
      ...base,
      current_mode: state?.mode ?? null,
      state: "blocked",
      action: "blocked",
      reason: "root_not_allowed",
      source_commit: sourceCommit,
      target_command: null,
    };
  }
  const targetCommand =
    "forge bootstrap ensure " + JSON.stringify(repository) + " --auto --json";
  if (policy.mode === "plugin") {
    return {
      ...base,
      current_mode: state?.mode ?? null,
      state: state?.status ?? "unmanaged",
      action: "none",
      reason: "plugin_mode",
      source_commit: sourceCommit,
      target_command: null,
    };
  }
  if (!policy.auto) {
    return {
      ...base,
      current_mode: state?.mode ?? null,
      state: state?.status ?? "unmanaged",
      action: "none",
      reason: "auto_disabled",
      source_commit: sourceCommit,
      target_command: null,
    };
  }
  const disabled = safeJsonRead(
    join(
      getBootstrapHome(),
      "disabled",
      projectRootDigest(repository) + ".json",
    ),
  );
  if (disabled !== null) {
    if (
      typeof disabled !== "object" ||
      !disabled ||
      (disabled as Record<string, unknown>).schema !==
        "forgewright-bootstrap-disabled/v1" ||
      (disabled as Record<string, unknown>).project_root_digest !==
        projectRootDigest(repository)
    ) {
      throw new Error("Invalid project disable receipt");
    }
    return {
      ...base,
      current_mode: state?.mode ?? null,
      state: state?.status ?? "unmanaged",
      action: "none",
      reason: "project_disabled",
      source_commit: sourceCommit,
      target_command: null,
    };
  }
  if (!state) {
    return {
      ...base,
      current_mode: null,
      state: "unmanaged",
      action: "ensure",
      reason: "project_unmanaged",
      source_commit: sourceCommit,
      target_command: targetCommand,
    };
  }
  if (state.status === "degraded") {
    return {
      ...base,
      current_mode: state.mode,
      state: state.status,
      action: "none",
      reason: "state_degraded",
      source_commit: sourceCommit,
      target_command:
        "forge bootstrap repair " + JSON.stringify(repository) + " --json",
    };
  }
  if (state.status === "blocked" || state.status === "rolling_back") {
    return {
      ...base,
      current_mode: state.mode,
      state: state.status,
      action: "blocked",
      reason: "state_blocked",
      source_commit: sourceCommit,
      target_command:
        "forge bootstrap explain " + JSON.stringify(repository) + " --json",
    };
  }
  if (state.status === "bootstrapping") {
    return {
      ...base,
      current_mode: state.mode,
      state: state.status,
      action: "blocked",
      reason: "state_busy",
      source_commit: sourceCommit,
      target_command: null,
    };
  }
  if (state.status !== "ready") {
    return {
      ...base,
      current_mode: state.mode,
      state: state.status,
      action: "ensure",
      reason: "state_not_ready",
      source_commit: sourceCommit,
      target_command: targetCommand,
    };
  }
  if (rank(state.mode) < rank(policy.mode)) {
    return {
      ...base,
      current_mode: state.mode,
      state: state.status,
      action: "ensure",
      reason: "mode_upgrade_required",
      source_commit: sourceCommit,
      target_command: targetCommand,
    };
  }
  if (sourceCommit && state.source_commit !== sourceCommit) {
    return {
      ...base,
      current_mode: state.mode,
      state: state.status,
      action: policy.auto_update ? "ensure" : "none",
      reason: policy.auto_update ? "source_changed" : "source_changed_manual",
      source_commit: sourceCommit,
      target_command: policy.auto_update ? targetCommand : null,
    };
  }
  return {
    ...base,
    current_mode: state.mode,
    state: state.status,
    action: "none",
    reason: "ready",
    source_commit: sourceCommit,
    target_command: null,
  };
}

export function bootstrapModeRank(mode: BootstrapMode): number {
  return rank(mode);
}

export function isBootstrapRootAllowed(
  projectRoot: string,
  policy: BootstrapPolicy,
): boolean {
  if (policy.deny_roots.some((root) => isUnder(projectRoot, root)))
    return false;
  return (
    policy.allowed_roots.length === 0 ||
    policy.allowed_roots.some((root) => isUnder(projectRoot, root))
  );
}
