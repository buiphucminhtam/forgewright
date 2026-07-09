#!/usr/bin/env node
/**
 * generate-template.ts — Forgewright Template Generator
 *
 * Renders Handlebars templates with project context.
 *
 * Usage:
 *   npx ts-node scripts/generate-template.ts --template docker/Dockerfile --output ./Dockerfile
 *   npx ts-node scripts/generate-template.ts --category ci --output ./.github/workflows/
 *   npx ts-node scripts/generate-template.ts --list
 *   npx ts-node scripts/generate-template.ts --all --output ./templates-out/
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import Handlebars from "handlebars";
import yaml from "yaml";
import { z } from "zod";

// ─── Schema ────────────────────────────────────────────────────────────────────

const CliArgsSchema = z.object({
  template: z.string().optional(),
  category: z.string().optional(),
  output: z.string().optional(),
  data: z.string().optional(),
  list: z.boolean().optional(),
  all: z.boolean().optional(),
  force: z.boolean().optional(),
  validate: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

type CliArgs = z.infer<typeof CliArgsSchema>;

const TemplateContextSchema = z.object({
  project: z.object({
    name: z.string(),
    slug: z.string(),
    version: z.string().default("1.0.0"),
    description: z.string().default(""),
  }),
  docker: z
    .object({
      baseImage: z.string().default("node:20-alpine"),
      port: z.number().default(3000),
      healthCheck: z.boolean().default(true),
      nodeVersion: z.string().default("20"),
    })
    .optional(),
  ci: z
    .object({
      nodeVersion: z.string().default("20"),
      testCommand: z.string().default("npm test"),
      lintCommand: z.string().default("npm run lint"),
    })
    .optional(),
  sre: z
    .object({
      team: z.string().default("platform"),
      severityLevels: z.array(z.string()).default(["SEV1", "SEV2", "SEV3", "SEV4"]),
    })
    .optional(),
});

type TemplateContext = z.infer<typeof TemplateContextSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function registerHandlebarsHelpers(): void {
  Handlebars.registerHelper("uppercase", (str: string) => String(str).toUpperCase());
  Handlebars.registerHelper("lowercase", (str: string) => String(str).toLowerCase());
  Handlebars.registerHelper("capitalize", (str: string) => {
    const s = String(str);
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
  Handlebars.registerHelper("kebab", (str: string) => {
    return String(str)
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
  });
  Handlebars.registerHelper("snake", (str: string) => {
    return String(str)
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[\s-]+/g, "_")
      .toLowerCase();
  });
  Handlebars.registerHelper("camel", (str: string) => {
    const s = String(str);
    return s
      .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
      .replace(/^(.)/, (_, c) => c.toLowerCase());
  });
  Handlebars.registerHelper("ternary", (cond: boolean, a: string, b: string) =>
    cond ? a : b
  );
  Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  Handlebars.registerHelper("ne", (a: unknown, b: unknown) => a !== b);
  Handlebars.registerHelper("or", (...args: unknown[]) =>
    args.slice(0, -1).some(Boolean)
  );
  Handlebars.registerHelper("and", (...args: unknown[]) =>
    args.slice(0, -1).every(Boolean)
  );
  Handlebars.registerHelper("not", (val: unknown) => !val);
  Handlebars.registerHelper("json", (obj: unknown) => JSON.stringify(obj, null, 2));
  Handlebars.registerHelper("yaml", (obj: unknown) => yaml.stringify(obj));
  Handlebars.registerHelper("join", (arr: unknown[], sep: string) =>
    Array.isArray(arr) ? arr.join(sep) : ""
  );
  Handlebars.registerHelper("eachWithIndex", function (
    arr: unknown[],
    options: Handlebars.HelperOptions
  ) {
    if (!Array.isArray(arr)) return "";
    return arr
      .map((item, index) =>
        options.fn(item, {
          data: { index, first: index === 0, last: index === arr.length - 1 },
        })
      )
      .join("");
  });
  Handlebars.registerHelper("repeat", (str: string, count: number) =>
    String(str).repeat(Math.max(0, count))
  );
  Handlebars.registerHelper("times", (n: number, options: Handlebars.HelperOptions) => {
    let result = "";
    for (let i = 0; i < n; i++) {
      result += options.fn(i, { data: { index: i } });
    }
    return result;
  });
}

function resolveTemplatePath(name: string): string {
  const templatesDir = path.resolve(process.cwd(), "templates");
  const extensions = ["", ".hbs", ".md.hbs", ".yaml.hbs", ".json.hbs", ".js.hbs"];

  for (const ext of extensions) {
    const candidate = path.join(templatesDir, name + ext);
    if (fs.existsSync(candidate)) return candidate;
  }

  // Try without extensions
  const direct = path.join(templatesDir, name);
  if (fs.existsSync(direct)) return direct;

  throw new Error(`Template not found: ${name}\nSearched in: ${templatesDir}`);
}

function discoverTemplates(baseDir: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  function walk(dir: string, category: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, entry.name);
      } else if (
        entry.name.endsWith(".hbs") ||
        entry.name.endsWith(".md") ||
        entry.name.endsWith(".yaml") ||
        entry.name.endsWith(".json")
      ) {
        const relPath = path.relative(baseDir, fullPath);
        const categoryName = path.dirname(relPath).split(path.sep)[0] || "root";
        if (!result[categoryName]) result[categoryName] = [];
        result[categoryName].push(relPath);
      }
    }
  }

  walk(baseDir, "root");
  return result;
}

function loadPackageJson(): Record<string, unknown> | null {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    }
  } catch {
    // Ignore
  }
  return null;
}

function buildContext(userData?: string): TemplateContext {
  const pkg = loadPackageJson();
  const name = (pkg?.name as string) || "my-project";
  const slug = name.replace(/^@[\w-]+\//, "").replace(/\s+/g, "-");

  const base: TemplateContext = {
    project: {
      name: slug,
      slug,
      version: (pkg?.version as string) || "1.0.0",
      description: (pkg?.description as string) || "",
    },
  };

  if (userData) {
    try {
      const parsed = JSON.parse(userData);
      // Merge user data
      if (parsed.project) Object.assign(base.project, parsed.project);
      if (parsed.docker) base.docker = { ...base.docker, ...parsed.docker } as NonNullable<TemplateContext["docker"]>;
      if (parsed.ci) base.ci = { ...base.ci, ...parsed.ci } as NonNullable<TemplateContext["ci"]>;
      if (parsed.sre) base.sre = { ...base.sre, ...parsed.sre } as NonNullable<TemplateContext["sre"]>;
    } catch (e) {
      console.error("Error parsing --data JSON:", e);
      process.exit(1);
    }
  }

  return base;
}

function renderTemplate(
  templatePath: string,
  context: TemplateContext
): string {
  const content = fs.readFileSync(templatePath, "utf-8");
  const ext = path.extname(templatePath);

  if (ext === ".yaml" || ext === ".yml") {
    // Pre-process YAML: extract frontmatter if present
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontmatterMatch) {
      const [, fmStr, body] = frontmatterMatch;
      const fm = yaml.parse(fmStr);
      const fmContext = { ...context, ...fm };
      const template = Handlebars.compile(body);
      return `---\n${yaml.stringify(fm)}\n---\n${template(fmContext)}`;
    }
  }

  const template = Handlebars.compile(content);
  return template(context);
}

function validateOutput(
  content: string,
  templatePath: string,
  dryRun: boolean
): { valid: boolean; errors: string[] } {
  const ext = path.extname(templatePath);
  const errors: string[] = [];

  if (ext === ".yaml" || ext === ".yml") {
    try {
      yaml.parse(content);
    } catch (e) {
      errors.push(`YAML parse error: ${e}`);
    }
  }

  if (ext === ".json" && !templatePath.endsWith(".hbs")) {
    try {
      JSON.parse(content);
    } catch (e) {
      errors.push(`JSON parse error: ${e}`);
    }
  }

  if (templatePath.includes("github-") && templatePath.endsWith(".hbs")) {
    // Validate GitHub Actions YAML structure
    try {
      const parsed = yaml.parse(content);
      if (!parsed.name) errors.push("Missing 'name' field in GitHub Actions workflow");
    } catch (e) {
      errors.push(`GitHub Actions YAML error: ${e}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getOutputPath(
  templatePath: string,
  outputDir: string
): string {
  const relativePath = path.relative(
    path.resolve(process.cwd(), "templates"),
    templatePath
  );
  // Remove .hbs extension
  let outputName = relativePath.replace(/\.hbs$/, "");
  return path.join(outputDir, outputName);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Forgewright Template Generator

Usage:
  npx ts-node scripts/generate-template.ts [options]

Options:
  --template <name>    Render a single template (e.g., docker/Dockerfile)
  --category <name>    Render all templates in a category (e.g., ci, docker)
  --output <path>       Output directory or file path
  --data <json>        JSON context data to override defaults
  --list               List all available templates
  --all                Render all templates (requires --output)
  --force              Overwrite existing files without prompting
  --validate           Validate rendered output
  --dry-run            Preview output without writing files
  --help, -h           Show this help message

Examples:
  # Render a single template
  npx ts-node scripts/generate-template.ts --template docker/Dockerfile --output ./Dockerfile

  # Render with custom data
  npx ts-node scripts/generate-template.ts --template ci/github-ci --output ./.github/workflows/ci.yml --data '{"project": "my-app", "nodeVersion": "20"}'

  # List all templates
  npx ts-node scripts/generate-template.ts --list

  # Render entire category
  npx ts-node scripts/generate-template.ts --category ci --output ./.github/workflows/

  # Render all templates (dry run)
  npx ts-node scripts/generate-template.ts --all --output ./templates-out/ --dry-run
`);
}

function listTemplates(): void {
  const templatesDir = path.resolve(process.cwd(), "templates");
  if (!fs.existsSync(templatesDir)) {
    console.error("templates/ directory not found. Run from project root.");
    process.exit(1);
  }

  const templates = discoverTemplates(templatesDir);

  console.log("\nAvailable Templates:\n");
  for (const [category, files] of Object.entries(templates)) {
    console.log(`  ${category}/`);
    for (const file of files.sort()) {
      console.log(`    ${file}`);
    }
    console.log();
  }

  const total = Object.values(templates).flat().length;
  console.log(`Total: ${total} templates\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  // Parse arguments
  const parsedArgs: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        parsedArgs[key] = true;
      } else {
        parsedArgs[key] = next;
        i++;
      }
    }
  }

  const result = CliArgsSchema.safeParse(parsedArgs);
  if (!result.success) {
    console.error("Invalid arguments:", result.error.issues);
    printHelp();
    process.exit(1);
  }

  const cliArgs = result.data;

  if (cliArgs.list) {
    listTemplates();
    return;
  }

  registerHandlebarsHelpers();

  const templatesDir = path.resolve(process.cwd(), "templates");
  if (!fs.existsSync(templatesDir)) {
    console.error("templates/ directory not found. Run from project root.");
    process.exit(1);
  }

  const context = buildContext(cliArgs.data);
  const errors: string[] = [];

  if (cliArgs.template) {
    // Single template
    const templatePath = resolveTemplatePath(cliArgs.template);
    const outputPath = cliArgs.output || getOutputPath(templatePath, "./");

    console.log(`\nRendering: ${cliArgs.template}`);
    console.log(`Output: ${outputPath}`);

    const rendered = renderTemplate(templatePath, context);

    if (cliArgs.validate || cliArgs.dryRun) {
      const validation = validateOutput(rendered, templatePath, !!cliArgs.dryRun);
      if (!validation.valid) {
        errors.push(...validation.errors);
        console.error("\nValidation errors:");
        validation.errors.forEach((e) => console.error(`  - ${e}`));
      } else {
        console.log("✓ Validation passed");
      }
    }

    if (!cliArgs.dryRun) {
      if (fs.existsSync(outputPath) && !cliArgs.force) {
        const rl = await import("node:readline").then((m) =>
          m.createInterface({ input: process.stdin, output: process.stdout })
        );
        const answer = await new Promise<string>((resolve) =>
          rl.question(`File exists: ${outputPath}. Overwrite? [y/N] `, resolve)
        );
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Skipped.");
          return;
        }
      }

      ensureDir(path.dirname(outputPath));
      fs.writeFileSync(outputPath, rendered, "utf-8");
      console.log(`✓ Written: ${outputPath}`);
    } else {
      console.log("\n--- Preview (dry-run) ---");
      console.log(rendered.slice(0, 500) + (rendered.length > 500 ? "\n..." : ""));
      console.log("--- End preview ---\n");
    }
  } else if (cliArgs.category) {
    // Category
    const categoryDir = path.join(templatesDir, cliArgs.category);
    if (!fs.existsSync(categoryDir)) {
      console.error(`Category not found: ${cliArgs.category}`);
      console.log("\nAvailable categories:");
      const templates = discoverTemplates(templatesDir);
      Object.keys(templates).forEach((cat) => console.log(`  - ${cat}`));
      process.exit(1);
    }

    if (!cliArgs.output) {
      console.error("--output is required when using --category");
      process.exit(1);
    }

    const files = fs.readdirSync(categoryDir, { recursive: true }) as string[];
    const hbsFiles = files.filter((f) => String(f).endsWith(".hbs"));

    console.log(`\nRendering ${hbsFiles.length} templates in category: ${cliArgs.category}`);

    for (const file of hbsFiles) {
      const templatePath = path.join(categoryDir, file);
      const outputPath = getOutputPath(templatePath, cliArgs.output!);
      const relName = path.relative(categoryDir, templatePath);

      try {
        const rendered = renderTemplate(templatePath, context);

        if (cliArgs.validate) {
          const validation = validateOutput(rendered, templatePath, false);
          if (!validation.valid) {
            errors.push(...validation.errors.map((e) => `${relName}: ${e}`));
            continue;
          }
        }

        if (!cliArgs.dryRun) {
          ensureDir(path.dirname(outputPath));
          if (fs.existsSync(outputPath) && !cliArgs.force) {
            console.log(`⚠ Skipped (exists): ${outputPath}`);
            continue;
          }
          fs.writeFileSync(outputPath, rendered, "utf-8");
        }
        console.log(`✓ ${relName}`);
      } catch (e) {
        errors.push(`${relName}: ${e}`);
        console.error(`✗ Error rendering ${relName}:`, e);
      }
    }
  } else if (cliArgs.all) {
    // All templates
    if (!cliArgs.output) {
      console.error("--output is required when using --all");
      process.exit(1);
    }

    const templates = discoverTemplates(templatesDir);
    const allFiles = Object.values(templates).flat();

    console.log(`\nRendering ${allFiles.length} templates...`);

    for (const file of allFiles) {
      const templatePath = path.join(templatesDir, file);
      const outputPath = getOutputPath(templatePath, cliArgs.output!);
      const relName = file;

      try {
        const rendered = renderTemplate(templatePath, context);

        if (!cliArgs.dryRun) {
          ensureDir(path.dirname(outputPath));
          if (fs.existsSync(outputPath) && !cliArgs.force) {
            continue;
          }
          fs.writeFileSync(outputPath, rendered, "utf-8");
        }
        console.log(`✓ ${relName}`);
      } catch (e) {
        errors.push(`${relName}: ${e}`);
        console.error(`✗ Error rendering ${relName}:`, e);
      }
    }
  } else {
    console.error("Specify --template, --category, --list, or --all");
    printHelp();
    process.exit(1);
  }

  // Summary
  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} error(s):`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log("\n✓ Done!");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
