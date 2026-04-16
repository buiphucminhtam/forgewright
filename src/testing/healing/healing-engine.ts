/**
 * Self-Healing Engine
 * Combines 5D Element Model, DOM, and Visual detection for comprehensive healing
 * 
 * Based on Functionize's 99.95% accuracy approach
 */

import { Element5D, ElementFingerprint, create5DFingerprint } from './element-5d/fingerprint';
import { calculateSimilarity, findBestMatch, SimilarityScore } from './element-5d/similarity';
import { DOMChangeDetector, generateAlternativeXPaths, DOMSnapshot, DOMChange } from './dom/detection';
import { VisualDiffCalculator, VisualSnapshot, VisualDiff } from './visual/comparison';
import { callLLM, getLLMConfig, type LLMProvider } from '../config/llm-providers';

export interface HealingResult {
  success: boolean;
  healed: boolean;
  originalSelector?: string;
  newSelector?: string;
  confidence: number;
  method: '5d-model' | 'dom' | 'visual' | 'llm' | 'fallback';
  details: string[];
  timestamp: number;
}

export interface HealingOptions {
  similarityThreshold: number;  // 0.85 default
  maxRetries: number;
  enableLLMFallback: boolean;
  enableVisualFallback: boolean;
  cacheEnabled: boolean;
  cacheTTL: number;  // seconds
}

const DEFAULT_OPTIONS: HealingOptions = {
  similarityThreshold: 0.85,
  maxRetries: 3,
  enableLLMFallback: true,
  enableVisualFallback: true,
  cacheEnabled: true,
  cacheTTL: 3600,
};

export interface HealingCache {
  key: string;
  originalSelector: string;
  healedSelector: string;
  timestamp: number;
  hitCount: number;
}

/**
 * Self-Healing Engine
 * Main entry point for element healing functionality
 */
export class SelfHealingEngine {
  private options: HealingOptions;
  private domDetector: DOMChangeDetector;
  private visualCalculator: VisualDiffCalculator;
  private cache: Map<string, HealingCache> = new Map();
  private provider: LLMProvider;
  
  constructor(
    options: Partial<HealingOptions> = {},
    provider: LLMProvider = 'openai'
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.domDetector = new DOMChangeDetector();
    this.visualCalculator = new VisualDiffCalculator();
    this.provider = provider;
  }
  
  /**
   * Heal a failed locator by finding the best matching element
   */
  async heal(
    originalSelector: string,
    failedElement: Partial<Element5D>,
    candidates: Element5D[]
  ): Promise<HealingResult> {
    const startTime = Date.now();
    
    // 1. Check cache first
    if (this.options.cacheEnabled) {
      const cached = this.getCachedHealing(originalSelector);
      if (cached) {
        return {
          success: true,
          healed: true,
          originalSelector,
          newSelector: cached.healedSelector,
          confidence: 0.95,
          method: 'fallback',
          details: ['Used cached healing result'],
          timestamp: Date.now() - startTime,
        };
      }
    }
    
    // 2. Try 5D model matching
    const result5D = await this.healWith5DModel(failedElement, candidates);
    if (result5D.success && result5D.healed) {
      this.cacheHealing(originalSelector, result5D.newSelector!);
      return { ...result5D, timestamp: Date.now() - startTime };
    }
    
    // 3. Try DOM-based healing
    const resultDOM = await this.healWithDOM(failedElement, candidates);
    if (resultDOM.success && resultDOM.healed) {
      this.cacheHealing(originalSelector, resultDOM.newSelector!);
      return { ...resultDOM, timestamp: Date.now() - startTime };
    }
    
    // 4. Try LLM-based healing
    if (this.options.enableLLMFallback) {
      const resultLLM = await this.healWithLLM(originalSelector, failedElement, candidates);
      if (resultLLM.success && resultLLM.healed) {
        this.cacheHealing(originalSelector, resultLLM.newSelector!);
        return { ...resultLLM, timestamp: Date.now() - startTime };
      }
    }
    
    // 5. Fallback: generate alternative xpaths
    const resultFallback = this.healWithFallback(failedElement, candidates);
    this.cacheHealing(originalSelector, resultFallback.newSelector || originalSelector);
    return { ...resultFallback, timestamp: Date.now() - startTime };
  }
  
