/**
 * Language Provider interface — the complete capability contract for a supported language.
 *
 * Each language implements this interface in a single file under `languages/`.
 * The pipeline accesses all per-language behavior through this interface.
 *
 * Design pattern: Strategy pattern with compile-time exhaustiveness.
 * The providers table in `languages/index.ts` uses `satisfies Record<SupportedLanguages, LanguageProvider>`
 * so adding a language to the enum without creating a provider is a compiler error.
 */
const DEFAULTS = {
    importSemantics: 'named',
    heritageDefaultEdge: 'EXTENDS',
    mroStrategy: 'first-wins',
};
/** Define a language provider — required fields must be supplied, optional fields get sensible defaults. */
export function defineLanguage(config) {
    const builtIns = config.builtInNames;
    return {
        ...DEFAULTS,
        ...config,
        isBuiltInName: builtIns ? (name) => builtIns.has(name) : () => false,
    };
}
