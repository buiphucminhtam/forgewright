/**
 * Creates a lazy-loaded CLI action that defers module import until invocation.
 * The generic constraints ensure the export name is a valid key of the module
 * at compile time — catching typos when used with concrete module imports.
 */
export declare function createLazyAction<TModule extends Record<string, unknown>, TKey extends string & keyof TModule>(loader: () => Promise<TModule>, exportName: TKey): (...args: unknown[]) => Promise<void>;
