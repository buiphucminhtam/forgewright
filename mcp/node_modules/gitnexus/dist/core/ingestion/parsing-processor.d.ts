import { KnowledgeGraph } from '../graph/types.js';
import { SymbolTable } from './symbol-table.js';
import { ASTCache } from './ast-cache.js';
import { WorkerPool } from './workers/worker-pool.js';
import type { ExtractedImport, ExtractedCall, ExtractedAssignment, ExtractedHeritage, ExtractedRoute, ExtractedFetchCall, ExtractedDecoratorRoute, ExtractedToolDef, FileConstructorBindings, FileTypeEnvBindings, ExtractedORMQuery } from './workers/parse-worker.js';
export type FileProgressCallback = (current: number, total: number, filePath: string) => void;
export interface WorkerExtractedData {
    imports: ExtractedImport[];
    calls: ExtractedCall[];
    assignments: ExtractedAssignment[];
    heritage: ExtractedHeritage[];
    routes: ExtractedRoute[];
    fetchCalls: ExtractedFetchCall[];
    decoratorRoutes: ExtractedDecoratorRoute[];
    toolDefs: ExtractedToolDef[];
    ormQueries: ExtractedORMQuery[];
    constructorBindings: FileConstructorBindings[];
    typeEnvBindings: FileTypeEnvBindings[];
}
export declare const processParsing: (graph: KnowledgeGraph, files: {
    path: string;
    content: string;
}[], symbolTable: SymbolTable, astCache: ASTCache, onFileProgress?: FileProgressCallback, workerPool?: WorkerPool) => Promise<WorkerExtractedData | null>;
