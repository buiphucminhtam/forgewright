/**
 * Instincts Configuration — Feature flags and settings
 * 
 * Controls:
 * - Enable/disable entire system (FORGEWRIGHT_INSTINCTS_ENABLED=0)
 * - Confidence thresholds
 * - Rate limiting
 * - Storage settings
 */

import { resolve } from 'path';
import { existsSync } from 'fs';

// ─── Environment Variable Names ────────────────────────────────────

export const ENV_VARS = {
  ENABLED: 'FORGEWRIGHT_INSTINCTS_ENABLED',
  CONFIG_PATH: 'FORGEWRIGHT_INSTINCTS_CONFIG',
  STORE_PATH: 'FORGEWRIGHT_INSTINCTS_STORE',
  LOG_LEVEL: 'FORGEWRIGHT_INSTINCTS_LOG',
} as const;

// ─── Default Configuration ─────────────────────────────────────────

export interface InstinctsConfig {
  /** Master switch — set to 0/false to disable entire system */
  enabled: boolean;
  
  /** Minimum tool sequence length to consider a pattern */
  minSequenceLength: number;
  
  /** Rolling window size for tool sequences */
  sequenceWindowSize: number;
  
  /** Minimum confidence to persist a new pattern */
  minInitialConfidence: number;
  
  /** Confidence threshold to suggest pattern promotion */
  promotionThreshold: number;
  
  /** Maximum events to process per minute (rate limiting) */
  maxEventsPerMinute: number;
  
  /** Path to the JSON store */
  storePath: string;
  
  /** Maximum patterns to store */
  maxPatterns: number;
  
  /** Minimum confidence to keep a pattern (pruning threshold) */
  pruneThreshold: number;
  
  /** Log level: 'silent' | 'error' | 'info' | 'debug' */
  logLevel: 'silent' | 'error' | 'info' | 'debug';
  
  /** Whether to auto-suggest patterns to user */
  autoSuggest: boolean;
  
  /** Maximum suggestions per session */
  maxSuggestionsPerSession: number;
  
  /** Time in ms to debounce suggestions */
  suggestionDebounceMs: number;
  
  /** Whether to track cross-project patterns */
  crossProjectTracking: boolean;
  
  /** Whether to hash tool arguments for privacy */
  hashArguments: boolean;
}

const DEFAULT_CONFIG: InstinctsConfig = {
  enabled: true,
  minSequenceLength: 3,
  sequenceWindowSize: 10,
  minInitialConfidence: 0.35,
  promotionThreshold: 0.7,
  maxEventsPerMinute: 60,
  storePath: resolve(process.env.FORGEWRIGHT_DIR || '', '.forgewright/instincts/store.json'),
  maxPatterns: 1000,
  pruneThreshold: 0.15,
  logLevel: 'info',
  autoSuggest: true,
  maxSuggestionsPerSession: 3,
  suggestionDebounceMs: 5000,
  crossProjectTracking: true,
  hashArguments: true,
};

// ─── Config Loading ────────────────────────────────────────────────

let _config: InstinctsConfig | null = null;

/**
 * Load configuration from environment and config file
 */
export function getInstinctsConfig(overrides?: Partial<InstinctsConfig>): InstinctsConfig {
  if (_config && !overrides) {
    return _config;
  }
  
  // Start with defaults
  let config: InstinctsConfig = { ...DEFAULT_CONFIG };
  
  // Override from environment
  config.enabled = loadEnvBool(ENV_VARS.ENABLED, DEFAULT_CONFIG.enabled);
  config.logLevel = loadEnvEnum(
    ENV_VARS.LOG_LEVEL,
    ['silent', 'error', 'info', 'debug'],
    DEFAULT_CONFIG.logLevel
  ) as InstinctsConfig['logLevel'];
  
  // Override store path from env
  if (process.env[ENV_VARS.STORE_PATH]) {
    config.storePath = process.env[ENV_VARS.STORE_PATH]!;
  }
  
  // Load from config file if exists
  const configPath = process.env[ENV_VARS.CONFIG_PATH] || 
    resolve(process.env.FORGEWRIGHT_DIR || '', '.forgewright/instincts-config.json');
  
  if (existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
      config = { ...config, ...fileConfig };
    } catch (err) {
      if (config.logLevel !== 'silent') {
        console.error(`[Instincts] Failed to load config from ${configPath}:`, err);
      }
    }
  }
  
  // Apply runtime overrides
  if (overrides) {
    config = { ...config, ...overrides };
  }
  
  _config = config;
  return config;
}

/**
 * Reset config cache (for testing)
 */
export function resetConfig(): void {
  _config = null;
}

/**
 * Check if instincts system is enabled
 */
export function isInstinctsEnabled(): boolean {
  return getInstinctsConfig().enabled;
}

// ─── Environment Helpers ───────────────────────────────────────────

function loadEnvBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  if (val === '0' || val === 'false' || val === 'no') return false;
  if (val === '1' || val === 'true' || val === 'yes') return true;
  return defaultValue;
}

function loadEnvEnum<T extends string>(
  key: string,
  allowed: T[],
  defaultValue: T
): T {
  const val = process.env[key];
  if (val && allowed.includes(val as T)) {
    return val as T;
  }
  return defaultValue;
}

function loadEnvNum(key: string, defaultValue: number, min?: number, max?: number): number {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  const num = parseFloat(val);
  if (isNaN(num)) return defaultValue;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
}

// ─── CLI Interface ────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Current Instincts Configuration:');
  console.log(JSON.stringify(getInstinctsConfig(), null, 2));
}
