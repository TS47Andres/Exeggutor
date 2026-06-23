// HTTP client for the Exeggutor backend REST API over Tailscale.
// All requests go through the Tailscale tailnet (WireGuard-encrypted).

import { loadConnection } from '../storage/secureStore';

// Error thrown when the backend responds with HTTP 401.
export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

// Builds the base URL from stored connection credentials.
async function getBaseUrl(): Promise<string> {
  const conn = await loadConnection(); // Stored host, port, and token.
  if (!conn.host || !conn.port) {
    throw new Error('No connection configured. Pair with a server first.');
  }
  return `http://${conn.host}:${conn.port}`;
}

// Builds authorization headers from the stored token.
async function getAuthHeaders(): Promise<Record<string, string>> {
  const conn = await loadConnection(); // Stored connection credentials.
  const headers: Record<string, string> = {};
  if (conn.token) {
    headers['Authorization'] = `Bearer ${conn.token}`;
  }
  return headers;
}

// Generic fetch wrapper that injects auth and base URL.
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getBaseUrl(); // Computed server base URL.
  const headers = await getAuthHeaders(); // Auth headers dictionary.
  const mergedInit: RequestInit = {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
  }; // Finalised request config.
  const response = await fetch(`${baseUrl}${path}`, mergedInit);
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  return response;
}

interface WorkspaceTab {
  id: string; // Tab identifier.
  name: string; // Human-readable tab name.
  cwd: string; // Working directory path.
  branch?: string; // Active git branch assigned to this tab.
  worktreePath?: string; // Git worktree directory if isolated.
}

interface Workspace {
  id: string; // Workspace identifier.
  name: string; // Human-readable workspace name.
  path: string; // Absolute filesystem path.
  tabs: WorkspaceTab[]; // Active terminal tabs.
  layout?: unknown; // Mosaic layout tree (unused on mobile).
}

// Fetches the list of all workspaces from the backend.
export async function getWorkspaces(): Promise<Workspace[]> {
  const res = await apiFetch('/api/workspaces');
  return res.json();
}

// Creates a new terminal tab in the given workspace.
export async function createTab(workspaceId: string, name: string): Promise<WorkspaceTab> {
  const res = await apiFetch(`/api/workspaces/${workspaceId}/tabs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

// Deletes a terminal tab.
export async function deleteTab(workspaceId: string, tabId: string): Promise<void> {
  await apiFetch(`/api/workspaces/${workspaceId}/tabs/${tabId}`, {
    method: 'DELETE',
  });
}

// Fetches the Tailscale status from the backend.
export async function getTailscaleStatus(): Promise<{
  installed: boolean;
  connected: boolean;
  tailscale: { ip: string; dnsName: string; tailnetName: string; online: boolean } | null;
  pairingCode: string | null;
}> {
  const res = await apiFetch('/api/tailscale/status');
  return res.json();
}

// Validates a pairing code by checking the backend tailscale status health.
export async function verifyPairing(host: string, port: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/api/tailscale/status`, {
      headers: { Authorization: `Bearer ${token}` },
    }); // Health check response from the target backend.
    if (!res.ok) {
      return false;
    }
    const data = await res.json(); // Parsed status payload.
    return data.connected === true;
  } catch {
    return false;
  }
}
