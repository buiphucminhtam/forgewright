/**
 * Mobile Self-Healing
 * Self-healing engine for mobile elements
 */

import { createMobile5DFingerprint, type MobileElement5D } from './mobile-5d/fingerprint';
import { findBestMobileMatch, type MobileSimilarityScore } from './mobile-5d/similarity';
import type { Platform } from '../../appium/config';

export interface MobileHealingConfig {
  similarityThreshold: number;
  maxRetries: number;
  enableCache: boolean;
  cacheTTL: number;
  fallbackChain: string[];
}

const DEFAULT_CONFIG: MobileHealingConfig = {
  similarityThreshold: 0.75,
  maxRetries: 3,
  enableCache: true,
  cacheTTL: 3600,
  fallbackChain: ['accessibility-id', 'resource-id', 'text', 'class', 'position'],
};

/**
 * Mobile Self-Healing Engine
 * Main healing orchestrator for mobile elements
 */
export class MobileSelfHealingEngine {
  private config: MobileHealingConfig;
  private cache: Map<string, MobileHealingResult> = new Map();
  private platform: Platform;

  constructor(
    platform: Platform,
    config: Partial<MobileHealingConfig> = {}
  ) {
    this.platform = platform;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Heal a failed element
   */
  async heal(
    originalSelector: string,
    failedElement: Partial<MobileElement5D>,
    candidates: MobileElement5D[]
  ): Promise<MobileHealingResult> {
    const startTime = Date.now();

    // Check cache
    if (this.config.enableCache) {
      const cached = this.getCached(originalSelector);
      if (cached) {
        return {
          ...cached,
          method: 'cache',
          duration: Date.now() - startTime,
          fromCache: true,
        };
      }
    }

    // Complete element with defaults
    const completeElement = this.completeElement(failedElement);

    // Try 5D model matching
    const match5D = this.try5DModel(completeElement, candidates);
    if (match5D) {
      this.cacheResult(originalSelector, match5D);
      return { ...match5D, duration: Date.now() - startTime };
    }

    // Try fallback chain
    for (let retry = 0; retry < this.config.maxRetries; retry++) {
      const fallback = this.tryFallback(completeElement, candidates);
      if (fallback) {
        this.cacheResult(originalSelector, fallback);
        return { ...fallback, duration: Date.now() - startTime };
      }
    }

    // Ultimate fallback
    return {
      success: false,
      healed: false,
      originalSelector,
      newSelector: originalSelector,
      confidence: 0,
      method: 'none',
      platform: this.platform,
      details: ['Could not heal element after all attempts'],
      duration: Date.now() - startTime,
    };
  }

  /**
   * Try 5D model matching
   */
  private try5DModel(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): MobileHealingResult | null {
    const match = findBestMobileMatch(element, candidates, {
      minThreshold: this.config.similarityThreshold,
      preferSamePlatform: true,
    });

    if (match && match.score.overall >= this.config.similarityThreshold) {
      return {
        success: true,
        healed: true,
        originalSelector: '',
        newSelector: this.generateLocator(match.element),
        confidence: match.score.overall,
        method: '5d-model',
        platform: this.platform,
        details: [
          `5D match score: ${(match.score.overall * 100).toFixed(1)}%`,
          ...match.score.details,
        ],
      };
    }

    return null;
  }

  /**
   * Try fallback strategies
   */
  private tryFallback(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): MobileHealingResult | null {
    for (const strategy of this.config.fallbackChain) {
      const result = this.tryStrategy(strategy, element, candidates);
      if (result) {
        return result;
      }
    }
    return null;
  }

  /**
   * Try specific strategy
   */
  private tryStrategy(
    strategy: string,
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): MobileHealingResult | null {
    let selector: string | null = null;

    switch (strategy) {
      case 'accessibility-id':
        selector = this.findByAccessibilityId(element, candidates);
        break;
      case 'resource-id':
        selector = this.findByResourceId(element, candidates);
        break;
      case 'text':
        selector = this.findByText(element, candidates);
        break;
      case 'class':
        selector = this.findByClass(element, candidates);
        break;
      case 'position':
        selector = this.findByPosition(element, candidates);
        break;
    }

    if (selector) {
      return {
        success: true,
        healed: true,
        originalSelector: '',
        newSelector: selector,
        confidence: 0.7,
        method: strategy,
        platform: this.platform,
        details: [`Found with ${strategy}`],
      };
    }

    return null;
  }

  /**
   * Find by accessibility ID
   */
  private findByAccessibilityId(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    const id = element.attributes.accessibilityId ||
               element.attributes.accessibilityLabel ||
               element.attributes.contentDesc;

    if (!id) return null;

    const match = candidates.find(c =>
      c.attributes.accessibilityId === id ||
      c.attributes.accessibilityLabel === id ||
      c.attributes.contentDesc === id
    );

    return match ? this.generateLocator(match) : null;
  }

  /**
   * Find by resource ID (Android)
   */
  private findByResourceId(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    if (this.platform !== 'Android') return null;

    const resourceId = element.attributes.resourceId;
    if (!resourceId) return null;

    const match = candidates.find(c => c.attributes.resourceId === resourceId);
    return match ? this.generateLocator(match) : null;
  }

  /**
   * Find by text
   */
  private findByText(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    const text = element.content.text || element.content.hintText;
    if (!text) return null;

    const match = candidates.find(c =>
      c.content.text === text ||
      c.content.hintText === text ||
      (c.content.text && text.includes(c.content.text)) ||
      (c.content.hintText && text.includes(c.content.hintText))
    );

    return match ? this.generateLocator(match) : null;
  }

  /**
   * Find by class
   */
  private findByClass(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    const className = element.attributes.className;
    if (!className) return null;

    const matches = candidates.filter(c => c.attributes.className === className);
    if (matches.length === 0) return null;

    // Try to match by text if available
    const text = element.content.text;
    if (text) {
      const textMatch = matches.find(m => m.content.text === text);
      if (textMatch) return this.generateLocator(textMatch);
    }

    // Fallback to first match
    return this.generateLocator(matches[0]);
  }

  /**
   * Find by position
   */
  private findByPosition(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    const targetCenterX = element.visual.centerX;
    const targetCenterY = element.visual.centerY;

    // Find element at similar position
    const match = candidates.find(c => {
      const diffX = Math.abs(c.visual.centerX - targetCenterX);
      const diffY = Math.abs(c.visual.centerY - targetCenterY);
      return diffX < 0.1 && diffY < 0.1;  // Within 10% of screen
    });

    return match ? this.generateLocator(match) : null;
  }

  /**
   * Generate locator string
   */
  private generateLocator(element: MobileElement5D): string {
    // Try accessibility ID first
    const accId = element.attributes.accessibilityId ||
                  element.attributes.accessibilityLabel ||
                  element.attributes.contentDesc;
    if (accId) {
      return `accessibility-id:${accId}`;
    }

    // Platform-specific
    if (this.platform === 'Android') {
      if (element.attributes.resourceId) {
        return `resource-id:${element.attributes.resourceId}`;
      }
      if (element.content.text) {
        return `text=${element.content.text}`;
      }
    }

    if (this.platform === 'iOS') {
      if (element.content.text) {
        return `label=${element.content.text}`;
      }
    }

    // Fallback to class + text
    const className = element.attributes.className?.split('.').pop() || element.tagName;
    const text = element.content.text || '';

    return text ? `${className}[${text}]` : className;
  }

  /**
   * Complete partial element
   */
  private completeElement(partial: Partial<MobileElement5D>): MobileElement5D {
    return {
      attributes: {
        accessibilityId: undefined,
        accessibilityLabel: undefined,
        accessibilityHint: undefined,
        resourceId: undefined,
        contentDesc: undefined,
        className: undefined,
        packageName: undefined,
        bundleId: undefined,
        index: undefined,
        parent: undefined,
        childCount: undefined,
        ...partial.attributes,
      },
      visual: {
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        centerX: 0,
        centerY: 0,
        screenX: 0,
        screenY: 0,
        inSafeAreaTop: false,
        inSafeAreaBottom: false,
        inSafeAreaLeft: false,
        inSafeAreaRight: false,
        alpha: 1,
        orientation: 'portrait',
        ...partial.visual,
      },
      accessibility: {
        isAccessibilityElement: true,
        accessibilityElementsHidden: false,
        enabledForAccessibility: true,
        contentDescription: undefined,
        hint: undefined,
        stateDescription: undefined,
        role: undefined,
        liveRegion: undefined,
        ...partial.accessibility,
      },
      state: {
        enabled: true,
        visible: true,
        displayed: true,
        selected: false,
        focused: false,
        focusable: false,
        swipeable: false,
        scrollable: false,
        expectedInteraction: 'tap',
        ...partial.state,
      },
      content: {
        text: '',
        hintText: undefined,
        labelText: undefined,
        value: undefined,
        placeholder: undefined,
        semanticText: '',
        inputType: undefined,
        ...partial.content,
      },
      tagName: partial.tagName || 'android.widget.View',
      platform: this.platform,
      generatedAt: Date.now(),
      screenWidth: partial.screenWidth || 0,
      screenHeight: partial.screenHeight || 0,
    };
  }

  /**
   * Get cached result
   */
  private getCached(selector: string): MobileHealingResult | null {
    const cached = this.cache.get(selector);
    if (!cached) return null;

    const age = (Date.now() - (cached.timestamp || 0)) / 1000;
    if (age > this.config.cacheTTL) {
      this.cache.delete(selector);
      return null;
    }

    return cached;
  }

  /**
   * Cache result
   */
  private cacheResult(selector: string, result: MobileHealingResult): void {
    this.cache.set(selector, {
      ...result,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; totalHits: number } {
    return {
      size: this.cache.size,
      totalHits: 0,
    };
  }
}

export interface MobileHealingResult {
  success: boolean;
  healed: boolean;
  originalSelector: string;
  newSelector: string;
  confidence: number;
  method: '5d-model' | 'cache' | 'accessibility-id' | 'resource-id' | 'text' | 'class' | 'position' | 'none';
  platform: Platform;
  details: string[];
  timestamp?: number;
  fromCache?: boolean;
  duration?: number;
}
