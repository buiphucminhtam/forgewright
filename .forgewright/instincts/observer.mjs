var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// .forgewright/instincts/observer.ts
import { createHash as createHash2 } from "crypto";
import { existsSync as existsSync3, readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, lstatSync as lstatSync2, statSync as statSync2, realpathSync, renameSync as renameSync2 } from "fs";
import { resolve as resolve3, dirname as dirname2, relative, isAbsolute } from "path";
import { execSync } from "child_process";

// .forgewright/instincts/instinct-store.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, lstatSync, statSync, renameSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { createHash } from "crypto";
var DEFAULT_CONFIG = {
  storePath: resolve(process.env.FORGEWRIGHT_DIR || "", ".forgewright/instincts/store.json"),
  maxPatterns: 1e3,
  pruneThreshold: 0.15,
  crossProjectTracking: false
};
function hashToolSequence(tools) {
  const normalized = tools.join("|").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").substring(0, 16);
}
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function isStorePathSafe(storePath) {
  try {
    let curr = resolve(storePath);
    while (curr && curr !== "/" && curr !== ".") {
      let stat;
      try {
        stat = lstatSync(curr);
      } catch {
        stat = null;
      }
      if (stat && stat.isSymbolicLink()) {
        return false;
      }
      const parent = dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
  } catch {
    return false;
  }
  return true;
}
var InstinctStoreManager = class {
  config;
  store;
  dirty = false;
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = this.load();
  }
  /**
   * Load store from disk, or create new if doesn't exist
   */
  load() {
    const { storePath } = this.config;
    if (!isStorePathSafe(storePath)) {
      return this.createFresh();
    }
    if (existsSync(storePath)) {
      try {
        const stat = statSync(storePath);
        if (stat.size > 256 * 1024) {
          return this.createFresh();
        }
        const raw = readFileSync(storePath, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          patterns: parsed.patterns || [],
          version: parsed.version || "1.0.0",
          lastUpdated: parsed.lastUpdated || (/* @__PURE__ */ new Date()).toISOString()
        };
      } catch {
        return this.createFresh();
      }
    }
    return this.createFresh();
  }
  /**
   * Create a fresh store structure
   */
  createFresh() {
    return {
      patterns: [],
      version: "1.0.0",
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  /**
   * Persist store to disk (debounced writes)
   */
  save() {
    if (!this.dirty) return true;
    const { storePath } = this.config;
    let ownedTemporaryPath = null;
    try {
      if (!isStorePathSafe(storePath)) return false;
      const dir = dirname(storePath);
      mkdirSync(dir, { recursive: true });
      if (!statSync(dir).isDirectory() || !isStorePathSafe(storePath)) return false;
      this.store.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
      const payload = JSON.stringify(this.store, null, 2);
      if (Buffer.byteLength(payload, "utf8") > 256 * 1024) return false;
      const tmpPath = `${storePath}.tmp.${process.pid}.${Date.now()}`;
      writeFileSync(tmpPath, payload, { encoding: "utf8", flag: "wx", mode: 384 });
      ownedTemporaryPath = tmpPath;
      if (!isStorePathSafe(storePath)) return false;
      renameSync(tmpPath, storePath);
      ownedTemporaryPath = null;
      this.dirty = false;
      return true;
    } catch {
      return false;
    } finally {
      if (ownedTemporaryPath) {
        try {
          unlinkSync(ownedTemporaryPath);
        } catch {
        }
      }
    }
  }
  /**
   * Add or update a pattern
   */
  recordPattern(toolSequence, projectContext, projectId, confidence) {
    const hash = hashToolSequence(toolSequence);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let existing;
    if (!this.config.crossProjectTracking) {
      existing = this.store.patterns.find((p) => p.id === hash && p.projectIds.includes(projectId));
    } else {
      existing = this.store.patterns.find((p) => p.id === hash);
    }
    if (existing) {
      existing.occurrences += 1;
      existing.lastSeen = now;
      existing.confidence = Math.max(existing.confidence, confidence);
      if (!existing.projectIds.includes(projectId)) {
        existing.projectIds.push(projectId);
        existing.crossProject = existing.projectIds.length > 1;
      }
      if (projectContext.language && !existing.projectContext.language) {
        existing.projectContext.language = projectContext.language;
      }
      if (projectContext.framework && !existing.projectContext.framework) {
        existing.projectContext.framework = projectContext.framework;
      }
      this.dirty = true;
      return deepClone(existing);
    }
    const newPattern = {
      id: hash,
      toolSequence,
      projectContext,
      confidence,
      occurrences: 1,
      firstSeen: now,
      lastSeen: now,
      suggested: false,
      crossProject: false,
      projectIds: [projectId]
    };
    this.store.patterns.push(newPattern);
    this.dirty = true;
    if (this.store.patterns.length > this.config.maxPatterns) {
      this.pruneLowConfidence();
    }
    return deepClone(newPattern);
  }
  /**
   * Find patterns matching a tool sequence
   */
  findPattern(toolSequence, projectId) {
    const hash = hashToolSequence(toolSequence);
    if (!this.config.crossProjectTracking && projectId) {
      return this.store.patterns.find((p) => p.id === hash && p.projectIds.includes(projectId)) || null;
    }
    return this.store.patterns.find((p) => p.id === hash) || null;
  }
  /**
   * Get all patterns for a project
   */
  getPatternsForProject(projectId) {
    return this.store.patterns.filter((p) => p.projectIds.includes(projectId));
  }
  /**
   * Get patterns ready for promotion (confidence >= threshold)
   */
  getPromotablePatterns(minConfidence = 0.7) {
    return this.store.patterns.filter((p) => p.confidence >= minConfidence && !p.suggested).sort((a, b) => b.confidence - a.confidence);
  }
  /**
   * Mark a pattern as suggested
   */
  markSuggested(patternId) {
    const pattern = this.store.patterns.find((p) => p.id === patternId);
    if (pattern) {
      pattern.suggested = true;
      this.dirty = true;
    }
  }
  /**
   * Get all patterns
   */
  getAllPatterns() {
    return deepClone(this.store.patterns);
  }
  /**
   * Prune low-confidence patterns to manage store size
   */
  pruneLowConfidence() {
    const before = this.store.patterns.length;
    this.store.patterns = this.store.patterns.filter((p) => p.confidence >= this.config.pruneThreshold).sort((a, b) => b.confidence - a.confidence).slice(0, this.config.maxPatterns);
    const pruned = before - this.store.patterns.length;
    if (pruned > 0) {
      console.log(`[InstinctStore] Pruned ${pruned} low-confidence patterns`);
    }
  }
  /**
   * Get store stats
   */
  getStats() {
    const patterns = this.store.patterns;
    return {
      totalPatterns: patterns.length,
      avgConfidence: patterns.length > 0 ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length : 0,
      crossProjectCount: patterns.filter((p) => p.crossProject).length,
      lastUpdated: this.store.lastUpdated
    };
  }
  /**
   * Clear all patterns (for testing/reset)
   */
  clear() {
    this.store = this.createFresh();
    this.dirty = true;
    this.save();
  }
};
var _instances = /* @__PURE__ */ new Map();
function getInstinctStore(config) {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };
  const key = effectiveConfig.storePath;
  if (!_instances.has(key)) {
    if (_instances.size >= 50) {
      const oldest = _instances.keys().next().value;
      if (oldest !== void 0) _instances.delete(oldest);
    }
    _instances.set(key, new InstinctStoreManager(effectiveConfig));
  }
  return _instances.get(key);
}
function resetStoreManager() {
  _instances.clear();
}
var isDirect_instinct_store_ts = process.argv[1] && (process.argv[1].endsWith("instinct-store.ts") || process.argv[1].endsWith("instinct-store.js"));
if (isDirect_instinct_store_ts) {
  const store = getInstinctStore();
  const stats = store.getStats();
  console.log(JSON.stringify(stats, null, 2));
}

// .forgewright/instincts/scorer.ts
var MIN_CONFIDENCE = 0.3;
var MAX_CONFIDENCE = 0.9;
var WEIGHTS = {
  frequency: 0.3,
  // Weight for occurrence count
  consistency: 0.25,
  // Weight for cross-file consistency
  recency: 0.25,
  // Weight for recency of patterns
  crossProject: 0.2
  // Weight for cross-project usage
};
var THRESHOLDS = {
  frequency: {
    initial: 3,
    // Min occurrences for base score
    good: 5,
    // Occurrences for good score
    excellent: 10
    // Occurrences for excellent score
  },
  recency: {
    // Hours after which recency score decays
    day: 24,
    week: 168,
    // 7 days
    month: 720
    // 30 days
  }
};
function calculateRecencyScore(lastSeen, firstSeen) {
  const now = Date.now();
  const last = new Date(lastSeen).getTime();
  const first = new Date(firstSeen).getTime();
  const hoursSinceLast = (now - last) / (1e3 * 60 * 60);
  const hoursSinceFirst = (now - first) / (1e3 * 60 * 60);
  const decayRate = 1 / THRESHOLDS.recency.month;
  let lastSeenScore = Math.exp(-decayRate * hoursSinceLast);
  let firstSeenScore = Math.exp(-decayRate * hoursSinceFirst * 0.5);
  return lastSeenScore * 0.7 + firstSeenScore * 0.3;
}
function calculateFrequencyScore(occurrences) {
  if (occurrences <= 1) return 0.2;
  if (occurrences < THRESHOLDS.frequency.initial) {
    return 0.2 + occurrences / THRESHOLDS.frequency.initial * 0.3;
  }
  if (occurrences < THRESHOLDS.frequency.good) {
    return 0.5 + (occurrences - THRESHOLDS.frequency.initial) / (THRESHOLDS.frequency.good - THRESHOLDS.frequency.initial) * 0.2;
  }
  if (occurrences < THRESHOLDS.frequency.excellent) {
    return 0.7 + (occurrences - THRESHOLDS.frequency.good) / (THRESHOLDS.frequency.excellent - THRESHOLDS.frequency.good) * 0.2;
  }
  return 0.9;
}
function calculateConsistencyScore(occurrences, projectContext, affectedFiles) {
  let score = 0.5;
  if (projectContext?.language) score += 0.1;
  if (projectContext?.framework) score += 0.1;
  if (projectContext?.projectType) score += 0.1;
  if (affectedFiles && affectedFiles.length > 1) {
    const extensions = new Set(
      affectedFiles.map((f) => f.split(".").pop() || "").filter(Boolean)
    );
    if (extensions.size > 1) {
      score += Math.min(0.1, extensions.size * 0.03);
    }
  }
  if (occurrences >= 5) score += 0.1;
  return Math.min(score, 1);
}
function calculateCrossProjectScore(crossProject, projectIds) {
  if (crossProject) {
    return Math.min(0.9, 0.5 + (projectIds.length - 1) * 0.15);
  }
  if (projectIds.length === 1) {
    return 0.3;
  }
  return 0.1;
}
function calculateInitialConfidence(toolCount, projectContext) {
  let base = 0.3;
  if (toolCount >= 3) base += 0.1;
  if (toolCount >= 5) base += 0.05;
  if (projectContext?.language) base += 0.05;
  return Math.min(base, MAX_CONFIDENCE);
}
function scorePattern(input) {
  const {
    occurrences,
    firstSeen,
    lastSeen,
    projectContext,
    crossProject,
    projectIds,
    affectedFiles
  } = input;
  const frequencyScore = calculateFrequencyScore(occurrences);
  const recencyScore = calculateRecencyScore(lastSeen, firstSeen);
  const consistencyScore = calculateConsistencyScore(occurrences, projectContext, affectedFiles);
  const crossProjectScore = calculateCrossProjectScore(crossProject, projectIds);
  const confidence = Math.min(
    MAX_CONFIDENCE,
    Math.max(
      MIN_CONFIDENCE,
      frequencyScore * WEIGHTS.frequency + recencyScore * WEIGHTS.recency + consistencyScore * WEIGHTS.consistency + crossProjectScore * WEIGHTS.crossProject
    )
  );
  let recommendation;
  if (confidence >= 0.7 && crossProject) {
    recommendation = "promote";
  } else if (confidence >= 0.6) {
    recommendation = "high";
  } else if (confidence >= 0.45) {
    recommendation = "medium";
  } else {
    recommendation = "low";
  }
  return {
    confidence: Math.round(confidence * 100) / 100,
    // Round to 2 decimal places
    breakdown: {
      frequency: Math.round(frequencyScore * 100) / 100,
      consistency: Math.round(consistencyScore * 100) / 100,
      recency: Math.round(recencyScore * 100) / 100,
      crossProject: Math.round(crossProjectScore * 100) / 100
    },
    recommendation
  };
}
function normalizeToolName(tool) {
  return tool.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/-/g, "_").toLowerCase();
}
function analyzeToolSequence(tools) {
  const toolSet = new Set(tools.map((t) => normalizeToolName(t)));
  let intent = "general";
  let description = "Tool sequence";
  if (toolSet.has("read") && (toolSet.has("str_replace") || toolSet.has("edit"))) {
    intent = "edit";
    description = "Read and modify code";
  } else if (toolSet.has("read") && toolSet.has("grep")) {
    intent = "search";
    description = "File search and content exploration";
  } else if (toolSet.has("write")) {
    intent = "write";
    description = "File creation or modification";
  } else if (toolSet.has("shell") || toolSet.has("bash")) {
    intent = "execute";
    description = "Shell command execution";
  } else if (toolSet.has("glob") || toolSet.has("grep")) {
    intent = "explore";
    description = "Project exploration and discovery";
  }
  const uniqueRatio = toolSet.size / tools.length;
  const complexity = Math.min(5, Math.ceil(
    tools.length * 0.3 + uniqueRatio * 2 + toolSet.size * 0.2
  ));
  const isHabitual = tools.length >= 3 && uniqueRatio < 0.8;
  return {
    complexity,
    intent,
    isHabitual,
    description
  };
}
var isDirect_scorer_ts = process.argv[1] && (process.argv[1].endsWith("scorer.ts") || process.argv[1].endsWith("scorer.js"));
if (isDirect_scorer_ts) {
  const sample = {
    occurrences: 5,
    firstSeen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString(),
    lastSeen: new Date(Date.now() - 1 * 60 * 60 * 1e3).toISOString(),
    projectContext: { language: "typescript", framework: "react" },
    crossProject: true,
    projectIds: ["project-a", "project-b"],
    affectedFiles: ["src/App.tsx", "src/components/Button.tsx"]
  };
  console.log("Sample scoring:");
  console.log(JSON.stringify(scorePattern(sample), null, 2));
}

