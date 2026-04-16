/**
 * MobileHealer Agent
 * Self-healing for Mobile Elements
 * 
 * Heals: accessibility ID changes, resource ID changes, text changes, layout changes
 */

import { createMobile5DFingerprint, type MobileElement5D } from '../healing/mobile-5d/fingerprint';
import { findBestMobileMatch, type MobileSimilarityScore } from '../healing/mobile-5d/similarity';
import type { Platform } from '../../appium/config';

export interface MobileHealerConfig {
  platform: Platform;
  similarityThreshold: number;
  cacheEnabled: boolean;
  cacheTTL: number;
  fallbackChain: string[];
}

const DEFAULT_CONFIG: MobileHealerConfig = {
  platform: 'Android',
  similarityThreshold: 0.75,
  cacheEnabled: true,
  cacheTTL: 3600,
  fallbackChain: ['accessibility-id', 'resource-id', 'text', 'xpath'],
};

/**
 * MobileHealer Agent
 * Self-healing for mobile element locators
 */
export class MobileHealerAgent {
  private config: MobileHealerConfig;
  private cache: Map<string, HealingResult> = new Map();

  constructor(config: Partial<MobileHealerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Heal a failed element
   */
  async heal(
    originalLocator: string,
    failedElement: MobileElement5D,
    candidates: MobileElement5D[]
  ): Promise<HealingResult> {
    const startTime = Date.now();

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.getCachedHealing(originalLocator);
      if (cached) {
        return {
          ...cached,
          method: 'cache',
          duration: Date.now() - startTime,
        };
      }
    }

    // Find best match using mobile 5D model
    const match = findBestMobileMatch(failedElement, candidates, {
      minThreshold: this.config.similarityThreshold,
      preferSamePlatform: true,
    });

    if (match && match.score.overall >= this.config.similarityThreshold) {
      const result: HealingResult = {
        success: true,
        healed: true,
        originalLocator,
        newLocator: this.generateLocatorFromElement(match.element),
        confidence: match.score.overall,
        method: '5d-model',
        details: match.score.details,
        platform: this.config.platform,
      };

      this.cacheHealing(originalLocator, result);
      return { ...result, duration: Date.now() - startTime };
    }

    // Try fallback chain
    const fallbackResult = await this.healWithFallback(
      originalLocator,
      failedElement,
      candidates
    );

    if (fallbackResult.healed) {
      this.cacheHealing(originalLocator, fallbackResult);
      return { ...fallbackResult, duration: Date.now() - startTime };
    }

    // Ultimate fallback
    return {
      success: false,
      healed: false,
      originalLocator,
      newLocator: originalLocator,
      confidence: 0,
      method: 'none',
      details: ['Could not find matching element'],
      platform: this.config.platform,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Heal using fallback chain
   */
  private async healWithFallback(
    originalLocator: string,
    failedElement: MobileElement5D,
    candidates: MobileElement5D[]
  ): Promise<HealingResult> {
    for (const strategy of this.config.fallbackChain) {
      const locator = await this.tryStrategy(strategy, failedElement, candidates);
      if (locator) {
        return {
          success: true,
          healed: true,
          originalLocator,
          newLocator: locator,
          confidence: 0.7,
          method: strategy,
          details: [`Found with ${strategy}`],
          platform: this.config.platform,
        };
      }
    }

    return {
      success: false,
      healed: false,
      originalLocator,
      newLocator: originalLocator,
      confidence: 0,
      method: 'none',
      details: ['No fallback strategy worked'],
      platform: this.config.platform,
    };
  }

  /**
   * Try a specific healing strategy
   */
  private async tryStrategy(
    strategy: string,
    failedElement: MobileElement5D,
    candidates: MobileElement5D[]
  ): Promise<string | null> {
    switch (strategy) {
      case 'accessibility-id':
        return this.findByAccessibilityId(failedElement, candidates);
      case 'resource-id':
        return this.findByResourceId(failedElement, candidates);
      case 'text':
        return this.findByText(failedElement, candidates);
      case 'class':
        return this.findByClassName(failedElement, candidates);
      case 'xpath':
        return this.findByXPath(failedElement, candidates);
      default:
        return null;
    }
  }

  /**
   * Find by accessibility ID
   */
  private findByAccessibilityId(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    const attr = element.attributes.accessibilityId || 
                 element.attributes.accessibilityLabel ||
                 element.attributes.contentDesc;

    if (!attr) return null;

    const match = candidates.find(c => 
      c.attributes.accessibilityId === attr ||
      c.attributes.accessibilityLabel === attr ||
      c.attributes.contentDesc === attr
    );

    return match ? this.generateLocatorFromElement(match) : null;
  }

  /**
   * Find by resource ID (Android)
   */
  private findByResourceId(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    const resourceId = element.attributes.resourceId;
    if (!resourceId) return null;

    const match = candidates.find(c => c.attributes.resourceId === resourceId);
    return match ? this.generateLocatorFromElement(match) : null;
  }

  /**
   * Find by text content
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
      (c.content.hintText && text.includes(c.content.hintText!))
    );

    return match ? this.generateLocatorFromElement(match) : null;
  }

  /**
   * Find by class name
   */
  private findByClassName(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    const className = element.attributes.className;
    if (!className) return null;

    // Find elements of same class with similar text
    const matches = candidates.filter(c => c.attributes.className === className);

    if (matches.length === 0) return null;

    // Try to find best match by text
    const text = element.content.text;
    if (text) {
      const textMatch = matches.find(m => 
        m.content.text === text ||
        (m.content.text && text.includes(m.content.text))
      );
      if (textMatch) return this.generateLocatorFromElement(textMatch);
    }

    // Fallback to first match
    return this.generateLocatorFromElement(matches[0]);
  }

  /**
   * Find by XPath (position-based)
   */
  private findByXPath(
    element: MobileElement5D,
    candidates: MobileElement5D[]
  ): string | null {
    const tag = element.tagName;
    const text = element.content.text;

    // Find all elements with same tag
    const matches = candidates.filter(c => 
      c.tagName === tag || c.attributes.className === element.attributes.className
    );

    if (matches.length === 0) return null;

    // Find element with similar position
    const targetPos = element.visual.centerX + element.visual.centerY;
    
    const closest = matches.reduce((best, current) => {
      const currentPos = current.visual.centerX + current.visual.centerY;
      const bestPos = best.visual.centerX + best.visual.centerY;
      const currentDiff = Math.abs(currentPos - targetPos);
      const bestDiff = Math.abs(bestPos - targetPos);
      return currentDiff < bestDiff ? current : best;
    });

    return this.generateLocatorFromElement(closest);
  }

  /**
   * Generate locator string from element
   */
  private generateLocatorFromElement(element: MobileElement5D): string {
    const platform = this.config.platform;

    // Try accessibility ID first (works on both platforms)
    const accessibilityId = element.attributes.accessibilityId ||
                             element.attributes.accessibilityLabel ||
                             element.attributes.contentDesc;
    if (accessibilityId) {
      return `accessibility-id:${accessibilityId}`;
    }

    // Platform-specific
    if (platform === 'Android') {
      if (element.attributes.resourceId) {
        return `resource-id:${element.attributes.resourceId}`;
      }
      if (element.content.text) {
        return `text=${element.content.text}`;
      }
    }

    if (platform === 'iOS') {
      if (element.content.text) {
        return `label=${element.content.text}`;
      }
    }

    // Fallback to class + text
    const className = element.attributes.className?.split('.').pop() || element.tagName;
    const text = element.content.text || element.content.hintText || '';

    if (text) {
      return `${className}[${text}]`;
    }

    // Last resort: partial class name
    return className;
  }

  /**
   * Get cached healing
   */
  private getCachedHealing(locator: string): HealingResult | null {
    const cached = this.cache.get(locator);
    if (!cached) return null;

    const age = (Date.now() - cached.timestamp) / 1000;
    if (age > this.config.cacheTTL) {
      this.cache.delete(locator);
      return null;
    }

    return { ...cached, fromCache: true };
  }

  /**
   * Cache healing result
   */
  private cacheHealing(original: string, result: HealingResult): void {
    this.cache.set(original, {
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
  getCacheStats(): { size: number } {
    return { size: this.cache.size };
  }
}

export interface HealingResult {
  success: boolean;
  healed: boolean;
  originalLocator: string;
  newLocator: string;
  confidence: number;
  method: '5d-model' | 'cache' | 'accessibility-id' | 'resource-id' | 'text' | 'class' | 'xpath' | 'none';
  details: string[];
  platform: Platform;
  timestamp?: number;
  fromCache?: boolean;
  duration?: number;
}
