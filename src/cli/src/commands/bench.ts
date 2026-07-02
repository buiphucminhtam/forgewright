import type { Command } from "commander";
import pc from "picocolors";
import { runBenchmarkSuite, writeJsonAtomic } from "../bench/runner.js";
import { EXIT_CODES } from "../exit-codes.js";

export function registerBenchCommand(program: Command): void {
  program
    .command("bench")
    .description("Run agent benchmark suite")
    .argument("<suite-path>", "Path to benchmark suite JSON file")
    .option("--run", "Perform a live benchmark run (default is dry-run)")
    .option("-o, --output <path>", "Path to write JSON results report")
    .action(
      async (
        suitePath: string,
        options: { run?: boolean; output?: string },
      ) => {
        try {
          const isRun = Boolean(options.run);
          if (!isRun) {
            console.log(pc.yellow("ℹ Running in DRY-RUN mode (safe default)"));
          }

          const { report, plan } = await runBenchmarkSuite(suitePath, {
            run: isRun,
          });

          if (!isRun) {
            console.log(plan);
            console.log(
              pc.green(
                "✔ Dry-run completed. To execute live, run with the --run option.",
              ),
            );
            process.exit(EXIT_CODES.OK);
          }

          if (report) {
            console.log(pc.green(`✔ Benchmark suite completed successfully.`));
            console.log(`Summary:`);
            console.log(` - Total Tasks: ${report.summary.totalTasks}`);
            console.log(
              ` - Pass@1 Rate: ${(report.summary.passAt1Rate * 100).toFixed(1)}% (${report.summary.passAt1Count}/${report.summary.totalTasks})`,
            );
            console.log(
              ` - Pass@k Rate: ${(report.summary.passAtKRate * 100).toFixed(1)}% (${report.summary.passAtKCount}/${report.summary.totalTasks})`,
            );

            for (const category of Object.values(report.summary.categories)) {
              console.log(`\nCategory: ${category.category}`);
              console.log(` - Tasks: ${category.totalTasks}`);
              console.log(
                ` - Pass@1 Rate: ${(category.passAt1Rate * 100).toFixed(1)}% (${category.passAt1Count}/${category.totalTasks})`,
              );
              console.log(
                ` - Pass@k Rate: ${(category.passAtKRate * 100).toFixed(1)}% (${category.passAtKCount}/${category.totalTasks})`,
              );
            }

            if (options.output) {
              const outputPath = options.output;
              writeJsonAtomic(outputPath, report);
              console.log(pc.cyan(`\n✔ Report written to ${outputPath}`));
            } else {
              console.log("\nResults (JSON):");
              console.log(JSON.stringify(report, null, 2));
            }
          }
          process.exit(EXIT_CODES.OK);
        } catch (err) {
          console.error(
            pc.red(
              `Error running benchmark suite: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
          process.exit(EXIT_CODES.TOOL_ERROR);
        }
      },
    );
}
