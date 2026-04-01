/**
 * Eval Server — Lightweight HTTP server for SWE-bench evaluation
 *
 * Keeps LadybugDB warm in memory so tool calls from the agent are near-instant.
 * Designed to run inside Docker containers during SWE-bench evaluation.
 *
 * KEY DESIGN: Returns LLM-friendly text, not raw JSON.
 * Raw JSON wastes tokens and is hard for models to parse. The text formatter
 * converts structured results into compact, readable output that models
 * can immediately act on. Next-step hints guide the agent through a
 * productive tool-chaining workflow (query → context → impact → fix).
 *
 * Architecture:
 *   Agent bash cmd → curl localhost:PORT/tool/query → eval-server → LocalBackend → format → text
 *
 * Usage:
 *   gitnexus eval-server                    # default port 4848
 *   gitnexus eval-server --port 4848        # explicit port
 *   gitnexus eval-server --idle-timeout 300 # auto-shutdown after 300s idle
 *
 * API:
 *   POST /tool/:name   — Call a tool. Body is JSON arguments. Returns formatted text.
 *   GET  /health       — Health check. Returns {"status":"ok","repos":[...]}
 *   POST /shutdown     — Graceful shutdown.
 */
export interface EvalServerOptions {
    port?: string;
    idleTimeout?: string;
}
export declare function formatQueryResult(result: any): string;
export declare function formatContextResult(result: any): string;
export declare function formatImpactResult(result: any): string;
export declare function formatCypherResult(result: any): string;
export declare function formatDetectChangesResult(result: any): string;
export declare function formatListReposResult(result: any): string;
export declare function evalServerCommand(options?: EvalServerOptions): Promise<void>;
export declare const MAX_BODY_SIZE: number;
