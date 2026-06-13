import { useEffect, useState } from 'react';
import { WorkspaceSelector } from './components/WorkspaceSelector';
import { ObserverSidebar } from './components/ObserverSidebar';
import { TerminalGrid, removeTabFromTree, addTabToTree } from './components/TerminalGrid';
import { Terminal, Layout, Plus, Info } from 'lucide-react';
import { MosaicNode } from 'react-mosaic-component';

export interface TerminalTab {
  id: string; // Tab ID.
  name: string; // Tab name.
  cwd: string; // Working directory path for this terminal process.
}

export interface Workspace {
  id: string; // Workspace ID.
  name: string; // Workspace name.
  path: string; // Directory path.
  branch?: string; // Target branch.
  worktreePath?: string; // Path of git worktree.
  tabs: TerminalTab[]; // List of terminal tabs.
  layout?: any; // Mosaic layout.
}

// Launches and binds the dashboard components.
function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]); // Dynamic array of all workspaces loaded from server.
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>(undefined); // Selected active workspace ID.
  const [layout, setLayout] = useState<MosaicNode<string> | null>(null); // Current mosaic panel configuration tree.

  useEffect(() => {
    fetch('http://localhost:4000/api/workspaces')
      .then(res => res.json())
      .then((data: Workspace[]) => {
        setWorkspaces(data);
        if (data.length > 0) {
          const firstWs = data[0]; // Resolves first workspace.
          setActiveWorkspaceId(firstWs.id);
          setLayout(firstWs.layout || null);
        }
      })
      .catch(() => {
        // Safe skip on server offline.
      });
  }, []);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId); // Found active workspace data.

  const handleSelectWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    const target = workspaces.find(w => w.id === id); // Resolved workspace object.
    setLayout(target?.layout || null);
  }; // Selects a different workspace.

  const handleCreateWorkspace = async (name: string, path: string, branch?: string) => {
    const res = await fetch('http://localhost:4000/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, branch }),
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
    const res = await fetch(`http://localhost:4000/api/workspaces/${id}`, {
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

  const handleUpdateWorkspace = async (id: string, updates: Partial<Workspace>) => {
    const res = await fetch(`http://localhost:4000/api/workspaces/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }); // Put request response.
    if (!res.ok) {
      const errData = await res.json(); // Deconstructed error details.
      alert(errData.error || 'Failed to update workspace');
      return;
    }
    const updatedWs = await res.json() as Workspace; // Server updated workspace.
    setWorkspaces(prev => prev.map(w => w.id === id ? updatedWs : w));
    if (id === activeWorkspaceId) {
      setLayout(updatedWs.layout || null);
    }
  }; // Modifies workspace settings.

  const handleChangeLayout = async (newLayout: MosaicNode<string> | null) => {
    if (!activeWorkspaceId) {
      return;
    }
    setLayout(newLayout);
    await fetch(`http://localhost:4000/api/workspaces/${activeWorkspaceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: newLayout }),
    });
    setWorkspaces(prev => prev.map(w => w.id === activeWorkspaceId ? { ...w, layout: newLayout } : w));
  }; // Persists window position states.

  const handleAddTab = async (name: string, direction: 'row' | 'column' = 'row') => {
    if (!activeWorkspaceId) {
      return;
    }
    const res = await fetch(`http://localhost:4000/api/workspaces/${activeWorkspaceId}/tabs`, {
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
    const res = await fetch(`http://localhost:4000/api/workspaces/${activeWorkspaceId}/tabs/${tabId}`, {
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

  const renderDashboard = () => {
    if (!activeWorkspace) {
      const registerGuide = (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto bg-dark-800/20 border border-dark-700/60 rounded-2xl my-16 select-none shadow-2xl">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center border border-dark-700 text-neon-blue mb-4">
            <Layout className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Welcome to Omnishell Multiplexer</h2>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            A subscription-free, local-first workspace coordinator. Register your project directory path to get started.
          </p>
          <div className="p-4 bg-dark-900 border border-dark-700/60 rounded-xl w-full text-left space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-neon-blue" />
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
              <Terminal className="w-4 h-4 text-neon-blue" />
              <span className="text-sm font-semibold text-slate-300">Terminal Shell Grid</span>
            </div>
            <button
              onClick={() => handleAddTab(`Terminal ${activeWorkspace.tabs.length + 1}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-800 hover:bg-dark-700/60 border border-dark-700/60 hover:border-dark-700 text-xs font-semibold rounded text-slate-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Terminal
            </button>
          </div>
        )}
        <TerminalGrid
          workspaceId={activeWorkspace.id}
          tabs={activeWorkspace.tabs}
          layout={layout}
          onChangeLayout={handleChangeLayout}
          onCloseTab={handleCloseTab}
          onAddTab={handleAddTab}
        />
      </div>
    ); // Main layouts mapping grid and terminals.
    return gridLayout;
  }; // Computes main viewport panel.

  const mainView = (
    <div className="h-screen w-screen bg-dark-900 flex flex-col overflow-hidden text-slate-100">
      <header className="h-16 border-b border-neon-blue/20 shadow-glow px-6 flex items-center justify-between shrink-0 bg-dark-800 select-none z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-tr from-neon-blue to-neon-green rounded-lg flex items-center justify-center text-white shadow-lg shadow-neon-blue/20">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
              OMNISHELL MULTIPLEXER
            </h1>
            <span className="text-[10px] text-neon-blue font-bold tracking-widest uppercase">Local-First</span>
          </div>
        </div>

        <WorkspaceSelector
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
          onCreateWorkspace={handleCreateWorkspace}
          onDeleteWorkspace={handleDeleteWorkspace}
          onUpdateWorkspace={handleUpdateWorkspace}
        />
      </header>

      <div className="flex-1 flex min-h-0">
        <ObserverSidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelectWorkspace={handleSelectWorkspace}
        />
        {renderDashboard()}
      </div>
    </div>
  ); // Dashboard container layout structure.
  return mainView;
}

export default App;
