/**
 * MCP Server (Multi-Repo)
 *
 * Model Context Protocol server that runs on stdio.
 * External AI tools (Cursor, Claude) spawn this process and
 * communicate via stdin/stdout using the MCP protocol.
 *
 * Supports multiple indexed repositories via the global registry.
 *
 * Tools: list_repos, query, cypher, context, impact, detect_changes, rename
 * Resources: repos, repo/{name}/context, repo/{name}/clusters, ...
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { LocalBackend } from './local/local-backend.js';
/**
 * Create a configured MCP Server with all handlers registered.
 * Transport-agnostic — caller connects the desired transport.
 */
export declare function createMCPServer(backend: LocalBackend): Server;
/**
 * Start the MCP server on stdio transport (for CLI use).
 */
export declare function startMCPServer(backend: LocalBackend): Promise<void>;
