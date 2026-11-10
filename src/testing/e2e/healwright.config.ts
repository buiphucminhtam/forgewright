/**
 * Healwright Configuration
 * AI-powered self-healing locators for Playwright
 * Supports: OpenAI, Anthropic, Gemini, Ollama, MiniMax
 */

export interface HealwrightConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'minimax';
  
  // Provider-specific config
  apiKey?: string;
  baseURL?: string;
  model?: string;
  
  // Healing behavior
  healing: {
    enabled: boolean;
    maxRetries: number;
    similarityThreshold: number;  // 0.0 - 1.0
    cacheEnabled: boolean;
    cacheTTL: number;  // seconds
    allowOracleMutation: false;
    preserveAcceptanceOracle: true;
  };
  
  // Smart locator generation
  smartLocators: {
    enabled: boolean;
    generateOnFailure: boolean;
    saveToFile: boolean;
    filePath: string;
  };
  
  // Multi-attribute fallback
  fallbackChain: string[];  // ['css', 'xpath', 'text', 'role', 'aria']
}

export const defaultConfig: HealwrightConfig = {
  enabled: true,
  provider: 'openai',
  
  healing: {
    enabled: true,
    maxRetries: 3,
    similarityThreshold: 0.85,
    cacheEnabled: true,
    cacheTTL: 3600,  // 1 hour
    allowOracleMutation: false,
    preserveAcceptanceOracle: true,
  },
  
  smartLocators: {
    enabled: true,
    generateOnFailure: true,
    saveToFile: true,
    filePath: './test-results/healed-locators.json',
  },
  
  fallbackChain: ['css', 'xpath', 'text', 'role', 'aria'],
};

// MiniMax specific configuration
export const minimaxConfig: Partial<HealwrightConfig> = {
  provider: 'minimax',
  baseURL: 'https://api.minimax.io',
  model: 'MiniMax-M2.7',
  
  healing: {
    ...defaultConfig.healing,
    similarityThreshold: 0.85,  // MiniMax has good accuracy
  },
};

// Provider models mapping
export const providerModels: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest'],
  gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-exp'],
  ollama: ['llama3.2', 'qwen2.5-coder-7b', 'codellama'],
  minimax: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.1'],
};
