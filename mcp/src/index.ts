#!/usr/bin/env node
/**
 * Forgewright Global MCP Server
 *
 * Works across ALL projects. The server:
 * - Loads skills from the Forgewright skills/ directory
 * - Stores per-project state in {workspace}/.forgewright/
 * - Detects the current workspace dynamically
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerPrompts } from './api/prompts.js'
import { registerTools } from './api/tools.js'
import { setWorkspaceRoot } from './state/pipeline-manager.js'

const server = new Server(
  {
    name: 'forgewright-mcp-global',
    version: '1.0.0',
  },
  {
    capabilities: {
      prompts: {},
      tools: {},
    },
  },
)

// Detect and set workspace root BEFORE registering handlers
setWorkspaceRoot()

registerPrompts(server)
registerTools(server)

async function run() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[Forgewright Global MCP] Running — workspace: ' + process.cwd())
}

run().catch((error) => {
  console.error('[Forgewright Global MCP] Fatal error:', error)
  process.exit(1)
})
