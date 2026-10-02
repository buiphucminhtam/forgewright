export interface PoolItem { visible: boolean }
export class ObjectPool<T extends PoolItem> {
  private free: T[] = [];
  private used = new Set<T>();
  private disposed = false;
  created = 0;
  constructor(private factory: () => T, private reset: (item: T) => void,
    private destroy: (item: T) => void, readonly capacity = 10) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('invalid-capacity');
  }
  acquire(): T {
    if (this.disposed) throw new Error('pool-disposed');
    if (!this.free.length && this.created >= this.capacity) throw new Error('pool-exhausted');
    const item = this.free.pop() ?? this.create();
    item.visible = true; this.used.add(item); return item;
  }
  private create(): T { const item = this.factory(); this.created++; return item; }
  release(item: T): boolean {
    if (!this.used.delete(item)) return false;
    this.reset(item); item.visible = false; this.free.push(item); return true;
  }
  get activeCount(): number { return this.used.size; }
  get availableCount(): number { return this.free.length; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of [...this.free, ...this.used]) this.destroy(item);
    this.free = []; this.used.clear();
  }
}
