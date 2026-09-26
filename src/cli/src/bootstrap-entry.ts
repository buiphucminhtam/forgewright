/** Hook launcher: keep the read-only preflight independent of CLI startup. */
import { preflightBootstrap } from "./bootstrap/state.js";
import { buildEnvelope } from "./types/index.js";
import { EXIT_CODES } from "./exit-codes.js";
import { VERSION } from "./version.js";

const args = process.argv.slice(2);
if (
  args.length === 4 &&
  args[0] === "--json" &&
  args[1] === "bootstrap" &&
  args[2] === "preflight" &&
  !args[3].startsWith("-")
) {
  const startedAt = Date.now();
  let data = null;
  let error;
  try {
    data = preflightBootstrap(args[3]);
  } catch (cause) {
    error = {
      code: EXIT_CODES.CONFIG_ERROR,
      message: cause instanceof Error ? cause.message : String(cause),
    };
    process.exitCode = error.code;
  }
  process.stdout.write(
    JSON.stringify(
      buildEnvelope("forge.bootstrap.preflight", data, {
        ok: error === undefined,
        duration_ms: Date.now() - startedAt,
        version: VERSION,
        error,
      }),
    ) + "\n",
  );
} else {
  // Resolve at runtime so bundlers do not eagerly import the command graph.
  const fullCli = new URL("./index.js", import.meta.url).href;
  await import(fullCli);
}
