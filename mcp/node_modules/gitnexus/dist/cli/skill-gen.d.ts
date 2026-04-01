/**
 * Skill File Generator
 *
 * Generates repo-specific SKILL.md files from detected Leiden communities.
 * Each significant community becomes a skill that describes a functional area
 * of the codebase, including key files, entry points, execution flows, and
 * cross-community connections.
 */
import { PipelineResult } from '../types/pipeline.js';
export interface GeneratedSkillInfo {
    name: string;
    label: string;
    symbolCount: number;
    fileCount: number;
}
/**
 * @brief Generate repo-specific skill files from detected communities
 * @param {string} repoPath - Absolute path to the repository root
 * @param {string} projectName - Human-readable project name
 * @param {PipelineResult} pipelineResult - In-memory pipeline data with communities, processes, graph
 * @returns {Promise<{ skills: GeneratedSkillInfo[], outputPath: string }>} Generated skill metadata
 */
export declare const generateSkillFiles: (repoPath: string, projectName: string, pipelineResult: PipelineResult) => Promise<{
    skills: GeneratedSkillInfo[];
    outputPath: string;
}>;
