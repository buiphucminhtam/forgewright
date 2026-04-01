/**
 * COBOL source pre-processing and regex-based symbol extraction.
 *
 * DESIGN DECISION — Why regex instead of a full parser (ANTLR4, tree-sitter):
 *
 * 1. Performance: Regex processes ~1ms/file vs 50-200ms/file for ANTLR4/tree-sitter.
 *    On EPAGHE (14k COBOL files), this is ~14 seconds vs 12-47 minutes.
 *
 * 2. Reliability: tree-sitter-cobol@0.0.1's external scanner hangs indefinitely
 *    on ~5% of production files (no timeout possible). ANTLR4's proleap-cobol-parser
 *    is a Java project — using it from Node.js requires Java subprocesses or
 *    extracting .g4 grammars and generating JS/TS targets (significant effort).
 *
 * 3. Dialect compatibility: GnuCOBOL with Italian comments, patch markers in
 *    cols 1-6 (mzADD, estero, etc.), and vendor extensions. Formal grammars
 *    target COBOL-85 and would need dialect modifications.
 *
 * 4. Industry precedent: ctags, GitHub code navigation, and Sourcegraph all use
 *    regex-based extraction for code indexing. Full parsing is only needed for
 *    compilation or semantic analysis, not symbol extraction.
 *
 * 5. Determinism: Every regex pattern is tested with canonical COBOL input
 *    (see test/unit/cobol-preprocessor.test.ts). Same input always produces
 *    same output — no grammar ambiguity or parser state issues.
 *
 * This module provides:
 * 1. preprocessCobolSource() — cleans patch markers (kept for potential future use)
 * 2. extractCobolSymbolsWithRegex() — single-pass state machine COBOL extraction
 */
export interface CobolRegexResults {
    programName: string | null;
    /** All programs in this file with line-range boundaries for per-program scoping. */
    programs: Array<{
        name: string;
        startLine: number;
        endLine: number;
        nestingDepth: number;
        procedureUsing?: string[];
        isCommon?: boolean;
    }>;
    paragraphs: Array<{
        name: string;
        line: number;
    }>;
    sections: Array<{
        name: string;
        line: number;
    }>;
    performs: Array<{
        caller: string | null;
        target: string;
        thruTarget?: string;
        line: number;
    }>;
    calls: Array<{
        target: string;
        line: number;
        isQuoted: boolean;
        parameters?: string[];
        returning?: string;
    }>;
    copies: Array<{
        target: string;
        line: number;
    }>;
    dataItems: Array<{
        name: string;
        level: number;
        line: number;
        pic?: string;
        usage?: string;
        occurs?: number;
        dependingOn?: string;
        redefines?: string;
        values?: string[];
        isExternal?: boolean;
        isGlobal?: boolean;
        section: 'working-storage' | 'linkage' | 'file' | 'local-storage' | 'screen' | 'unknown';
    }>;
    fileDeclarations: Array<{
        selectName: string;
        assignTo: string;
        organization?: string;
        access?: string;
        recordKey?: string;
        alternateKeys?: string[];
        fileStatus?: string;
        isOptional?: boolean;
        line: number;
    }>;
    fdEntries: Array<{
        fdName: string;
        recordName?: string;
        line: number;
    }>;
    programMetadata: {
        author?: string;
        dateWritten?: string;
        dateCompiled?: string;
        installation?: string;
    };
    execSqlBlocks: Array<{
        line: number;
        tables: string[];
        cursors: string[];
        hostVariables: string[];
        operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'DECLARE' | 'OPEN' | 'CLOSE' | 'FETCH' | 'OTHER';
        includeMember?: string;
    }>;
    execCicsBlocks: Array<{
        line: number;
        command: string;
        mapName?: string;
        programName?: string;
        programIsLiteral?: boolean;
        transId?: string;
        fileName?: string;
        fileIsLiteral?: boolean;
        queueName?: string;
        labelName?: string;
        intoField?: string;
        fromField?: string;
    }>;
    procedureUsing: string[];
    entryPoints: Array<{
        name: string;
        parameters: string[];
        line: number;
    }>;
    moves: Array<{
        from: string;
        targets: string[];
        line: number;
        caller: string | null;
        corresponding: boolean;
    }>;
    gotos: Array<{
        caller: string | null;
        target: string;
        line: number;
    }>;
    sorts: Array<{
        sortFile: string;
        usingFiles: string[];
        givingFiles: string[];
        line: number;
    }>;
    searches: Array<{
        target: string;
        line: number;
    }>;
    cancels: Array<{
        target: string;
        line: number;
        isQuoted: boolean;
    }>;
    execDliBlocks: Array<{
        line: number;
        verb: string;
        pcbNumber?: number;
        segmentName?: string;
        intoField?: string;
        fromField?: string;
        psbName?: string;
    }>;
    declaratives: Array<{
        sectionName: string;
        target: string;
        line: number;
    }>;
    sets: Array<{
        targets: string[];
        form: 'to-true' | 'to-value' | 'up-by' | 'down-by';
        value?: string;
        line: number;
        caller: string | null;
    }>;
    inspects: Array<{
        inspectedField: string;
        counters: string[];
        form: 'tallying' | 'replacing' | 'converting' | 'tallying-replacing';
        line: number;
        caller: string | null;
    }>;
    initializes: Array<{
        target: string;
        line: number;
        caller: string | null;
    }>;
}
/**
 * Normalize COBOL source for regex-based extraction.
 *
 * The COBOL fixed-format sequence number area (columns 1-6) is semantically
 * irrelevant to parsing — compilers and tools always ignore it.  This
 * function replaces ANY non-space content in columns 1-6 with spaces
 * so that position-sensitive regexes (paragraph/section detection, data-item
 * anchors, etc.) work identically whether the file carries numeric sequence
 * numbers (000100), alphabetic patch markers (mzADD, estero, #patch), or
 * the COBOL default of all spaces.
 *
 * Preserves exact line count for position mapping.
 */
export declare function preprocessCobolSource(content: string): string;
/**
 * Extract COBOL symbols using a single-pass state machine.
 * Extracts program name, paragraphs, sections, CALL, PERFORM, COPY,
 * data items, file declarations, FD entries, and program metadata.
 */
export declare function extractCobolSymbolsWithRegex(content: string, _filePath: string): CobolRegexResults;
