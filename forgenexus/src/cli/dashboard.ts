/**
 * Dashboard command — displays metrics from various sources
 */

import { globalMetrics } from '../telemetry/metrics.js';
import { globalFeedback } from '../feedback/collector.js';
import { renderMetricsDashboard, renderHtmlDashboard, renderMarkdownDashboard } from '../dashboard/renderer.js';
import * as fs from 'fs';

export interface DashboardOptions {
  format?: 'terminal' | 'json' | 'html' | 'markdown';
  output?: string;
  metrics?: string;
  compact?: boolean;
  color?: boolean;
  header?: boolean;
}

export function createDashboardCommand() {
  return {
    name: 'dashboard',
    description: 'Display Forgenexus metrics dashboard',
    
    // Main dashboard command - show terminal metrics
    async metrics(opts: DashboardOptions = {}) {
      const metrics = opts.metrics 
        ? JSON.parse(fs.readFileSync(opts.metrics, 'utf8'))
        : globalMetrics.toJSON();
      
      const output = renderMetricsDashboard(metrics, {
        format: opts.format || 'terminal',
        compact: opts.compact || false,
        colorize: opts.color !== false,
        showHeader: opts.header !== false,
      });
      
      if (opts.output) {
        fs.writeFileSync(opts.output, output);
        console.log(`Written to ${opts.output}`);
      } else {
        console.log(output);
      }
    },

    // Generate HTML dashboard
    async html(opts: DashboardOptions = {}) {
      const metrics = opts.metrics
        ? JSON.parse(fs.readFileSync(opts.metrics, 'utf8'))
        : globalMetrics.toJSON();
      
      const output = opts.output || 'dashboard.html';
      const html = renderHtmlDashboard(metrics);
      fs.writeFileSync(output, html);
      console.log(`HTML dashboard written to ${output}`);
    },

    // Generate markdown report
    async report(opts: DashboardOptions = {}) {
      const metrics = opts.metrics
        ? JSON.parse(fs.readFileSync(opts.metrics, 'utf8'))
        : globalMetrics.toJSON();
      
      const output = opts.output || 'REPORT.md';
      const md = renderMarkdownDashboard(metrics);
      fs.writeFileSync(output, md);
      console.log(`Report written to ${output}`);
    },

    // Export all metrics as JSON
    async export(opts: DashboardOptions = {}) {
      const output = opts.output || 'metrics-export.json';
      const data = {
        timestamp: new Date().toISOString(),
        metrics: globalMetrics.toJSON(),
        feedback: globalFeedback.getAll(),
      };
      fs.writeFileSync(output, JSON.stringify(data, null, 2));
      console.log(`Exported to ${output}`);
    },
  };
}

// CLI handler for dashboard command
export function handleDashboardCommand(args: string[]) {
  const dashboard = createDashboardCommand();
  
  // Parse subcommands
  const subcommand = args[0] || 'metrics';
  const subArgs = args.slice(1);
  
  // Parse common options
  const opts: DashboardOptions = {};
  const remainingArgs: string[] = [];
  
  for (let i = 0; i < subArgs.length; i++) {
    const arg = subArgs[i];
    if (arg === '-o' || arg === '--output') {
      opts.output = subArgs[++i];
    } else if (arg === '-m' || arg === '--metrics') {
      opts.metrics = subArgs[++i];
    } else if (arg === '-f' || arg === '--format') {
      opts.format = subArgs[++i] as DashboardOptions['format'];
    } else if (arg === '--compact') {
      opts.compact = true;
    } else if (arg === '--no-color') {
      opts.color = false;
    } else if (arg === '--no-header') {
      opts.header = false;
    } else if (arg === '-h' || arg === '--help') {
      printDashboardHelp();
      return;
    } else {
      remainingArgs.push(arg);
    }
  }
  
  // Route to subcommand
  switch (subcommand) {
    case 'metrics':
      dashboard.metrics(opts);
      break;
    case 'html':
      dashboard.html(opts);
      break;
    case 'report':
      dashboard.report(opts);
      break;
    case 'export':
      dashboard.export(opts);
      break;
    default:
      console.error(`Unknown dashboard subcommand: ${subcommand}`);
      printDashboardHelp();
      process.exit(1);
  }
}

function printDashboardHelp() {
  console.log(`
\x1b[1mDashboard Commands\x1b[0m

\x1b[32mforgenexus dashboard\x1b[0m [subcommand] [options]

\x1b[1mSubcommands:\x1b[0m
  \x1b[36mmetrics\x1b[0m   Show terminal metrics dashboard (default)
  \x1b[36mhtml\x1b[0m      Generate HTML dashboard
  \x1b[36mreport\x1b[0m    Generate markdown report
  \x1b[36mexport\x1b[0m    Export all data as JSON

\x1b[1mOptions:\x1b[0m
  -o, --output <file>    Output file path
  -m, --metrics <file>   Load metrics from JSON file
  -f, --format <type>    Output format: terminal, json, html, markdown
  --compact              Compact output
  --no-color             Disable colors
  --no-header            Hide header

\x1b[1mExamples:\x1b[0m
  forgenexus dashboard              # Show terminal metrics
  forgenexus dashboard metrics      # Show terminal metrics
  forgenexus dashboard html         # Generate HTML dashboard
  forgenexus dashboard html -o mydashboard.html
  forgenexus dashboard report      # Generate markdown report
  forgenexus dashboard export       # Export all data
  forgenexus dashboard -m metrics.json
`);
}
