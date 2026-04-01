/**
 * Markdown Processor
 *
 * Extracts structure from .md files using regex (no tree-sitter dependency).
 * Creates Section nodes for headings with hierarchy, and IMPORTS edges for
 * cross-file links.
 */
import { KnowledgeGraph } from '../graph/types.js';
interface MdFile {
    path: string;
    content: string;
}
export declare const processMarkdown: (graph: KnowledgeGraph, files: MdFile[], allPathSet: Set<string>) => {
    sections: number;
    links: number;
};
export {};
