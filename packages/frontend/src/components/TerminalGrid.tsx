import React, { useState, useEffect, useRef } from 'react';
import { Mosaic, MosaicWindow, MosaicNode } from 'react-mosaic-component';
import { TerminalTab } from './TerminalTab';
import { Plus, Trash2, LayoutGrid, Split, Check, GitBranch, ChevronDown, Search, X, Edit3 } from 'lucide-react';
import { TerminalTab as TabType } from '../App';

interface TerminalGridProps {
  workspaceId: string;
  tabs: TabType[];
  layout: MosaicNode<string> | null;
  onChangeLayout: (newLayout: MosaicNode<string> | null) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: (name: string, direction?: 'row' | 'column') => void;
  onRenameTab: (tabId: string, newName: string) => void;
  branches: string[];
  isGitRepo: boolean;
  onChangeTabBranch: (tabId: string, branch: string) => Promise<void>;
  onCreateTabBranch: (tabId: string, branchName: string) => Promise<void>;
}

export function removeTabFromTree(tree: MosaicNode<string> | null, tabId: string): MosaicNode<string> | null {
  if (tree === null) {
    return null;
  }
  if (typeof tree === 'string') {
    if (tree === tabId) {
      return null;
    }
    return tree;
  }
  const first = removeTabFromTree(tree.first, tabId);
  const second = removeTabFromTree(tree.second, tabId);
  if (first === null) {
    return second;
  }
  if (second === null) {
    return first;
  }
  return { ...tree, first, second };
}

export function addTabToTree(tree: MosaicNode<string> | null, newTabId: string, direction: 'row' | 'column' = 'row'): MosaicNode<string> {
  if (tree === null) {
    return newTabId;
  }
  if (typeof tree === 'string') {
    return {
      direction: direction,
      first: tree,
      second: newTabId,
      splitPercentage: 50,
    };
  }
  return { ...tree, second: addTabToTree(tree.second, newTabId, direction) };
}

interface BranchSelectorProps {
  currentBranch?: string;
  branches: string[];
  onChangeBranch: (branch: string) => void;
  onCreateBranch: (branchName: string) => void;
}

