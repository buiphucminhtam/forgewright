import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { IEventPublisher } from '../../core/ports/IEventPublisher.js';

export class HttpWebhookEventPublisher implements IEventPublisher {
  private readonly sessionId: string | undefined;
  private readonly workspacePath: string;

  constructor(workspacePath: string, sessionId?: string) {
    this.workspacePath = workspacePath;
    this.sessionId = sessionId;
  }

  private getWebhookUrl(): string | null {
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

  publish(eventName: string, payload: unknown): void {
    const baseUrl = this.getWebhookUrl();
    if (!baseUrl) return;

    const body = JSON.stringify({
      sessionId: this.sessionId,
      workspacePath: this.workspacePath,
      payload,
    });

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