  /**
   * Heal using 5D element model
   */
  private async healWith5DModel(
    failedElement: Partial<Element5D>,
    candidates: Element5D[]
  ): Promise<HealingResult> {
    const fullElement = this.completeElement(failedElement);
    
    // Find best match using 5D similarity
    const match = findBestMatch(fullElement, candidates, {
      minThreshold: this.options.similarityThreshold,
      preferSameTag: true,
    });
    
    if (match) {
      const newXPath = this.generateXPathFromElement(match.element);
      return {
        success: true,
        healed: true,
        newSelector: newXPath,
        confidence: match.score.overall,
        method: '5d-model',
        details: [
          `5D similarity score: ${(match.score.overall * 100).toFixed(1)}%`,
          ...match.score.details,
        ],
      };
    }
    
    return {
      success: false,
      healed: false,
      method: '5d-model',
      details: ['No matching element found with 5D model'],
    };
  }
  
  /**
   * Heal using DOM analysis
   */
  private async healWithDOM(
    failedElement: Partial<Element5D>,
    candidates: Element5D[]
  ): Promise<HealingResult> {
    const xpaths = failedElement.hierarchy?.xpath
      ? generateAlternativeXPaths(this.completeElement(failedElement))
      : [];
    
    // Try each generated xpath
    for (const xpath of xpaths) {
      const match = candidates.find(el => el.hierarchy.xpath === xpath);
      if (match) {
        return {
          success: true,
          healed: true,
          newSelector: xpath,
          confidence: 0.85,
          method: 'dom',
          details: [`Found element with alternative xpath: ${xpath}`],
        };
      }
    }
    
    return {
      success: false,
      healed: false,
      method: 'dom',
      details: ['No matching element found with DOM analysis'],
    };
  }
  
  /**
   * Heal using LLM (AI-powered)
   */
  private async healWithLLM(
    originalSelector: string,
    failedElement: Partial<Element5D>,
    candidates: Element5D[]
  ): Promise<HealingResult> {
    const config = getLLMConfig(this.provider);
    
    const prompt = `
You are a test automation expert helping to heal a broken element locator.

Original selector that failed: ${originalSelector}

Element context:
- Tag: ${failedElement.tagName || 'unknown'}
- Text: ${failedElement.content?.visibleText || 'none'}
- ID: ${failedElement.attributes?.id || 'none'}
- Classes: ${failedElement.attributes?.classes?.join(', ') || 'none'}
- Role: ${failedElement.attributes?.roles?.join(', ') || 'none'}

Available elements on the page:
${candidates.slice(0, 10).map((el, i) => 
  `${i + 1}. Tag: ${el.tagName}, Text: "${el.content.visibleText.slice(0, 50)}", ` +
  `ID: ${el.attributes.id || 'none'}, Role: ${el.attributes.roles[0] || 'none'}`
).join('\n')}

Task: Find the best matching element and provide its xpath or CSS selector.

Provide your answer in this format:
SELECTOR: [the best selector]
CONFIDENCE: [0.0-1.0]
REASONING: [why this selector is the best match]
`;
    
    try {
      const response = await callLLM(config, prompt);
      
      // Parse LLM response
      const selectorMatch = response.content.match(/SELECTOR:\s*([^\n]+)/i);
      const confidenceMatch = response.content.match(/CONFIDENCE:\s*([\d.]+)/i);
      
      if (selectorMatch && confidenceMatch) {
        return {
          success: true,
          healed: true,
          newSelector: selectorMatch[1].trim(),
          confidence: parseFloat(confidenceMatch[1]),
          method: 'llm',
          details: [
            'AI-powered healing',
            response.content.slice(0, 200),
          ],
        };
      }
    } catch (error) {
      // LLM healing failed
    }
    
    return {
      success: false,
      healed: false,
      method: 'llm',
      details: ['LLM healing failed'],
    };
  }
  
