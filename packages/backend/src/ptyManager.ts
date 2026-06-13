import * as pty from 'node-pty';
import * as os from 'os';

export interface TerminalSession {
  id: string; // The unique tab ID associated with this terminal process.
  workspaceId: string; // The ID of the workspace that owns this session.
  ptyProcess: pty.IPty; // The live node-pty process instance.
  outputBuffer: string[]; // Accumulated recent terminal output lines.
  lastOutputTime: number; // Unix timestamp of the last stdout chunk received.
  status: 'Active' | 'Waiting' | 'Idle' | 'Errored'; // Real-time state of the terminal process.
  lastLinePreview: string; // The single most recent line of terminal output for sidebar observers.
  onData: (data: string) => void; // Event dispatcher callback for new stdout streams.
}

const sessions = new Map<string, TerminalSession>(); // Global map cache linking tab IDs to their active persistent TerminalSessions.
let statusCheckInterval: NodeJS.Timeout | null = null; // Background interval reference for running periodic status audits.

// Audits the activity state of all terminal sessions to update active vs idle states.
export function startStatusAuditor(broadcastCallback: () => void): void {
  if (statusCheckInterval) {
    return;
  }
  statusCheckInterval = setInterval(() => {
    const now = Date.now(); // The current high resolution timestamp.
    let changed = false; // Flag to indicate if any session state changed during this audit cycle.
    sessions.forEach(session => {
      if (session.status === 'Active' && now - session.lastOutputTime > 2000) {
        session.status = 'Idle';
        changed = true;
      }
    });
    if (changed) {
      broadcastCallback();
    }
  }, 1000); // Trigger auditor check every 1 second.
}

// Spawns a persistent terminal process or retrieves an existing one, matching it to the tab.
export function getOrCreatePtySession(
  workspaceId: string,
  tabId: string,
  cwd: string,
  shellPath?: string,
  broadcastCallback?: () => void
): TerminalSession {
  const existing = sessions.get(tabId); // Attempt to retrieve an existing session from the cache.
  if (existing) {
    const foundSession = existing; // Explicit reference to the cached session.
    return foundSession;
  }

  const defaultShell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'; // Choose shell path depending on underlying server OS.
  const targetShell = shellPath || defaultShell; // Evaluated shell executable to run.

  const ptyProcess = pty.spawn(targetShell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd,
    env: process.env as Record<string, string>,
  }); // Spawn the process via node-pty.

  const newSession: TerminalSession = {
    id: tabId,
    workspaceId: workspaceId,
    ptyProcess: ptyProcess,
    outputBuffer: [],
    lastOutputTime: Date.now(),
    status: 'Idle',
    lastLinePreview: '',
    onData: () => {},
  }; // The new terminal session schema instance mapping this tab.

  sessions.set(tabId, newSession);

  ptyProcess.onData(data => {
    newSession.lastOutputTime = Date.now();
    
    const maxBufferLines = 1000; // Limit total cached rows in memory to save memory usage.
    newSession.outputBuffer.push(data);
    if (newSession.outputBuffer.length > maxBufferLines) {
      newSession.outputBuffer.shift();
    }

    const lines = data.split(/\r?\n/); // Splitted chunk array.
    const lastNonEmpty = lines.filter(l => l.trim().length > 0).pop(); // The last non-empty line of text.
    if (lastNonEmpty) {
      const cleanLine = lastNonEmpty.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim(); // Remove ANSI terminal escape codes.
      if (cleanLine.length > 0) {
        newSession.lastLinePreview = cleanLine.substring(0, 100);
      }
    }

    const lowerData = data.toLowerCase(); // Lowercased data for pattern matching.
    const waitPatterns = [
      '?', '[y/n]', 'password:', 'password for', 'enter passphrase', 'input:', 'confirm:', 'proceed?'
    ]; // List of common command prompts that request input.
    const isWaiting = waitPatterns.some(p => lowerData.includes(p)); // Check evaluation.

    const oldStatus = newSession.status; // Preserve original status before computation.
    if (isWaiting) {
      newSession.status = 'Waiting';
    } else {
      newSession.status = 'Active';
    }

    newSession.onData(data);

    if (oldStatus !== newSession.status && broadcastCallback) {
      broadcastCallback();
    }
  });

  ptyProcess.onExit(res => {
    newSession.status = res.exitCode === 0 ? 'Idle' : 'Errored';
    if (broadcastCallback) {
      broadcastCallback();
    }
  });

  const createdSession = newSession; // Explicit reference to return.
  return createdSession;
}

// Resizes the terminal process row and column dimensions.
export function resizePtySession(tabId: string, cols: number, rows: number): void {
  const session = sessions.get(tabId); // Look up session by ID.
  if (session) {
    session.ptyProcess.resize(cols, rows);
  }
}

// Write input data directly to the active terminal process.
export function writeToPtySession(tabId: string, data: string): void {
  const session = sessions.get(tabId); // Look up session by ID.
  if (session) {
    session.ptyProcess.write(data);
  }
}

// Forces the termination of a terminal session and frees system process resources.
export function killPtySession(tabId: string): void {
  const session = sessions.get(tabId); // Find session by tab ID.
  if (session) {
    try {
      session.ptyProcess.kill();
    } catch (err) {
      // Ignore exit errors.
    }
    sessions.delete(tabId);
  }
}

// Retrieves all terminal session descriptors currently managed by the backend.
export function getAllSessions(): Array<{ id: string; workspaceId: string; status: string; preview: string }> {
  const list: Array<{ id: string; workspaceId: string; status: string; preview: string }> = []; // Return sessions descriptors.
  sessions.forEach(s => {
    list.push({
      id: s.id,
      workspaceId: s.workspaceId,
      status: s.status,
      preview: s.lastLinePreview,
    });
  });
  return list;
}
