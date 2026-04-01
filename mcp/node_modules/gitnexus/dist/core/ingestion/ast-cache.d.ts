import Parser from 'tree-sitter';
export interface ASTCache {
    get: (filePath: string) => Parser.Tree | undefined;
    set: (filePath: string, tree: Parser.Tree) => void;
    clear: () => void;
    stats: () => {
        size: number;
        maxSize: number;
    };
}
export declare const createASTCache: (maxSize?: number) => ASTCache;
