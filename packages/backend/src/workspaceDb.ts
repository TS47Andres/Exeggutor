import * as fs from 'fs';
import * as path from 'path';

export interface TerminalTab {
  id: string; // Unique identifier for the terminal tab.
  name: string; // User-facing name of the terminal tab.
  cwd: string; // Current working directory for this terminal session.
  shell?: string; // Optional shell path override for the terminal.
  branch?: string; // Target Git branch assigned to this individual terminal tab.
  worktreePath?: string; // Path to the generated git worktree for this tab if isolated.
  pid?: number; // The process ID of the active shell process.
}

export interface Workspace {
  id: string; // Unique identifier for the workspace.
  name: string; // User-facing name of the workspace.
  path: string; // Core absolute path to the workspace code directory.
  layout?: any; // The react-mosaic-component layout state for this workspace.
  tabs: TerminalTab[]; // List of terminal tabs owned by this workspace.
}

export interface SessionDb {
  workspaces: Workspace[]; // Array of workspaces managed in this system session.
  activeWorkspaceId?: string; // ID of the currently selected active workspace.
}

const dbPath = path.join(__dirname, '../sessions.json'); // Absolute system path pointing to the sessions flat-file JSON database.

// Reads and parses the sessions database from the local file system.
export function readDatabase(): SessionDb {
  if (!fs.existsSync(dbPath)) {
    const initialDb: SessionDb = { workspaces: [] }; // The initial structural database template to write when the file does not exist.
    fs.writeFileSync(dbPath, JSON.stringify(initialDb, null, 2), 'utf8');
    return initialDb;
  }
  const rawData = fs.readFileSync(dbPath, 'utf8'); // Loaded string content from the session JSON file.
  const parsed = JSON.parse(rawData) as SessionDb; // Parsed sessions database schema object.
  return parsed;
}

// Serializes and saves the database state back to the local file system.
export function writeDatabase(db: SessionDb): void {
  const serialized = JSON.stringify(db, null, 2); // Serialized JSON string of the session database structure.
  const tempPath = dbPath + '.tmp'; // Temporary file path to write.
  fs.writeFileSync(tempPath, serialized, 'utf8');
  fs.renameSync(tempPath, dbPath);
}

// Retrieves all workspaces registered in the database.
export function getWorkspaces(): Workspace[] {
  const db = readDatabase(); // The current session database instance loaded from disk.
  const list = db.workspaces; // The list of workspaces extracted from the loaded database.
  return list;
}

// Creates a new workspace and initializes it in the persistent database.
export function createWorkspace(name: string, folderPath: string): Workspace {
  const db = readDatabase(); // The active database object loaded from persistent storage.
  const newWorkspace: Workspace = {
    id: 'ws_' + Math.random().toString(36).substring(2, 9), // Dynamically generated unique workspace ID string.
    name: name, // The workspace name passed as a parameter.
    path: path.resolve(folderPath), // Resolved absolute path string.
    tabs: [], // Initialized empty list of terminal tabs.
  }; // The new workspace structure to append.
  db.workspaces.push(newWorkspace);
  if (!db.activeWorkspaceId) {
    db.activeWorkspaceId = newWorkspace.id; // Sets the first workspace as the default active workspace.
  }
  writeDatabase(db);
  const result = newWorkspace; // The created workspace returned to caller.
  return result;
}

// Deletes a workspace by its ID from the persistent database.
export function deleteWorkspace(id: string): void {
  const db = readDatabase(); // The current database structure loaded from disk.
  const filtered = db.workspaces.filter(ws => ws.id !== id); // Filtered array of workspaces excluding the target workspace ID.
  db.workspaces = filtered;
  if (db.activeWorkspaceId === id) {
    const fallbackId = db.workspaces.length > 0 ? db.workspaces[0].id : undefined; // Fallback workspace ID if the deleted one was active.
    db.activeWorkspaceId = fallbackId;
  }
  writeDatabase(db);
}

// Updates details of an existing workspace in the database.
export function updateWorkspace(id: string, updates: Partial<Omit<Workspace, 'id' | 'tabs'>>): Workspace | null {
  const db = readDatabase(); // The loaded session database object.
  const wsIndex = db.workspaces.findIndex(ws => ws.id === id); // Index of the target workspace in the array.
  if (wsIndex === -1) {
    const nullResult = null; // Represents a missing workspace lookup outcome.
    return nullResult;
  }
  const updatedWs = { ...db.workspaces[wsIndex], ...updates }; // Blended workspace object with updated values.
  db.workspaces[wsIndex] = updatedWs;
  writeDatabase(db);
  const result = updatedWs; // Returns the updated workspace structure.
  return result;
}

// Creates a new terminal tab under a specific workspace in the database.
export function createTerminalTab(workspaceId: string, name: string, cwd: string, shell?: string): TerminalTab | null {
  const db = readDatabase(); // The database session object retrieved from file system.
  const ws = db.workspaces.find(w => w.id === workspaceId); // Workspace object referenced by workspaceId.
  if (!ws) {
    const errorResult = null; // Represents a failure to find the workspace.
    return errorResult;
  }
  const newTab: TerminalTab = {
    id: 'tab_' + Math.random().toString(36).substring(2, 9), // Dynamically generated unique tab ID string.
    name: name, // User assigned name of the terminal tab.
    cwd: path.resolve(cwd), // Resolved absolute current working directory.
    shell: shell, // The optional custom shell path override.
  }; // The new terminal tab object to be created.
  ws.tabs.push(newTab);
  writeDatabase(db);
  const result = newTab; // Returns the newly created terminal tab.
  return result;
}

// Deletes a terminal tab from a workspace in the database.
export function deleteTerminalTab(workspaceId: string, tabId: string): void {
  const db = readDatabase(); // The database state loaded from sessions.json.
  const ws = db.workspaces.find(w => w.id === workspaceId); // Target workspace object.
  if (ws) {
    const filteredTabs = ws.tabs.filter(t => t.id !== tabId); // Filtered terminal tabs excluding the target tab ID.
    ws.tabs = filteredTabs;
    writeDatabase(db);
  }
}

// Updates details of an existing terminal tab in a workspace.
export function updateTerminalTab(workspaceId: string, tabId: string, updates: Partial<Omit<TerminalTab, 'id'>>): TerminalTab | null {
  const db = readDatabase(); // The loaded session database object.
  const ws = db.workspaces.find(w => w.id === workspaceId); // Target workspace instance.
  if (!ws) {
    const errorResult = null; // Target workspace not found.
    return errorResult;
  }
  const tabIndex = ws.tabs.findIndex(t => t.id === tabId); // Index of the target tab.
  if (tabIndex === -1) {
    const errorResult = null; // Target tab not found.
    return errorResult;
  }
  const updatedTab = { ...ws.tabs[tabIndex], ...updates }; // Blended terminal tab configuration.
  ws.tabs[tabIndex] = updatedTab;
  writeDatabase(db);
  const result = updatedTab; // Returns the updated tab structure.
  return result;
}
