import fs from 'fs';
import path from 'path';
import { IEventPublisher } from '../../core/ports/IEventPublisher.js';

export class FileLogEventPublisher implements IEventPublisher {
  private readonly eventLogFile: string;

  constructor(workspacePath: string) {
    this.eventLogFile = path.join(workspacePath, '.forgewright', 'events.log');
  }

  publish(eventName: string, payload: unknown): void {
    try {
      const dir = path.dirname(this.eventLogFile);
      if (fs.existsSync(dir)) {
        const eventLine =
          JSON.stringify({ event: eventName, timestamp: Date.now(), payload }) + '\n';
        fs.appendFileSync(this.eventLogFile, eventLine, 'utf8');
      }
    } catch (e) {
      // ignore
    }
  }
}
