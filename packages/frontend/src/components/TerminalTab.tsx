import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

interface TerminalTabProps {
  workspaceId: string; // The ID of the parent workspace owning the tab.
  tabId: string; // The unique ID of this terminal session tab.
  isActive: boolean; // Flag to indicate if this terminal window is currently focused.
}

// Renders an xterm.js instance and binds it to a persistent backend shell process.
export const TerminalTab: React.FC<TerminalTabProps> = ({ workspaceId, tabId, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null); // Reference mapping to the DOM element hosting the xterm frame.
  const termRef = useRef<Terminal | null>(null); // Reference containing the instantiated xterm terminal engine.
  const wsRef = useRef<WebSocket | null>(null); // Reference containing the websocket connection pointing to the terminal server.
  const fitAddonRef = useRef<FitAddon | null>(null); // Reference containing the fit addon instance for managing sizes.

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, monospace',
      theme: {
        background: '#0b0f19',
        foreground: '#f1f5f9',
        cursor: '#3b82f6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
        black: '#1f2937',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#f1f5f9',
      },
    }); // Spawns a new client-side xterm Terminal instance.
    termRef.current = term;

    const fitAddon = new FitAddon(); // Spawns a new FitAddon instance.
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; // Computes socket protocol matching current page protocol.
    const wsHost = window.location.hostname; // Hostname of the current web page.
    const wsUrl = `${wsProtocol}//${wsHost}:4000/ws/terminal/${tabId}`; // Dynamic target websocket connection URL.
    const ws = new WebSocket(wsUrl); // Instant WebSocket connection object.
    wsRef.current = ws;

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify({ type: 'input', data }); // Serialized terminal input payload.
        ws.send(payload);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          const dims = { type: 'resize', cols: term.cols, rows: term.rows }; // Resizing details to transmit.
          ws.send(JSON.stringify(dims));
        }
      } catch (err) {
        // Safe resize skip.
      }
    }); // Listens to dimension shifts on the viewport wrapper.
    resizeObserver.observe(containerRef.current);

    ws.onopen = () => {
      try {
        fitAddon.fit();
        const dims = { type: 'resize', cols: term.cols, rows: term.rows }; // Initial resizing layout data.
        ws.send(JSON.stringify(dims));
      } catch (err) {
        // Safe resize skip.
      }
    };

    const cleanup = () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    }; // Internal cleanup function.
    return cleanup;
  }, [tabId, workspaceId]);

  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      try {
        fitAddonRef.current.fit();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && termRef.current) {
          const dims = { type: 'resize', cols: termRef.current.cols, rows: termRef.current.rows }; // Focused resize dimensions.
          wsRef.current.send(JSON.stringify(dims));
        }
      } catch (err) {
        // Safe resize skip.
      }
    }
  }, [isActive]);

  const view = (
    <div className="w-full h-full bg-dark-900 relative">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
    </div>
  ); // The main layout representation.
  return view;
};
