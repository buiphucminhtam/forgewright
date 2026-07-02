import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  buildAgyArgs,
  resolveContractPath,
} from "../src/delegation/agy-worker.js";

describe("Agy worker adapter", () => {
  it("uses print mode, sandboxing, and the configured model", () => {
    const args = buildAgyArgs({
      model: "Gemini 3.5 Flash (High)",
      contractFileName: "CONTRACT.json",
      sandbox: true,
    });

    const prompt =
      "Read WORKER_INSTRUCTIONS.md and CONTRACT.json, execute only the contracted task, run its verification commands, and write DELIVERY.json.";

    expect(args).toEqual([
      "--model",
      "Gemini 3.5 Flash (High)",
      "--sandbox",
      "--print",
      prompt,
    ]);
    expect(args.at(-2)).toBe("--print");
    expect(args.at(-1)).toBe(prompt);
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("rejects contracts outside the project root", () => {
    const projectRoot = resolve("/tmp/project");
    expect(() =>
      resolveContractPath(projectRoot, resolve("/tmp/other/CONTRACT.json")),
    ).toThrow("Contract must be inside the project workspace");
  });

  it("accepts contracts inside the project root", () => {
    const projectRoot = resolve("/tmp/project");
    expect(resolveContractPath(projectRoot, "tasks/T1/CONTRACT.json")).toBe(
      resolve(projectRoot, "tasks/T1/CONTRACT.json"),
    );
  });
});
