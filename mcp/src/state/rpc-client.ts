import WebSocket from 'ws';
import { getRpcUrl } from './rpc-port.js';

let wsClient: WebSocket | null = null;
let isConnecting = false;

function getSessionId(): string | undefined {
  return process.env.FORGEWRIGHT_SESSION_ID;
}

let messageQueue: any[] = [];

export function initRpcClient(): void {
  if (wsClient || isConnecting) return;

  const url = getRpcUrl();
  if (!url) return; // RPC not available

  isConnecting = true;
  try {
    wsClient = new WebSocket(url);

    wsClient.on('open', () => {
      isConnecting = false;
      // Send queued messages
      while (messageQueue.length > 0) {
        const msg = messageQueue.shift();
        try {
          wsClient?.send(JSON.stringify(msg));
        } catch (e) {}
      }
    });

    wsClient.on('error', (_err) => {
      isConnecting = false;
    });

    wsClient.on('close', () => {
      wsClient = null;
      isConnecting = false;
    });
  } catch (error) {
    isConnecting = false;
  }
}

export function emitRpcEvent(eventName: string, payload: unknown): void {
  if (!getRpcUrl()) return;

  if (!wsClient && !isConnecting) {
    initRpcClient();
  }

  const sessionId = getSessionId();
  const workspacePath = process.cwd();

  const rpcMessage = {
    event: eventName,
    sessionId,
    workspacePath,
    payload,
  };

  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
    messageQueue.push(rpcMessage);
    return;
  }

  try {
    wsClient.send(JSON.stringify(rpcMessage), (err) => {
      if (err) {
        // Ignore
      }
    });
  } catch (e) {
    // Fallback
  }
}
