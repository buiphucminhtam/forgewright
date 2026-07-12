import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, PipelineState } from '../models/PipelineState.js';
import { IEventPublisher } from '../ports/IEventPublisher.js';
import { IStateRepository } from '../ports/IStateRepository.js';
import { PipelineService } from './PipelineService.js';

class MemoryStateRepository implements IStateRepository<PipelineState> {
  constructor(public state: PipelineState | null) {}

  saves = 0;

  async load(): Promise<PipelineState | null> {
    return this.state;
  }

  async save(state: PipelineState): Promise<void> {
    this.state = state;
    this.saves += 1;
  }

  async update(partialState: Partial<PipelineState>): Promise<void> {
    await this.save({ ...this.state!, ...partialState });
  }

  async transact(
    mutator: (state: PipelineState | null) => PipelineState | null | Promise<PipelineState | null>,
  ): Promise<PipelineState | null> {
    const next = await mutator(this.state);
    if (next) await this.save(next);
    return next;
  }
}

class RecordingEventPublisher implements IEventPublisher {
  events: Array<{ event: string; payload: unknown }> = [];

  publish(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

class RejectingTransactionRepository extends MemoryStateRepository {
  async transact(): Promise<PipelineState | null> {
    throw new Error('injected transaction rejection');
  }
}

describe('PipelineService', () => {
  it('does not persist or publish when a gate denies phase advancement', async () => {
    const state: PipelineState = {
      ...DEFAULT_STATE,
      status: 'WAITING_FOR_GATE',
      phases: [],
    };
    const repo = new MemoryStateRepository(state);
    const publisher = new RecordingEventPublisher();
    const service = new PipelineService(repo, publisher);

    await expect(service.advancePhase()).resolves.toContain('cannot advance');

    expect(repo.saves).toBe(0);
    expect(publisher.events).toEqual([]);
  });

  it('does not persist or publish when approval is requested outside a gate', async () => {
    const repo = new MemoryStateRepository({ ...DEFAULT_STATE, phases: [] });
    const publisher = new RecordingEventPublisher();
    const service = new PipelineService(repo, publisher);

    await expect(service.approveGate()).resolves.toContain('not waiting');

    expect(repo.saves).toBe(0);
    expect(publisher.events).toEqual([]);
  });

  it('keeps the newest 100 history entries when a canonical mutation appends one', async () => {
    const history = Array.from({ length: 100 }, (_, index) => `entry-${index}`);
    const repo = new MemoryStateRepository({ ...DEFAULT_STATE, history, phases: [] });
    const publisher = new RecordingEventPublisher();
    const service = new PipelineService(repo, publisher);

    await service.startPipeline('test');

    expect(repo.state?.history).toHaveLength(100);
    expect(repo.state?.history[0]).toBe('entry-1');
    expect(repo.state?.history.at(-1)).toBe('Started pipeline in mode: test');
  });

  it('trims oversized legacy history through canonical mutations that do not append history', async () => {
    const history = Array.from({ length: 101 }, (_, index) => `entry-${index}`);
    const repo = new MemoryStateRepository({ ...DEFAULT_STATE, history, phases: [] });
    const publisher = new RecordingEventPublisher();
    const service = new PipelineService(repo, publisher);

    await service.updateSelfHealing(null);

    expect(repo.state?.history).toHaveLength(100);
    expect(repo.state?.history[0]).toBe('entry-1');
    expect(publisher.events).toHaveLength(1);
  });

  it('never publishes an event when its repository transaction rejects', async () => {
    const repo = new RejectingTransactionRepository({ ...DEFAULT_STATE, phases: [] });
    const publisher = new RecordingEventPublisher();
    const service = new PipelineService(repo, publisher);

    await expect(service.startPipeline('test')).rejects.toThrow('injected transaction rejection');

    expect(publisher.events).toEqual([]);
  });
});
