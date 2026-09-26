import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bootstrap-entry.ts"],
  format: ["esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  platform: "node",
  // Keep the literal spelling checked by the repository's Node runtime policy.
  // prettier-ignore
  target: 'node22',
});
