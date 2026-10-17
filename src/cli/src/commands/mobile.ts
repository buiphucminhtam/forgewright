import type { Command } from "commander";
import {
  StudioProfile,
  doctorMobile,
  parse,
  resolveMobile,
} from "../mobile/contracts.js";
import { initMobile, readJson } from "../mobile/files.js";
import { buildEnvelope } from "../types/index.js";
import { VERSION } from "../version.js";
import { EXIT_CODES } from "../exit-codes.js";
import { createBetaIntent } from "../mobile/beta.js";

function output(tool: string, operation: () => unknown) {
  const start = Date.now();
  try {
    const data = operation();
    process.stdout.write(
      JSON.stringify(
        buildEnvelope(tool, data, {
          ok: true,
          duration_ms: Date.now() - start,
          version: VERSION,
        }),
      ) + "\n",
    );
  } catch (error) {
    const known =
      error instanceof Error && /^[a-z_]+$/.test(error.message)
        ? error.message
        : "mobile_input_or_operation_failed";
    process.stdout.write(
      JSON.stringify(
        buildEnvelope(tool, null, {
          ok: false,
          duration_ms: Date.now() - start,
          version: VERSION,
          error: { code: EXIT_CODES.TOOL_ERROR, message: known },
        }),
      ) + "\n",
    );
    process.exitCode = EXIT_CODES.TOOL_ERROR;
  }
}

export function registerMobileCommands(program: Command): void {
  const mobile = program
    .command("mobile")
    .description(
      "Evidence-led mobile studio setup and internal beta contracts",
    );
  mobile
    .command("profile <file>")
    .description(
      "Validate a shared nonsecret studio profile without revealing bindings",
    )
    .action((file: string) =>
      output("forge.mobile.profile", () => {
        const profile = parse(StudioProfile, readJson(file));
        return {
          profile_id: profile.profile_id,
          revision: profile.revision,
          games: profile.release_policy.allowed_game_ids,
          destinations: profile.release_policy.allowed_destinations,
        };
      }),
    );
  mobile
    .command("init <target>")
    .requiredOption("--engine <engine>", "phaser4 or threejs")
    .description(
      "Create labelled hypothetical inputs; preserve existing customization",
    )
    .action((target: string, options: { engine: string }) =>
      output("forge.mobile.init", () => initMobile(target, options.engine)),
    );
  mobile
    .command("doctor <game>")
    .requiredOption("--profile <file>", "shared nonsecret studio profile")
    .requiredOption(
      "--strategy <file>",
      "per-game player/market/monetization brief",
    )
    .description(
      "Resolve shared config; report assumptions and real integration blockers",
    )
    .action((game: string, options: { profile: string; strategy: string }) =>
      output("forge.mobile.doctor", () =>
        doctorMobile(
          resolveMobile(
            readJson(options.profile),
            readJson(game),
            readJson(options.strategy),
          ),
        ),
      ),
    );
  mobile
    .command("plan <game>")
    .requiredOption("--profile <file>", "shared nonsecret studio profile")
    .requiredOption("--strategy <file>", "per-game strategy")
    .requiredOption("--artifact <file>", "exact artifact identity manifest")
    .description("Produce an internal-beta intent; never build or publish")
    .action(
      (
        game: string,
        options: { profile: string; strategy: string; artifact: string },
      ) =>
        output("forge.mobile.plan", () => {
          const config = resolveMobile(
            readJson(options.profile),
            readJson(game),
            readJson(options.strategy),
          );
          return {
            mode: "dry_run",
            mutation_allowed: false,
            intent: createBetaIntent(config, readJson(options.artifact)),
            readiness: doctorMobile(config),
          };
        }),
    );
}
