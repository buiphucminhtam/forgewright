/**
 * Creates a lazy-loaded CLI action that defers module import until invocation.
 * The generic constraints ensure the export name is a valid key of the module
 * at compile time — catching typos when used with concrete module imports.
 */
function isCallable(value) {
    return typeof value === 'function';
}
export function createLazyAction(loader, exportName) {
    return async (...args) => {
        const module = await loader();
        const action = module[exportName];
        if (!isCallable(action)) {
            throw new Error(`Lazy action export not found: ${exportName}`);
        }
        await action(...args);
    };
}
