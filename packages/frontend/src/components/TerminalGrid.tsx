import React from 'react';
import { Mosaic, MosaicWindow, MosaicNode } from 'react-mosaic-component';
import { TerminalTab } from './TerminalTab';
import { Plus, Trash2, LayoutGrid, Split } from 'lucide-react';
import { TerminalTab as TabType } from '../App';

interface TerminalGridProps {
  workspaceId: string; // The ID of the currently selected workspace.
  tabs: TabType[]; // List of terminal tabs in the active workspace.
  layout: MosaicNode<string> | null; // The current hierarchical mosaic window layout tree.
  onChangeLayout: (newLayout: MosaicNode<string> | null) => void; // Callback invoked when windows are rearranged or resized.
  onCloseTab: (tabId: string) => void; // Callback invoked when a terminal tab is closed.
  onAddTab: (name: string, direction?: 'row' | 'column') => void; // Callback invoked to spawn a new terminal tab.
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

// Renders the side-by-side terminal grid layout.
export const TerminalGrid: React.FC<TerminalGridProps> = ({
  workspaceId,
  tabs,
  layout,
  onChangeLayout,
  onCloseTab,
  onAddTab,
  branches,
  isGitRepo,
  onChangeTabBranch,
  onCreateTabBranch,
}) => {
  const tabMap = new Map(tabs.map(t => [t.id, t])); // HashMap optimization mapping tab IDs to their configurations.

  const handleAddTerminal = () => {
    onAddTab(`Terminal ${tabs.length + 1}`);
  }; // Spawns a default shell terminal.

  const renderTile = (id: string, path: any) => {
    const tabData = tabMap.get(id); // Configurations for this terminal leaf.
    if (!tabData) {
      const missingTile = <div className="p-4 text-neon-red">Terminal session missing</div>; // Fallback view.
      return missingTile;
    }

    const handleSelectBranch = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value; // Selected dropdown option.
      if (val === '__create_new_branch__') {
        const branchName = prompt('Enter name for the new branch:'); // User prompt response.
        if (branchName && branchName.trim().length > 0) {
          onCreateTabBranch(id, branchName.trim());
        }
      } else {
        onChangeTabBranch(id, val);
      }
    }; // Event coordinator for tab branch dropdown select actions.

    const branchSelector = isGitRepo ? (
      <div className="flex items-center gap-1.5 mr-2" onClick={e => e.stopPropagation()} key="branch-selector">
        <select
          value={tabData.branch || ''}
          onChange={handleSelectBranch}
          className="bg-dark-900 border border-dark-700/60 rounded px-2 py-0.5 text-[10px] text-slate-300 font-mono focus:outline-none focus:border-neon-blue cursor-pointer max-w-[120px] truncate"
        >
          <option value="">-- Direct (No branch) --</option>
          {branches.map(b => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          {tabData.branch && !branches.includes(tabData.branch) && (
            <option value={tabData.branch}>{tabData.branch}</option>
          )}
          <option value="__create_new_branch__" className="text-neon-green font-bold">
            + Create Branch...
          </option>
        </select>
      </div>
    ) : null; // Dynamic branch picker select tag.

    const tileView = (
      <MosaicWindow<string>
        path={path}
        title={tabData.name}
        toolbarControls={[
          branchSelector,
          <button
            key="split-row"
            title="Split Horizontally"
            onClick={() => onAddTab(`Terminal ${tabs.length + 1}`, 'row')}
            className="p-1 hover:text-neon-blue transition-colors mr-1"
          >
            <Split className="w-3.5 h-3.5 rotate-90" />
          </button>,
          <button
            key="split-col"
            title="Split Vertically"
            onClick={() => onAddTab(`Terminal ${tabs.length + 1}`, 'column')}
            className="p-1 hover:text-neon-blue transition-colors mr-2"
          >
            <Split className="w-3.5 h-3.5" />
          </button>,
          <button
            key="delete"
            title="Close Terminal"
            onClick={() => onCloseTab(id)}
            className="p-1 hover:text-neon-red transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>,
        ].filter(Boolean) as React.ReactNode[]}
      >
        <TerminalTab workspaceId={workspaceId} tabId={id} isActive={true} />
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
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-neon-blue to-neon-green text-white font-medium rounded-lg hover:shadow-lg hover:shadow-neon-blue/20 transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          Spawn Terminal Tab
        </button>
      </div>
    ); // Zero state view.
    return zeroState;
  }

  const activeLayout = layout || tabs[0].id; // Resolves default layout to single tile if tree state is null.

  const mosaicGrid = (
    <div className="flex-1 h-full p-4 relative min-h-0 bg-dark-900">
      <Mosaic<string>
        renderTile={renderTile}
        value={activeLayout}
        onChange={onChangeLayout}
        className="mosaic-blueprint-theme"
      />
    </div>
  ); // Core Grid Component.
  return mosaicGrid;
};
