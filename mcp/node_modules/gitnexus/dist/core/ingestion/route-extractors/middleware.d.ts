/**
 * Middleware chain extraction from route handler file content.
 * Detects wrapper patterns like: export const POST = withA(withB(withC(handler)))
 */
/** Keywords that terminate middleware chain walking (not wrapper function names) */
export declare const MIDDLEWARE_STOP_KEYWORDS: Set<string>;
/**
 * Extract middleware wrapper chain from a route handler file.
 * Detects patterns like: export const POST = withA(withB(withC(handler)))
 * Returns an object with the wrapper function names (outermost-first) and the
 * HTTP method they were captured from, or undefined if no chain found.
 */
export declare function extractMiddlewareChain(content: string): {
    chain: string[];
    method: string;
} | undefined;
export interface NextjsMiddlewareConfig {
    matchers: string[];
    exportedName: string;
    wrappedFunctions: string[];
}
/**
 * Parse a Next.js project-level middleware.ts file and extract:
 * - config.matcher patterns (string or string[])
 * - the exported middleware function name
 * - wrapper composition (e.g. chain([withAuth, withI18n]))
 */
export declare function extractNextjsMiddlewareConfig(content: string): NextjsMiddlewareConfig | undefined;
/** Pre-compiled matcher for efficient per-route testing. */
export type CompiledMatcher = {
    type: 'prefix';
    prefix: string;
} | {
    type: 'regex';
    re: RegExp;
} | {
    type: 'exact';
    value: string;
};
/**
 * Compile a Next.js middleware matcher pattern into a reusable matcher.
 * Call once per pattern, then use compiledMatcherMatchesRoute per route.
 */
export declare function compileMatcher(matcher: string): CompiledMatcher | null;
/** Test a route URL against a pre-compiled matcher. */
export declare function compiledMatcherMatchesRoute(cm: CompiledMatcher, routeURL: string): boolean;
export declare function middlewareMatcherMatchesRoute(matcher: string, routeURL: string): boolean;
