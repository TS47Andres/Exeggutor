import React, { useEffect, useState, useRef } from 'react';
import { Eye, Terminal, FolderOpen, AlertTriangle } from 'lucide-react';
import { Workspace } from '../App';

interface ObserverSidebarProps {
  workspaces: Workspace[]; // Current list of workspaces loaded in the client.
  activeWorkspaceId?: string; // The ID of the currently selected workspace.
  onSelectWorkspace: (workspaceId: string) => void; // Callback to switch the active workspace context.
}

interface SessionState {
  id: string; // The tab ID.
  workspaceId: string; // The ID of the owning workspace.
  status: 'Active' | 'Waiting' | 'Idle' | 'Errored'; // Evaluated activity state of the shell process.
  preview: string; // Truncated last line output preview from the stdout stream.
}

// Connects to the backend event socket to render real-time terminal process activities.
export const ObserverSidebar: React.FC<ObserverSidebarProps> = ({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
}) => {
  const [sessions, setSessions] = useState<SessionState[]>([]); // Reactive cache containing live session states.
  const wsRef = useRef<WebSocket | null>(null); // WebSocket connection reference.

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'; // Selected communication protocol.
    const wsHost = window.location.hostname; // Target backend host IP or DNS name.
    const wsUrl = `${wsProtocol}//${wsHost}:4000/ws/observer`; // Computed observer ws address.
    const ws = new WebSocket(wsUrl); // Loaded socket handler.
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data); // Parsed JSON message envelope from backend.
        if (data && data.type === 'observer') {
          setSessions(data.sessions || []);
        }
      } catch (err) {
        // Safe skip of parse errors.
      }
    };

    const cleanup = () => {
      ws.close();
    }; // Socket cleanup handler.
    return cleanup;
  }, []);

  const sessionMap = new Map(sessions.map(s => [s.id, s])); // Lookup index linking terminal tab IDs to their status payloads.

  const renderBadge = (status: SessionState['status']) => {
    switch (status) {
      case 'Active':
        const activeBadge = (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neon-green/10 text-neon-green border border-neon-green/20">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
            Active
          </span>
        ); // Active label configuration.
        return activeBadge;
      case 'Waiting':
        const waitingBadge = (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neon-orange/10 text-neon-orange border border-neon-orange/20">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-orange animate-bounce" />
            Waiting
          </span>
        ); // Waiting label configuration.
        return waitingBadge;
      case 'Errored':
        const erroredBadge = (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neon-red/10 text-neon-red border border-neon-red/20">
            <AlertTriangle className="w-2.5 h-2.5" />
            Error
          </span>
        ); // Errored label configuration.
        return erroredBadge;
      default:
        const idleBadge = (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-dark-600 text-slate-400 border border-dark-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            Idle
          </span>
        ); // Idle label configuration.
        return idleBadge;
    }
  }; // Badge mapping renderer.

  const sidebarView = (
    <aside className="w-80 h-full bg-dark-800 border-r border-dark-700/60 flex flex-col shrink-0">
      <div className="p-4 border-b border-dark-700/60 flex items-center gap-2">
        <Eye className="w-5 h-5 text-neon-blue" />
        <h2 className="font-semibold text-slate-200">Global Observer</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {workspaces.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No workspaces registered.
          </div>
        ) : (
          workspaces.map(ws => {
            const isActiveWs = ws.id === activeWorkspaceId; // Selected status flag.
            const wsView = (
              <div
                key={ws.id}
                className={`rounded-lg border transition-all duration-200 ${
                  isActiveWs
                    ? 'bg-dark-900/50 border-neon-blue/30 shadow-md shadow-neon-blue/5'
                    : 'bg-transparent border-dark-700/40 hover:border-dark-700'
                }`}
              >
                <div
                  onClick={() => onSelectWorkspace(ws.id)}
                  className="p-3 flex items-center gap-2 cursor-pointer border-b border-dark-700/30"
                >
                  <FolderOpen className={`w-4 h-4 ${isActiveWs ? 'text-neon-blue' : 'text-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-200 truncate">{ws.name}</div>
                  </div>
                </div>

                <div className="p-2 space-y-1.5">
                  {ws.tabs.length === 0 ? (
                    <div className="text-center py-2 text-xs text-slate-500">
                      No terminal tabs
                    </div>
                  ) : (
                    ws.tabs.map(tab => {
                      const sessionInfo = sessionMap.get(tab.id); // Matches status payload.
                      const termStatus = sessionInfo?.status || 'Idle'; // Computed fallback status.
                      const termPreview = sessionInfo?.preview || 'No output stream...'; // Display string preview.

                      const tabItemView = (
                        <div
                          key={tab.id}
                          className="p-2 rounded bg-dark-900/30 border border-dark-700/20 text-xs flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-slate-300 font-medium truncate">
                              <Terminal className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className="flex flex-col min-w-0">
                                <span className="truncate">{tab.name}</span>
                                {tab.branch && (
                                  <span className="text-[9px] text-neon-blue font-bold tracking-wide truncate">
                                    branch: {tab.branch}
                                  </span>
                                )}
                              </span>
                            </span>
                            {renderBadge(termStatus)}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate font-mono bg-dark-900/80 p-1 rounded border border-dark-700/40">
                            {termPreview}
                          </div>
                        </div>
                      ); // Tab listing.
                      return tabItemView;
                    })
                  )}
                </div>
              </div>
            ); // Rendered workspace item.
            return wsView;
          })
        )}
      </div>
    </aside>
  ); // Sidebar shell.
  return sidebarView;
};
