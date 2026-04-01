import Parser from 'tree-sitter';
import { SupportedLanguages } from '../../config/supported-languages.js';
export declare const isLanguageAvailable: (language: SupportedLanguages) => boolean;
export declare const loadParser: () => Promise<Parser>;
export declare const loadLanguage: (language: SupportedLanguages, filePath?: string) => Promise<void>;
