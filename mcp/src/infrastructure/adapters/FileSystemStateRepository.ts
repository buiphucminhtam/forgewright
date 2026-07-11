import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { IStateRepository } from '../../core/ports/IStateRepository.js';

interface StateEnvelope<T> {
  schemaVersion: 1;
  revision: number;
  state: T;
}

export interface FileSystemStateRepositoryOptions {
  lockTimeoutMs?: number;
  lockStaleMs?: number;
  lockRetryMs?: number;
}

export class StatePersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'StatePersistenceError';
  }
}

export class FileSystemStateRepository<T> implements IStateRepository<T> {
  private static readonly queues = new Map<string, Promise<void>>();
  private readonly stateFile: string;
  private readonly dirPath: string;
  private readonly lockFile: string;
  private readonly lockTimeoutMs: number;
  private readonly lockStaleMs: number;
  private readonly lockRetryMs: number;

  constructor(
    workspacePath: string,
    filename: string = 'state.json',
    private readonly parseState: (value: unknown) => T,
    options: FileSystemStateRepositoryOptions = {},
  ) {
    this.dirPath = path.join(workspacePath, '.forgewright');
    this.stateFile = path.join(this.dirPath, filename);
    this.lockFile = `${this.stateFile}.lock`;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 2_000;
    this.lockStaleMs = options.lockStaleMs ?? 30_000;
    this.lockRetryMs = options.lockRetryMs ?? 10;
  }

  async load(): Promise<T | null> {
    return this.readEnvelope().state;
  }

  private readEnvelope(): { state: T | null; revision: number } {
    if (!fs.existsSync(this.stateFile)) return { state: null, revision: 0 };
    try {
      const raw = fs.readFileSync(this.stateFile, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'schemaVersion' in parsed &&
        'revision' in parsed &&
        'state' in parsed
      ) {
        const envelope = parsed as Record<string, unknown>;
        if (
          envelope.schemaVersion !== 1 ||
          !Number.isSafeInteger(envelope.revision) ||
          (envelope.revision as number) < 1
        ) {
          throw new StatePersistenceError('Unsupported or invalid state envelope.');
        }
        return {
          state: this.parseState(envelope.state),
          revision: envelope.revision as number,
        };
      }
      // Valid legacy raw state is read at revision 0 and migrated on the next write.
      return { state: this.parseState(parsed), revision: 0 };
    } catch (error) {
      if (error instanceof StatePersistenceError) throw error;
      throw new StatePersistenceError(`Failed to load state from ${this.stateFile}.`, {
        cause: error,
      });
    }
  }

  async save(state: T): Promise<void> {
    await this.withLock(async () => {
      const current = this.readEnvelope();
      this.writeEnvelope(this.parseState(state), current.revision + 1);
    });
  }

  async update(partialState: Partial<T>): Promise<void> {
    await this.transact((currentState) => {
      if (!currentState) {
        throw new StatePersistenceError('Cannot update state before it has been initialized.');
      }
      return { ...currentState, ...partialState } as T;
    });
  }

  async transact(mutator: (state: T | null) => T | null | Promise<T | null>): Promise<T | null> {
    return this.withLock(async () => {
      const current = this.readEnvelope();
      const candidate = await mutator(current.state);
      if (candidate === null) return null;
      const next = this.parseState(candidate);
      this.writeEnvelope(next, current.revision + 1);
      return next;
    });
  }

  private writeEnvelope(state: T, revision: number): void {
    fs.mkdirSync(this.dirPath, { recursive: true });
    const envelope: StateEnvelope<T> = { schemaVersion: 1, revision, state };
    const tempFile = `${this.stateFile}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(envelope, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      fs.renameSync(tempFile, this.stateFile);
    } catch (error) {
      throw new StatePersistenceError(`Failed to save state to ${this.stateFile}.`, {
        cause: error,
      });
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }

  private async withLock<R>(operation: () => Promise<R>): Promise<R> {
    const previous = FileSystemStateRepository.queues.get(this.stateFile) ?? Promise.resolve();
    let releaseQueue!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    const queue = previous.then(() => current);
    FileSystemStateRepository.queues.set(this.stateFile, queue);
    await previous;

    fs.mkdirSync(this.dirPath, { recursive: true });
    const deadline = Date.now() + this.lockTimeoutMs;
    let fd: number | undefined;
    let ownerToken: string | undefined;
    let result!: R;
    let operationError: unknown;
    let hasOperationError = false;
    let cleanupError: unknown;
    try {
      while (fd === undefined) {
        try {
          fd = fs.openSync(this.lockFile, 'wx', 0o600);
          ownerToken = randomUUID();
          fs.writeFileSync(fd, ownerToken, { encoding: 'utf-8' });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw new StatePersistenceError(`Failed to acquire state lock ${this.lockFile}.`, {
              cause: error,
            });
          }
          if (this.removeStaleLock()) continue;
          if (Date.now() >= deadline) {
            throw new StatePersistenceError(`Timed out acquiring state lock ${this.lockFile}.`, {
              cause: error,
            });
          }
          await new Promise((resolve) => setTimeout(resolve, this.lockRetryMs));
        }
      }
      result = await operation();
    } catch (error) {
      hasOperationError = true;
      operationError = error;
    } finally {
      try {
        if (fd !== undefined) {
          fs.closeSync(fd);
          if (ownerToken !== undefined && fs.readFileSync(this.lockFile, 'utf-8') === ownerToken) {
            fs.unlinkSync(this.lockFile);
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') cleanupError = error;
      }
      releaseQueue();
      if (FileSystemStateRepository.queues.get(this.stateFile) === queue) {
        FileSystemStateRepository.queues.delete(this.stateFile);
      }
    }
    if (hasOperationError) throw operationError;
    if (cleanupError !== undefined) throw cleanupError;
    return result;
  }

  private removeStaleLock(): boolean {
    try {
      const ageMs = Date.now() - fs.statSync(this.lockFile).mtimeMs;
      if (ageMs < this.lockStaleMs) return false;
      fs.unlinkSync(this.lockFile);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
      throw new StatePersistenceError(`Failed to inspect state lock ${this.lockFile}.`, {
        cause: error,
      });
    }
  }
}
