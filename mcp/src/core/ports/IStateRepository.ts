export interface IStateRepository<T> {
  load(): Promise<T | null>;
  save(state: T): Promise<void>;
  update(partialState: Partial<T>): Promise<void>;
  /** Atomically read, mutate, and persist state while holding the repository lock. */
  transact(mutator: (state: T | null) => T | null | Promise<T | null>): Promise<T | null>;
}
