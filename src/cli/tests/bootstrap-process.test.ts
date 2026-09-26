import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBootstrapProcess } from "../../../hooks/bootstrap-process.mjs";

describe("bootstrap child supervision", () => {
  it("reports actual exit status and bounded output", async () => {
    const result = await runBootstrapProcess(
      process.execPath,
      ["-e", "console.log('ok');process.exitCode=7"],
      { timeout: 5000 },
    );
    expect(result.status).toBe(7);
    expect(result.stdout.trim()).toBe("ok");
  });
  it("fails when a child exceeds its output allowance", async () => {
    await expect(
      runBootstrapProcess(
        process.execPath,
        [
          "-e",
          "process.stdout.write('x'.repeat(10000));setInterval(()=>{},1000)",
        ],
        { timeout: 5000, maximum: 100 },
      ),
    ).rejects.toThrow(/output exceeded/);
  });
  it.skipIf(process.platform === "win32")(
    "terminates a timed-out child and its inherited process group",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "fw-process-test-"));
      const file = join(root, "child.pid");
      try {
        const code = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(file)},String(child.pid));setInterval(()=>{},1000)`;
        await expect(
          runBootstrapProcess(process.execPath, ["-e", code], {
            timeout: 1500,
          }),
        ).rejects.toThrow(/timed out/);
        const pid = Number(readFileSync(file, "utf8"));
        expect(() => process.kill(pid, 0)).toThrow();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    12000,
  );
});
