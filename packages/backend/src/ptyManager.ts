import * as pty from 'node-pty';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

export interface TerminalSession {
  id: string; // The unique tab ID associated with this terminal process.
  workspaceId: string; // The ID of the workspace that owns this session.
  ptyProcess: pty.IPty; // The live node-pty process instance.
  outputBuffer: string[]; // Accumulated recent terminal output lines.
  lastOutputTime: number; // Unix timestamp of the last stdout chunk received.
  status: 'Active' | 'Waiting' | 'Idle' | 'Errored'; // Real-time state of the terminal process.
  lastLinePreview: string; // The single most recent line of terminal output for sidebar observers.
  onData: (data: string) => void; // Event dispatcher callback for new stdout streams.
  activeSocket?: any; // The active WebSocket connection associated with this session.
  broadcastCallback?: () => void; // Optional callback to notify observer of state changes.
}

const sessions = new Map<string, TerminalSession>(); // Global map cache linking tab IDs to their active persistent TerminalSessions.
let statusCheckInterval: NodeJS.Timeout | null = null; // Background interval reference for running periodic status audits.

// Queries the operating system to recursively find all active child and descendant process IDs of the specified parent process.
function getDescendants(parentPid: number): Promise<Array<{ pid: number; name: string }>> {
  const p = new Promise<Array<{ pid: number; name: string }>>((resolve) => {
    const isWin = process.platform === 'win32'; // Flag denoting if the host operating system is Windows.
    const cmd = isWin ? 'wmic process get ParentProcessId,ProcessId,Name' : 'ps -A -o ppid,pid,comm'; // System command to run.
    const runOptions = { windowsHide: true }; // Hide window option.
    exec(cmd, runOptions, (err, stdout) => {
      if (err || !stdout) {
        resolve([]);
        return;
      }
      const lines = stdout.split(/\r?\n/); // Process lines array.
      const procList: Array<{ pid: number; ppid: number; name: string }> = []; // Registry of all active system processes.
      for (const line of lines) {
        const parts = line.trim().split(/\s+/); // Splitted columns.
        if (parts.length >= 3) {
          if (isWin) {
            const name = parts[0]; // Process executable name.
            const ppid = parseInt(parts[parts.length - 2], 10); // Parent process identifier.
            const pid = parseInt(parts[parts.length - 1], 10); // Target process identifier.
            if (!isNaN(pid) && !isNaN(ppid)) {
              procList.push({ pid, ppid, name });
            }
          } else {
            const ppid = parseInt(parts[0], 10); // Parent process identifier.
            const pid = parseInt(parts[1], 10); // Target process identifier.
            const name = parts.slice(2).join(' '); // Executable name or command line.
            if (!isNaN(pid) && !isNaN(ppid)) {
              procList.push({ pid, ppid, name });
            }
          }
        }
      }

      const descendants: Array<{ pid: number; name: string }> = []; // Flat registry of descendant processes.
      const queue = [parentPid]; // Queue container for breath-first traversal.
      const visited = new Set<number>(); // Visited PID tracker to prevent circular reference locks.
      while (queue.length > 0) {
        const current = queue.shift()!; // Dequeued parent PID.
        if (visited.has(current)) {
          continue;
        }
        visited.add(current);
        const children = procList.filter(p => p.ppid === current); // Direct children matching current process.
        for (const child of children) {
          descendants.push({ pid: child.pid, name: child.name });
          queue.push(child.pid);
        }
      }
      resolve(descendants);
    });
  }); // Spawns execution promise handle.
  return p;
}

