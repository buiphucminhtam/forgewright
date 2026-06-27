import { IEventPublisher } from '../../core/ports/IEventPublisher.js';

export class CombinedEventPublisher implements IEventPublisher {
  constructor(private publishers: IEventPublisher[]) {}

  publish(eventName: string, payload: unknown): void {
    for (const publisher of this.publishers) {
      try {
        publisher.publish(eventName, payload);
      } catch (e) {
        // Continue even if one publisher fails
      }
    }
  }
}
