/**
 * Visual Comparison for Self-Healing
 * Compares visual snapshots to detect UI changes
 */

export interface VisualDiff {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'added' | 'removed' | 'changed';
  confidence: number;
}

export interface VisualSnapshot {
  url: string;
  timestamp: number;
  viewport: { width: number; height: number };
  elements: VisualElement[];
}

export interface VisualElement {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  text?: string;
  tagName: string;
  zIndex?: number;
}

/**
 * Visual Diff Calculator
 * Calculates visual differences between two snapshots
 */
export class VisualDiffCalculator {
  private readonly pixelThreshold = 10;  // Color difference threshold
  private readonly positionThreshold = 5;  // Position difference threshold (px)
  
  /**
   * Calculate visual diff between two snapshots
   */
  calculateDiff(before: VisualSnapshot, after: VisualSnapshot): VisualDiff[] {
    const diffs: VisualDiff[] = [];
    
    // Match elements between snapshots
    const beforeElements = this.createElementGrid(before.elements);
    const afterElements = this.createElementGrid(after.elements);
    
    // Find added elements (in after but not in before)
    for (const afterEl of after.elements) {
      const matched = this.findMatchingElement(afterEl, before.elements, this.positionThreshold);
      if (!matched) {
        diffs.push({
          x: afterEl.x,
          y: afterEl.y,
          width: afterEl.width,
          height: afterEl.height,
          type: 'added',
          confidence: 0.95,
        });
      }
    }
    
    // Find removed elements (in before but not in after)
    for (const beforeEl of before.elements) {
      const matched = this.findMatchingElement(beforeEl, after.elements, this.positionThreshold);
      if (!matched) {
        diffs.push({
          x: beforeEl.x,
          y: beforeEl.y,
          width: beforeEl.width,
          height: beforeEl.height,
          type: 'removed',
          confidence: 0.95,
        });
      }
    }
    
    // Find changed elements (different position or size)
    for (const afterEl of after.elements) {
      const matched = this.findMatchingElement(afterEl, before.elements, this.positionThreshold);
      if (matched) {
        const posDiff = Math.abs(afterEl.x - matched.x) + Math.abs(afterEl.y - matched.y);
        const sizeDiff = Math.abs(afterEl.width - matched.width) + Math.abs(afterEl.height - matched.height);
        
        if (posDiff > this.positionThreshold || sizeDiff > this.positionThreshold) {
          diffs.push({
            x: Math.min(afterEl.x, matched.x),
            y: Math.min(afterEl.y, matched.y),
            width: Math.max(afterEl.width, matched.width),
            height: Math.max(afterEl.height, matched.height),
            type: 'changed',
            confidence: 0.9,
          });
        }
      }
    }
    
    return diffs;
  }
  
  /**
   * Create a spatial grid for faster element lookup
   */
  private createElementGrid(elements: VisualElement[]): Map<string, VisualElement[]> {
    const grid = new Map<string, VisualElement[]>();
    
    for (const el of elements) {
      // Create grid cell key based on position
      const cellX = Math.floor(el.x / 100);
      const cellY = Math.floor(el.y / 100);
      const key = `${cellX},${cellY}`;
      
      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(el);
    }
    
    return grid;
  }
  
  /**
   * Find matching element within threshold
   */
  private findMatchingElement(
    target: VisualElement,
    candidates: VisualElement[],
    threshold: number
  ): VisualElement | null {
    for (const candidate of candidates) {
      const posDiff = Math.abs(target.x - candidate.x) + Math.abs(target.y - candidate.y);
      const sizeMatch = Math.abs(target.width - candidate.width) < threshold &&
                        Math.abs(target.height - candidate.height) < threshold;
      
      if (posDiff < threshold && sizeMatch) {
        return candidate;
      }
    }
    return null;
  }
  
  /**
   * Calculate pixel-level diff percentage
   */
  calculateDiffPercentage(diffs: VisualDiff[], viewport: { width: number; height: number }): number {
    const totalArea = viewport.width * viewport.height;
    const diffArea = diffs.reduce((sum, diff) => sum + (diff.width * diff.height), 0);
    return diffArea / totalArea;
  }
  
  /**
   * Check if diff is significant (beyond threshold)
   */
  isSignificantDiff(diffPercentage: number, threshold = 0.05): boolean {
    return diffPercentage > threshold;
  }
}

/**
 * Generate visual baseline from element positions
 */
export function generateVisualBaseline(elements: VisualElement[]): VisualSnapshot {
  return {
    url: '',
    timestamp: Date.now(),
    viewport: {
      width: Math.max(...elements.map(e => e.x + e.width), 0),
      height: Math.max(...elements.map(e => e.y + e.height), 0),
    },
    elements,
  };
}

/**
 * Compare two colors for similarity
 */
export function colorsSimilar(color1: string, color2: string, threshold = 30): boolean {
  // Simple hex comparison
  const c1 = color1.replace('#', '');
  const c2 = color2.replace('#', '');
  
  if (c1.length !== 6 || c2.length !== 6) {
    return color1 === color2;
  }
  
  const r1 = parseInt(c1.slice(0, 2), 16);
  const g1 = parseInt(c1.slice(2, 4), 16);
  const b1 = parseInt(c1.slice(4, 6), 16);
  
  const r2 = parseInt(c2.slice(0, 2), 16);
  const g2 = parseInt(c2.slice(2, 4), 16);
  const b2 = parseInt(c2.slice(4, 6), 16);
  
  const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
  return diff < threshold;
}
