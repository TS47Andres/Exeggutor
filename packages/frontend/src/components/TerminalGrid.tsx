import React, { useState, useEffect, useRef } from 'react';
import { Mosaic, MosaicWindow, MosaicNode } from 'react-mosaic-component';
import { TerminalTab } from './TerminalTab';
import { Plus, Trash2, LayoutGrid, Split, Check, GitBranch, ChevronDown, Search, X, Edit3 } from 'lucide-react';
import { TerminalTab as TabType } from '../App';

interface TerminalGridProps {
  workspaceId: string; // The ID of the currently selected workspace.
  tabs: TabType[]; // List of terminal tabs in the active workspace.
  layout: MosaicNode<string> | null; // The current hierarchical mosaic window layout tree.
  onChangeLayout: (newLayout: MosaicNode<string> | null) => void; // Callback invoked when windows are rearranged or resized.
  onCloseTab: (tabId: string) => void; // Callback invoked when a terminal tab is closed.
  onAddTab: (name: string, direction?: 'row' | 'column') => void; // Callback invoked to spawn a new terminal tab.
  onRenameTab: (tabId: string, newName: string) => void; // Callback invoked when a terminal tab is renamed.
  branches: string[]; // List of git branches scanned in the workspace repository.
  isGitRepo: boolean; // Flag marking if the workspace is a valid Git repository.
  onChangeTabBranch: (tabId: string, branch: string) => Promise<void>; // Callback to switch the Git branch/worktree of a terminal tab.
  onCreateTabBranch: (tabId: string, branchName: string) => Promise<void>; // Callback to create and check out a new branch on a terminal tab.
}

// Recursively removes a target tab ID from a mosaic window layout tree.
export function removeTabFromTree(tree: MosaicNode<string> | null, tabId: string): MosaicNode<string> | null {
  if (tree === null) {
    const nullResult = null; // Represents an empty tree layout.
    return nullResult;
  }
  if (typeof tree === 'string') {
    if (tree === tabId) {
      const emptyResult = null; // Node is matches, return null to remove it.
      return emptyResult;
    }
    const identityResult = tree; // Node does not match, return it unchanged.
    return identityResult;
  }
  const first = removeTabFromTree(tree.first, tabId); // Left/Top subtree after pruning the target tab.
  const second = removeTabFromTree(tree.second, tabId); // Right/Bottom subtree after pruning the target tab.
  if (first === null) {
    const rightResult = second; // Left branch is pruned, lift right branch.
    return rightResult;
  }
  if (second === null) {
    const leftResult = first; // Right branch is pruned, lift left branch.
    return leftResult;
  }
  const rebuiltNode: MosaicNode<string> = { ...tree, first, second }; // Reconstructed parent node.
  return rebuiltNode;
}

// Recursively appends a new tab ID to the rightmost/bottommost slot of a mosaic tree.
export function addTabToTree(tree: MosaicNode<string> | null, newTabId: string, direction: 'row' | 'column' = 'row'): MosaicNode<string> {
  if (tree === null) {
    const singleNode = newTabId; // The new tab becomes the root leaf.
    return singleNode;
  }
  if (typeof tree === 'string') {
    const splitNode: MosaicNode<string> = {
      direction: direction,
      first: tree,
      second: newTabId,
      splitPercentage: 50,
    }; // A new parent node splitting the single existing tab.
    return splitNode;
  }
  const updatedSecond = addTabToTree(tree.second, newTabId, direction); // Recursively append to the second branch.
  const updatedNode: MosaicNode<string> = { ...tree, second: updatedSecond }; // Rebuilt node with nested split.
  return updatedNode;
}

interface BranchSelectorProps {
  currentBranch?: string; // Active branch name for the tab.
  branches: string[]; // List of available git branches.
  onChangeBranch: (branch: string) => void; // Event when selecting an option.
  onCreateBranch: (branchName: string) => void; // Event when creating a new branch.
}

