import React, { useState, useEffect } from 'react';
import { Folder, GitBranch, Plus, Check, Trash2, AlertCircle } from 'lucide-react';
import { Workspace } from '../App';

interface WorkspaceSelectorProps {
  workspaces: Workspace[]; // List of registered workspaces.
  activeWorkspaceId?: string; // The ID of the currently active workspace.
  onSelectWorkspace: (id: string) => void; // Triggered when switching workspaces.
  onCreateWorkspace: (name: string, path: string, branch?: string) => Promise<void>; // Triggered when adding a new workspace.
  onDeleteWorkspace: (id: string) => Promise<void>; // Triggered when deleting a workspace.
  onUpdateWorkspace: (id: string, updates: Partial<Workspace>) => Promise<void>; // Triggered when updating workspace configs.
}

// Manages the workspaces and Git worktree bindings.
export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onDeleteWorkspace,
  onUpdateWorkspace,
}) => {
  const [isOpen, setIsOpen] = useState(false); // Controls workspaces dropdown list visibility.
  const [showAddForm, setShowAddForm] = useState(false); // Controls visibility of the add new workspace form.
  const [name, setName] = useState(''); // New workspace name text input.
  const [folderPath, setFolderPath] = useState(''); // New workspace absolute directory path text input.
  const [branch, setBranch] = useState(''); // Optional initial Git branch input.
  
  const [branches, setBranches] = useState<string[]>([]); // Git branch options retrieved from current workspace repo.
  const [isGitRepo, setIsGitRepo] = useState(true); // Flag marking if the current workspace directory is a valid git repository.
  const [isLoadingBranches, setIsLoadingBranches] = useState(false); // Controls loading indicators for branch fetch operations.

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId); // Reference to the active workspace.

  useEffect(() => {
    if (!activeWorkspace) {
      return;
    }
    setIsLoadingBranches(true);
    fetch(`http://localhost:4000/api/workspaces/${activeWorkspace.id}/git/branches`)
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
      })
      .finally(() => {
        setIsLoadingBranches(false);
      });
  }, [activeWorkspaceId, activeWorkspace]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !folderPath.trim()) {
      return;
    }
    try {
      await onCreateWorkspace(name, folderPath, branch ? branch : undefined);
      setName('');
      setFolderPath('');
      setBranch('');
      setShowAddForm(false);
    } catch (err) {
      // Form submit issue.
    }
  }; // Handle form submits.

  const handleBranchChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!activeWorkspace) {
      return;
    }
    const val = e.target.value; // Selected target branch.
    try {
      await onUpdateWorkspace(activeWorkspace.id, { branch: val ? val : undefined });
    } catch (err) {
      // Branch update failed.
    }
  }; // Handles selection dropdown actions.

  const dropdownView = (
    <div className="relative z-20">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between gap-3 px-4 py-2 bg-dark-800 border border-dark-700/60 rounded-lg text-sm font-medium hover:border-dark-700 hover:bg-dark-800/80 transition-all w-64 text-left"
        >
          <span className="flex items-center gap-2 truncate">
            <Folder className="w-4 h-4 text-neon-blue shrink-0" />
            {activeWorkspace ? activeWorkspace.name : 'Select Workspace'}
          </span>
          <span className="text-[10px] text-slate-400 font-semibold tracking-wider">SELECT</span>
        </button>

        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setIsOpen(false);
          }}
          className="p-2 bg-dark-800 border border-dark-700/60 rounded-lg text-slate-400 hover:text-white hover:border-dark-700 transition-colors"
          title="New Workspace"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-dark-800 border border-dark-700 rounded-lg shadow-xl py-1.5 z-30 select-none">
          <div className="max-h-60 overflow-y-auto">
            {workspaces.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-400 text-center">
                No workspaces registered
              </div>
            ) : (
              workspaces.map(ws => {
                const isSelected = ws.id === activeWorkspaceId; // Selected active workspace.
              const item = (
                <div
                  key={ws.id}
                  onClick={() => {
                    onSelectWorkspace(ws.id);
                    setIsOpen(false);
                  }}
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-dark-700/50 text-sm"
                >
                  <span className="flex items-center gap-2 truncate text-slate-300">
                    <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-neon-blue' : 'text-slate-500'}`} />
                    {ws.name}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-neon-green" />}
                </div>
              ); // Workspace options item.
              return item;
            }))}
          </div>
          {workspaces.length > 0 && activeWorkspace && (
            <div className="border-t border-dark-700/60 mt-1 pt-1 px-1">
              <button
                onClick={() => {
                  onDeleteWorkspace(activeWorkspace.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-neon-red hover:bg-neon-red/10 rounded transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Active Workspace
              </button>
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="absolute top-full right-0 mt-2 w-96 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl p-4 z-30 space-y-4">
          <h4 className="font-semibold text-sm text-slate-200">Register Workspace</h4>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Workspace Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Project"
                className="w-full bg-dark-900 border border-dark-700/60 rounded px-2.5 py-1.5 text-xs focus:border-neon-blue focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Root Path</label>
              <input
                type="text"
                required
                value={folderPath}
                onChange={e => setFolderPath(e.target.value)}
                placeholder="c:/projects/my-project"
                className="w-full bg-dark-900 border border-dark-700/60 rounded px-2.5 py-1.5 text-xs focus:border-neon-blue focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Git Isolation Branch (Optional)</label>
              <input
                type="text"
                value={branch}
                onChange={e => setBranch(e.target.value)}
                placeholder="feature-sandbox"
                className="w-full bg-dark-900 border border-dark-700/60 rounded px-2.5 py-1.5 text-xs focus:border-neon-blue focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs bg-dark-700 text-slate-300 rounded hover:bg-dark-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs bg-neon-blue hover:bg-neon-blue/80 text-white rounded transition-colors"
              >
                Register
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  ); // Selector Dropdown view.

  const detailView = activeWorkspace ? (
    <div className="flex items-center gap-6 text-xs text-slate-400 bg-dark-800/40 border border-dark-700/40 rounded-lg px-4 py-2 select-none">
      <div className="flex items-center gap-1.5 truncate">
        <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">CWD:</span>
        <span className="font-mono text-slate-300 truncate max-w-xs">{activeWorkspace.worktreePath || activeWorkspace.path}</span>
      </div>

      {isGitRepo ? (
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-neon-blue" />
            <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Worktree Branch:</span>
            {isLoadingBranches ? (
              <span className="text-slate-500 animate-pulse">Loading...</span>
            ) : (
              <select
                value={activeWorkspace.branch || ''}
                onChange={handleBranchChange}
                className="bg-dark-900 border border-dark-700/60 rounded px-2 py-0.5 text-slate-300 focus:outline-none focus:border-neon-blue cursor-pointer"
              >
                <option value="">-- No Isolation (Local checkout) --</option>
                {branches.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
                {activeWorkspace.branch && !branches.includes(activeWorkspace.branch) && (
                  <option value={activeWorkspace.branch}>{activeWorkspace.branch}</option>
                )}
              </select>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-slate-500 shrink-0 select-none">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Non-Git Directory</span>
        </div>
      )}
    </div>
  ) : null; // Details configuration.

  const wrapper = (
    <div className="flex items-center gap-4">
      {dropdownView}
      {detailView}
    </div>
  ); // Final wrapper layout.
  return wrapper;
};
