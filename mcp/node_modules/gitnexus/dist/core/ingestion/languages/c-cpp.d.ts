/**
 * C and C++ language providers.
 *
 * Both languages use wildcard import semantics (headers expose all symbols
 * via #include). Neither language has named binding extraction.
 *
 * C uses 'first-wins' MRO (no inheritance). C++ uses 'leftmost-base' MRO
 * for its left-to-right multiple inheritance resolution order.
 */
import type { LanguageProvider } from '../language-provider.js';
export declare const cProvider: LanguageProvider;
export declare const cppProvider: LanguageProvider;