// Custom premium monochrome dropdown selector for terminal tab branch isolation.
const BranchSelector: React.FC<BranchSelectorProps> = ({
  currentBranch,
  branches,
  onChangeBranch,
  onCreateBranch,
}) => {
  const [isOpen, setIsOpen] = useState(false); // Controls branch dropdown list visibility.
  const [searchQuery, setSearchQuery] = useState(''); // Text query used to filter branches in the selector menu.
  const [showInlineCreate, setShowInlineCreate] = useState(false); // Controls visibility of the inline branch creation input.
  const [newBranchName, setNewBranchName] = useState(''); // Stores the name of the new branch input text.
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref element mapping to the dropdown container.

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowInlineCreate(false);
        setSearchQuery('');
        setNewBranchName('');
      }
    }; // Callback closing drop list if clicking elsewhere.
    document.addEventListener('mousedown', handleClickOutside);
    const cleanup = () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    return cleanup;
  }, []);

  const activeLabel = currentBranch || 'Direct (No branch)'; // Active string display representation.

  const filteredBranches = branches.filter(b =>
    b.toLowerCase().includes(searchQuery.toLowerCase())
  ); // List of git branches filtered by the active search query.

  const handleInlineCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBranchName.trim().length > 0) {
      onCreateBranch(newBranchName.trim());
      setNewBranchName('');
      setShowInlineCreate(false);
      setIsOpen(false);
    }
  }; // Submits inline branch creation form and triggers backend worktree checkout.

  const selectView = (
    <div className="relative font-sans text-xs" ref={dropdownRef} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (isOpen) {
            setShowInlineCreate(false);
            setSearchQuery('');
            setNewBranchName('');
          }
        }}
        className="flex items-center gap-1 px-2 py-1 hover:bg-dark-700/80 border border-transparent rounded-md text-slate-300 transition-all select-none shrink-0 font-medium font-sans"
      >
        <GitBranch className="w-3 h-3 text-slate-400" />
        <span className="max-w-[80px] truncate leading-none">{activeLabel}</span>
        <ChevronDown className="w-2.5 h-2.5 text-slate-500 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl py-1.5 z-50 select-none flex flex-col font-sans">
          {/* Branch Search Input */}
          <div className="px-2 pb-1.5 border-b border-dark-700/60 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search branches..."
              className="bg-dark-900 border border-dark-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 w-full font-sans"
            />
          </div>

          {/* Branches List */}
          <div className="max-h-40 overflow-y-auto mt-1">
            <div className="text-[9px] font-bold text-slate-500 tracking-wider px-2.5 py-1 uppercase">
              Git Branches
            </div>

            <div
              onClick={() => {
                onChangeBranch('');
                setIsOpen(false);
                setSearchQuery('');
              }}
              className={`px-2.5 py-1.5 cursor-pointer hover:bg-dark-700/50 flex items-center justify-between text-slate-300 transition-colors ${
                !currentBranch ? 'font-semibold bg-dark-900/50 text-white' : ''
              }`}
            >
              <span className="truncate">Direct (No branch)</span>
              {!currentBranch && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
            </div>

            {filteredBranches.length === 0 && searchQuery.length > 0 ? (
              <div className="px-2.5 py-2 text-xs text-slate-500 italic">
                No branches match filter
              </div>
            ) : (
              filteredBranches.map(b => {
                const isSelected = b === currentBranch; // Active option flag.
                const item = (
                  <div
                    key={b}
                    onClick={() => {
                      onChangeBranch(b);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`px-2.5 py-1.5 cursor-pointer hover:bg-dark-700/50 flex items-center justify-between text-slate-300 transition-colors ${
                      isSelected ? 'font-semibold bg-dark-900/50 text-white' : ''
                    }`}
                  >
                    <span className="truncate">{b}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                  </div>
                ); // Branch menu option.
                return item;
              })
            )}
          </div>

          {/* Branch Creation Footer */}
          <div className="border-t border-dark-700/60 mt-1.5 pt-1.5 px-1.5">
            {!showInlineCreate ? (
              <button
                type="button"
                onClick={() => setShowInlineCreate(true)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-slate-300 hover:text-white hover:bg-dark-700/50 rounded font-medium transition-colors text-xs"
              >
                <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Create Branch...</span>
              </button>
            ) : (
              <form onSubmit={handleInlineCreateSubmit} className="flex items-center gap-1">
                <input
                  type="text"
                  required
                  autoFocus
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  placeholder="new-branch"
                  className="flex-1 bg-dark-900 border border-dark-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500 min-w-0"
                />
                <button
                  type="submit"
                  className="p-1 hover:bg-dark-700 rounded text-white transition-colors shrink-0"
                  title="Confirm"
                >
                  <Check className="w-4 h-4 text-white" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInlineCreate(false);
                    setNewBranchName('');
                  }}
                  className="p-1 hover:bg-dark-700 rounded text-slate-400 hover:text-white transition-colors shrink-0"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  ); // Dropdown HTML representation.
  return selectView;
};

// Renders the side-by-side terminal grid layout.
export const TerminalGrid: React.FC<TerminalGridProps> = ({
  workspaceId,
  tabs,
  layout,
  onChangeLayout,
  onCloseTab,
  onAddTab,
  onRenameTab,
  branches,
  isGitRepo,
  onChangeTabBranch,
  onCreateTabBranch,
}) => {
  const tabMap = new Map(tabs.map(t => [t.id, t])); // HashMap optimization mapping tab IDs to their configurations.
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null); // Active tab ID being renamed.
  const [renameValue, setRenameValue] = useState(''); // Text input value for the tab rename field.

  const MAX_TABS = 4; // Maximum terminal tabs allowed per workspace.
  const atTabLimit = tabs.length >= MAX_TABS; // Flag indicating the tab limit has been reached.

  const handleAddTerminal = () => {
    if (atTabLimit) {
      return;
    }
    onAddTab(`Terminal ${tabs.length + 1}`);
  }; // Spawns a default shell terminal.

  const renderTile = (id: string, path: any) => {
    const tabData = tabMap.get(id); // Configurations for this terminal leaf.
    if (!tabData) {
      const missingTile = <div className="p-4 text-neon-red">Terminal session missing</div>; // Fallback view.
      return missingTile;
    }

    const handleSelectBranch = (val: string) => {
      onChangeTabBranch(id, val);
    }; // Event coordinator for tab branch selection.

    // Event coordinator for branch creation.
    const handleCreateBranch = (branchName: string) => {
      onCreateTabBranch(id, branchName);
    };

    const branchSelector = isGitRepo ? (
      <BranchSelector
        currentBranch={tabData.branch}
        branches={branches}
        onChangeBranch={handleSelectBranch}
        onCreateBranch={handleCreateBranch}
        key="branch-selector"
      />
    ) : null; // Dynamic branch custom dropdown tag.

    const handleRename = () => {
      setRenameValue(tabData.name);
      setRenamingTabId(id);
    }; // Activates the custom rename modal.

    const tileView = (
      <MosaicWindow<string>
        path={path}
        title={tabData.name}
        className="group"
        toolbarControls={[
          branchSelector,
          <div key="toolbar-actions" className="flex items-center gap-1 ml-1">
            <button
              key="rename"
              title="Rename Terminal"
              onClick={handleRename}
              className="p-1 text-slate-500 hover:text-neon-blue transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              key="split-row"
              title={atTabLimit ? `Max ${MAX_TABS} terminals reached` : 'Split Horizontally'}
              onClick={() => !atTabLimit && onAddTab(`Terminal ${tabs.length + 1}`, 'row')}
              className={`p-1 transition-colors ${atTabLimit ? 'text-dark-700 cursor-not-allowed' : 'text-slate-500 hover:text-neon-blue'}`}
            >
              <Split className="w-3.5 h-3.5 rotate-90" />
            </button>
            <button
              key="split-col"
              title={atTabLimit ? `Max ${MAX_TABS} terminals reached` : 'Split Vertically'}
              onClick={() => !atTabLimit && onAddTab(`Terminal ${tabs.length + 1}`, 'column')}
              className={`p-1 transition-colors ${atTabLimit ? 'text-dark-700 cursor-not-allowed' : 'text-slate-500 hover:text-neon-blue'}`}
            >
              <Split className="w-3.5 h-3.5" />
            </button>
            <div key="sep" className="w-px h-4 bg-dark-700 mx-0.5" />
            <button
              key="delete"
              title="Close Terminal"
              onClick={() => onCloseTab(id)}
              className="p-1 text-slate-500 hover:text-neon-red transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>,
        ].filter(Boolean) as React.ReactNode[]}
      >
        <TerminalTab key={`${id}-${tabData.branch || ''}`} workspaceId={workspaceId} tabId={id} isActive={true} />
      </MosaicWindow>
    ); // The rendered tile with toolbars.
    return tileView;
  }; // Inline renderer.

  if (tabs.length === 0) {
    const zeroState = (
      <div className="flex-1 flex flex-col items-center justify-center bg-dark-900 border border-dark-700/60 rounded-xl m-4 p-8 text-center">
        <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center text-neon-blue mb-4 border border-dark-700">
          <LayoutGrid className="w-8 h-8 animate-pulse" />
        </div>
        <h3 className="text-lg font-semibold text-slate-100 mb-2">No Active Terminals</h3>
        <p className="text-sm text-slate-400 max-w-sm mb-6">
          Initialize layout cells by spawning side-by-side terminal instances.
        </p>
        <button
          onClick={handleAddTerminal}
          disabled={atTabLimit}
          className={`flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg transition-all duration-200 ${
            atTabLimit
              ? 'bg-dark-800 text-slate-600 cursor-not-allowed border border-dark-700'
              : 'bg-gradient-to-r from-neon-blue to-neon-green text-black hover:shadow-lg hover:shadow-neon-blue/20'
          }`}
        >
          <Plus className="w-4 h-4" />
          {atTabLimit ? `Max ${MAX_TABS} Reached` : 'Spawn Terminal Tab'}
        </button>
      </div>
    ); // Zero state view.
    return zeroState;
  }

  const activeLayout = layout || tabs[0].id; // Resolves default layout to single tile if tree state is null.

  const renameModal = renamingTabId ? (() => {
    const tabData = tabMap.get(renamingTabId); // Configuration for the target renaming tab.
    if (!tabData) return null;
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (renameValue.trim() && renameValue.trim() !== tabData.name) {
        onRenameTab(renamingTabId, renameValue.trim());
      }
      setRenamingTabId(null);
    }; // Submits tab rename event and hides modal.
    const modalView = (
      <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-[100]" onClick={() => setRenamingTabId(null)}>
        <div className="bg-dark-800 border border-dark-700 w-80 rounded-xl p-4 shadow-2xl flex flex-col font-sans gap-4" onClick={e => e.stopPropagation()}>
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Rename Terminal</h3>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              required
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              className="bg-dark-900 border border-dark-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-500 w-full font-sans"
            />
            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setRenamingTabId(null)}
                className="px-3 py-1.5 hover:bg-dark-700 rounded text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-neon-blue hover:bg-neon-blue/80 text-dark-900 font-bold rounded transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    ); // Rename Modal view.
    return modalView;
  })() : null; // Dynamic rename modal element.

  const mosaicGrid = (
    <div className="flex-1 p-4 relative min-h-0 bg-dark-900">
      <Mosaic<string>
        renderTile={renderTile}
        value={activeLayout}
        onChange={onChangeLayout}
        className="mosaic-blueprint-theme"
      />
      {renameModal}
    </div>
  ); // Core Grid Component.
  return mosaicGrid;
};
