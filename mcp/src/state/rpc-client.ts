import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

let mcpServer: Server | null = null;

export function setMcpServer(server: Server): void {
  mcpServer = server;
}

function getSessionId(): string | undefined {
  return process.env.FORGEWRIGHT_SESSION_ID;
}

function getWebhookUrl(): string | null {
  if (process.env.FORGEWRIGHT_WEBHOOK_URL) {
    return process.env.FORGEWRIGHT_WEBHOOK_URL;
  }
  try {
    const portFile = path.join(os.homedir(), '.forgewright-console', 'webhook-port.txt');
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, 'utf8').trim();
      return `http://127.0.0.1:${port}`;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export function initRpcClient(): void {
  // Deprecated, no-op since we use stateless webhooks + MCP notifications
}

export function emitRpcEvent(eventName: string, payload: unknown): void {
  const sessionId = getSessionId();
  const workspacePath = process.cwd();

  const eventPayload = {
    sessionId,
    workspacePath,
    event: eventName,
    timestamp: Date.now(),
    payload,
  };

  // 1. Mechanism 1: MCP Custom Notification
  // This is the fastest, cleanest way if the IDE acts as the MCP client (Cursor/Claude Code)
  if (mcpServer) {
    try {
      mcpServer
        .notification({
          method: `notifications/forgewright_event`,
          params: eventPayload,
        })
        .catch(() => {
          /* ignore */
        });
    } catch (e) {
      // ignore
    }
  }

  // 2. Mechanism 2: Dedicated Event Trigger File (for lightweight fs.watch without polling)
  // External tools can `tail -f` or `fs.watch` this single file instead of multiple deep files.
  try {
    const fwDir = path.join(workspacePath, '.forgewright');
    if (fs.existsSync(fwDir)) {
      const eventLogFile = path.join(fwDir, 'events.log');
      // Append a single line event (keep file size manageable)
      const eventLine =
        JSON.stringify({ event: eventName, timestamp: eventPayload.timestamp }) + '\n';
      fs.appendFileSync(eventLogFile, eventLine, 'utf8');
    }
  } catch (e) {
    // ignore
  }

  // 3. Mechanism 3: HTTP Webhook (Legacy/Fallback)
  const baseUrl = getWebhookUrl();
  if (baseUrl) {
    const body = JSON.stringify({ sessionId, workspacePath, payload });
    let endpoint = '/api/v1/unknown';
    if (eventName === 'PIPELINE_STATE_UPDATE') {
      endpoint = '/api/v1/state';
    } else if (eventName === 'COST_UPDATE') {
      endpoint = '/api/v1/telemetry';
    }

    try {
      const fullUrl = new URL(endpoint, baseUrl);
      const req = http.request(
        fullUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          res.resume();
        },
      );
      req.on('error', () => {
        /* ignore */
      });
      req.write(body);
      req.end();
    } catch (e) {
      // ignore invalid URL
    }
  }
}
