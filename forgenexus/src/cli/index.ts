#!/usr/bin/env node
/**
 * CLI Module - Main Entry Point
 */

import { evaluateCommand } from './evaluate.js';
import { wikiCommand } from './wiki.js';
import { impactCommand } from './impact.js';
import { queryCommand } from './query.js';
import { analyze } from './analyze.js';
import { startMCPServer } from '../mcp/server.js';

export { evaluateCommand } from './evaluate.js';
export { wikiCommand, generateWiki } from './wiki.js';
export { impactCommand, analyzeImpact } from './impact.js';
export { queryCommand, query } from './query.js';

export async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
ForgeNexus CLI

Usage:
  forgenexus <command> [options]

Commands:
  analyze    - Run the full indexing pipeline
  evaluate   - Run anti-hallucination evaluation
  wiki       - Generate documentation
  impact     - Analyze blast radius
  query      - Search code base
  mcp        - Start the MCP Server
    `);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'analyze':
        await analyze({ repoPath: process.cwd() });
        break;
      case 'evaluate':
        await evaluateCommand(args.slice(1));
        break;
      case 'wiki':
        await wikiCommand(args.slice(1));
        break;
      case 'impact':
        await impactCommand(args.slice(1));
        break;
      case 'query':
        await queryCommand(args.slice(1));
        break;
      case 'mcp':
        await startMCPServer(process.cwd());
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err: unknown) {
    console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Only execute auto-routing if invoked directly as script (or via bin)
// A lightweight check for execution vs import (ESM safe-ish for CLI bins)
const isCLI = process.argv[1] && process.argv[1].endsWith('dist/cli/index.js');
if (isCLI) {
  main();
}
