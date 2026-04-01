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
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMCPServer } from '../mcp/server.js';
import { randomUUID } from 'crypto';
/** Idle sessions are evicted after 30 minutes */
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Cleanup sweep runs every 5 minutes */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
export function mountMCPEndpoints(app, backend) {
    const sessions = new Map();
    // Periodic cleanup of idle sessions (guards against network drops)
    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [id, session] of sessions) {
            if (now - session.lastActivity > SESSION_TTL_MS) {
                try {
                    session.server.close();
                }
                catch { }
                sessions.delete(id);
            }
        }
    }, CLEANUP_INTERVAL_MS);
    if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
        cleanupTimer.unref();
    }
    const handleMcpRequest = async (req, res) => {
        const sessionId = req.headers['mcp-session-id'];
        if (sessionId && sessions.has(sessionId)) {
            // Existing session — delegate to its transport
            const session = sessions.get(sessionId);
            session.lastActivity = Date.now();
            await session.transport.handleRequest(req, res, req.body);
        }
        else if (sessionId) {
            // Unknown/expired session ID — tell client to re-initialize (per MCP spec)
            res.status(404).json({
                jsonrpc: '2.0',
                error: { code: -32001, message: 'Session not found. Re-initialize.' },
                id: null,
            });
        }
        else if (req.method === 'POST') {
            // No session ID — new client initializing
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
            });
            const server = createMCPServer(backend);
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            if (transport.sessionId) {
                sessions.set(transport.sessionId, { server, transport, lastActivity: Date.now() });
                transport.onclose = () => {
                    sessions.delete(transport.sessionId);
                };
            }
        }
        else {
            res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'No valid session. Send a POST to initialize.' },
                id: null,
            });
        }
    };
    app.all('/api/mcp', (req, res) => {
        void handleMcpRequest(req, res).catch((err) => {
            console.error('MCP HTTP request failed:', err);
            if (res.headersSent)
                return;
            res.status(500).json({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Internal MCP server error' },
                id: null,
            });
        });
    });
    const cleanup = async () => {
        clearInterval(cleanupTimer);
        const closers = [...sessions.values()].map(async (session) => {
            try {
                await Promise.resolve(session.server.close());
            }
            catch { }
        });
        sessions.clear();
        await Promise.allSettled(closers);
    };
    console.log('MCP HTTP endpoints mounted at /api/mcp');
    return cleanup;
}
