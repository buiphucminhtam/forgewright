// Copy after tsup (including its declaration cleanup) has fully finished.
// Keep one canonical kit in templates/; generated assets ship inside dist/.
import { cpSync } from "node:fs";
import { join } from "node:path";
import { buildOutputDir } from "./build-output.mjs";
cpSync(
  new URL("../../../templates/game/mobile-monetization/", import.meta.url),
  join(buildOutputDir(), "mobile-template"),
  { recursive: true },
);
