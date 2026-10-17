// Copy after tsup (including its declaration cleanup) has fully finished.
// Keep one canonical kit in templates/; generated assets ship inside dist/.
import { cpSync } from "node:fs";
cpSync(
  new URL("../../../templates/game/mobile-monetization/", import.meta.url),
  new URL("../dist/mobile-template/", import.meta.url),
  { recursive: true },
);