// .forgewright/instincts/instincts-config.ts
import { resolve as resolve2 } from "path";
import { existsSync as existsSync2 } from "fs";
var ENV_VARS = {
  ENABLED: "FORGEWRIGHT_INSTINCTS_ENABLED",
  CONFIG_PATH: "FORGEWRIGHT_INSTINCTS_CONFIG",
  STORE_PATH: "FORGEWRIGHT_INSTINCTS_STORE",
  LOG_LEVEL: "FORGEWRIGHT_INSTINCTS_LOG"
};
var DEFAULT_CONFIG2 = {
  enabled: false,
  minSequenceLength: 3,
  sequenceWindowSize: 10,
  minInitialConfidence: 0.35,
  promotionThreshold: 0.7,
  maxEventsPerMinute: 60,
  storePath: resolve2(process.env.FORGEWRIGHT_DIR || "", ".forgewright/instincts/store.json"),
  maxPatterns: 1e3,
  pruneThreshold: 0.15,
  logLevel: "info",
  autoSuggest: false,
  maxSuggestionsPerSession: 3,
  suggestionDebounceMs: 5e3,
  crossProjectTracking: false,
  hashArguments: true
};
var _config = null;
function getInstinctsConfig(overrides) {
  if (_config && !overrides) {
    return _config;
  }
  let config = { ...DEFAULT_CONFIG2 };
  config.enabled = loadEnvBool(ENV_VARS.ENABLED, false);
  config.logLevel = loadEnvEnum(
    ENV_VARS.LOG_LEVEL,
    ["silent", "error", "info", "debug"],
    DEFAULT_CONFIG2.logLevel
  );
  if (process.env[ENV_VARS.STORE_PATH]) {
    config.storePath = process.env[ENV_VARS.STORE_PATH];
  }
  const configPath = process.env[ENV_VARS.CONFIG_PATH] || resolve2(process.env.FORGEWRIGHT_DIR || "", ".forgewright/instincts-config.json");
  if (existsSync2(configPath)) {
    try {
      const fileConfig = JSON.parse(__require("fs").readFileSync(configPath, "utf-8"));
      config = { ...config, ...fileConfig };
    } catch (err) {
      if (config.logLevel !== "silent") {
        console.error(`[Instincts] Failed to load config from ${configPath}:`, err);
      }
    }
  }
  if (overrides) {
    config = { ...config, ...overrides };
  }
  _config = config;
  return config;
}
function loadEnvBool(key, defaultValue) {
  const val = process.env[key];
  if (val === void 0) return defaultValue;
  if (val === "0" || val === "false" || val === "no") return false;
  if (val === "1" || val === "true" || val === "yes") return true;
  return defaultValue;
}
function loadEnvEnum(key, allowed, defaultValue) {
  const val = process.env[key];
  if (val && allowed.includes(val)) {
    return val;
  }
  return defaultValue;
}
var isDirect_instincts_config_ts = process.argv[1] && (process.argv[1].endsWith("instincts-config.ts") || process.argv[1].endsWith("instincts-config.js"));
if (isDirect_instincts_config_ts) {
  console.log("Current Instincts Configuration:");
  console.log(JSON.stringify(getInstinctsConfig(), null, 2));
}