const BranchSelector: React.FC<BranchSelectorProps> = ({
  currentBranch,
  branches,
  onChangeBranch,
  onCreateBranch,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowInlineCreate(false);
        setSearchQuery('');
        setNewBranchName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const activeLabel = currentBranch || 'Direct (No branch)';

  const filteredBranches = branches.filter(b =>
    b.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInlineCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newBranchName.trim().length > 0) {
      onCreateBranch(newBranchName.trim());
      setNewBranchName('');
      setShowInlineCreate(false);
      setIsOpen(false);
    }
  };

  return (
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
                const isSelected = b === currentBranch;
                return (
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
                );
              })
            )}
          </div>

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
  );
};

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
  const tabMap = new Map(tabs.map(t => [t.id, t]));
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [focusedTabId, setFocusedTabId] = useState<string | null>(null);

  useEffect(() => {
    if (tabs.length > 0 && (!focusedTabId || !tabMap.has(focusedTabId))) {
      setFocusedTabId(tabs[0].id);
    }
  }, [tabs, focusedTabId, tabMap]);

  const MAX_TABS = 4;
  const atTabLimit = tabs.length >= MAX_TABS;

  const handleAddTerminal = () => {
    if (atTabLimit) {
      return;
    }
    onAddTab(`Terminal ${tabs.length + 1}`);
  };

  const renderTile = (id: string, path: any) => {
    const tabData = tabMap.get(id);
    if (!tabData) {
      return <div className="p-4 text-zinc-700">Terminal session missing</div>;
    }

    const handleSelectBranch = (val: string) => {
      onChangeTabBranch(id, val);
    };

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
    ) : null;

    const handleRename = () => {
      setRenameValue(tabData.name);
      setRenamingTabId(id);
    };

    const isFocused = id === focusedTabId;
    return (
      <MosaicWindow<string>
        path={path}
        title={tabData.name}
        className={`group${isFocused ? ' mosaic-window-focused' : ''}`}
        toolbarControls={[
          branchSelector,
          <div key="toolbar-actions" className="flex items-center gap-1 ml-1">
            <button
              key="rename"
              title="Rename Terminal"
              onClick={handleRename}
              className="p-1 text-slate-500 hover:text-white transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              key="split-row"
              title={atTabLimit ? `Max ${MAX_TABS} terminals reached` : 'Split Horizontally'}
              onClick={() => !atTabLimit && onAddTab(`Terminal ${tabs.length + 1}`, 'row')}
              className={`p-1 transition-colors ${atTabLimit ? 'text-dark-700 cursor-not-allowed' : 'text-slate-500 hover:text-white'}`}
            >
              <Split className="w-3.5 h-3.5 rotate-90" />
            </button>
            <button
              key="split-col"
              title={atTabLimit ? `Max ${MAX_TABS} terminals reached` : 'Split Vertically'}
              onClick={() => !atTabLimit && onAddTab(`Terminal ${tabs.length + 1}`, 'column')}
              className={`p-1 transition-colors ${atTabLimit ? 'text-dark-700 cursor-not-allowed' : 'text-slate-500 hover:text-white'}`}
            >
              <Split className="w-3.5 h-3.5" />
            </button>
            <div key="sep" className="w-px h-4 bg-dark-700 mx-0.5" />
            <button
              key="delete"
              title="Close Terminal"
              onClick={() => onCloseTab(id)}
              className="p-1 text-slate-500 hover:text-zinc-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>,
        ].filter(Boolean) as React.ReactNode[]}
      >
        <TerminalTab
          key={`${id}-${tabData.branch || ''}`}
          workspaceId={workspaceId}
          tabId={id}
          isActive={isFocused}
          onFocus={() => setFocusedTabId(id)}
        />
      </MosaicWindow>
    );
  };

  const renameModal = renamingTabId ? (() => {
    const tabData = tabMap.get(renamingTabId);
    if (!tabData) return null;
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (renameValue.trim() && renameValue.trim() !== tabData.name) {
        onRenameTab(renamingTabId, renameValue.trim());
      }
      setRenamingTabId(null);
    };
    return (
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
                className="px-3 py-1.5 bg-white hover:bg-white/80 text-dark-900 font-bold rounded transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  })() : null;

  if (tabs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-dark-900 border border-dark-700/60 rounded-xl m-4 p-8 text-center">
        <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center text-white mb-4 border border-dark-700">
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
              : 'bg-gradient-to-r from-white to-zinc-100 text-black hover:shadow-lg hover:shadow-white/20'
          }`}
        >
          <Plus className="w-4 h-4" />
          {atTabLimit ? `Max ${MAX_TABS} Reached` : 'Spawn Terminal Tab'}
        </button>
      </div>
    );
  }

  const activeLayout = layout || tabs[0].id;
  const activeTab = focusedTabId && tabMap.get(focusedTabId);

  return (
    <>
      {/* Desktop: Mosaic grid (unchanged) */}
      <div className="hidden lg:block flex-1 p-4 relative min-h-0 bg-dark-900">
        <Mosaic<string>
          renderTile={renderTile}
          value={activeLayout}
          onChange={onChangeLayout}
          className="mosaic-blueprint-theme"
        />
        {renameModal}
      </div>

      {/* Mobile: tab bar + single terminal */}
      <div className="lg:hidden flex-1 flex flex-col min-h-0 bg-dark-900 overflow-hidden">
        <div className="flex items-center overflow-x-auto border-b border-dark-700/60 shrink-0 bg-dark-800/50">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFocusedTabId(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                focusedTabId === tab.id
                  ? 'border-white text-white bg-dark-800'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-dark-800/30'
              }`}
            >
              <span className="truncate max-w-[80px]">{tab.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="p-0.5 rounded hover:bg-dark-700 text-slate-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </button>
          ))}
          {!atTabLimit && (
            <button
              onClick={handleAddTerminal}
              className="px-3 py-2.5 text-slate-500 hover:text-white shrink-0"
              title="Add Terminal"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Rename button + Add Terminal (visible when tabs exist) */}
        {activeTab && (
          <div className="hidden"> {/* spacer for layout */}</div>
        )}

        <div className="flex-1 min-h-0">
          {activeTab ? (
            <TerminalTab
              key={`${activeTab.id}-${activeTab.branch || ''}`}
              workspaceId={workspaceId}
              tabId={activeTab.id}
              isActive={true}
              onFocus={() => setFocusedTabId(activeTab.id)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              No terminal selected
            </div>
          )}
        </div>

        {renameModal}
      </div>
    </>
  );
};
