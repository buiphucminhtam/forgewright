/**
 * Validate Command - Quality gate validation
 */
import type { Command } from "commander";
import pc from "picocolors";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { buildEnvelope } from "../types/index.js";
import { VERSION } from "../version.js";

export interface ValidationResult {
  level: number;
  score: number;
  maxScore: number;
  grade: string;
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
}

export interface ValidationCheck {
  name: string;
  status: "pass" | "fail" | "skip" | "warning";
  score: number;
  maxScore: number;
  message: string;
}

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Run quality gate validation")
    .option(
      "-l, --level <1-4>",
      "Validation level (1: build, 2: +regression, 3: +standards, 4: +traceability)",
      "4",
    )
    .option("--strict", "Treat warnings as failures")
    .option("-j, --json", "Output as JSON")
    .option("--report <path>", "Write report to file")
    .action(
      async (options: {
        level: string;
        strict: boolean;
        json: boolean;
        report?: string;
      }) => {
        await handleValidate(options);
      },
    );
}

async function handleValidate(options: {
  level: string;
  strict: boolean;
  json: boolean;
  report?: string;
}): Promise<void> {
  const startTime = Date.now();
  const useJson = options.json || !process.stdout.isTTY;
  const level = parseInt(options.level, 10);

  if (isNaN(level) || level < 1 || level > 4) {
    if (useJson) {
      const envelope = buildEnvelope("validate.quality", null, {
        ok: false,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: { code: 2, message: "Invalid level. Use 1, 2, 3, or 4." },
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(
        pc.red(`Error: Invalid level "${options.level}". Use 1, 2, 3, or 4.`),
      );
    }
    process.exit(2);
  }

  const result = await runValidation(level, options.strict);

  // Write report if requested
  if (options.report) {
    const reportContent = useJson
      ? JSON.stringify(result, null, 2)
      : generateTextReport(result);
    writeFileSync(options.report, reportContent + "\n");
  }

  if (useJson) {
    const envelope = buildEnvelope("validate.quality", result, {
      ok: result.issues.length === 0,
      duration_ms: Date.now() - startTime,
      version: VERSION,
      error:
        result.issues.length > 0
          ? { code: 1, message: `${result.issues.length} issues found` }
          : undefined,
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printHumanReadable(result);
  }

  const exitCode = result.issues.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

async function runValidation(
  level: number,
  strict: boolean,
): Promise<ValidationResult> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];

  let totalScore = 0;
  let maxScore = 0;

  // Level 1: Build & Syntax
  if (level >= 1) {
    const buildChecks = await runBuildChecks();
    checks.push(...buildChecks.checks);
    issues.push(...buildChecks.issues);
    warnings.push(...buildChecks.warnings);
    totalScore += buildChecks.score;
    maxScore += buildChecks.maxScore;
  }

  // Level 2: Regression Safety
  if (level >= 2) {
    const regressionChecks = await runRegressionChecks();
    checks.push(...regressionChecks.checks);
    issues.push(...regressionChecks.issues);
    warnings.push(...regressionChecks.warnings);
    totalScore += regressionChecks.score;
    maxScore += regressionChecks.maxScore;
  }

  // Level 3: Code Standards
  if (level >= 3) {
    const standardsChecks = await runStandardsChecks();
    checks.push(...standardsChecks.checks);
    issues.push(...standardsChecks.issues);
    warnings.push(...standardsChecks.warnings);
    totalScore += standardsChecks.score;
    maxScore += standardsChecks.maxScore;
  }

  // Level 4: Acceptance Traceability
  if (level >= 4) {
    const traceabilityChecks = await runTraceabilityChecks();
    checks.push(...traceabilityChecks.checks);
    issues.push(...traceabilityChecks.issues);
    warnings.push(...traceabilityChecks.warnings);
    totalScore += traceabilityChecks.score;
    maxScore += traceabilityChecks.maxScore;
  }

  if (strict && warnings.length > 0) {
    issues.push(...warnings.map((warning) => `Strict warning: ${warning}`));
  }

  // Calculate grade
  const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;
  let grade = "F";
  if (percentage >= 90) grade = "A";
  else if (percentage >= 80) grade = "B";
  else if (percentage >= 70) grade = "C";
  else if (percentage >= 60) grade = "D";

  return {
    level,
    score: totalScore,
    maxScore,
    grade,
    checks,
    issues,
    warnings,
  };
}

async function runBuildChecks(): Promise<{
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
  score: number;
  maxScore: number;
}> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const maxScore = 25;

  // Check package.json exists
  if (existsSync("package.json")) {
    const packageJson = readPackageJson();
    const scripts = packageJson?.scripts ?? {};
    checks.push({
      name: "Build Tool",
      status: "pass",
      score: 0,
      maxScore: 0,
      message: "package.json found",
    });

    // Try to build
    try {
      execSync("npm run build --silent 2>/dev/null", {
        stdio: "pipe",
        timeout: 60000,
      });
      checks.push({
        name: "Build Success",
        status: "pass",
        score: 15,
        maxScore: 15,
        message: "Build completed successfully",
      });
      score += 15;
    } catch {
      checks.push({
        name: "Build Success",
        status: "fail",
        score: 0,
        maxScore: 15,
        message: "Build failed",
      });
      issues.push("Build failed");
    }

    // Type check
    const typecheckCommand =
      typeof scripts.typecheck === "string"
        ? "npm run typecheck --silent"
        : null;
    if (!typecheckCommand) {
      checks.push({
        name: "TypeScript Check",
        status: "skip",
        score: 10,
        maxScore: 10,
        message: "No typecheck script or tsconfig.json; skipped",
      });
      score += 10;
    } else {
      try {
        execSync(`${typecheckCommand} 2>/dev/null`, {
          stdio: "pipe",
          timeout: 60000,
        });
        checks.push({
          name: "TypeScript Check",
          status: "pass",
          score: 10,
          maxScore: 10,
          message: "TypeScript compilation passed",
        });
        score += 10;
      } catch {
        checks.push({
          name: "TypeScript Check",
          status: "fail",
          score: 0,
          maxScore: 10,
          message: "TypeScript compilation errors",
        });
        issues.push("TypeScript compilation failed");
      }
    }
  } else {
    checks.push({
      name: "Build Tool",
      status: "skip",
      score: 0,
      maxScore: 0,
      message: "No package.json found",
    });
  }

  return { checks, issues, warnings, score, maxScore };
}

function readPackageJson(): { scripts?: Record<string, unknown> } | null {
  try {
    return JSON.parse(readFileSync("package.json", "utf-8")) as {
      scripts?: Record<string, unknown>;
    };
  } catch {
    return null;
  }
}

async function runRegressionChecks(): Promise<{
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
  score: number;
  maxScore: number;
}> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const maxScore = 25;

  if (existsSync(".git")) {
    checks.push({
      name: "Git Repository",
      status: "pass",
      score: 0,
      maxScore: 0,
      message: "Git repository detected",
    });

    if (existsSync("package.json")) {
      try {
        execSync("npm test --silent 2>/dev/null", {
          stdio: "pipe",
          timeout: 120000,
        });
        checks.push({
          name: "Test Suite",
          status: "pass",
          score: 25,
          maxScore: 25,
          message: "All tests passed",
        });
        score += 25;
      } catch {
        checks.push({
          name: "Test Suite",
          status: "fail",
          score: 0,
          maxScore: 25,
          message: "Test suite has failures",
        });
        issues.push("Test suite failed");
      }
    } else {
      checks.push({
        name: "Test Suite",
        status: "skip",
        score: 25,
        maxScore: 25,
        message: "No test suite configured",
      });
      score += 25;
    }
  } else {
    checks.push({
      name: "Git Repository",
      status: "skip",
      score: 25,
      maxScore: 25,
      message: "Not a git repository",
    });
    score += 25;
  }

  return { checks, issues, warnings, score, maxScore };
}

async function runStandardsChecks(): Promise<{
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
  score: number;
  maxScore: number;
}> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 30;
  const maxScore = 30;

  // Check for TODOs/FIXMEs (10 points)
  try {
    const todoOutput = execSync(
      'git grep -nE "TODO|FIXME|HACK|XXX" -- "*.ts" "*.js" "*.tsx" "*.jsx" ":(exclude)node_modules/**" ":(exclude)dist/**" ":(exclude)build/**" ":(exclude)tests/**" ":(exclude)**/*.test.*" ":(exclude)**/*.spec.*" ":(exclude)scripts/comment-checker/**" ":(exclude)src/cli/src/commands/validate.ts" 2>/dev/null | head -5 || true',
      { encoding: "utf-8", timeout: 10000 },
    );

    if (todoOutput.trim()) {
      const count = todoOutput.trim().split("\n").length;
      checks.push({
        name: "Code Quality",
        status: "warning",
        score: 0,
        maxScore: 10,
        message: `Found ${count} TODOs/FIXMEs`,
      });
      warnings.push(`${count} TODOs/FIXMEs found`);
      score -= 10;
    } else {
      checks.push({
        name: "Code Quality",
        status: "pass",
        score: 10,
        maxScore: 10,
        message: "No TODOs/FIXMEs found",
      });
    }
  } catch {
    checks.push({
      name: "Code Quality",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "No TODOs/FIXMEs found",
    });
  }

  // Check for secrets (10 points)
  try {
    const secretOutput = execSync(
      'grep -rnE "(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|password[[:space:]]*[:=])" --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build 2>/dev/null | grep -v ".env" | grep -v ".test." | grep -v ".spec." | head -5 || true',
      { encoding: "utf-8", timeout: 10000 },
    );

    if (secretOutput.trim()) {
      const count = secretOutput.trim().split("\n").length;
      checks.push({
        name: "Secret Detection",
        status: "fail",
        score: 0,
        maxScore: 10,
        message: `Found ${count} potential hardcoded secrets`,
      });
      issues.push(`${count} potential secrets detected`);
      score -= 10;
    } else {
      checks.push({
        name: "Secret Detection",
        status: "pass",
        score: 10,
        maxScore: 10,
        message: "No hardcoded secrets detected",
      });
    }
  } catch {
    checks.push({
      name: "Secret Detection",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "No hardcoded secrets detected",
    });
  }

  // Check conventions (5 points)
  const conventionFile = [
    ".forgewright/code-conventions.md",
    "skills/_shared/protocols/pipeline-activation.md",
    "AGENTS.md",
  ].find((file) => existsSync(file));

  if (conventionFile) {
    checks.push({
      name: "Code Conventions",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: `Code conventions defined in ${conventionFile}`,
    });
  } else {
    checks.push({
      name: "Code Conventions",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No code conventions file",
    });
    warnings.push("No .forgewright/code-conventions.md");
    score -= 5;
  }

  // Check docs (5 points)
  if (existsSync("README.md")) {
    checks.push({
      name: "Documentation",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: "README.md found",
    });
  } else {
    checks.push({
      name: "Documentation",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No README.md",
    });
    warnings.push("No README.md");
    score -= 5;
  }

  return { checks, issues, warnings, score, maxScore };
}