// .forgewright/instincts/observer.ts
var CONTEXT_CACHE_TTL_MS = 6e4;
var MAX_CONTEXT_CACHE_ENTRIES = 50;
var MAX_SESSIONS = 50;
var MAX_SESSION_HISTORY = 50;
var MAX_ID_CHARS = 256;
var MAX_ARG_BYTES = 64 * 1024;
var MAX_EVENT_BYTES = 128 * 1024;
var MAX_HEALTH_FILE_BYTES = 256 * 1024;
var DEFAULT_HEALTH = {
  hookId: "forgewright-instinct-hook",
  version: "1.1.0",
  state: "registered",
  lastRun: null,
  counters: {
    observed: 0,
    processed: 0,
    failed: 0,
    skipped: 0
  },
  lastSkipReason: null,
  lastError: null
};
var MAX_PROJECT_HEALTH_ENTRIES = 50;
var projectHealthMap = /* @__PURE__ */ new Map();
var ALLOWED_HEALTH_ERRORS = /* @__PURE__ */ new Set([
  "health_write_failed",
  "store_write_failed",
  "store_save_failed",
  "observation_failed",
  "parse_failed",
  "timeout",
  "unknown_error",
  "unsupported",
  "missing_executable",
  "observer.mjs not found"
]);
var ALLOWED_SKIP_REASONS = /* @__PURE__ */ new Set([
  "feature_disabled",
  "symlink_escape_denied",
  "malformed_event",
  "oversized_event",
  "self_observation",
  "failed_outcome",
  "unknown_outcome",
  "rate_limited",
  "missing_executable",
  "unsupported_platform"
]);
function setProjectHealth(projectId, health) {
  if (projectHealthMap.size >= MAX_PROJECT_HEALTH_ENTRIES && !projectHealthMap.has(projectId)) {
    const oldestKey = projectHealthMap.keys().next().value;
    if (oldestKey !== void 0) {
      projectHealthMap.delete(oldestKey);
    }
  }
  projectHealthMap.set(projectId, cloneHealth(health));
}
function cloneHealth(h) {
  return {
    hookId: h.hookId,
    version: h.version,
    state: h.state,
    lastRun: h.lastRun,
    counters: { ...h.counters },
    lastSkipReason: h.lastSkipReason,
    lastError: h.lastError
  };
}
function getCanonicalRoot(projectRoot) {
  try {
    if (existsSync3(projectRoot)) {
      return realpathSync.native ? realpathSync.native(projectRoot) : realpathSync(projectRoot);
    }
  } catch {
  }
  return resolve3(projectRoot);
}
function isMetadataSymlinkSafe(projectRoot) {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const fgDir = resolve3(projectRoot, ".forgewright");
  try {
    let stat1;
    try {
      stat1 = lstatSync2(fgDir);
    } catch {
      stat1 = null;
    }
    if (stat1) {
      if (stat1.isSymbolicLink()) return false;
      const real1 = realpathSync(fgDir);
      if (!real1.startsWith(canonicalRoot + "/") && real1 !== canonicalRoot) return false;
      const instinctsDir = resolve3(fgDir, "instincts");
      let stat2;
      try {
        stat2 = lstatSync2(instinctsDir);
      } catch {
        stat2 = null;
      }
      if (stat2) {
        if (stat2.isSymbolicLink()) return false;
        const real2 = realpathSync(instinctsDir);
        if (!real2.startsWith(canonicalRoot + "/")) return false;
        const healthFile = resolve3(instinctsDir, "health.json");
        let stat3;
        try {
          stat3 = lstatSync2(healthFile);
        } catch {
          stat3 = null;
        }
        if (stat3 && stat3.isSymbolicLink()) return false;
      }
    }
  } catch {
    return false;
  }
  return true;
}
function isStorePathWithinProject(storePath, projectRoot) {
  try {
    const canonicalProject = realpathSync(projectRoot);
    const resolvedTarget = resolve3(projectRoot, storePath);
    let curr = resolvedTarget;
    while (curr && curr !== "/" && curr !== ".") {
      let stat;
      try {
        stat = lstatSync2(curr);
      } catch {
        stat = null;
      }
      if (stat && stat.isSymbolicLink()) {
        const targetReal = realpathSync(curr);
        const rel2 = relative(canonicalProject, targetReal);
        if (rel2.startsWith("..") || isAbsolute(rel2)) {
          return false;
        }
      }
      const parent = dirname2(curr);
      if (parent === curr) break;
      curr = parent;
    }
    let existing = resolvedTarget;
    while (!existsSync3(existing)) {
      const p = dirname2(existing);
      if (p === existing) break;
      existing = p;
    }
    const realExisting = realpathSync(existing);
    const rel = relative(canonicalProject, realExisting);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
function getHookHealth(projectRoot = process.cwd()) {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  if (isMetadataSymlinkSafe(canonicalRoot)) {
    const hp = resolve3(canonicalRoot, ".forgewright", "instincts", "health.json");
    if (existsSync3(hp)) {
      try {
        const fileStat = statSync2(hp);
        if (fileStat.size <= MAX_HEALTH_FILE_BYTES) {
          const raw = readFileSync2(hp, "utf-8");
          const parsed = JSON.parse(raw);
          if (parsed && parsed.counters) {
            const safeCounter = (val) => typeof val === "number" && Number.isSafeInteger(val) && val >= 0 ? val : 0;
            const validStates = /* @__PURE__ */ new Set(["unregistered", "registered", "running", "unsupported", "degraded"]);
            const state = typeof parsed.state === "string" && validStates.has(parsed.state) ? parsed.state : "unregistered";
            const lastError = typeof parsed.lastError === "string" && ALLOWED_HEALTH_ERRORS.has(parsed.lastError) ? parsed.lastError : null;
            const lastSkipReason = typeof parsed.lastSkipReason === "string" && ALLOWED_SKIP_REASONS.has(parsed.lastSkipReason) ? parsed.lastSkipReason : null;
            const loaded = {
              hookId: typeof parsed.hookId === "string" && parsed.hookId.length <= 64 ? parsed.hookId : DEFAULT_HEALTH.hookId,
              version: typeof parsed.version === "string" && parsed.version.length <= 32 ? parsed.version : DEFAULT_HEALTH.version,
              state,
              lastRun: typeof parsed.lastRun === "string" && parsed.lastRun.length <= 64 ? parsed.lastRun : null,
              counters: {
                observed: safeCounter(parsed.counters.observed),
                processed: safeCounter(parsed.counters.processed),
                failed: safeCounter(parsed.counters.failed),
                skipped: safeCounter(parsed.counters.skipped)
              },
              lastSkipReason,
              lastError
            };
            setProjectHealth(projectId, loaded);
            return cloneHealth(loaded);
          }
        }
      } catch {
      }
    }
  }
  const inMemory = projectHealthMap.get(projectId);
  if (inMemory) {
    return cloneHealth(inMemory);
  }
  const fresh = {
    ...DEFAULT_HEALTH,
    state: "unregistered",
    counters: { observed: 0, processed: 0, failed: 0, skipped: 0 }
  };
  return cloneHealth(fresh);
}
function saveHookHealth(projectRoot = process.cwd(), healthToSave) {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  if (!isMetadataSymlinkSafe(canonicalRoot)) {
    return;
  }
  const health = healthToSave || projectHealthMap.get(projectId);
  if (!health) return;
  setProjectHealth(projectId, health);
  const instinctsDir = resolve3(canonicalRoot, ".forgewright", "instincts");
  const hp = resolve3(instinctsDir, "health.json");
  try {
    if (!existsSync3(instinctsDir)) {
      mkdirSync2(instinctsDir, { recursive: true });
    }
    if (!isMetadataSymlinkSafe(canonicalRoot)) return;
    const tmpHp = `${hp}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync2(tmpHp, JSON.stringify(health, null, 2), "utf-8");
    renameSync2(tmpHp, hp);
  } catch {
    health.state = "degraded";
    health.lastError = "health_write_failed";
    setProjectHealth(projectId, health);
  }
}
function resetHookHealth() {
  projectHealthMap.clear();
}
var contextCache = /* @__PURE__ */ new Map();
function detectProjectContext(projectRoot) {
  const now = Date.now();
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  const cached = contextCache.get(projectId);
  if (cached && now - cached.cachedAt < CONTEXT_CACHE_TTL_MS) {
    return cached.context;
  }
  const context = {
    language: void 0,
    framework: void 0,
    fileTypes: [],
    projectType: void 0
  };
  try {
    const exts = execSync(
      `git ls-files 2>/dev/null | grep -E "\\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h)$" | head -100 | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -5`,
      { cwd: canonicalRoot, encoding: "utf-8", timeout: 5e3 }
    ).trim();
    if (exts) {
      const lines = exts.split("\n").filter(Boolean);
      const extCounts = {};
      for (const line of lines) {
        const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
        if (match) {
          extCounts[match[2]] = parseInt(match[1]);
        }
      }
      const topExt = Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0];
      if (topExt) {
        const ext = topExt[0];
        context.language = extToLanguage(ext);
      }
      context.fileTypes = Object.keys(extCounts);
    }
    const pkgPath = resolve3(canonicalRoot, "package.json");
    if (existsSync3(pkgPath)) {
      const pkg = JSON.parse(readFileSync2(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react) context.framework = "react";
      else if (deps.vue) context.framework = "vue";
      else if (deps.angular) context.framework = "angular";
      else if (deps.next) context.framework = "next";
      else if (deps.express) context.framework = "express";
      else if (deps.fastify) context.framework = "fastify";
      else if (deps.fastapi || deps.flask) context.framework = "python-web";
      if (pkg.workspaces) context.projectType = "monorepo";
      else if (deps.next || deps.gatsby) context.projectType = "ssr";
      else if (deps.electron) context.projectType = "desktop";
      else if (deps["react-native"]) context.projectType = "mobile";
      else if (deps.unity) context.projectType = "game";
    }
    const goModPath = resolve3(canonicalRoot, "go.mod");
    if (existsSync3(goModPath)) {
      context.language = "go";
      const goMod = readFileSync2(goModPath, "utf-8");
      if (goMod.includes("github.com/gin-gonic/gin")) context.framework = "gin";
      else if (goMod.includes("github.com/gofiber/fiber")) context.framework = "fiber";
    }
    const cargoPath = resolve3(canonicalRoot, "Cargo.toml");
    if (existsSync3(cargoPath)) {
      context.language = "rust";
      const cargo = readFileSync2(cargoPath, "utf-8");
      if (cargo.includes("actix-web")) context.framework = "actix";
      else if (cargo.includes("axum")) context.framework = "axum";
    }
  } catch {
  }
  if (contextCache.size >= MAX_CONTEXT_CACHE_ENTRIES) {
    const firstKey = contextCache.keys().next().value;
    if (firstKey) contextCache.delete(firstKey);
  }
  contextCache.set(projectId, { context, cachedAt: now });
  return context;
}
function extToLanguage(ext) {
  const map = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    h: "c",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    cs: "csharp"
  };
  return map[ext] || ext;
}
function getProjectId(projectRoot) {
  const canonicalPath = getCanonicalRoot(projectRoot);
  const pathHash = createHash2("sha256").update(canonicalPath).digest("hex").substring(0, 8);
  let remoteTag = null;
  if (existsSync3(resolve3(canonicalPath, ".git"))) {
    try {
      const rawRemote = execSync(
        "git remote get-url origin 2>/dev/null",
        { cwd: canonicalPath, encoding: "utf-8", timeout: 3e3 }
      ).trim();
      if (rawRemote) {
        const sanitized = rawRemote.replace(/https?:\/\/[^@]+@/, "").replace(/\.git$/, "");
        const parts = sanitized.split(/[/:]/).filter(Boolean);
        if (parts.length >= 2) {
          remoteTag = `${parts[parts.length - 2]}_${parts[parts.length - 1]}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        } else if (parts.length === 1 && parts[0]) {
          remoteTag = parts[0].replace(/[^a-zA-Z0-9_-]/g, "_");
        }
      }
    } catch {
    }
  }
  const baseName = (canonicalPath.split("/").filter(Boolean).pop() || "project").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (remoteTag) {
    return `${remoteTag}--${pathHash}`;
  }
  return `${baseName}--${pathHash}`;
}
var sessions = /* @__PURE__ */ new Map();
function getSessionState(sessionId, projectRoot) {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  const sessionKey = `${projectId}::${sessionId}`;
  if (!sessions.has(sessionKey)) {
    if (sessions.size >= MAX_SESSIONS) {
      const oldestKey = sessions.keys().next().value;
      if (oldestKey) sessions.delete(oldestKey);
    }
    const context = detectProjectContext(canonicalRoot);
    sessions.set(sessionKey, {
      sessionId,
      projectId,
      startTime: (/* @__PURE__ */ new Date()).toISOString(),
      toolSequence: [],
      toolHistory: [],
      projectContext: context,
      lastActivity: (/* @__PURE__ */ new Date()).toISOString(),
      toolCount: 0
    });
  }
  return sessions.get(sessionKey);
}
function hashArguments(args) {
  const normalized = JSON.stringify(args, Object.keys(args).sort());
  return createHash2("sha256").update(normalized).digest("hex").substring(0, 16);
}
var ALLOWED_FILE_EXTENSIONS = /* @__PURE__ */ new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "json",
  "md",
  "yaml",
  "yml",
  "sh",
  "css",
  "html",
  "rs",
  "go",
  "toml",
  "sql"
]);
var MAX_AFFECTED_FILES = 10;
function extractAffectedFiles(toolName, args) {
  const candidates = [];
  const fileFields = ["path", "file", "files", "target", "targets", "src", "dest", "destination"];
  for (const field of fileFields) {
    const value = args[field];
    if (value) {
      if (Array.isArray(value)) {
        candidates.push(...value.map(String));
      } else if (typeof value === "string") {
        candidates.push(value);
      }
    }
  }
  if (toolName === "Read" || toolName === "Grep" || toolName === "read_file") {
    if (args.path && typeof args.path === "string") {
      candidates.push(args.path);
    }
  }
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const candidate of candidates) {
    if (result.length >= MAX_AFFECTED_FILES) break;
    if (typeof candidate !== "string" || candidate.length > 256) continue;
    const parts = candidate.split(".");
    if (parts.length < 2) continue;
    const ext = parts.pop()?.toLowerCase();
    if (!ext || !ALLOWED_FILE_EXTENSIONS.has(ext)) continue;
    const pathHash = createHash2("sha256").update(candidate).digest("hex").slice(0, 12);
    const token = "f-" + pathHash + "." + ext;
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }
  return result;
}
var _config2 = null;
var _stats = {
  eventsObserved: 0,
  patternsDetected: 0,
  lastEvent: null,
  sessionActive: false
};
function initObserver(config) {
  _config2 = getInstinctsConfig(config);
}
async function observeToolCall(event, projectRoot) {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  const health = getHookHealth(canonicalRoot);
  const config = _config2 || getInstinctsConfig();
  if (!config.enabled) {
    health.counters.skipped++;
    health.lastSkipReason = "feature_disabled";
    setProjectHealth(projectId, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  health.counters.observed++;
  health.lastRun = (/* @__PURE__ */ new Date()).toISOString();
  if (health.state === "unregistered") health.state = "registered";
  health.state = "running";
  if (!isMetadataSymlinkSafe(canonicalRoot)) {
    health.counters.skipped++;
    health.lastSkipReason = "symlink_escape_denied";
    setProjectHealth(projectId, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  if (!event || typeof event !== "object" || !event.toolName || typeof event.toolName !== "string" || !event.sessionId || typeof event.sessionId !== "string" || !event.arguments || typeof event.arguments !== "object" || Array.isArray(event.arguments) || event.timestamp !== void 0 && (typeof event.timestamp !== "string" || event.timestamp.length > 64 || !Number.isFinite(Date.parse(event.timestamp))) || event.duration !== void 0 && (typeof event.duration !== "number" || !Number.isFinite(event.duration) || event.duration < 0)) {
    health.counters.skipped++;
    health.lastSkipReason = "malformed_event";
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  if (event.sessionId.length > MAX_ID_CHARS || Buffer.byteLength(event.sessionId, "utf8") > MAX_ID_CHARS) {
    health.counters.skipped++;
    health.lastSkipReason = "oversized_event";
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  if (event.toolName.length > MAX_ID_CHARS || Buffer.byteLength(event.toolName, "utf8") > MAX_ID_CHARS) {
    health.counters.skipped++;
    health.lastSkipReason = "oversized_event";
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  let argsByteLength = 0;
  let eventByteLength = 0;
  try {
    const argsJson = JSON.stringify(event.arguments || {});
    argsByteLength = Buffer.byteLength(argsJson, "utf8");
    eventByteLength = Buffer.byteLength(JSON.stringify(event), "utf8");
  } catch {
    health.counters.skipped++;
    health.lastSkipReason = "malformed_event";
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  if (argsByteLength > MAX_ARG_BYTES || eventByteLength > MAX_EVENT_BYTES) {
    health.counters.skipped++;
    health.lastSkipReason = "oversized_event";
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  const toolLower = event.toolName.toLowerCase();
  const isSelf = /^(?:observe|instinct|promoter|scorer|learning[-_]foundry)/i.test(toolLower) || Boolean(event.arguments && event.arguments._internal_hook);
  if (isSelf) {
    health.counters.skipped++;
    health.lastSkipReason = "self_observation";
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  if (event.success !== true) {
    health.counters.skipped++;
    health.lastSkipReason = "failed_outcome";
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
  if (config.maxEventsPerMinute > 0) {
    const storePathToUse = _config2 && _config2.storePath ? _config2.storePath : resolve3(canonicalRoot, ".forgewright", "instincts", "store.json");
    if (!isStorePathWithinProject(storePathToUse, canonicalRoot)) {
      health.counters.skipped++;
      health.lastSkipReason = "symlink_escape_denied";
      saveHookHealth(canonicalRoot, health);
      return { pattern: null, analysis: null, shouldPersist: false };
    }
    const store = getInstinctStore({ ...config, storePath: storePathToUse });
    const now = Date.now();
    const lastObs = store._lastObservation || 0;
    const minInterval = 6e4 / config.maxEventsPerMinute;
    if (now - lastObs < minInterval) {
      health.counters.skipped++;
      health.lastSkipReason = "rate_limited";
      saveHookHealth(canonicalRoot, health);
      return { pattern: null, analysis: null, shouldPersist: false };
    }
    store._lastObservation = now;
  }
  try {
    const session = getSessionState(event.sessionId, canonicalRoot);
    session.toolSequence.push(event.toolName);
    if (session.toolSequence.length > config.sequenceWindowSize) {
      session.toolSequence.shift();
    }
    const sanitizedEvent = {
      toolName: event.toolName,
      arguments: { _hash: hashArguments(event.arguments || {}) },
      sessionId: event.sessionId,
      timestamp: event.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
      success: true,
      duration: event.duration,
      affectedFiles: extractAffectedFiles(event.toolName, event.arguments || {})
    };
    session.toolHistory.push(sanitizedEvent);
    if (session.toolHistory.length > MAX_SESSION_HISTORY) {
      session.toolHistory.shift();
    }
    session.lastActivity = sanitizedEvent.timestamp;
    session.toolCount++;
    health.counters.processed++;
    health.lastSkipReason = null;
    _stats.eventsObserved++;
    _stats.lastEvent = sanitizedEvent.timestamp;
    _stats.sessionActive = true;
    if (session.toolSequence.length < config.minSequenceLength) {
      saveHookHealth(canonicalRoot, health);
      return { pattern: null, analysis: null, shouldPersist: false };
    }
    const analysis = analyzeToolSequence(session.toolSequence);
    const storePathToUse = _config2 && _config2.storePath ? _config2.storePath : resolve3(canonicalRoot, ".forgewright", "instincts", "store.json");
    if (!isStorePathWithinProject(storePathToUse, canonicalRoot)) {
      health.counters.skipped++;
      health.lastSkipReason = "symlink_escape_denied";
      saveHookHealth(canonicalRoot, health);
      return { pattern: null, analysis: null, shouldPersist: false };
    }
    const store = getInstinctStore({ ...config, storePath: storePathToUse });
    const existingPattern = store.findPattern(
      session.toolSequence,
      config.crossProjectTracking ? void 0 : projectId
    );
    let confidence;
    if (existingPattern) {
      confidence = scorePattern({
        occurrences: existingPattern.occurrences + 1,
        firstSeen: existingPattern.firstSeen,
        lastSeen: sanitizedEvent.timestamp,
        projectContext: existingPattern.projectContext,
        crossProject: existingPattern.crossProject,
        projectIds: existingPattern.projectIds,
        affectedFiles: sanitizedEvent.affectedFiles
      }).confidence;
      const pattern = store.recordPattern(
        session.toolSequence,
        session.projectContext,
        projectId,
        confidence
      );
      _stats.patternsDetected++;
      if (!store.save()) {
        health.counters.failed++;
        health.lastError = "store_write_failed";
        health.state = "degraded";
      }
      saveHookHealth(canonicalRoot, health);
      return {
        pattern,
        analysis,
        shouldPersist: false
        // Observations alone must never count as accepted product outcomes
      };
    } else {
      confidence = calculateInitialConfidence(
        session.toolSequence.length,
        session.projectContext
      );
      if (confidence >= config.minInitialConfidence) {
        const pattern = store.recordPattern(
          session.toolSequence,
          session.projectContext,
          projectId,
          confidence
        );
        if (!store.save()) {
          health.counters.failed++;
          health.lastError = "store_write_failed";
          health.state = "degraded";
        }
        saveHookHealth(canonicalRoot, health);
        return {
          pattern,
          analysis,
          shouldPersist: false
        };
      }
    }
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis, shouldPersist: false };
  } catch {
    health.counters.failed++;
    health.lastError = "observation_failed";
    health.state = "degraded";
    saveHookHealth(canonicalRoot, health);
    return { pattern: null, analysis: null, shouldPersist: false };
  }
}
function checkSessionForPromotion(sessionId, projectRoot) {
  const canonicalRoot = getCanonicalRoot(projectRoot);
  const projectId = getProjectId(canonicalRoot);
  const sessionKey = `${projectId}::${sessionId}`;
  const session = sessions.get(sessionKey);
  if (!session) return [];
  const store = getInstinctStore();
  const config = _config2 || getInstinctsConfig();
  const patterns = store.getPromotablePatterns(config.promotionThreshold);
  return patterns.filter(
    (p) => session.toolSequence.some((t) => p.toolSequence.includes(t))
  );
}
function endSession(sessionId, projectRoot) {
  if (projectRoot) {
    const canonicalRoot = getCanonicalRoot(projectRoot);
    const projectId = getProjectId(canonicalRoot);
    const sessionKey = `${projectId}::${sessionId}`;
    const session = sessions.get(sessionKey);
    if (session) {
      const store = getInstinctStore();
      if (session.toolSequence.length >= 3) {
        try {
          store.save();
        } catch {
        }
      }
      sessions.delete(sessionKey);
    }
  } else {
    for (const [key, session] of sessions.entries()) {
      if (session.sessionId === sessionId) {
        const store = getInstinctStore();
        if (session.toolSequence.length >= 3) {
          try {
            store.save();
          } catch {
          }
        }
        sessions.delete(key);
      }
    }
  }
  if (sessions.size === 0) {
    _stats.sessionActive = false;
  }
}
function getObserverStats() {
  return { ..._stats, sessionActive: sessions.size > 0 };
}
function resetSessions() {
  sessions.clear();
  contextCache.clear();
  projectHealthMap.clear();
  resetStoreManager();
  _stats = {
    eventsObserved: 0,
    patternsDetected: 0,
    lastEvent: null,
    sessionActive: false
  };
}
function createInstinctHook() {
  return async function instinctHook(toolName, args, result, context) {
    const projectRoot = context.projectRoot || process.cwd();
    const sessionId = context.sessionId || "default";
    const timestamp = context.timestamp || (/* @__PURE__ */ new Date()).toISOString();
    const event = {
      toolName,
      arguments: args,
      sessionId,
      timestamp,
      success: result.success
    };
    try {
      await observeToolCall(event, projectRoot);
    } catch {
    }
  };
}
function rejectCliInput(root, reason) {
  if (getInstinctsConfig().enabled) {
    const health = getHookHealth(root);
    health.counters.observed++;
    health.counters.skipped++;
    health.lastRun = (/* @__PURE__ */ new Date()).toISOString();
    health.lastSkipReason = reason;
    health.state = "degraded";
    saveHookHealth(root, health);
  }
  console.log(JSON.stringify({ ok: false, status: "skipped", reason }));
}
var isMain = process.argv[1] && (process.argv[1].endsWith("observer.ts") || process.argv[1].endsWith("observer.js") || process.argv[1].endsWith("observer.mjs"));
if (isMain) {
  const action = process.argv[2] || "status";
  const projectRoot = process.argv[4] || process.argv[3] || process.cwd();
  if (action === "observe-args") {
    const toolName = process.argv[3] || "";
    const rawArgs = process.argv[4] || "{}";
    const successStr = process.argv[5];
    const sessionId = process.argv[6] || "default";
    const root = process.argv[7] || process.cwd();
    if (Buffer.byteLength(rawArgs, "utf8") > MAX_ARG_BYTES) {
      rejectCliInput(root, "oversized_event");
      process.exit(0);
    }
    let parsedArgs;
    try {
      const decoded = JSON.parse(rawArgs);
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw new Error("malformed_event");
      }
      parsedArgs = decoded;
    } catch {
      rejectCliInput(root, "malformed_event");
      process.exit(0);
    }
    const event = {
      toolName,
      arguments: parsedArgs,
      sessionId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      success: successStr === "true"
    };
    observeToolCall(event, root).then((res) => {
      console.log(JSON.stringify({ ok: true, result: res }));
    }).catch(() => {
      process.exit(0);
    });
  } else if (action === "observe") {
    const eventJson = process.argv[3];
    if (!eventJson) {
      console.error("Error: missing event JSON");
      process.exit(1);
    }
    if (Buffer.byteLength(eventJson, "utf8") > MAX_EVENT_BYTES) {
      rejectCliInput(process.argv[4] || process.cwd(), "oversized_event");
      process.exit(0);
    }
    let parsed;
    try {
      parsed = JSON.parse(eventJson);
    } catch (e) {
      console.error("Error: malformed event JSON");
      process.exit(1);
    }
    const root = process.argv[4] || process.cwd();
    observeToolCall(parsed, root).then((res) => {
      console.log(JSON.stringify({ ok: true, result: res }));
    }).catch(() => {
      process.exit(0);
    });
  } else if (action === "health") {
    const health = getHookHealth(projectRoot);
    console.log(JSON.stringify(health, null, 2));
  } else if (action === "status") {
    const health = getHookHealth(projectRoot);
    let totalPatterns = 0;
    const storePath = resolve3(projectRoot, ".forgewright", "instincts", "store.json");
    if (existsSync3(storePath)) {
      try {
        const raw = readFileSync2(storePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.patterns)) {
          totalPatterns = parsed.patterns.length;
        }
      } catch {
        totalPatterns = 0;
      }
    }
    console.log("\u2550\u2550\u2550 Instinct System Status \u2550\u2550\u2550");
    console.log(`Hook State:   ${health.state}`);
    console.log(`Observed:     ${health.counters.observed}`);
    console.log(`Processed:    ${health.counters.processed}`);
    console.log(`Skipped:      ${health.counters.skipped}`);
    console.log(`Failed:       ${health.counters.failed}`);
    if (health.lastSkipReason) console.log(`Last Skip:    ${health.lastSkipReason}`);
    if (health.lastError) console.log(`Last Error:   ${health.lastError}`);
    console.log(`Total Patterns: ${totalPatterns}`);
  } else if (action === "clear") {
    const store = getInstinctStore({ storePath: resolve3(projectRoot, ".forgewright", "instincts", "store.json") });
    store.clear();
    resetSessions();
    console.log("Store and sessions cleared");
  } else {
    console.log("Usage: observer.mjs {observe-args|observe|health|status|clear}");
  }
}
export {
  CONTEXT_CACHE_TTL_MS,
  checkSessionForPromotion,
  createInstinctHook,
  detectProjectContext,
  endSession,
  extractAffectedFiles,
  getCanonicalRoot,
  getHookHealth,
  getObserverStats,
  getProjectId,
  getSessionState,
  hashArguments,
  initObserver,
  isMetadataSymlinkSafe,
  isStorePathWithinProject,
  observeToolCall,
  resetHookHealth,
  resetSessions,
  saveHookHealth
};
