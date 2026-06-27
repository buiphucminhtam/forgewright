import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { IEventPublisher } from '../../core/ports/IEventPublisher.js';

export class McpEventPublisher implements IEventPublisher {
  private mcpServer: Server | null = null;
  private sessionId: string | undefined;
  private workspacePath: string;

  constructor(workspacePath: string, sessionId?: string) {
    this.workspacePath = workspacePath;
    this.sessionId = sessionId;
  }

  setServer(server: Server): void {
    this.mcpServer = server;
  }

  publish(eventName: string, payload: unknown): void {
    if (!this.mcpServer) return;
    try {
      this.mcpServer
        .notification({
          method: 'notifications/forgewright_event',
          params: {
            sessionId: this.sessionId,
            workspacePath: this.workspacePath,
            event: eventName,
            timestamp: Date.now(),
            payload,
          },
        })
        .catch(() => {
          // ignore
        });
    } catch (e) {
      // ignore
    }
  }
}
