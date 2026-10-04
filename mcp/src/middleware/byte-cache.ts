/** Accounted result-cache bytes, not a process RSS limit or host-wide allocator. */
export const CACHE_BYTE_LIMITS = Object.freeze({
  total: 8 * 1024 * 1024,
  project: 2 * 1024 * 1024,
  entry: 512 * 1024,
  ttlMs: 300_000,
});
type Limits = { total: number; project: number; entry: number; ttlMs: number };
type Reservation = { project: string; bytes: number; touched: number; evict: () => void };
export class ByteBudget {
  private entries = new Map<symbol, Reservation>();
  private projects = new Map<string, number>();
  private bytes = 0;
  private readonly limits: Limits;
  constructor(
    limits: Limits = CACHE_BYTE_LIMITS,
    private readonly now = Date.now,
  ) {
    if (
      Object.values(limits).some((value) => !Number.isSafeInteger(value) || value <= 0) ||
      limits.entry > limits.project ||
      limits.project > limits.total
    )
      throw new Error('invalid-cache-byte-limits');
    this.limits = Object.freeze({ ...limits });
  }
  remove(token: symbol): void {
    const entry = this.entries.get(token);
    if (!entry) return;
    this.entries.delete(token);
    this.bytes -= entry.bytes;
    const remaining = (this.projects.get(entry.project) ?? 0) - entry.bytes;
    if (remaining) this.projects.set(entry.project, remaining);
    else this.projects.delete(entry.project);
    entry.evict();
  }
  touch(token: symbol): void {
    const entry = this.entries.get(token);
    if (!entry) return;
    if (this.now() - entry.touched >= this.limits.ttlMs) {
      this.remove(token);
      return;
    }
    entry.touched = this.now();
    this.entries.delete(token);
    this.entries.set(token, entry);
  }
  prune(): void {
    for (const [token, entry] of this.entries)
      if (this.now() - entry.touched >= this.limits.ttlMs) this.remove(token);
  }
  reserve(project: string, bytes: number, evict: () => void): symbol | undefined {
    this.prune();
    if (
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > Math.min(this.limits.entry, this.limits.project, this.limits.total)
    )
      return;
    for (const [token, entry] of this.entries) {
      if ((this.projects.get(project) ?? 0) + bytes <= this.limits.project) break;
      if (entry.project === project) this.remove(token);
    }
    while (this.bytes + bytes > this.limits.total) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.remove(oldest);
    }
    const token = Symbol();
    this.entries.set(token, { project, bytes, touched: this.now(), evict });
    this.bytes += bytes;
    this.projects.set(project, (this.projects.get(project) ?? 0) + bytes);
    return token;
  }
  stats(): { bytes: number; projects: Record<string, number> } {
    this.prune();
    return { bytes: this.bytes, projects: Object.fromEntries(this.projects) };
  }
}
const processBudget = new ByteBudget();
// One unreferenced maintenance timer per MCP process, never one per project.
setInterval(() => processBudget.prune(), 60_000).unref();
export class ByteBoundedMap<T> extends Map<string, T> {
  private tokens = new Map<string, symbol>();
  constructor(
    private readonly project: string,
    private readonly measure: (value: T) => number,
    private readonly budget = processBudget,
  ) {
    super();
  }
  override set(key: string, value: T): this {
    this.delete(key);
    const token = this.budget.reserve(this.project, this.measure(value), () => {
      super.delete(key);
      this.tokens.delete(key);
    });
    if (token !== undefined) {
      this.tokens.set(key, token);
      super.set(key, value);
    }
    return this;
  }
  override get(key: string): T | undefined {
    const token = this.tokens.get(key);
    if (token !== undefined) this.budget.touch(token);
    return super.get(key);
  }
  override delete(key: string): boolean {
    const present = super.has(key),
      token = this.tokens.get(key);
    if (token !== undefined) this.budget.remove(token);
    return present;
  }
  override clear(): void {
    for (const key of this.tokens.keys()) this.delete(key);
  }
}
