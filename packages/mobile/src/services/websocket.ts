// WebSocket connection manager for terminal I/O.
// Manages a single WebSocket connection to a backend terminal session.

import { loadConnection } from '../storage/secureStore';

export type TerminalMessageHandler = (data: string) => void;

export interface TerminalConnection {
  send: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
  close: () => void;
  setOnMessage: (handler: TerminalMessageHandler | null) => void;
}

// Opens a WebSocket connection to the terminal backend for the given tab.
// Returns a controller object for sending and receiving data.
export async function connectTerminal(
  tabId: string,
  onMessage: TerminalMessageHandler
): Promise<TerminalConnection> {
  const conn = await loadConnection(); // Stored host, port, and token.
  if (!conn.host || !conn.port || !conn.token) {
    throw new Error('No connection configured');
  }

  const wsUrl = `ws://${conn.host}:${conn.port}/ws/terminal/${tabId}?token=${encodeURIComponent(conn.token)}`; // WebSocket URL with auth query parameter.
  const ws = new WebSocket(wsUrl);

  let messageHandler: TerminalMessageHandler | null = onMessage;

  const connectionPromise = new Promise<TerminalConnection>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket connection timed out'));
    }, 10000); // Reject if the connection does not open within 10 seconds.

    ws.onopen = () => {
      clearTimeout(timeout);
      const controller: TerminalConnection = {
        send: (data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        },
        sendResize: (cols: number, rows: number) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        },
        close: () => {
          ws.onopen = null;
          ws.onclose = null;
          ws.onerror = null;
          ws.onmessage = null;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        },
        setOnMessage: (handler: TerminalMessageHandler | null) => {
          messageHandler = handler;
        },
      };
      resolve(controller);
    };

    ws.onmessage = (event) => {
      if (messageHandler) {
        messageHandler(event.data as string);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection failed'));
    };

    ws.onclose = () => {
      // Connection closed — the consumer should re-connect if needed.
    };
  });

  return connectionPromise;
}
