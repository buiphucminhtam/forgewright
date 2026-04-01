// gitnexus/src/core/ingestion/field-extractor.ts
/**
 * Base class for field extractors with common utilities
 */
export class BaseFieldExtractor {
    normalizeType(type) {
        if (!type)
            return null;
        return type.trim().replace(/\s+/g, ' ');
    }
    resolveType(typeName, context) {
        const { typeEnv, symbolTable, filePath } = context;
        // Try to find in type environment (check file scope first)
        const fileEnv = typeEnv.fileScope();
        const local = fileEnv.get(typeName);
        if (local)
            return local;
        // Try symbol table lookup in current file
        const symbols = symbolTable.lookupExactAll(filePath, typeName);
        if (symbols.length === 1) {
            return symbols[0].nodeId;
        }
        return typeName;
    }
}
