import { LRUCache } from 'lru-cache';
export const createASTCache = (maxSize = 50) => {
    const effectiveMax = Math.max(maxSize, 1);
    // Initialize the cache with a 'dispose' handler
    // This is the magic: When an item is evicted (dropped), this runs automatically.
    const cache = new LRUCache({
        max: effectiveMax,
        dispose: (tree) => {
            try {
                // NOTE: web-tree-sitter has tree.delete(); native tree-sitter trees are GC-managed.
                // Keep this try/catch so we don't crash on either runtime.
                tree.delete?.();
            }
            catch (e) {
                console.warn('Failed to delete tree from WASM memory', e);
            }
        }
    });
    return {
        get: (filePath) => {
            const tree = cache.get(filePath);
            return tree; // Returns undefined if not found
        },
        set: (filePath, tree) => {
            cache.set(filePath, tree);
        },
        clear: () => {
            cache.clear();
        },
        stats: () => ({
            size: cache.size,
            maxSize: effectiveMax
        })
    };
};