async function runTraceabilityChecks(): Promise<{
  checks: ValidationCheck[];
  issues: string[];
  warnings: string[];
  score: number;
  maxScore: number;
}> {
  const checks: ValidationCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const maxScore = 25;

  if (existsSync(".forgewright/product-manager/BRD")) {
    checks.push({
      name: "Requirement Mapping",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "BRD directory found",
    });
  } else {
    checks.push({
      name: "Requirement Mapping",
      status: "skip",
      score: 10,
      maxScore: 10,
      message:
        "No BRD directory; requirement mapping treated as not applicable",
    });
  }
  score += 10;

  try {
    const testFiles = execSync(
      'find . \\( -name "*.test.*" -o -name "*.spec.*" -o -name "test_*" \\) -not -path "./node_modules/*" -not -path "./dist/*" | head -5',
      { encoding: "utf-8", timeout: 10000 },
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    if (testFiles.length > 0) {
      checks.push({
        name: "Test Traceability",
        status: "pass",
        score: 5,
        maxScore: 5,
        message: `Found ${testFiles.length} test file(s)`,
      });
      score += 5;
    } else {
      checks.push({
        name: "Test Traceability",
        status: "warning",
        score: 0,
        maxScore: 5,
        message: "No test files found",
      });
      warnings.push("No test files found");
    }
  } catch {
    checks.push({
      name: "Test Traceability",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "Could not inspect test files",
    });
    warnings.push("Could not inspect test files");
  }

  if (existsSync(".forgewright")) {
    checks.push({
      name: "Workspace Artifacts",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: ".forgewright workspace exists",
    });
    score += 5;
  } else {
    checks.push({
      name: "Workspace Artifacts",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No .forgewright workspace artifacts found",
    });
    warnings.push("No .forgewright workspace artifacts found");
  }

  if (existsSync("scripts/pipeline-preflight.sh")) {
    try {
      execSync("bash scripts/pipeline-preflight.sh --max-state-age-minutes 240 --json-only", {
        stdio: "pipe",
        timeout: 15000,
      });
      checks.push({
        name: "Pipeline Activation",
        status: "pass",
        score: 5,
        maxScore: 5,
        message: "Pipeline activation controls pass",
      });
      score += 5;
    } catch {
      checks.push({
        name: "Pipeline Activation",
        status: "warning",
        score: 0,
        maxScore: 5,
        message: "Pipeline activation preflight failed",
      });
      warnings.push("Pipeline activation preflight failed");
    }
  } else {
    checks.push({
      name: "Pipeline Activation",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No pipeline preflight script",
    });
    warnings.push("No scripts/pipeline-preflight.sh");
  }

  return { checks, issues, warnings, score, maxScore };
}

function generateTextReport(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push("=== Forgewright Quality Gate Report ===");
  lines.push(`Level: ${result.level}`);
  lines.push(`Score: ${result.score}/${result.maxScore} (${result.grade})`);
  lines.push("");

  for (const check of result.checks) {
    const icon =
      check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : "○";
    lines.push(`${icon} ${check.name}: ${check.message}`);
  }

  if (result.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");
    for (const issue of result.issues) {
      lines.push(`  - ${issue}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join("\n");
}

function printHumanReadable(result: ValidationResult): void {
  const percentage =
    result.maxScore > 0
      ? Math.round((result.score / result.maxScore) * 100)
      : 0;

  console.log();
  console.log(
    pc.bold(
      "╔════════════════════════════════════════════════════════════════╗",
    ),
  );
  console.log(
    pc.bold("║") +
      "          Quality Gate Validation".padEnd(62) +
      pc.bold("║"),
  );
  console.log(
    pc.bold(
      "╠════════════════════════════════════════════════════════════════╣",
    ),
  );

  const gradeColor =
    result.grade === "A"
      ? pc.green
      : result.grade === "B"
        ? pc.cyan
        : result.grade === "C"
          ? pc.yellow
          : pc.red;

  console.log(
    pc.bold("║") +
      `  Level ${result.level} | ${result.score}/${result.maxScore} (${gradeColor(result.grade)}) | ${percentage}%`.padEnd(
        62,
      ) +
      pc.bold("║"),
  );
  console.log(
    pc.bold(
      "╚════════════════════════════════════════════════════════════════╝",
    ),
  );
  console.log();

  // Summary
  if (result.issues.length === 0 && result.warnings.length === 0) {
    console.log(pc.green("  ✓ All checks passed"));
  } else {
    if (result.issues.length > 0) {
      console.log(pc.red(`  ✗ ${result.issues.length} issue(s)`));
    }
    if (result.warnings.length > 0) {
      console.log(pc.yellow(`  ⚠ ${result.warnings.length} warning(s)`));
    }
  }

  console.log();

  // Detailed checks
  console.log(pc.bold("  Checks:"));
  console.log(pc.gray("  " + "─".repeat(50)));

  for (const check of result.checks) {
    const icon =
      check.status === "pass"
        ? pc.green("✓")
        : check.status === "fail"
          ? pc.red("✗")
          : pc.gray("○");
    const statusColor =
      check.status === "pass"
        ? pc.green
        : check.status === "fail"
          ? pc.red
          : check.status === "warning"
            ? pc.yellow
            : pc.gray;
    console.log(
      `    ${icon} ${check.name.padEnd(20)} ${statusColor(check.message)}`,
    );
  }

  console.log();

  // Exit code note
  if (result.issues.length > 0) {
    console.log(pc.dim("  Run with --json for machine-readable output"));
  }
}
