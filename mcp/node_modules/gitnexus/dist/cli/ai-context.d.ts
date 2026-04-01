/**
 * AI Context Generator
 *
 * Creates AGENTS.md and CLAUDE.md with full inline GitNexus context.
 * AGENTS.md is the standard read by Cursor, Windsurf, OpenCode, Codex, Cline, etc.
 * CLAUDE.md is for Claude Code which only reads that file.
 */
import { type GeneratedSkillInfo } from './skill-gen.js';
interface RepoStats {
    files?: number;
    nodes?: number;
    edges?: number;
    communities?: number;
    clusters?: number;
    processes?: number;
}
/**
 * Generate AI context files after indexing
 */
export declare function generateAIContextFiles(repoPath: string, _storagePath: string, projectName: string, stats: RepoStats, generatedSkills?: GeneratedSkillInfo[]): Promise<{
    files: string[];
}>;
export {};
