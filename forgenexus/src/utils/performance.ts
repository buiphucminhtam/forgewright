/**
 * Performance Optimization Module for ForgeWright
 * 
 * Provides caching, memoization, and performance monitoring.
 */

// ============================================================================
// LRU Cache
// ============================================================================

export interface CacheOptions {
  maxSize?: number;
  ttl?: number;
  onEvict?: (key: string, value: unknown) => void;
}

export class LRUCache<K, V> {
  private cache: Map<K, { value: V; expiry?: number }>;
  private maxSize: number;
  private ttl: number;
  private onEvict?: (key: K, value: V) => void;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize ?? 100;
    this.ttl = options.ttl ?? 1000 * 60 * 5; // 5 minutes
    this.onEvict = options.onEvict as (key: K, value: V) => void;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    // Check expiry
    if (entry.expiry && Date.now() > entry.expiry) {
      this.delete(key);
      return undefined;
    }
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }

  set(key: K, value: V, ttl?: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        const evicted = this.cache.get(oldest);
        if (evicted && this.onEvict) {
          this.onEvict(oldest, evicted.value);
        }
        this.cache.delete(oldest);
      }
    }
    
    this.cache.set(key, {
      value,
      expiry: ttl ? Date.now() + ttl : undefined,
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiry && Date.now() > entry.expiry) {
      this.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry && this.onEvict) {
      this.onEvict(key, entry.value);
    }
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Memoization
// ============================================================================

export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  options: {
    cache?: LRUCache<string, ReturnType<T>>;
    keyGenerator?: (...args: Parameters<T>) => string;
  } = {}
): T {
  const cache = options.cache ?? new LRUCache<string, ReturnType<T>>({ maxSize: 100 });
  const keyGen = options.keyGenerator ?? JSON.stringify;

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGen(args as Parameters<T>);
    const cached = cache.get(key);
    
    if (cached !== undefined) {
      return cached;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    
    return result;
  }) as T;
}

// ============================================================================
// Performance Monitor
// ============================================================================

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private marks: Map<string, number> = new Map();

  /**
   * Start timing
   */
  mark(name: string): void {
    this.marks.set(name, Date.now());
  }

  /**
   * End timing and record
   */
  measure(name: string, startMark?: string): number {
    const start = startMark ? this.marks.get(startMark) : this.marks.get(name);
    if (!start) {
      console.warn(`No start mark found for: ${name}`);
      return 0;
    }
    
    const duration = Date.now() - start;
    this.record(name, duration);
    this.marks.delete(startMark ?? name);
    
    return duration;
  }

  /**
   * Record a metric
   */
  record(name: string, duration: number, metadata?: Record<string, unknown>): void {
    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    });
  }

  /**
   * Get statistics for a metric
   */
  getStats(name: string): {
    count: number;
    total: number;
    average: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const values = this.metrics
      .filter(m => m.name === name)
      .map(m => m.duration)
      .sort((a, b) => a - b);
    
    if (values.length === 0) {
      return { count: 0, total: 0, average: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    return {
      count: values.length,
      total: values.reduce((a, b) => a + b, 0),
      average: values.reduce((a, b) => a + b, 0) / values.length,
      min: values[0],
      max: values[values.length - 1],
      p50: this.percentile(values, 0.5),
      p95: this.percentile(values, 0.95),
      p99: this.percentile(values, 0.99),
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics = [];
    this.marks.clear();
  }

  /**
   * Get summary
   */
  summary(): Record<string, ReturnType<typeof this.getStats>> {
    const names = new Set(this.metrics.map(m => m.name));
    const result: Record<string, ReturnType<typeof this.getStats>> = {};
    
    for (const name of names) {
      result[name] = this.getStats(name);
    }
    
    return result;
  }
}

// ============================================================================
// Async Batching
// ============================================================================

export class AsyncBatcher<T, R> {
  private queue: Array<{ item: T; resolve: (value: R) => void; reject: (error: Error) => void }> = [];
  private timeout: NodeJS.Timeout | null = null;
  private processor: (items: T[]) => Promise<R[]>;
  private batchSize: number;
  private maxWait: number;

  constructor(
    processor: (items: T[]) => Promise<R[]>,
    options: { batchSize?: number; maxWait?: number } = {}
  ) {
    this.processor = processor;
    this.batchSize = options.batchSize ?? 10;
    this.maxWait = options.maxWait ?? 100;
  }

  async add(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ item, resolve, reject });
      
      if (this.queue.length >= this.batchSize) {
        this.flush();
      } else if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), this.maxWait);
      }
    });
  }

  private async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0, this.batchSize);
    
    try {
      const results = await this.processor(batch.map(b => b.item));
      batch.forEach((b, i) => b.resolve(results[i]));
    } catch (error) {
      batch.forEach(b => b.reject(error as Error));
    }
  }
}

// ============================================================================
// Debounce & Throttle
// ============================================================================

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ============================================================================
// Global Performance Monitor
// ============================================================================

export const globalMonitor = new PerformanceMonitor();

// ============================================================================
// Decorators
// ============================================================================

/**
 * Memoize decorator
 */
export function Memoize(_target: object, _propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;
  
  descriptor.value = memoize(original);
  
  return descriptor;
}

/**
 * Monitor decorator
 */
export function Monitor(name?: string) {
  return function (target: object, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    const metricName = name ?? propertyKey;
    
    descriptor.value = function (...args: any[]) {
      globalMonitor.mark(metricName);
      const result = original.apply(this, args);
      
      if (result instanceof Promise) {
        return result
          .then((value) => {
            globalMonitor.measure(metricName, metricName);
            return value;
          })
          .catch((error) => {
            globalMonitor.measure(metricName, metricName);
            throw error;
          });
      }
      
      globalMonitor.measure(metricName, metricName);
      return result;
    };
    
    return descriptor;
  };
}

// ============================================================================
// Performance Budget
// ============================================================================

export interface PerformanceBudget {
  maxDuration: number;
  warningThreshold: number;
}

export function checkPerformanceBudget(
  name: string,
  duration: number,
  budget: PerformanceBudget
): void {
  if (duration > budget.maxDuration) {
    console.error(`❌ Performance budget exceeded for ${name}: ${duration}ms > ${budget.maxDuration}ms`);
  } else if (duration > budget.warningThreshold) {
    console.warn(`⚠️ Performance warning for ${name}: ${duration}ms > ${budget.warningThreshold}ms`);
  }
}
