/**
 * DOM-Based Element Detection
 * Detects element changes based on DOM structure analysis
 */

import { Element5D } from './fingerprint';

export interface DOMChange {
  type: 'added' | 'removed' | 'modified' | 'moved';
  element: Element5D;
  previousState?: Partial<Element5D>;
  xpath: string;
  timestamp: number;
}

export interface DOMSnapshot {
  elements: Element5D[];
  timestamp: number;
  url: string;
}

/**
 * DOM Change Detector
 * Detects structural changes between DOM snapshots
 */
export class DOMChangeDetector {
  /**
   * Compare two DOM snapshots and identify changes
   */
  detectChanges(before: DOMSnapshot, after: DOMSnapshot): DOMChange[] {
    const changes: DOMChange[] = [];
    
    const beforeMap = new Map(before.elements.map(el => [el.hierarchy.xpath, el]));
    const afterMap = new Map(after.elements.map(el => [el.hierarchy.xpath, el]));
    
    // Find removed elements
    for (const [xpath, element] of beforeMap) {
      if (!afterMap.has(xpath)) {
        changes.push({
          type: 'removed',
          element,
          xpath,
          timestamp: Date.now(),
        });
      }
    }
    
    // Find added elements
    for (const [xpath, element] of afterMap) {
      if (!beforeMap.has(xpath)) {
        changes.push({
          type: 'added',
          element,
          xpath,
          timestamp: Date.now(),
        });
      }
    }
    
    // Find modified elements
    for (const [xpath, beforeElement] of beforeMap) {
      const afterElement = afterMap.get(xpath);
      if (afterElement) {
        const modifications = this.detectModifications(beforeElement, afterElement);
        if (Object.keys(modifications).length > 0) {
          changes.push({
            type: 'modified',
            element: afterElement,
            previousState: modifications,
            xpath,
            timestamp: Date.now(),
          });
        }
      }
    }
    
    return changes;
  }
  
  /**
   * Detect modifications between two element states
   */
  private detectModifications(before: Element5D, after: Element5D): Partial<Element5D> {
    const modifications: Partial<Element5D> = {};
    
    // Check attributes
    if (before.attributes.id !== after.attributes.id) {
      modifications.attributes = { ...after.attributes, id: after.attributes.id };
    }
    
    // Check visual changes
    if (before.visual.size.width !== after.visual.size.width ||
        before.visual.size.height !== after.visual.size.height) {
      modifications.visual = after.visual;
    }
    
    // Check content changes
    if (before.content.visibleText !== after.content.visibleText) {
      modifications.content = { ...after.content };
    }
    
    // Check state changes
    if (before.state.disabled !== after.state.disabled) {
      modifications.state = { ...after.state };
    }
    
    return modifications;
  }
  
  /**
   * Find element by xpath
   */
  findByXPath(element: Element5D, xpath: string): boolean {
    return element.hierarchy.xpath === xpath;
  }
  
  /**
   * Find element by text content
   */
  findByText(element: Element5D, text: string): boolean {
    return element.content.visibleText.toLowerCase().includes(text.toLowerCase());
  }
  
  /**
   * Find element by semantic meaning
   */
  findBySemantic(element: Element5D, meaning: string): boolean {
    return element.content.semanticMeaning.toLowerCase().includes(meaning.toLowerCase());
  }
}

/**
 * Generate alternative xpaths for an element
 */
export function generateAlternativeXPaths(element: Element5D): string[] {
  const xpaths: string[] = [];
  const tag = element.tagName.toLowerCase();
  const text = element.content.visibleText;
  const id = element.attributes.id;
  const classes = element.attributes.classes;
  
  // ID-based xpath
  if (id) {
    xpaths.push(`//*[@id="${id}"]`);
  }
  
  // Text-based xpath
  if (text) {
    xpaths.push(`//${tag}[contains(text(),"${text.slice(0, 30)}")]`);
  }
  
  // Class-based xpath
  if (classes.length > 0) {
    const classXPath = classes
      .slice(0, 2)  // Take first 2 classes
      .map(c => `contains(@class,"${c}")`)
      .join(' and ');
    xpaths.push(`//${tag}[${classXPath}]`);
  }
  
  // Role-based xpath
  if (element.attributes.roles.length > 0) {
    xpaths.push(`//*[@role="${element.attributes.roles[0]}"]`);
  }
  
  // Attribute-based xpath
  if (element.attributes.name) {
    xpaths.push(`//${tag}[@name="${element.attributes.name}"]`);
  }
  
  // Placeholder-based xpath (for inputs)
  if (element.content.placeholder) {
    xpaths.push(`//input[@placeholder="${element.content.placeholder}"]`);
  }
  
  // Data-testid xpath
  if (element.hierarchy.parent) {
    xpaths.push(`//*[@data-testid="${element.hierarchy.parent}"]//${tag}`);
  }
  
  return xpaths;
}

/**
 * Validate xpath syntax
 */
export function validateXPath(xpath: string): boolean {
  try {
    // Basic validation - starts with //
    return xpath.startsWith('//');
  } catch {
    return false;
  }
}
