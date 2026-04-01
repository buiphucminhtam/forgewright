/**
 * Cursor CLI Client for Wiki Generation
 *
 * Wrapper for the Cursor headless CLI (`agent` command).
 * Uses print mode for non-interactive LLM calls.
 *
 * Docs: https://cursor.com/docs/cli/headless
 */
import type { LLMResponse, CallLLMOptions } from './llm-client.js';
export interface CursorConfig {
    model?: string;
    workingDirectory?: string;
}
/**
 * Detect if Cursor CLI is available in PATH.
 * Returns the binary name if found ('agent'), null otherwise.
 * Result is cached after the first call.
 */
export declare function detectCursorCLI(): string | null;
/**
 * Resolve Cursor CLI configuration.
 * Model is optional - if not provided, Cursor CLI uses its default (auto).
 */
export declare function resolveCursorConfig(overrides?: Partial<CursorConfig>): CursorConfig;
/**
 * Call the Cursor CLI in print mode.
 *
 * Uses `agent -p --output-format text` for clean non-streaming output.
 * The prompt is passed as the final CLI argument.
 */
export declare function callCursorLLM(prompt: string, config: CursorConfig, systemPrompt?: string, options?: CallLLMOptions): Promise<LLMResponse>;