// Audits the activity state of all terminal sessions to update active vs idle/waiting states.
export function startStatusAuditor(broadcastCallback: () => void): void {
  if (statusCheckInterval) {
    return;
  }
  statusCheckInterval = setInterval(async () => {
    const now = Date.now(); // The current high resolution timestamp.
    let changed = false; // Flag to indicate if any session state changed during this audit cycle.
    
    const sessionPromises = Array.from(sessions.values()).map(async (session) => {
      const descendants = await getDescendants(session.ptyProcess.pid); // Retrieved process descendants of the PTY.
      const utilityNames = new Set([
        'winpty-agent.exe', 'conhost.exe', 'powershell.exe', 'cmd.exe',
        'wmic.exe', 'openconsole.exe', 'conconsole.exe', 'bash', 'zsh', 'sh', 'ps'
      ]); // Process utility names set.
      
      const hasActiveProcess = descendants.some(d => {
        const nameLower = d.name.toLowerCase(); // Lowercased process name.
        const isUtility = Array.from(utilityNames).some(u => nameLower.includes(u.toLowerCase())); // Flag identifying utility processes.
        return !isUtility;
      }); // Verification flag identifying if any non-utility process is running.

      if (!hasActiveProcess) {
        if (session.status !== 'Idle') {
          session.status = 'Idle';
          changed = true;
        }
      } else {
        if (session.status === 'Active' && now - session.lastOutputTime > 2000) {
          const fullOutput = session.outputBuffer.join(''); // Combined stdout stream of the session.
          const lines = fullOutput.split(/\r?\n/); // Splitted chunk array.
          const nonLines = lines.map(l => l.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim()); // Cleaned line array without ANSI.
          const nonZeroLines = nonLines.filter(l => l.length > 0); // Non-empty cleaned lines.
          const lastFewLines = nonZeroLines.slice(-5); // Last 5 non-empty output lines.
          const lastFewTextLower = lastFewLines.join(' ').toLowerCase(); // Combined lowercased string of recent lines.
          const interactiveGuides = ['tab', 'select', 'enter', 'confirm', 'dismiss', 'arrow', 'esc', 'up/down', '[y/n]']; // Interactive keyboard control terms.
          const promptIndicators = ['password:', 'password for', 'enter passphrase', 'input:', 'confirm:', 'proceed?']; // Standard CLI input indicators.
          const hasInteractiveGuides = interactiveGuides.some(guide => lastFewTextLower.includes(guide)); // Flag identifying key guides in output.
          const hasPromptIndicators = promptIndicators.some(indicator => lastFewTextLower.includes(indicator)); // Flag identifying standard prompts in output.
          const lastLine = nonZeroLines[nonZeroLines.length - 1] || ''; // The single last line of output.
          const endsWithQuestion = lastLine.endsWith('?') || lastFewLines.some(l => l.endsWith('?')); // Flag verifying if any recent lines end with a question mark.
          const isWaiting = hasInteractiveGuides || hasPromptIndicators || endsWithQuestion; // Combined check for form prompt or question.
          const nextStatus = isWaiting ? 'Waiting' : 'Idle'; // Computed target status mapping.
          session.status = nextStatus;
          changed = true;
        }
      }
    }); // Spawns concurrent auditing sessions.

    await Promise.all(sessionPromises);
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

  const ptyArgs: string[] = []; // Arguments passed to the spawned shell.
  const ptyEnv = { ...process.env } as Record<string, string>; // Environment variables for the spawned process.

  const isWin = os.platform() === 'win32'; // Flag indicating Windows platform.
  if (isWin) {
    const guardScript = path.resolve(__dirname, '../scripts/git-guard.ps1');
    if (fs.existsSync(guardScript)) {
      ptyArgs.push('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', `. '${guardScript}'`);
    }
  } else {
    const wrapperDir = path.resolve(__dirname, '../git-wrapper');
    if (fs.existsSync(path.join(wrapperDir, 'git'))) {
      ptyEnv.PATH = `${wrapperDir}${path.delimiter}${ptyEnv.PATH || ''}`;
    }
  }

  let ptyProcess: pty.IPty; // The spawned node-pty process instance.
  try {
    ptyProcess = pty.spawn(targetShell, ptyArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd,
      env: ptyEnv,
      useConpty: true, // Uses modern ConPTY for proper cursor escape sequence passthrough.
    }); // Attempt to spawn with modern ConPTY for cursor support.
  } catch (_e) {
    ptyProcess = pty.spawn(targetShell, ptyArgs, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd,
      env: ptyEnv,
      useConpty: false, // Falls back to winpty when ConPTY is unavailable.
    }); // Fallback to winpty if ConPTY fails (e.g. headless environments).
  }

  const newSession: TerminalSession = {
    id: tabId,
    workspaceId: workspaceId,
    ptyProcess: ptyProcess,
    outputBuffer: [],
    lastOutputTime: Date.now(),
    status: 'Idle',
    lastLinePreview: '',
    onData: () => {},
    broadcastCallback: broadcastCallback,
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

    const oldStatus = newSession.status; // Preserve original status before computation.
    newSession.status = 'Active'; // Mark status as active immediately when receiving new data.

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
  if (session && typeof cols === 'number' && typeof rows === 'number' && cols > 0 && rows > 0) {
    const parsedCols = Math.floor(cols); // Normalized columns count.
    const parsedRows = Math.floor(rows); // Normalized rows count.
    if (parsedCols > 0 && parsedRows > 0) {
      session.ptyProcess.resize(parsedCols, parsedRows);
    }
  }
}

// Write input data directly to the active terminal process.
export function writeToPtySession(tabId: string, data: string): void {
  const session = sessions.get(tabId); // Look up session by ID.
  if (session) {
    const oldStatus = session.status; // Preserve original status before computation.
    session.status = 'Idle'; // Set status to Idle immediately when user interacts.
    if (oldStatus !== session.status && session.broadcastCallback) {
      session.broadcastCallback();
    }
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
