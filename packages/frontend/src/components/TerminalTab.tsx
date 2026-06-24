import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

interface TerminalTabProps {
  workspaceId: string; // The ID of the parent workspace owning the tab.
  tabId: string; // The unique ID of this terminal session tab.
  isActive: boolean; // Flag to indicate if this terminal window is currently focused.
  onFocus?: () => void; // Callback invoked when the terminal is clicked to request focus.
}

// Renders an xterm.js instance and binds it to a persistent backend shell process.
export const TerminalTab: React.FC<TerminalTabProps> = ({ workspaceId, tabId, isActive, onFocus }) => {
  const [ready, setReady] = useState(false); // Tracks if the container has non-zero dimensions.
  const containerRef = useRef<HTMLDivElement>(null); // Reference mapping to the DOM element hosting the xterm frame.
  const termRef = useRef<Terminal | null>(null); // Reference containing the instantiated xterm terminal engine.
  const wsRef = useRef<WebSocket | null>(null); // Reference containing the websocket connection pointing to the terminal server.
  const fitAddonRef = useRef<FitAddon | null>(null); // Reference containing the fit addon instance for managing sizes.
  const disposedRef = useRef(false); // Flag marking if the terminal was disposed to prevent stale async calls.
  const lastColsRef = useRef<number>(0); // Tracks the last successfully sent terminal column dimension.
  const lastRowsRef = useRef<number>(0); // Tracks the last successfully sent terminal row dimension.

  // Phase 1: Wait for the container to have non-zero dimensions before creating the terminal.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
      setReady(true);
      return;
    }
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) {
        setReady(true);
        ro.disconnect();
      }
    });
    ro.observe(el);
    return () => { ro.disconnect(); setReady(false); };
  }, []);

  // Phase 2: Create the terminal and WebSocket only when the container has final dimensions.
  useEffect(() => {
    if (!ready || !containerRef.current) return;

    disposedRef.current = false;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      fontSize: 13,
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

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; // Computes socket protocol matching current page protocol.
    const wsHost = window.location.host; // Host:port of the current page (Vite proxy handles routing to backend).
    const token = localStorage.getItem('exeggutor_token') || ''; // Active authorization token value.
    const wsUrl = `${wsProtocol}//${wsHost}/ws/terminal/${tabId}?token=${token}`; // Dynamic target websocket connection URL with auth query parameter.
    const ws = new WebSocket(wsUrl); // Instant WebSocket connection object.
    wsRef.current = ws;

    // Synchronizes the current frontend xterm dimensions with the backend PTY session.
    const sendResize = () => {
      if (disposedRef.current) { return; }
      try {
        if (containerRef.current && (containerRef.current.offsetWidth > 0 || containerRef.current.offsetHeight > 0) && !disposedRef.current) {
          fitAddon.fit();
          const finalCols = Math.max(term.cols, 40); // Ensures the terminal is not resized below a minimum of 40 columns.
          const finalRows = Math.max(term.rows, 10); // Ensures the terminal is not resized below a minimum of 10 rows.
          if (finalCols > 0 && finalRows > 0) {
            if (ws.readyState === WebSocket.OPEN) {
              if (finalCols !== lastColsRef.current || finalRows !== lastRowsRef.current) {
                lastColsRef.current = finalCols;
                lastRowsRef.current = finalRows;
                const dims = { type: 'resize', cols: finalCols, rows: finalRows }; // Serialized dimensions object sent to backend.
                ws.send(JSON.stringify(dims));
              }
            }
          }
        }
      } catch (err) {
        // Safe resize skip.
      }
    };

    // Container has dimensions at this point, so fit succeeds immediately without flicker.
    term.open(containerRef.current);
    fitAddon.fit();
    term.focus();
    sendResize();

    const wheelHandler = (ev: WheelEvent) => {
      if (term.buffer.active.type !== 'alternate') return;
      if (ev.deltaY === 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const amount = Math.max(1, Math.min(Math.round(Math.abs(ev.deltaY) / 20), 10));
      const seq = `\x1b[${ev.deltaY < 0 ? 'A' : 'B'}`;
      let data = '';
      for (let i = 0; i < amount; i++) data += seq;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    };
    const termEl = term.element;
    termEl?.addEventListener('wheel', wheelHandler, { capture: true, passive: false });

    ws.onmessage = (event) => {
      if (!disposedRef.current) {
        try {
          term.write(event.data);
        } catch (_) {
          // Safe write skip after disposal.
        }
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN && !disposedRef.current) {
        const payload = JSON.stringify({ type: 'input', data }); // Serialized terminal input payload.
        ws.send(payload);
      }
    });

    const resizeObserver = new ResizeObserver(sendResize); // Observation controller notifying on layout changes.
    resizeObserver.observe(containerRef.current);

    ws.onopen = sendResize;

    const cleanup = () => {
      disposedRef.current = true;
      termEl?.removeEventListener('wheel', wheelHandler, { capture: true });
      resizeObserver.disconnect();
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      try {
        term.dispose();
      } catch (_) {
        // Safe dispose skip.
      }
      termRef.current = null;
      fitAddonRef.current = null;
    };
    return cleanup;
  }, [ready, tabId, workspaceId]);

  // Re-fits the terminal when the tab becomes active.
  useEffect(() => {
    if (isActive && fitAddonRef.current && containerRef.current) {
      try {
        if (containerRef.current.offsetWidth > 0 || containerRef.current.offsetHeight > 0) {
          fitAddonRef.current.fit();
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && termRef.current && termRef.current.cols > 0 && termRef.current.rows > 0) {
            const finalCols = Math.max(termRef.current.cols, 40); // Ensures a minimum columns count is maintained on tab activation.
            const finalRows = Math.max(termRef.current.rows, 10); // Ensures a minimum rows count is maintained on tab activation.
            if (finalCols !== lastColsRef.current || finalRows !== lastRowsRef.current) {
              lastColsRef.current = finalCols;
              lastRowsRef.current = finalRows;
              const dims = { type: 'resize', cols: finalCols, rows: finalRows }; // Serialized dimensions object sent to backend.
              wsRef.current.send(JSON.stringify(dims));
            }
          }
        }
      } catch (err) {
        // Safe resize skip.
      }
    }
  }, [isActive]);

  const view = (
    <div className="w-full h-full bg-dark-900 relative overflow-hidden">
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full bg-dark-900"
        onMouseDown={() => { termRef.current?.focus(); onFocus?.(); }}
        onTouchStart={() => { termRef.current?.focus(); onFocus?.(); }}
      />
    </div>
  ); // The main layout representation.
  return view;
};
