/**
 * Tools Call Command - Execute a tool by name
 */
import type { Command } from 'commander';
import pc from 'picocolors';
import { getToolByName, getAllTools } from '../core/tool-registry.js';
import { buildEnvelope, AgentEnvelope } from '../types/index.js';
import { VERSION } from '../version.js';
import { EXIT_CODES } from '../exit-codes.js';

export interface ToolsCallOptions {
  args?: string;
  stdin?: boolean;
  json: boolean;
}

export function registerToolsCallCommand(program: Command): void {
  // tools:call <name>
  program
    .command('tools:call')
    .description('Call a tool by name')
    .argument('<name>', 'Tool name to call (e.g., skills.list)')
    .option('-a, --args <json>', 'Tool arguments as JSON string')
    .option('--stdin', 'Read arguments from stdin')
    .option('-j, --json', 'Output as JSON')
    .action(async (name: string, options: ToolsCallOptions) => {
      await handleToolsCall(name, options);
    });
}

async function handleToolsCall(name: string, options: ToolsCallOptions): Promise<void> {
  const startTime = Date.now();
  const useJson = options.json || !process.stdout.isTTY;

  try {
    // Find the tool
    const tool = getToolByName(name);

    if (!tool) {
      const availableTools = getAllTools().map((t) => t.name).join(', ');
      throw new Error(
        `Tool "${name}" not found. Available tools: ${availableTools}`
      );
    }

    // Parse arguments
    let args: Record<string, unknown> = {};

    if (options.stdin) {
      // Read from stdin
      const stdinData = await readStdin();
      try {
        args = JSON.parse(stdinData);
      } catch {
        throw new Error('Invalid JSON from stdin');
      }
    } else if (options.args) {
      // Parse from CLI argument
      try {
        args = JSON.parse(options.args);
      } catch {
        throw new Error('Invalid JSON in --args. Use: --args \'{"key":"value"}\'');
      }
    }

    // Validate required arguments
    for (const [key, field] of Object.entries(tool.inputSchema)) {
      if (field.required && !(key in args)) {
        throw new Error(`Missing required argument: ${key}`);
      }
    }

    const duration_ms = Date.now() - startTime;

    // Execute the tool (stub implementation)
    const result = await executeTool(tool.name, args);

    if (useJson) {
      const envelope = buildEnvelope(`tools.call.${tool.name}`, result, {
        ok: true,
        duration_ms,
        version: VERSION,
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printHumanReadable(tool.name, result);
    }

    process.exit(EXIT_CODES.OK);
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    if (useJson) {
      const envelope: AgentEnvelope = {
        ok: false,
        tool: 'tools.call',
        data: null,
        metadata: {
          duration_ms,
          version: VERSION,
        },
        error: {
          code: EXIT_CODES.TOOL_ERROR,
          message,
        },
      };
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc.red(`Error: ${message}`));
    }

    process.exit(EXIT_CODES.TOOL_ERROR);
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.on('readable', () => {
      let chunk: string | Buffer | null;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk.toString();
      }
    });

    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Tool execution stub
  // In the future, this will route to actual tool implementations
  return {
    tool: name,
    args,
    status: 'executed',
    message: `Tool "${name}" executed successfully`,
    timestamp: new Date().toISOString(),
  };
}

function printHumanReadable(toolName: string, result: unknown): void {
  console.log();
  console.log(pc.green(`✓ ${toolName}`));
  console.log(pc.dim('─'.repeat(50)));
  console.log();
  console.log(pc.bold('Result:'));
  console.log(JSON.stringify(result, null, 2));
  console.log();
}
