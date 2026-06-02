/**
 * Tunable Thresholds — adjust based on beta feedback
 * These control when the system accepts or rejects content.
 */

export interface ThresholdConfig {
  wiki: {
    strict: number;    // Min confidence for --strict mode (0-1)
    normal: number;    // Min confidence for normal mode (0-1)
    citationMin: number; // Min confidence for citation to be "verified" (0-1)
  };
  skeptic: {
    maxIterations: number; // Max synthesizer-skeptic loop iterations
    claimThreshold: number; // Min confidence for claim to pass (0-1)
    falsePositivePenalty: number; // Penalty for false positive (0-1)
  };
  citation: {
    minConfidence: number; // Min citation confidence (0-1)
    minSourceLength: number; // Min source text length for citation
  };
  impact: {
    staleDays: number; // Days before graph data is considered "stale"
    minConfidence: number; // Min confidence for impact analysis (0-1)
  };
  rag: {
    maxResults: number; // Max RAG results to retrieve
    minRelevance: number; // Min relevance score (0-1)
    timeoutMs: number; // Query timeout in ms
  };
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  wiki: {
    strict: 0.85,
    normal: 0.60,
    citationMin: 0.80,
  },
  skeptic: {
    maxIterations: 3,
    claimThreshold: 0.70,
    falsePositivePenalty: 0.15,
  },
  citation: {
    minConfidence: 0.80,
    minSourceLength: 50,
  },
  impact: {
    staleDays: 7,
    minConfidence: 0.65,
  },
  rag: {
    maxResults: 10,
    minRelevance: 0.50,
    timeoutMs: 5000,
  },
};

let _thresholds: ThresholdConfig = { ...DEFAULT_THRESHOLDS };

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target } as T;
  for (const key of Object.keys(source) as (keyof T)[]) {
    const s = source[key];
    const t = target[key];
    if (s !== undefined) {
      result[key] = isObject(s) && isObject(t)
        ? deepMerge(t, s as Partial<typeof t>)
        : s as T[keyof T];
    }
  }
  return result;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const thresholds = {
  get current(): ThresholdConfig {
    return JSON.parse(JSON.stringify(_thresholds)) as ThresholdConfig;
  },
  
  set(overrides: Partial<ThresholdConfig>): void {
    _thresholds = deepMerge(_thresholds, overrides);
  },
  
  reset(): void {
    _thresholds = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS)) as ThresholdConfig;
  },
  
  // Convenience getters
  get wikiConfidence(): number {
    return _thresholds.wiki.normal;
  },
  get wikiStrictConfidence(): number {
    return _thresholds.wiki.strict;
  },
  get skepticMaxIterations(): number {
    return _thresholds.skeptic.maxIterations;
  },
  get skepticClaimThreshold(): number {
    return _thresholds.skeptic.claimThreshold;
  },
  get staleDays(): number {
    return _thresholds.impact.staleDays;
  },
  get citationMinConfidence(): number {
    return _thresholds.citation.minConfidence;
  },
  get ragMaxResults(): number {
    return _thresholds.rag.maxResults;
  },
  get ragMinRelevance(): number {
    return _thresholds.rag.minRelevance;
  },
};

// Environment variable overrides (loaded once at startup)
export function loadEnvOverrides(): void {
  // Wiki thresholds
  if (process.env.FORGE_WIKI_STRICT) {
    const val = parseFloat(process.env.FORGE_WIKI_STRICT);
    if (!isNaN(val) && val >= 0 && val <= 1) {
      _thresholds.wiki.strict = val;
    }
  }
  if (process.env.FORGE_WIKI_NORMAL) {
    const val = parseFloat(process.env.FORGE_WIKI_NORMAL);
    if (!isNaN(val) && val >= 0 && val <= 1) {
      _thresholds.wiki.normal = val;
    }
  }

  // Skeptic thresholds
  if (process.env.FORGE_SKEPTIC_MAX) {
    const val = parseInt(process.env.FORGE_SKEPTIC_MAX, 10);
    if (!isNaN(val) && val > 0) {
      _thresholds.skeptic.maxIterations = val;
    }
  }
  if (process.env.FORGE_SKEPTIC_CLAIM) {
    const val = parseFloat(process.env.FORGE_SKEPTIC_CLAIM);
    if (!isNaN(val) && val >= 0 && val <= 1) {
      _thresholds.skeptic.claimThreshold = val;
    }
  }

  // Citation thresholds
  if (process.env.FORGE_CITATION_MIN) {
    const val = parseFloat(process.env.FORGE_CITATION_MIN);
    if (!isNaN(val) && val >= 0 && val <= 1) {
      _thresholds.citation.minConfidence = val;
    }
  }

  // Impact thresholds
  if (process.env.FORGE_STALE_DAYS) {
    const val = parseInt(process.env.FORGE_STALE_DAYS, 10);
    if (!isNaN(val) && val > 0) {
      _thresholds.impact.staleDays = val;
    }
  }

  // RAG thresholds
  if (process.env.FORGE_RAG_MAX) {
    const val = parseInt(process.env.FORGE_RAG_MAX, 10);
    if (!isNaN(val) && val > 0) {
      _thresholds.rag.maxResults = val;
    }
  }
  if (process.env.FORGE_RAG_MIN_REL) {
    const val = parseFloat(process.env.FORGE_RAG_MIN_REL);
    if (!isNaN(val) && val >= 0 && val <= 1) {
      _thresholds.rag.minRelevance = val;
    }
  }
}
