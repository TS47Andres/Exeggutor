import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

interface TerminalTabProps {
  workspaceId: string; // The ID of the parent workspace owning the tab.
  tabId: string; // The unique ID of this terminal session tab.
  isActive: boolean; // Flag to indicate if this terminal window is currently focused.
  fontSize: number; // Current font size for the terminal display.
}

// Renders an xterm.js instance and binds it to a persistent backend shell process.
export const TerminalTab: React.FC<TerminalTabProps> = ({ workspaceId, tabId, isActive, fontSize }) => {
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
      cursorStyle: 'block',
      scrollback: 5000,
      fontSize: fontSize,
      fontFamily: 'JetBrains Mono, monospace',
      theme: {
        background: '#000000',
        foreground: '#f4f4f5',
        cursor: '#ffffff',
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#ec4899',
        cyan: '#06b6d4',
        white: '#f4f4f5',
      },
    }); // Spawns a new client-side xterm Terminal instance.
    termRef.current = term;

    const fitAddon = new FitAddon(); // Spawns a new FitAddon instance.
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    if (containerRef.current && (containerRef.current.offsetWidth > 0 || containerRef.current.offsetHeight > 0)) {
      fitAddon.fit();
      term.focus();
    } else {
      setTimeout(() => {
        if (containerRef.current && fitAddonRef.current) {
          try { fitAddonRef.current.fit(); } catch (_) {}
        }
      }, 100);
    }

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

    let lastCols = 0; // Previous cols count to avoid redundant resize messages.
    let lastRows = 0; // Previous rows count to avoid redundant resize messages.

    const sendResize = () => {
      try {
        if (containerRef.current && (containerRef.current.offsetWidth > 0 || containerRef.current.offsetHeight > 0)) {
          fitAddon.fit();
          if (term.cols > 0 && term.rows > 0 && (term.cols !== lastCols || term.rows !== lastRows)) {
            lastCols = term.cols;
            lastRows = term.rows;
            if (ws.readyState === WebSocket.OPEN) {
              const dims = { type: 'resize', cols: term.cols, rows: term.rows };
              ws.send(JSON.stringify(dims));
            }
          }
        }
      } catch (err) {
        // Safe resize skip.
      }
    };

    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(containerRef.current);

    ws.onopen = sendResize;

    const cleanup = () => {
      resizeObserver.disconnect();
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
    return cleanup;
  }, [tabId, workspaceId]);

  // Re-fits the terminal when the tab becomes active.
  useEffect(() => {
    if (isActive && fitAddonRef.current && containerRef.current) {
      try {
        if (containerRef.current.offsetWidth > 0 || containerRef.current.offsetHeight > 0) {
          fitAddonRef.current.fit();
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && termRef.current && termRef.current.cols > 0 && termRef.current.rows > 0) {
            const dims = { type: 'resize', cols: termRef.current.cols, rows: termRef.current.rows };
            wsRef.current.send(JSON.stringify(dims));
          }
        }
      } catch (err) {
        // Safe resize skip.
      }
    }
  }, [isActive]);

  // Updates the terminal font size and re-fits when the zoom level changes.
  useEffect(() => {
    const term = termRef.current;
    const fit = fitAddonRef.current;
    if (term && fit && typeof term.setOption === 'function') {
      try {
        term.setOption('fontSize', fontSize);
        if (containerRef.current && (containerRef.current.offsetWidth > 0 || containerRef.current.offsetHeight > 0)) {
          fit.fit();
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && term.cols > 0 && term.rows > 0) {
            const dims = { type: 'resize', cols: term.cols, rows: term.rows };
            wsRef.current.send(JSON.stringify(dims));
          }
        }
      } catch (err) {
        // Safe resize skip.
      }
    }
  }, [fontSize]);

  const view = (
    <div className="w-full h-full bg-dark-900 relative">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" onClick={() => termRef.current?.focus()} />
    </div>
  ); // The main layout representation.
  return view;
};
