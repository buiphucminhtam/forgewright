/**
 * Direct CLI Tool Commands
 *
 * Exposes GitNexus tools (query, context, impact, cypher) as direct CLI commands.
 * Bypasses MCP entirely — invokes LocalBackend directly for minimal overhead.
 *
 * Usage:
 *   gitnexus query "authentication flow"
 *   gitnexus context --name "validateUser"
 *   gitnexus impact --target "AuthService" --direction upstream
 *   gitnexus cypher "MATCH (n:Function) RETURN n.name LIMIT 10"
 *
 * Note: Output goes to stdout via fs.writeSync(fd 1), bypassing LadybugDB's
 * native module which captures the Node.js process.stdout stream during init.
 * See the output() function for details (#324).
 */
export declare function queryCommand(queryText: string, options?: {
    repo?: string;
    context?: string;
    goal?: string;
    limit?: string;
    content?: boolean;
}): Promise<void>;
export declare function contextCommand(name: string, options?: {
    repo?: string;
    file?: string;
    uid?: string;
    content?: boolean;
}): Promise<void>;
export declare function impactCommand(target: string, options?: {
    direction?: string;
    repo?: string;
    depth?: string;
    includeTests?: boolean;
}): Promise<void>;
export declare function cypherCommand(query: string, options?: {
    repo?: string;
}): Promise<void>;
