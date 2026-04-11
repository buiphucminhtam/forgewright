/**
 * ForgeWright Agents - Anti-Hallucination System
 * 
 * Main export file for all agent modules.
 */

// Types
export * from './types.js';

// Prompts
export * from './prompts.js';

// Agents (lazy-loaded to avoid circular dependencies)
export { GuardedLLMClient, MockLLMClient } from './llm-client.js';
export { SkepticAgent } from './skeptic.js';
export { SynthesizerAgent } from './synthesizer.js';
export { MultiAgentWorkflow } from './multi-agent.js';
export { 
  calculateConfidence, 
  applyBehavior,
} from './confidence.js';
export { DEFAULT_CONFIDENCE_CONFIG } from './types.js';
export { calculateSemanticEnergy, calculateEnhancedConfidence } from './semantic-energy.js';
export { 
  extractCitations, 
  verifyCitations, 
  calculateTokenShapley 
} from './citations.js';
