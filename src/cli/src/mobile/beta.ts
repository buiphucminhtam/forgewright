import {
  constants,
  existsSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  digest,
  parse,
  resolveMobile,
  type EffectiveConfig,
} from "./contracts.js";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const label = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const Artifact = z
  .object({
    schema: z.literal("mobile-artifact/v1"),
    game_id: label,
    platform: z.enum(["android", "ios"]),
    app_id: label,
    source_revision: z.string().regex(/^[a-f0-9]{40}$/),
    config_digest: sha,
    artifact_sha256: sha,
    version: z.number().int().positive(),
    build_id: label,
  })
  .strict();
export type BetaIntent = ReturnType<typeof createBetaIntent>;
export interface BetaObservation {
  intent_id: string;
  account: string;
  app_id: string;
  destination: string;
  source_revision: string;
  config_digest: string;
  artifact_sha256: string;
  version: number;
  build_id: string;
  state: "absent" | "unknown" | "processing" | "available" | "failed";
  observed_at: string;
  expires_at?: string;
  device_install_launch_verified: boolean;
}
export interface BetaProvider {
  mode: "simulated" | "live";
  // Trusted project adapter, never a boolean loaded from the game config/file.
  verifyReadiness?: (intent: BetaIntent) => Promise<{
    intent_id: string;
    source: "runtime";
    checks: Array<{ id: string; passed: boolean; evidence_ref: string }>;
  }>;
  authorize: (intent: BetaIntent) => Promise<boolean>;
  observe: (intent: BetaIntent) => Promise<BetaObservation>;
  submit: (intent: BetaIntent) => Promise<void>;
}
const liveChecks = [
  "native_sdk",
  "purchase_sandbox",
  "privacy",
  "license_testers",
  "artifact_identity",
  "store_scope",
];
export function createBetaIntent(
  input: EffectiveConfig,
  artifactInput: unknown,
) {
  const config = resolveMobile(input.profile, input.game, input.strategy);
  const artifact = parse(Artifact, artifactInput);
  const { game, profile } = config;
  const android = artifact.platform === "android";
  const app_id = android ? game.android.app_id : game.ios.app_id;
  if (
    artifact.game_id !== game.game_id ||
    artifact.app_id !== app_id ||
    artifact.config_digest !== config.digest
  )
    throw Error("artifact_binding_mismatch");
  const destination = android
    ? ("google_play_internal_testing" as const)
    : ("testflight_internal" as const);
  if (!profile.release_policy.allowed_destinations.includes(destination))
    throw Error("beta_destination_outside_scope");
  const target = android ? game.android.track_id : game.ios.group_id;
  if (target && /^(production|default|external)$/i.test(target))
    throw Error("unsafe_beta_target");
  const binding = {
    ...artifact,
    account: android
      ? profile.accounts.google_play
      : profile.accounts.apple_team,
    destination,
    target,
    workflow_id: android ? null : game.ios.workflow_id,
  };
  return Object.freeze({
    ...binding,
    schema: "mobile-beta-intent/v1" as const,
    intent_id: digest(binding),
  });
}

