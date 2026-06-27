export interface IEventPublisher {
  publish(eventName: string, payload: unknown): void;
}