  /**
   * Fallback healing using generated xpaths
   */
  private healWithFallback(
    failedElement: Partial<Element5D>,
    candidates: Element5D[]
  ): HealingResult {
    const element = this.completeElement(failedElement);
    const xpaths = generateAlternativeXPaths(element);
    
    // Try each generated xpath
    for (const xpath of xpaths) {
      const match = candidates.find(el =>
        el.hierarchy.xpath === xpath ||
        el.attributes.id === element.attributes.id ||
        el.content.visibleText === element.content.visibleText
      );
      
      if (match) {
        return {
          success: true,
          healed: true,
          newSelector: xpath,
          confidence: 0.7,
          method: 'fallback',
          details: [`Generated xpath: ${xpath}`],
        };
      }
    }
    
    return {
      success: false,
      healed: false,
      newSelector: originalSelector || xpaths[0],
      method: 'fallback',
      details: ['Could not find matching element'],
    };
  }
  
  /**
   * Complete partial element with defaults
   */
  private completeElement(partial: Partial<Element5D>): Element5D {
    return {
      attributes: {
        id: undefined,
        classes: [],
        roles: [],
        ariaLabels: [],
        name: undefined,
        behavioralStates: [],
        ...partial.attributes,
      },
      visual: {
        size: { width: 0, height: 0 },
        position: { x: 0, y: 0 },
        color: '',
        font: '',
        fontSize: '',
        fontWeight: '',
        renderingStyle: '',
        ...partial.visual,
      },
      hierarchy: {
        parent: undefined,
        parentTag: '',
        siblings: [],
        siblingTags: [],
        iframeNesting: [],
        proximityToLandmarks: [],
        depth: 0,
        xpath: '',
        ...partial.hierarchy,
      },
      state: {
        active: true,
        disabled: false,
        focused: false,
        visible: true,
        expectedInteraction: 'click',
        ...partial.state,
      },
      content: {
        visibleText: '',
        innerText: '',
        semanticMeaning: '',
        ...partial.content,
      },
      tagName: partial.tagName || 'div',
      generatedAt: Date.now(),
      url: '',
    };
  }
  
  /**
   * Generate xpath from element
   */
  private generateXPathFromElement(element: Element5D): string {
    const tag = element.tagName;
    const id = element.attributes.id;
    const text = element.content.visibleText;
    
    if (id) {
      return `//*[@id="${id}"]`;
    }
    
    if (text) {
      return `//${tag}[contains(text(),"${text.slice(0, 30)}")]`;
    }
    
    // Fallback to role
    if (element.attributes.roles.length > 0) {
      return `//*[@role="${element.attributes.roles[0]}"]`;
    }
    
    return `//${tag}`;
  }
  
  /**
   * Get cached healing result
   */
  private getCachedHealing(selector: string): HealingCache | null {
    const cached = this.cache.get(selector);
    
    if (cached) {
      const age = (Date.now() - cached.timestamp) / 1000;
      if (age < this.options.cacheTTL) {
        cached.hitCount++;
        return cached;
      }
      this.cache.delete(selector);
    }
    
    return null;
  }
  
  /**
   * Cache healing result
   */
  private cacheHealing(original: string, healed: string): void {
    this.cache.set(original, {
      key: `${original}:${healed}`,
      originalSelector: original,
      healedSelector: healed,
      timestamp: Date.now(),
      hitCount: 0,
    });
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; totalHits: number } {
    let totalHits = 0;
    this.cache.forEach(cached => {
      totalHits += cached.hitCount;
    });
    
    return {
      size: this.cache.size,
      totalHits,
    };
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
