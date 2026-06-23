import { useEffect, useState } from 'react';
import { WorkspaceSelector } from './components/WorkspaceSelector';
import { ObserverSidebar } from './components/ObserverSidebar';
import { TerminalGrid, removeTabFromTree, addTabToTree } from './components/TerminalGrid';
import { Terminal, Layout, Plus, Info, Wifi, Menu } from 'lucide-react';
import { MosaicNode } from 'react-mosaic-component';

const API_BASE = ''; // Empty string means relative URLs (Vite proxy handles routing to backend).

// Helper retrieving the active authentication token from persistent local storage only.
const getAuthToken = (): string => {
  return localStorage.getItem('exeggutor_token') || '';
};

// Performs a secure HTTP request, automatically injecting the persistent authentication token.
const apiFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = getAuthToken(); // Active authentication token.
  const headers = new Headers(init?.headers); // Header mapping dictionary.
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const mergedInit = { ...init, headers }; // Request config object.
  return fetch(input, mergedInit);
};

export interface TerminalTab {
  id: string; // Tab ID.
  name: string; // Tab name.
  cwd: string; // Working directory path for this terminal process.
  branch?: string; // Target branch name assigned to this terminal tab.
  worktreePath?: string; // Path to the generated git worktree for this tab if isolated.
}

export interface Workspace {
  id: string; // Workspace ID.
  name: string; // Workspace name.
  path: string; // Directory path.
  tabs: TerminalTab[]; // List of terminal tabs.
  layout?: any; // Mosaic layout.
}

