export interface ITelemetryLogger {
  logTokenUsage(usage: unknown): void;
  logCost(cost: unknown): void;
}
