import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const cli = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("bootstrap standalone source package", () => {
  it("resolves the bootstrap process helper within CLI-owned source", () => {
    const snapshot = mkdtempSync(join(tmpdir(), "fw-cli-package-"));
    try {
      cpSync(join(cli, "src"), join(snapshot, "src"), { recursive: true });
      const entry = join(snapshot, "src/commands/bootstrap.ts");
      const contents = ts.sys.readFile(entry)!;
      const imports = ts.preProcessFile(contents).importedFiles;
      const helper = imports.find((item) =>
        /(?:bootstrap-process|process)\.mjs$/.test(item.fileName),
      );
      expect(
        helper,
        "process supervisor must remain an explicit import",
      ).toBeDefined();
      const result = ts.resolveModuleName(
        helper!.fileName,
        entry,
        {
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
        ts.sys,
      );
      expect(
        result.resolvedModule,
        "CLI sources must compile without repository hooks/",
      ).toBeDefined();
      expect(
        relative(snapshot, result.resolvedModule!.resolvedFileName).split(
          sep,
        )[0],
      ).toBe("src");
    } finally {
      rmSync(snapshot, { recursive: true, force: true });
    }
  });
});
