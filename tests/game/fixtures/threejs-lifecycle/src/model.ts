export const STEP = 1 / 60;
export type Phase = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
export function damage(atk: number, def: number, skill: number, critical: boolean): number {
  return Math.max(1, (atk * skill - def * 0.5) * (critical ? 2 : 1));
}
export class Game {
  phase: Phase = 'ready';
  lane = 1;
  ticks = 0;
  score = 0;
  readonly route: number[];
  constructor(seed = 7) {
    let value = seed >>> 0;
    this.route = Array.from({length: 3}, () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value % 3;
    });
  }
  start(): void { this.phase = 'playing'; this.lane = 1; this.ticks = 0; this.score = 0; }
  move(direction: number): void {
    if (this.phase === 'playing') this.lane = Math.max(0, Math.min(2, this.lane + direction));
  }
  pause(): void { if (this.phase === 'playing') this.phase = 'paused'; }
  resume(): void { if (this.phase === 'paused') this.phase = 'playing'; }
  step(): void {
    if (this.phase !== 'playing') return;
    this.ticks++;
    if (this.ticks % 120 !== 0) return;
    if (this.lane !== this.route[this.score]) { this.phase = 'lost'; return; }
    this.score++;
    if (this.score === this.route.length) this.phase = 'won';
  }
}