// Launches and binds the dashboard components.
function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]); // Dynamic array of all workspaces loaded from server.
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>(undefined); // Selected active workspace ID.
  const [layout, setLayout] = useState<MosaicNode<string> | null>(null); // Current mosaic panel configuration tree.
  const [branches, setBranches] = useState<string[]>([]); // Dynamic list of scanned branches in the active workspace repository.
  const [isGitRepo, setIsGitRepo] = useState(false); // Flag indicating if the active workspace is a Git repository.
  const [unauthorized, setUnauthorized] = useState(false); // Flag indicating if the session is unauthorized.
  const [isLoading, setIsLoading] = useState(true); // Flag indicating if the workspaces are currently loading.
  const [ready, setReady] = useState(false); // Flag indicating if session code exchange has completed.
  const [tailscaleInfo, setTailscaleInfo] = useState<{ installed: boolean; connected: boolean; tailscaleMode: boolean; ip?: string; dnsName?: string; tailscale?: { ip: string; dnsName: string; tailnetName: string; online: boolean } } | null>(null); // Tailscale connection state from the backend.
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar drawer visibility state.

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search); // Parsed URL query parameters.
    const code = urlParams.get('code'); // One-time session code from CLI.
    if (!code) {
      setReady(true);
      return;
    }
    fetch(`${API_BASE}/api/auth/exchange-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Session code exchange failed');
        return res.json();
      })
      .then(data => {
        if (data.token) {
          localStorage.setItem('exeggutor_token', data.token);
        }
        window.history.replaceState({}, document.title, window.location.pathname); // Remove the code from the URL bar.
      })
      .catch(() => {
        // Exchange failed — user may need to use exeggutor --open from terminal.
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!activeWorkspaceId) {
      setBranches([]);
      setIsGitRepo(false);
      return;
    }
    apiFetch(`${API_BASE}/api/workspaces/${activeWorkspaceId}/git/branches`)
      .then(res => {
        if (!res.ok) {
          throw new Error();
        }
        return res.json();
      })
      .then((data: string[]) => {
        setBranches(data);
        setIsGitRepo(true);
      })
      .catch(() => {
        setBranches([]);
        setIsGitRepo(false);
      });
  }, [activeWorkspaceId, workspaces, ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    apiFetch(`${API_BASE}/api/workspaces`)
      .then(res => {
        if (res.status === 401) {
          setUnauthorized(true);
          throw new Error('Unauthorized');
        }
        if (!res.ok) {
          throw new Error('Server error');
        }
        return res.json();
      })
      .then((data: Workspace[]) => {
        if (Array.isArray(data)) {
          setWorkspaces(data);
          if (data.length > 0) {
            const firstWs = data[0]; // Resolves first workspace.
            setActiveWorkspaceId(firstWs.id);
            setLayout(firstWs.layout || null);
          }
        }
      })
      .catch(() => {
        // Safe skip on server offline or unauthorized.
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    apiFetch(`${API_BASE}/api/tailscale/status`)
      .then(res => {
        if (!res.ok) { throw new Error('Failed to fetch'); }
        return res.json();
      })
      .then((data) => {
        setTailscaleInfo(data);
      })
      .catch(() => {
        setTailscaleInfo(null);
      });
  }, [ready]);

  if (unauthorized) {
    return (
      <div className="h-screen w-screen bg-dark-900 flex flex-col items-center justify-center p-6 text-center select-none font-sans">
        <div className="max-w-md w-full p-8 bg-dark-800 border border-red-500/20 rounded-2xl shadow-2xl flex flex-col items-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 text-red-500 mb-6">
            <Info className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-3 tracking-wide">Authentication Required</h2>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Running on the host machine? Open the dashboard from your terminal:
          </p>
          <div className="w-full bg-dark-900 border border-dark-700/60 rounded-xl p-3.5 mb-6 text-left font-mono text-xs text-white select-all cursor-pointer">
            exeggutor --open
          </div>
          <div className="w-full border-t border-dark-700/40 pt-5 mt-1">
            <p className="text-sm text-slate-400 mb-3 leading-relaxed">
              Accessing remotely? Enter your auth token from <code className="text-slate-400 font-mono text-xs">~/.exeggutor.json</code> on the host machine:
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              const input = (e.target as HTMLFormElement).querySelector('input')!;
              const token = input.value.trim();
              if (token) {
                localStorage.setItem('exeggutor_token', token);
                window.location.reload();
              }
            }} className="flex gap-2">
              <input
                type="text"
                placeholder="Paste auth token..."
                className="flex-1 bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                className="px-4 py-2 bg-white hover:bg-white/80 text-dark-900 font-bold text-xs rounded-lg transition-colors"
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId); // Found active workspace data.

  const handleSelectWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    const target = workspaces.find(w => w.id === id); // Resolved workspace object.
    setLayout(target?.layout || null);
  }; // Selects a different workspace.

  const handleCreateWorkspace = async (name: string, path: string) => {
    const res = await apiFetch(`${API_BASE}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path }),
    }); // Server response from workspace creation API.
    if (!res.ok) {
      const errData = await res.json(); // Parsed error response.
      alert(errData.error || 'Failed to create workspace');
      return;
    }
    const newWs = await res.json() as Workspace; // Loaded new workspace configuration payload.
    setWorkspaces(prev => [...prev, newWs]);
    setActiveWorkspaceId(newWs.id);
    setLayout(null);
  }; // Creates a new workspace path.

  const handleDeleteWorkspace = async (id: string) => {
    const res = await apiFetch(`${API_BASE}/api/workspaces/${id}`, {
      method: 'DELETE',
    }); // Deletion service response.
    if (res.ok) {
      setWorkspaces(prev => {
        const filtered = prev.filter(w => w.id !== id); // Filtered array.
        const nextActive = filtered.length > 0 ? filtered[0].id : undefined; // Select next active.
        setActiveWorkspaceId(nextActive);
        const nextWs = filtered.find(w => w.id === nextActive); // Resolved next active workspace.
        setLayout(nextWs?.layout || null);
        return filtered;
      });
    }
  }; // Deletes a workspace path.


  const handleChangeLayout = async (newLayout: MosaicNode<string> | null) => {
    if (!activeWorkspaceId) {
      return;
    }
    setLayout(newLayout);
    await apiFetch(`${API_BASE}/api/workspaces/${activeWorkspaceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: newLayout }),
    });
    setWorkspaces(prev => prev.map(w => w.id === activeWorkspaceId ? { ...w, layout: newLayout } : w));
  }; // Persists window position states.

  const MAX_TABS_PER_WORKSPACE = 4; // Maximum terminal tabs allowed per workspace.

  const handleAddTab = async (name: string, direction: 'row' | 'column' = 'row') => {
    if (!activeWorkspaceId) {
      return;
    }
    const currentWs = workspaces.find(w => w.id === activeWorkspaceId); // Resolved active workspace.
    if (currentWs && currentWs.tabs.length >= MAX_TABS_PER_WORKSPACE) {
      alert(`Maximum ${MAX_TABS_PER_WORKSPACE} terminals per workspace`);
      return;
    }
    const res = await apiFetch(`${API_BASE}/api/workspaces/${activeWorkspaceId}/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }); // Request node-pty process setup.
    if (res.ok) {
      const newTab = await res.json() as TerminalTab; // Loaded terminal tab data payload.
      setWorkspaces(prev => prev.map(w => {
        if (w.id === activeWorkspaceId) {
          const nextTabs = [...w.tabs, newTab]; // Append new tab item.
          return { ...w, tabs: nextTabs };
        }
        return w;
      }));
      const nextLayout = addTabToTree(layout, newTab.id, direction); // Append tab ID into layout tree.
      await handleChangeLayout(nextLayout);
    }
  }; // Spawns a new terminal tab process.

  const handleCloseTab = async (tabId: string) => {
    if (!activeWorkspaceId) {
      return;
    }
    const res = await apiFetch(`${API_BASE}/api/workspaces/${activeWorkspaceId}/tabs/${tabId}`, {
      method: 'DELETE',
    }); // Terminal process termination request.
    if (res.ok) {
      setWorkspaces(prev => prev.map(w => {
        if (w.id === activeWorkspaceId) {
          const nextTabs = w.tabs.filter(t => t.id !== tabId); // Filtered tabs.
          return { ...w, tabs: nextTabs };
        }
        return w;
      }));
      const nextLayout = removeTabFromTree(layout, tabId); // Remove tab ID from layout tree.
      await handleChangeLayout(nextLayout);
    }
  }; // Closes a terminal tab process.

  const handleRenameTab = async (tabId: string, newName: string) => {
    if (!activeWorkspaceId) {
      return;
    }
    const res = await apiFetch(`${API_BASE}/api/workspaces/${activeWorkspaceId}/tabs/${tabId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    }); // Tab rename endpoint response.
    if (res.ok) {
      const updatedTab = await res.json() as TerminalTab; // Server modified tab.
      setWorkspaces(prev => prev.map(w => {
        if (w.id === activeWorkspaceId) {
          const nextTabs = w.tabs.map(t => t.id === tabId ? updatedTab : t); // Updated tabs list.
          return { ...w, tabs: nextTabs };
        }
        return w;
      }));
    }
  }; // Renames a terminal tab.

  const handleChangeTabBranch = async (tabId: string, branchName: string) => {
    if (!activeWorkspaceId) {
      return;
    }
    const res = await apiFetch(`${API_BASE}/api/workspaces/${activeWorkspaceId}/tabs/${tabId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: branchName }),
    }); // Tab branch update endpoint response.
    if (!res.ok) {
      const errData = await res.json(); // Error body details.
      alert(errData.error || 'Failed to update terminal tab branch');
      return;
    }
    const updatedTab = await res.json() as TerminalTab; // Server modified tab.
    setWorkspaces(prev => prev.map(w => {
      if (w.id === activeWorkspaceId) {
        const nextTabs = w.tabs.map(t => t.id === tabId ? updatedTab : t); // Updated tabs list.
        return { ...w, tabs: nextTabs };
      }
      return w;
    }));
  }; // Updates a terminal tab branch.

  const handleCreateTabBranch = async (tabId: string, branchName: string) => {
    if (!activeWorkspaceId) {
      return;
    }
    const res = await apiFetch(`${API_BASE}/api/workspaces/${activeWorkspaceId}/tabs/${tabId}/branches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: branchName }),
    }); // Branch creation endpoint response.
    if (!res.ok) {
      const errData = await res.json(); // Error payload.
      alert(errData.error || 'Failed to create git branch');
      return;
    }
    const updatedTab = await res.json() as TerminalTab; // Returned tab schema.
    setWorkspaces(prev => prev.map(w => {
      if (w.id === activeWorkspaceId) {
        const nextTabs = w.tabs.map(t => t.id === tabId ? updatedTab : t); // Upgraded tabs structure.
        return { ...w, tabs: nextTabs };
      }
      return w;
    }));
  }; // Spawns branch for a tab.



  const renderDashboard = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-dark-900 select-none">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
          <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Loading Workspace...</span>
        </div>
      );
    }

    if (!activeWorkspace) {
      const registerGuide = (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto bg-dark-800/20 border border-dark-700/60 rounded-2xl my-16 select-none shadow-2xl">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center border border-dark-700 text-white mb-4">
            <Layout className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Welcome to Exeggutor</h2>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            A subscription-free, local-first workspace coordinator. Register your project directory path to get started.
          </p>
          <div className="p-4 bg-dark-900 border border-dark-700/60 rounded-xl w-full text-left space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-white" />
              Quick Setup Guide
            </h4>
            <ol className="text-xs text-slate-400 list-decimal list-inside space-y-1.5">
              <li>Click the <span className="font-semibold text-slate-300">+</span> icon in the top header.</li>
              <li>Provide a user-friendly name and enter the absolute path of your workspace.</li>
              <li>Optionally, specify a Git branch for automatic worktree directory mapping.</li>
            </ol>
          </div>
        </div>
      ); // Dashboard selector guide.
      return registerGuide;
    }

    const gridLayout = (
      <div className="flex-1 flex flex-col min-h-0 bg-dark-900">
        {activeWorkspace.tabs.length > 0 && (
          <div className="px-6 py-3 border-b border-dark-700/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-white" />
              <span className="text-sm font-semibold text-slate-300">Terminal Shell Grid</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleAddTab(`Terminal ${activeWorkspace.tabs.length + 1}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700/60 border border-dark-700/60 hover:border-dark-700 text-xs font-semibold rounded text-slate-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Terminal
              </button>
            </div>
          </div>
        )}
        <TerminalGrid
          workspaceId={activeWorkspace.id}
          tabs={activeWorkspace.tabs}
          layout={layout}
          onChangeLayout={handleChangeLayout}
          onCloseTab={handleCloseTab}
          onAddTab={handleAddTab}
          onRenameTab={handleRenameTab}
          branches={branches}
          isGitRepo={isGitRepo}
          onChangeTabBranch={handleChangeTabBranch}
          onCreateTabBranch={handleCreateTabBranch}
        />
      </div>
    ); // Main layouts mapping grid and terminals.
    return gridLayout;
  }; // Computes main viewport panel.

  const mainView = (
    <div className="h-screen w-screen bg-dark-900 flex flex-col overflow-hidden text-slate-100">
      <header className="h-16 border-b border-white/20 shadow-glow px-3 lg:px-6 flex items-center justify-between shrink-0 bg-dark-800 select-none z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-colors"
            title="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 bg-gradient-to-tr from-white to-zinc-100 rounded-lg flex items-center justify-center text-white shadow-lg shadow-white/20">
            <Terminal className="w-5 h-5 text-dark-900" />
          </div>
          <div className="hidden lg:flex flex-col">
            <h1 className="text-sm font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
              EXEGGUTOR
            </h1>
          </div>
        </div>

        <WorkspaceSelector
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          onCreateWorkspace={handleCreateWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
        />

        {tailscaleInfo && tailscaleInfo.tailscaleMode && tailscaleInfo.connected && tailscaleInfo.tailscale && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-900/50 border border-dark-700/40 text-xs cursor-pointer hover:bg-dark-700/40 transition-colors"
            title={`Tailscale IP: ${tailscaleInfo.tailscale.ip}`}
            onClick={() => {
              if (tailscaleInfo.tailscale && tailscaleInfo.tailscale.ip) {
                navigator.clipboard.writeText(`http://${tailscaleInfo.tailscale.ip}:17492`);
              }
            }}
          >
            <Wifi className="w-3.5 h-3.5 text-green-400" />
            <span className="text-slate-400 font-medium">{tailscaleInfo.tailscale.ip}</span>
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0">
        <ObserverSidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
        />
        {renderDashboard()}
      </div>
    </div>
  ); // Dashboard container layout structure.
  return mainView;
}

export default App;
