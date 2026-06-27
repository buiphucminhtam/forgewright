import fs from 'fs';
import path from 'path';
import { IStateRepository } from '../../core/ports/IStateRepository.js';

export class FileSystemStateRepository<T> implements IStateRepository<T> {
  private readonly stateFile: string;
  private readonly dirPath: string;

  constructor(workspacePath: string, filename: string = 'state.json') {
    this.dirPath = path.join(workspacePath, '.forgewright');
    this.stateFile = path.join(this.dirPath, filename);
  }

  async load(): Promise<T | null> {
    if (!fs.existsSync(this.stateFile)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(this.stateFile, 'utf-8');
      return JSON.parse(raw) as T;
    } catch (e) {
      console.error('Failed to parse state file', e);
      return null;
    }
  }

  async save(state: T): Promise<void> {
    if (!fs.existsSync(this.dirPath)) {
      fs.mkdirSync(this.dirPath, { recursive: true });
    }
    const tempFile = `${this.stateFile}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tempFile, this.stateFile);
    } catch (e) {
      console.error('Failed to write state file', e);
    } finally {
      if (fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // ignore
        }
      }
    }
  }

  async update(partialState: Partial<T>): Promise<void> {
    const currentState = await this.load();
    if (currentState) {
      const newState = { ...currentState, ...partialState } as T;
      await this.save(newState);
    }
  }
}
