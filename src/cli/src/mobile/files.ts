import {
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function readJson(path: string): unknown {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
    throw new Error("invalid_mobile_input_file");
  return JSON.parse(readFileSync(path, "utf8"));
}

export function mobileTemplateRoot(): string {
  // Bundled CLI lives in src/cli/dist; also supports unbundled source use.
  const here = dirname(fileURLToPath(import.meta.url));
  const packaged = join(here, "mobile-template");
  if (existsSync(join(packaged, "examples/studio.json"))) return packaged;
  for (const base of [
    resolve(here, "../../.."),
    resolve(here, "../../../.."),
  ]) {
    const path = join(base, "templates/game/mobile-monetization");
    if (existsSync(join(path, "examples/studio.json"))) return path;
  }
  throw new Error("mobile_templates_missing");
}

export function initMobile(target: string, engine: string) {
  if (!["phaser4", "threejs"].includes(engine))
    throw new Error("unsupported_mobile_engine");
  const root = resolve(target);
  // Existing parent must be real; never adopt another project's symlinked root.
  let parent = root;
  while (!existsSync(parent)) parent = dirname(parent);
  if (realpathSync(parent) !== parent)
    throw new Error("symlinked_mobile_target");
  const dest = join(root, "mobile");
  if (existsSync(dest))
    throw new Error("mobile_setup_exists_preserve_customization");
  const source = mobileTemplateRoot();
  const game = readJson(join(source, `examples/${engine}-game.json`));
  const strategy = readJson(join(source, "examples/strategy.json")) as Record<
    string,
    unknown
  >;
  const gameId = (game as Record<string, unknown>).game_id;
  strategy.game_id = gameId;
  const entries: Array<[string, string]> = [
    ["game.json", JSON.stringify(game, null, 2) + "\n"],
    ["strategy.json", JSON.stringify(strategy, null, 2) + "\n"],
    [
      "studio.example.json",
      readFileSync(join(source, "examples/studio.json"), "utf8"),
    ],
    ["runtime.mjs", readFileSync(join(source, "runtime.mjs"), "utf8")],
    ["runtime.d.mts", readFileSync(join(source, "runtime.d.mts"), "utf8")],
    ["server/delivery.mjs", readFileSync(join(source, "delivery.mjs"), "utf8")],
    [
      "server/sqlite-ledger.mjs",
      readFileSync(join(source, "sqlite-ledger.mjs"), "utf8"),
    ],
  ];
  mkdirSync(root, { recursive: true });
  mkdirSync(dest, { mode: 0o700 });
  mkdirSync(join(dest, "server"), { mode: 0o700 });
  for (const [name, content] of entries) {
    const fd = openSync(
      join(dest, name),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeFileSync(fd, content);
    } finally {
      closeSync(fd);
    }
  }
  return {
    created: entries.map(([name]) => `mobile/${name}`),
    mode: "hypothetical_setup",
    live_ready: false,
    next: "Edit game/strategy; reuse one reviewed studio profile; run forge mobile doctor.",
  };
}
