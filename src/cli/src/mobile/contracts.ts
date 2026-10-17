import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/);
const text = z.string().min(1).max(2000);
export const destination = z.enum([
  "google_play_internal_testing",
  "testflight_internal",
]);
const binding = z
  .object({
    resolver: z.literal("runtime_binding"),
    name: z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/),
  })
  .strict();
const product = z
  .object({
    id,
    kind: z.enum(["non_consumable", "consumable"]),
    benefit: text,
    removes_ads: z.boolean(),
    store_ids: z
      .object({ google_play: id.nullable(), apple: id.nullable() })
      .strict(),
  })
  .strict();
const placement = z
  .object({
    id,
    format: z.enum(["rewarded", "interstitial"]),
    trigger: text,
    value: text,
    decline: text,
  })
  .strict();

// Canonical executable schemas: strict parsing never persists or echoes values.
export const StudioProfile = z
  .object({
    schema: z.literal("mobile-studio-profile/v1"),
    profile_id: id,
    revision: id,
    accounts: z.object({ google_play: id, apple_team: id, admob: id }).strict(),
    app_bindings: z
      .array(
        z
          .object({
            game_id: id,
            android_package: id,
            android_app_id: id,
            ios_bundle: id,
            ios_app_id: id,
          })
          .strict(),
      )
      .min(1),
    secret_refs: z
      .object({
        play_publisher: binding.optional(),
        apple_connect: binding.optional(),
        admob_provisioner: binding.optional(),
      })
      .strict(),
    release_policy: z
      .object({
        allowed_destinations: z.array(destination).min(1),
        allowed_game_ids: z.array(id).min(1),
        production_enabled: z.literal(false),
      })
      .strict(),
    ads_policy: z
      .object({
        mediation_owner: z.literal("admob"),
        network_candidates: z.array(z.enum(["meta", "unity_ads"])),
        test_ads_required: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const GameDelta = z
  .object({
    schema: z.literal("mobile-game-delta/v1"),
    game_id: id,
    studio_profile_ref: z.object({ id, revision: id }).strict(),
    engine: z.enum(["phaser4", "threejs"]),
    wrapper: z
      .object({
        kind: z.enum(["capacitor", "cordova", "custom_webview", "unverified"]),
        evidence: z.enum(["hypothesis", "observed"]),
      })
      .strict(),
    android: z
      .object({ package: id, app_id: id, track_id: id.nullable() })
      .strict(),
    ios: z
      .object({
        bundle: id,
        app_id: id,
        workflow_id: id.nullable(),
        group_id: id.nullable(),
      })
      .strict(),
    catalog: z
      .object({ products: z.array(product), placements: z.array(placement) })
      .strict(),
    ads: z
      .object({
        android_app_id: text.nullable(),
        ios_app_id: text.nullable(),
        ad_units: z.array(
          z
            .object({
              platform: z.enum(["android", "ios"]),
              placement_id: id,
              ad_unit_id: text,
              network_mappings: z.array(
                z
                  .object({
                    network: z.enum(["meta", "unity_ads"]),
                    partner_app_id: text,
                    partner_placement_id: text,
                  })
                  .strict(),
              ),
            })
            .strict(),
        ),
      })
      .strict(),
    purchase_environment: z.enum(["sandbox", "production"]),
  })
  .strict();

const evidence = z
  .object({
    id,
    kind: z.enum([
      "primary_source",
      "observed",
      "estimate",
      "hypothesis",
      "synthetic",
    ]),
    claim: text,
    source: z.string().url().optional(),
    observed_at: z.string().datetime().optional(),
    validation: text,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      ["primary_source", "observed", "estimate"].includes(v.kind) &&
      (!v.source || !v.observed_at)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "source_and_time_required",
      });
    }
  });
export const StrategyBrief = z
  .object({
    schema: z.literal("mobile-strategy/v1"),
    game_id: id,
    evidence: z.array(evidence).min(1),
    player: z
      .object({
        audience: text,
        motives: z.array(text).min(1),
        session_context: text,
        fairness_risks: z.array(text).min(1),
      })
      .strict(),
    market: z
      .object({
        countries: z.array(id).min(1),
        competition: z.array(
          z
            .object({
              name: text,
              relationship: text,
              evidence_ids: z.array(id).min(1),
            })
            .strict(),
        ),
      })
      .strict(),
    monetization: z
      .object({
        model: z.enum(["ads", "iap", "hybrid", "premium"]),
        value_hypothesis: text,
        free_path: text,
        no_ads_scope: text,
        evidence_ids: z.array(id).min(1),
      })
      .strict(),
    levels: z
      .array(
        z
          .object({
            id,
            learning_intent: text,
            fail_recovery: text,
            sources: z.array(text),
            sinks: z.array(text),
            evidence_ids: z.array(id).min(1),
          })
          .strict(),
      )
      .min(1),
    measurement: z
      .object({
        baseline: z.enum(["unmeasured", "synthetic", "observed"]),
        primary_metric: text,
        experience_guardrails: z.array(text).min(1),
        revenue_guardrails: z.array(text).min(1),
        decision_rule: text,
      })
      .strict(),
  })
  .strict();

export type Profile = z.infer<typeof StudioProfile>;
export type Game = z.infer<typeof GameDelta>;
export type Strategy = z.infer<typeof StrategyBrief>;
export type EffectiveConfig = {
  profile: Profile;
  game: Game;
  strategy: Strategy;
  digest: string;
};

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  // Zod's raw error includes caller-controlled values; expose a fixed code only.
  if (!parsed.success) throw new Error("invalid_mobile_contract");
  return parsed.data;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
export function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function resolveMobile(
  profileInput: unknown,
  gameInput: unknown,
  strategyInput: unknown,
): EffectiveConfig {
  const profile = parse(StudioProfile, profileInput);
  const game = parse(GameDelta, gameInput);
  const strategy = parse(StrategyBrief, strategyInput);
  if (profile.profile_id !== game.studio_profile_ref.id)
    throw new Error("profile_identity_mismatch");
  if (profile.revision !== game.studio_profile_ref.revision)
    throw new Error("profile_revision_mismatch");
  if (!profile.release_policy.allowed_game_ids.includes(game.game_id))
    throw new Error("game_outside_studio_scope");
  const bound = profile.app_bindings.filter((v) => v.game_id === game.game_id);
  if (
    bound.length !== 1 ||
    bound[0].android_package !== game.android.package ||
    bound[0].android_app_id !== game.android.app_id ||
    bound[0].ios_bundle !== game.ios.bundle ||
    bound[0].ios_app_id !== game.ios.app_id
  )
    throw new Error("app_binding_mismatch");
  for (const field of [
    "game_id",
    "android_package",
    "android_app_id",
    "ios_bundle",
    "ios_app_id",
  ] as const) {
    if (
      new Set(profile.app_bindings.map((v) => v[field])).size !==
      profile.app_bindings.length
    )
      throw new Error("duplicate_app_binding");
  }
  if (strategy.game_id !== game.game_id)
    throw new Error("strategy_game_mismatch");
  const placementIds = new Set(game.catalog.placements.map((v) => v.id));
  if (
    game.ads.ad_units.some(
      (v) =>
        !placementIds.has(v.placement_id) ||
        v.network_mappings.some(
          (n) => !profile.ads_policy.network_candidates.includes(n.network),
        ),
    )
  )
    throw new Error("ad_mapping_outside_scope");
  if (
    new Set(game.ads.ad_units.map((v) => `${v.platform}:${v.placement_id}`))
      .size !== game.ads.ad_units.length
  )
    throw new Error("duplicate_ad_mapping");
  for (const values of [
    game.catalog.products,
    game.catalog.placements,
    strategy.evidence,
    strategy.levels,
  ]) {
    if (new Set(values.map((v) => v.id)).size !== values.length)
      throw new Error("duplicate_semantic_identity");
  }
  const evidenceIds = new Set(strategy.evidence.map((v) => v.id));
  const refs = [
    ...strategy.market.competition,
    strategy.monetization,
    ...strategy.levels,
  ];
  if (refs.some((v) => v.evidence_ids.some((ref) => !evidenceIds.has(ref))))
    throw new Error("missing_strategy_evidence");
  if (
    strategy.measurement.baseline === "observed" &&
    !strategy.evidence.some((v) => v.kind === "observed")
  )
    throw new Error("observed_baseline_requires_evidence");
  return {
    profile,
    game,
    strategy,
    digest: digest({ profile, game, strategy }),
  };
}

export function doctorMobile(config: EffectiveConfig) {
  const { game, profile, strategy } = config;
  const assumptions = strategy.evidence
    .filter((v) => ["hypothesis", "synthetic"].includes(v.kind))
    .map((v) => ({ id: v.id, kind: v.kind, validation: v.validation }));
  // Static input never establishes authenticated account, device or SDK readiness.
  const live_blockers = [
    "native_host_unverified",
    "store_capabilities_unverified",
    "sdk_compatibility_unverified",
    "physical_device_unverified",
  ];
  if (
    game.wrapper.evidence !== "observed" ||
    game.wrapper.kind === "unverified"
  )
    live_blockers.push("wrapper_unverified");
  if (!game.android.track_id) live_blockers.push("play_track_unresolved");
  if (!game.ios.workflow_id || !game.ios.group_id)
    live_blockers.push("xcode_workflow_or_group_unresolved");
  if (!profile.secret_refs.play_publisher)
    live_blockers.push("play_binding_missing");
  if (!profile.secret_refs.apple_connect)
    live_blockers.push("apple_binding_missing");
  if (
    game.catalog.products.some(
      (p) => !p.store_ids.google_play || !p.store_ids.apple,
    )
  )
    live_blockers.push("store_product_ids_unresolved");
  if (
    ["ads", "hybrid"].includes(strategy.monetization.model) &&
    (!game.ads.android_app_id ||
      !game.ads.ios_app_id ||
      game.ads.ad_units.length === 0)
  )
    live_blockers.push("admob_app_units_unresolved");
  return {
    schema: "mobile-doctor/v1",
    game_id: game.game_id,
    engine: game.engine,
    simulation_ready: true,
    live_ready: false,
    config_digest: config.digest,
    profile: { id: profile.profile_id, revision: profile.revision },
    provenance: {
      accounts: "studio_profile",
      catalog: "game_delta",
      strategy: "per_game_brief",
      runtime_authority: "unverified",
    },
    assumptions,
    live_blockers,
    baseline: strategy.measurement.baseline,
    allowed_destinations: profile.release_policy.allowed_destinations,
  };
}
