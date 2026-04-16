/**
 * Configuration Manager - Layered config resolution
 *
 * Priority (highest to lowest):
 * 1. OS Environment variables (FORGE_*)
 * 2. User config (~/.config/forgewright/config.json)
 * 3. Process environment (injected)
 * 4. .env files (.env, .env.local)
 * 5. Inline flags (lowest priority)
 */
import { homedir } from 'os';
import { join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import type { ConfigSource, ConfigEntry } from '../types/index.js';

// Config source priorities
export const CONFIG_SOURCE_PRIORITY: Record<number, ConfigSource> = {
  1: 'OS_ENV',
  2: 'USER_CONFIG',
  3: 'PROCESS_ENV',
  4: 'DOTENV',
  5: 'INLINE_FLAGS',
};

export const SOURCE_LABELS: Record<ConfigSource, string> = {
  OS_ENV: 'Environment Variable',
  USER_CONFIG: 'User Config (~/.config/forgewright)',
  PROCESS_ENV: 'Process Environment',
  DOTENV: '.env File',
  INLINE_FLAGS: 'Inline Flag',
};

// Config file locations
export const CONFIG_PATHS = {
  USER_CONFIG: join(homedir(), '.config', 'forgewright', 'config.json'),
  LEGACY_CONFIG: join(homedir(), '.forgewright', 'config.json'),
  LOCAL_ENV: '.env',
  LOCAL_ENV_LOCAL: '.env.local',
  PROJECT_ENV: '.env',
  PROJECT_ENV_LOCAL: '.env.local',
};

// Environment variable prefix
export const ENV_PREFIX = 'FORGE_';

/**
 * Configuration store
 */
export class ConfigStore {
  private values: Map<string, ConfigEntry> = new Map();
  private inlineFirst = false;

  constructor() {
    this.loadDefaults();
  }

  /**
   * Load default configuration values
   */
  private loadDefaults(): void {
    this.set('forge.debug', false, 'DEFAULT');
    this.set('forge.quiet', false, 'DEFAULT');
    this.set('forge.json', false, 'DEFAULT');
    this.set('forge.color', true, 'DEFAULT');
    this.set('forge.apiUrl', 'https://api.forgewright.io', 'DEFAULT');
    this.set('forge.timeout', 30000, 'DEFAULT');
  }

  /**
   * Set a configuration value
   */
  set(key: string, value: unknown, source: ConfigSource | 'DEFAULT'): void {
    const entry: ConfigEntry = {
      key,
      value,
      source: source === 'DEFAULT' ? 'INLINE_FLAGS' : source,
    };

    // Check if we should override
    const existing = this.values.get(key);
    if (existing && !this.shouldOverride(existing.source, entry.source)) {
      return;
    }

    this.values.set(key, entry);
  }

  /**
   * Check if new source should override existing
   */
  private shouldOverride(existingSource: ConfigSource, newSource: ConfigSource): boolean {
    if (this.inlineFirst) {
      return existingSource > newSource;
    }
    return existingSource > newSource;
  }

  /**
   * Get a configuration value
   */
  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    const entry = this.values.get(key);
    return entry ? (entry.value as T) : defaultValue;
  }

  /**
   * Get with source info
   */
  getEntry(key: string): ConfigEntry | undefined {
    return this.values.get(key);
  }

  /**
   * Get all entries
   */
  getAll(): ConfigEntry[] {
    return Array.from(this.values.values());
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.values.has(key);
  }

  /**
   * Delete a key
   */
  delete(key: string): boolean {
    return this.values.delete(key);
  }

  /**
   * Enable inline-first mode (higher priority for inline/flag values)
   */
  enableInlineFirst(): void {
    this.inlineFirst = true;
  }

  /**
   * Load from user config file
   */
  loadUserConfig(): boolean {
    const path = CONFIG_PATHS.USER_CONFIG;

    if (!existsSync(path)) {
      // Try legacy path
      if (existsSync(CONFIG_PATHS.LEGACY_CONFIG)) {
        return this.loadJsonFile(CONFIG_PATHS.LEGACY_CONFIG, 'USER_CONFIG');
      }
      return false;
    }

    return this.loadJsonFile(path, 'USER_CONFIG');
  }

  /**
   * Load from .env files
   */
  loadEnvFiles(cwd: string): void {
    const paths = [
      resolve(cwd, CONFIG_PATHS.PROJECT_ENV_LOCAL),
      resolve(cwd, CONFIG_PATHS.PROJECT_ENV),
    ];

    for (const path of paths) {
      if (existsSync(path)) {
        this.loadEnvFile(path);
      }
    }
  }

  /**
   * Load environment variables
   */
  loadEnvVars(): void {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(ENV_PREFIX)) {
        const configKey = key.slice(ENV_PREFIX.length).toLowerCase().replace(/_/g, '.');
        this.set(configKey, this.parseValue(value), 'OS_ENV');
      }
    }
  }

  /**
   * Load JSON config file
   */
  private loadJsonFile(path: string, source: ConfigSource): boolean {
    try {
      const content = readFileSync(path, 'utf-8');
      const config = JSON.parse(content);

      for (const [key, value] of Object.entries(config)) {
        this.set(key, value, source);
      }

      return true;
    } catch (error) {
      console.warn(`Warning: Failed to load config from ${path}:`, error);
      return false;
    }
  }

  /**
   * Load .env file
   */
  private loadEnvFile(path: string): void {
    try {
      const content = readFileSync(path, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }

        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const [, key, value] = match;
          this.set(key.trim(), this.parseValue(value.trim()), 'DOTENV');
        }
      }
    } catch (error) {
      console.warn(`Warning: Failed to load .env from ${path}:`, error);
    }
  }

  /**
   * Parse value to appropriate type
   */
  private parseValue(value: string): unknown {
    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Null
    if (value === 'null') return null;
    if (value === 'undefined') return undefined;

    // Number
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

    // JSON parse for objects/arrays
    if ((value.startsWith('{') && value.endsWith('}')) ||
        (value.startsWith('[') && value.endsWith(']'))) {
      try {
        return JSON.parse(value);
      } catch {
        // Not valid JSON
      }
    }

    return value;
  }
}

/**
 * Global config instance
 */
let globalConfig: ConfigStore | null = null;

export function getConfig(): ConfigStore {
  if (!globalConfig) {
    globalConfig = new ConfigStore();
  }
  return globalConfig;
}

export function resetConfig(): void {
  globalConfig = null;
}
