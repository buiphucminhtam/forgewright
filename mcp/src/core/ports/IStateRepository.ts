export interface IStateRepository<T> {
  load(): Promise<T | null>;
  save(state: T): Promise<void>;
  update(partialState: Partial<T>): Promise<void>;
}
