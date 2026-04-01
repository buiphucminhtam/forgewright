/**
 * MCP Tool Definitions
 *
 * Defines the tools that GitNexus exposes to external AI agents.
 * All tools support an optional `repo` parameter for multi-repo setups.
 */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description?: string;
            default?: any;
            items?: {
                type: string;
            };
            enum?: string[];
        }>;
        required: string[];
    };
}
export declare const GITNEXUS_TOOLS: ToolDefinition[];
