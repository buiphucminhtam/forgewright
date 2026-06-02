/**
 * Feature Flags for Forgenexus Anti-Hallucination
 * These control which features are active at runtime.
 */

export interface FeatureFlags {
  /** Enable skeptic verification (default: true) */
  verify: boolean;
  /** Strict mode: reject any claim below threshold (default: false) */
  strict: boolean;
  /** Force bypass all verification (default: false) */
  noVerify: boolean;
  /** Enable skeptic agent (default: true) */
  enableSkeptic: boolean;
  /** Enable semantic energy uncertainty (default: true) */
  enableSemanticEnergy: boolean;
  /** Enable RAG retrieval (default: true) */
  enableRag: boolean;
  /** Enable citation extraction (default: true) */
  enableCitations: boolean;
  /** Enable confidence scoring (default: true) */
  enableConfidence: boolean;
}

const defaults: FeatureFlags = {
  verify: process.env.FORGE_VERIFY !== '0',
  strict: process.env.FORGE_STRICT === '1',
  noVerify: process.env.FORCE_NO_VERIFY === '1',
  enableSkeptic: process.env.FORGE_SKEPTIC !== '0',
  enableSemanticEnergy: process.env.FORGE_SEMANTIC_ENERGY !== '0',
  enableRag: process.env.FORGE_RAG !== '0',
  enableCitations: process.env.FORGE_CITATIONS !== '0',
  enableConfidence: process.env.FORGE_CONFIDENCE !== '0',
};

let _flags: FeatureFlags = { ...defaults };

export const featureFlags = {
  get current(): FeatureFlags {
    return { ..._flags };
  },

  set(overrides: Partial<FeatureFlags>) {
    _flags = { ..._flags, ...overrides };
  },

  reset() {
    _flags = { ...defaults };
  },

  isEnabled(flag: keyof FeatureFlags): boolean {
    return _flags[flag];
  },

  /** Check if verification pipeline should run */
  shouldVerify(): boolean {
    return _flags.verify && !_flags.noVerify;
  },

  /** Get confidence threshold based on strict mode */
  getConfidenceThreshold(): number {
    return _flags.strict ? 0.85 : 0.60;
  },

  /** Get skeptic max iterations */
  getMaxIterations(): number {
    return _flags.strict ? 2 : 3;
  },
};

export const ENV_VARS = {
  FORGE_VERIFY: 'Toggle verification (0=off, 1=on, default=1)',
  FORGE_STRICT: 'Enable strict mode — reject low confidence (1=strict, default=0)',
  FORCE_NO_VERIFY: 'Force bypass all verification (1=bypass, default=0)',
  FORGE_SKEPTIC: 'Enable skeptic agent (0=off, 1=on, default=1)',
  FORGE_SEMANTIC_ENERGY: 'Enable semantic energy (0=off, 1=on, default=1)',
  FORGE_RAG: 'Enable RAG retrieval (0=off, 1=on, default=1)',
  FORGE_CITATIONS: 'Enable citation extraction (0=off, 1=on, default=1)',
  FORGE_CONFIDENCE: 'Enable confidence scoring (0=off, 1=on, default=1)',
} as const;

export type ENVVar = keyof typeof ENV_VARS;
