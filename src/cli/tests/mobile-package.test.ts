import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  mkdirSync,
  cpSync,
  rmSync,
  symlinkSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { execNpmSync } from "../../../scripts/ci/native-node-commands.mjs";

describe("standalone mobile CLI distribution", () => {
  it("I6: packs the kit and initializes without access to the checkout ancestors", () => {
    const cli = resolve(".");
    const root = mkdtempSync(
      join(realpathSync(tmpdir()), "fw-mobile-package-"),
    );
    try {
      const packed = JSON.parse(
        execNpmSync(
          [
            "pack",
            "--workspace",
            "src/cli",
            "--dry-run",
            "--ignore-scripts",
            "--json",
          ],
          { cwd: resolve("../.."), encoding: "utf8" },
        ),
      );
      const files = packed[0].files as Array<{ path: string }>;
      expect(
        files.some(
          (v) => v.path === "dist/mobile-template/examples/studio.json",
        ),
      ).toBe(true);
      const installed = join(root, "node_modules/@forgewright/cli");
      mkdirSync(installed, { recursive: true });
      for (const entry of files) {
        const target = join(installed, entry.path);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(join(cli, entry.path), target);
      }
      const require = createRequire(join(cli, "package.json"));
      mkdirSync(join(installed, "node_modules"));
      for (const dependency of ["commander", "picocolors", "zod"]) {
        let source = dirname(require.resolve(dependency));
        while (
          !existsSync(join(source, "package.json")) ||
          JSON.parse(readFileSync(join(source, "package.json"), "utf8"))
            .name !== dependency
        ) {
          const parent = dirname(source);
          if (parent === source) throw Error("dependency package not found");
          source = parent;
        }
        symlinkSync(
          source,
          join(installed, "node_modules", dependency),
          "junction",
        );
      }
      const target = join(root, "game");
      const result = spawnSync(
        process.execPath,
        [
          join(installed, "dist/index.js"),
          "--json",
          "mobile",
          "init",
          target,
          "--engine",
          "threejs",
        ],
        { cwd: root, encoding: "utf8", timeout: 15000 },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(
        JSON.parse(readFileSync(join(target, "mobile/game.json"), "utf8"))
          .engine,
      ).toBe("threejs");
      expect(
        readFileSync(join(target, "mobile/server/delivery.mjs"), "utf8"),
      ).toContain("deliverPurchase");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 20000);
});
