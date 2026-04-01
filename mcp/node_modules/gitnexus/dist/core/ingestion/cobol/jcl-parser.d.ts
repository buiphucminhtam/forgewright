/**
 * JCL Parser — Regex single-pass extraction.
 *
 * Extracts JCL constructs from mainframe job streams:
 * - JOB statements (job name, CLASS, MSGCLASS)
 * - EXEC statements (step -> program or proc)
 * - DD statements (dataset references, DISP)
 * - PROC definitions (in-stream and catalogued)
 * - INCLUDE MEMBER= directives
 * - SET symbolic parameters
 * - IF/ELSE/ENDIF conditional execution
 * - JCLLIB ORDER= search paths
 *
 * Pattern follows cobol-preprocessor.ts — regex-only, no tree-sitter.
 */
export interface JclParseResults {
    jobs: Array<{
        name: string;
        line: number;
        class?: string;
        msgclass?: string;
    }>;
    steps: Array<{
        name: string;
        jobName: string;
        program?: string;
        proc?: string;
        line: number;
    }>;
    ddStatements: Array<{
        ddName: string;
        stepName: string;
        dataset?: string;
        disp?: string;
        line: number;
    }>;
    procs: Array<{
        name: string;
        line: number;
        isInStream: boolean;
    }>;
    includes: Array<{
        member: string;
        line: number;
    }>;
    sets: Array<{
        variable: string;
        value: string;
        line: number;
    }>;
    jcllib: Array<{
        order: string[];
        line: number;
    }>;
    conditionals: Array<{
        type: 'IF' | 'ELSE' | 'ENDIF';
        condition?: string;
        line: number;
    }>;
}
/**
 * Parse a JCL file and extract all constructs.
 *
 * @param content - Raw JCL file content
 * @param filePath - Path for diagnostics (not used in extraction)
 * @returns Parsed JCL results
 */
export declare function parseJcl(content: string, filePath: string): JclParseResults;
