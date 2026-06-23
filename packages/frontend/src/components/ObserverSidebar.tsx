import React, { useEffect, useState, useRef } from 'react';
import { Terminal, FolderOpen, AlertTriangle } from 'lucide-react';
import { Workspace } from '../App';

interface ObserverSidebarProps {
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  onSelectWorkspace: (workspaceId: string) => void;
  sidebarOpen?: boolean;
  onCloseSidebar?: () => void;
}

interface SessionState {
  id: string;
  workspaceId: string;
  status: 'Active' | 'Waiting' | 'Idle' | 'Errored';
  preview: string;
}

export const ObserverSidebar: React.FC<ObserverSidebarProps> = ({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  sidebarOpen,
  onCloseSidebar,
}) => {
  const [sessions, setSessions] = useState<SessionState[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const token = localStorage.getItem('exeggutor_token') || '';
    const wsUrl = `${wsProtocol}//${wsHost}/ws/observer?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'observer') {
          setSessions(data.sessions || []);
        }
      } catch (err) {
      }
    };

    return () => {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  const sessionMap = new Map(sessions.map(s => [s.id, s]));

  const renderBadge = (status: SessionState['status']) => {
    switch (status) {
      case 'Active':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-100/10 text-zinc-100 border border-zinc-100/20">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-100 animate-pulse" />
            Active
          </span>
        );
      case 'Waiting':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" />
            Waiting
          </span>
        );
      case 'Errored':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-700/10 text-zinc-700 border border-zinc-700/20">
            <AlertTriangle className="w-2.5 h-2.5" />
            Error
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-dark-600 text-slate-400 border border-dark-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            Idle
          </span>
        );
    }
  };

  const handleSelectWs = (id: string) => {
    onSelectWorkspace(id);
    if (onCloseSidebar) {
      onCloseSidebar();
    }
  };

  const innerContent = (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {workspaces.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          No workspaces registered.
        </div>
      ) : (
        workspaces.map(ws => {
          const isActiveWs = ws.id === activeWorkspaceId;
          return (
            <div
              key={ws.id}
              className={`rounded-lg border transition-all duration-200 ${
                isActiveWs
                  ? 'bg-dark-900/50 border-white/30 shadow-md shadow-white/5'
                  : 'bg-transparent border-dark-700/40 hover:border-dark-700'
              }`}
            >
              <div
                onClick={() => handleSelectWs(ws.id)}
                className="p-3 flex items-center gap-2 cursor-pointer border-b border-dark-700/30"
              >
                <FolderOpen className={`w-4 h-4 ${isActiveWs ? 'text-white' : 'text-slate-400'}`} />
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
                    const sessionInfo = sessionMap.get(tab.id);
                    const termStatus = sessionInfo?.status || 'Idle';
                    return (
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
                                <span className="text-[9px] text-white font-bold tracking-wide truncate">
                                  branch: {tab.branch}
                                </span>
                              )}
                            </span>
                          </span>
                          {renderBadge(termStatus)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <>
      <div className="hidden lg:block w-80 h-full shrink-0">
        <aside className="w-full h-full bg-dark-800 border-r border-dark-700/60 flex flex-col">
          {innerContent}
        </aside>
      </div>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="fixed inset-0 bg-black/50" onClick={onCloseSidebar} />
          <aside className="fixed inset-y-0 left-0 z-50 w-80 bg-dark-800 border-r border-dark-700/60 flex flex-col">
            <div className="h-16 shrink-0 flex items-center px-4 border-b border-dark-700/60">
              <span className="text-sm font-bold text-slate-200">Workspaces</span>
            </div>
            {innerContent}
          </aside>
        </div>
      )}
    </>
  );
};
