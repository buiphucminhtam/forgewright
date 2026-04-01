/**
 * MCP over HTTP
 *
 * Mounts the GitNexus MCP server on Express using StreamableHTTP transport.
 * Each connecting client gets its own stateful session; the LocalBackend
 * is shared across all sessions (thread-safe — lazy LadybugDB per repo).
 *
 * Sessions are cleaned up on explicit close or after SESSION_TTL_MS of inactivity
 * (guards against network drops that never trigger onclose).
 */
import type { Express } from 'express';
import type { LocalBackend } from '../mcp/local/local-backend.js';
export declare function mountMCPEndpoints(app: Express, backend: LocalBackend): () => Promise<void>;
