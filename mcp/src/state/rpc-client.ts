import WebSocket from 'ws';

let wsClient: WebSocket | null = null;
let isConnecting = false;

function getSessionId(): string | undefined {
  return process.env.FORGEWRIGHT_SESSION_ID;
}

export function initRpcClient(): void {
  if (wsClient || isConnecting) return;

  const url = process.env.FORGEWRIGHT_RPC_URL;
  if (!url) return; // RPC not available

  isConnecting = true;
  try {
    wsClient = new WebSocket(url);

    wsClient.on('open', () => {
      isConnecting = false;
      // Optional: Log connection success if needed, but usually we stay silent to avoid polluting stdout
    });

    wsClient.on('error', (_err) => {
      // Catch errors silently so it doesn't crash the CLI
      isConnecting = false;
    });

    wsClient.on('close', () => {
      wsClient = null;
      isConnecting = false;
      // Connection closed, we could try reconnecting, but gracefully falling back is fine
    });
  } catch (error) {
    // Catch initial creation errors
    isConnecting = false;
  }
}

export function emitRpcEvent(eventName: string, payload: unknown): void {
  // Try to initialize if not done yet
  if (!wsClient && !isConnecting && process.env.FORGEWRIGHT_RPC_URL) {
    initRpcClient();
  }

  // If no connection is active, gracefully fallback
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
    return;
  }

  const sessionId = getSessionId();
  if (!sessionId) return;

  const rpcMessage = {
    event: eventName,
    sessionId,
    payload,
  };

  try {
    wsClient.send(JSON.stringify(rpcMessage), (err) => {
      if (err) {
        // Ignore send errors to avoid crashing
      }
    });
  } catch (e) {
    // Graceful fallback on sync errors
  }
}
