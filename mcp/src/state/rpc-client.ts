import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpEventPublisher } from '../infrastructure/adapters/McpEventPublisher.js';
import { FileLogEventPublisher } from '../infrastructure/adapters/FileLogEventPublisher.js';
import { HttpWebhookEventPublisher } from '../infrastructure/adapters/HttpWebhookEventPublisher.js';
import { CombinedEventPublisher } from '../infrastructure/adapters/CombinedEventPublisher.js';

let mcpServer: Server | null = null;
let mcpPublisher: McpEventPublisher | null = null;

export function setMcpServer(server: Server): void {
  mcpServer = server;
  if (mcpPublisher) {
    mcpPublisher.setServer(server);
  }
}

function getSessionId(): string | undefined {
  return process.env.FORGEWRIGHT_SESSION_ID;
}

export function initRpcClient(): void {
  // Deprecated
}

export function emitRpcEvent(eventName: string, payload: unknown): void {
  const sessionId = getSessionId();
  const workspacePath = process.cwd();

  if (!mcpPublisher) {
    mcpPublisher = new McpEventPublisher(workspacePath, sessionId);
    if (mcpServer) mcpPublisher.setServer(mcpServer);
  }

  const filePublisher = new FileLogEventPublisher(workspacePath);
  const httpPublisher = new HttpWebhookEventPublisher(workspacePath, sessionId);

  const combined = new CombinedEventPublisher([mcpPublisher, filePublisher, httpPublisher]);

  combined.publish(eventName, payload);
}