export class FileBetaJournal {
  private root: string;
  constructor(root: string) {
    this.root = resolve(root);
    let ancestor = this.root;
    while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    if (
      realpathSync(ancestor) !== ancestor ||
      !lstatSync(ancestor).isDirectory()
    )
      throw Error("unsafe_beta_journal_root");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }
  lock(intent: BetaIntent): () => void {
    const appKey = digest([intent.account, intent.platform, intent.app_id]);
    const path = join(this.root, `${appKey}.lock`);
    let fd: number;
    try {
      fd = openSync(
        path,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch {
      throw Error("beta_intent_locked");
    }
    const token = randomUUID();
    writeFileSync(fd, token);
    closeSync(fd);
    const unlock = () => {
      if (readFileSync(path, "utf8") !== token)
        throw Error("beta_lock_ownership_changed");
      unlinkSync(path);
    };
    return unlock;
  }
  reserve(intent: BetaIntent): void {
    const appKey = digest([intent.account, intent.platform, intent.app_id]);
    const reservation = join(
      this.root,
      `${appKey}-${intent.version}.reservation`,
    );
    let saved: number;
    try {
      saved = openSync(
        reservation,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST")
        throw Error("unsafe_beta_version_reservation");
      saved = openSync(reservation, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (readFileSync(saved, "utf8") !== intent.intent_id)
          throw Error("beta_version_reserved_by_another_intent");
      } finally {
        closeSync(saved);
      }
      return;
    }
    try {
      writeFileSync(saved, intent.intent_id);
      fsyncSync(saved);
    } finally {
      closeSync(saved);
    }
  }
  read(intent: BetaIntent): Record<string, unknown> | null {
    const path = join(this.root, `${intent.intent_id}.json`);
    let fd: number;
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw Error("unsafe_beta_journal_file");
    }
    try {
      if (lstatSync(path).size > 1024 * 1024)
        throw Error("beta_journal_too_large");
      const value = JSON.parse(readFileSync(fd, "utf8"));
      if (value.intent_id !== intent.intent_id)
        throw Error("beta_journal_identity_mismatch");
      return value;
    } finally {
      closeSync(fd);
    }
  }
  write(
    intent: BetaIntent,
    status: string,
    mode: string,
    attempted: boolean,
  ): void {
    const path = join(this.root, `${intent.intent_id}.json`);
    const tmp = path + "." + randomUUID() + ".tmp";
    const fd = openSync(
      tmp,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(
        fd,
        JSON.stringify({
          intent_id: intent.intent_id,
          status,
          mode,
          attempted,
          updated_at: new Date().toISOString(),
        }) + "\n",
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      renameSync(tmp, path);
    } catch (error) {
      unlinkSync(tmp);
      throw error;
    }
  }
}
function validateObservation(
  intent: BetaIntent,
  observation: BetaObservation,
): void {
  const fields = [
    "intent_id",
    "account",
    "app_id",
    "destination",
    "source_revision",
    "config_digest",
    "artifact_sha256",
    "version",
    "build_id",
  ] as const;
  if (!observation || fields.some((k) => observation[k] !== intent[k]))
    throw Error("provider_observation_mismatch");
  if (
    !["absent", "unknown", "processing", "available", "failed"].includes(
      observation.state,
    )
  )
    throw Error("invalid_provider_state");
  const now = Date.now();
  const observed = Date.parse(observation.observed_at);
  const expires = observation.expires_at
    ? Date.parse(observation.expires_at)
    : null;
  if (
    !Number.isFinite(observed) ||
    observed > now ||
    (expires !== null && (!Number.isFinite(expires) || expires <= now))
  )
    throw Error("stale_or_invalid_provider_observation");
}
export async function runBetaRelease(
  config: EffectiveConfig,
  artifact: unknown,
  {
    provider,
    journal,
    signal,
  }: { provider: BetaProvider; journal: FileBetaJournal; signal?: AbortSignal },
) {
  signal?.throwIfAborted();
  const intent = createBetaIntent(config, artifact);
  if (!["live", "simulated"].includes(provider.mode))
    throw Error("invalid_provider_mode");
  if (provider.mode === "live") {
    if (!provider.verifyReadiness)
      throw Error("live_mobile_prerequisites_unverified");
    const readiness = await provider.verifyReadiness(intent);
    if (
      readiness.intent_id !== intent.intent_id ||
      readiness.source !== "runtime" ||
      liveChecks.some(
        (id) =>
          !readiness.checks.some(
            (c) => c.id === id && c.passed && c.evidence_ref,
          ),
      )
    )
      throw Error("live_mobile_prerequisites_unverified");
  }
  if (!intent.target || (intent.platform === "ios" && !intent.workflow_id))
    throw Error("beta_target_unresolved");
  const unlock = journal.lock(intent);
  const result = (status: string, observation?: BetaObservation) => ({
    intent_id: intent.intent_id,
    mode: provider.mode,
    status,
    available_to_testers:
      provider.mode === "live" && observation?.state === "available",
    simulated_available_to_testers:
      provider.mode === "simulated" && observation?.state === "available",
    device_install_launch_verified:
      provider.mode === "live" &&
      observation?.device_install_launch_verified === true,
    observed_at: observation?.observed_at ?? null,
  });
  try {
    signal?.throwIfAborted();
    if (!(await provider.authorize(intent)))
      throw Error("beta_scope_not_authorized");
    const previous = journal.read(intent);
    let observation = await provider.observe(intent);
    validateObservation(intent, observation);
    let attempted = previous?.attempted === true;
    signal?.throwIfAborted();
    if (observation.state === "unknown") {
      journal.write(intent, "outcome_unknown", provider.mode, attempted);
      return result("outcome_unknown", observation);
    }
    // Observed jobs and prior submits remain attempted even when reads regress.
    if (observation.state === "absent" && attempted) {
      journal.write(intent, "outcome_unknown", provider.mode, true);
      return result("outcome_unknown", observation);
    }
    journal.reserve(intent);
    if (observation.state === "absent") {
      attempted = true;
      journal.write(intent, "outcome_unknown", provider.mode, true);
      try {
        await provider.submit(intent);
      } catch {
        return result("outcome_unknown");
      }
      observation = await provider.observe(intent);
      validateObservation(intent, observation);
    } else {
      attempted = true;
    }
    signal?.throwIfAborted();
    const status =
      observation.state === "available"
        ? "available_to_testers"
        : observation.state === "absent" || observation.state === "unknown"
          ? "outcome_unknown"
          : observation.state;
    journal.write(intent, status, provider.mode, attempted);
    return result(status, observation);
  } finally {
    unlock();
  }
}
