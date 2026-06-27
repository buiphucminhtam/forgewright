import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
  // Deprecated, no-op since we use stateless webhook
}

export function emitRpcEvent(eventName: string, payload: unknown): void {
  const baseUrl = getWebhookUrl();
  if (!baseUrl) return;

  const sessionId = getSessionId();
  const workspacePath = process.cwd();

  const body = JSON.stringify({
    sessionId,
    workspacePath,
    payload,
  });

  let endpoint = '/api/v1/unknown';
  if (eventName === 'PIPELINE_STATE_UPDATE') {
    endpoint = '/api/v1/state';
  } else if (eventName === 'COST_UPDATE') {
    endpoint = '/api/v1/telemetry';
  }

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
      // Ignore response
      res.resume();
    }
  );

  req.on('error', () => {
    // Ignore error
  });

  req.write(body);
  req.end();
}
