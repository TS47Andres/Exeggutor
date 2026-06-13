import fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import * as db from './workspaceDb';
import * as git from './gitWorktree';
import * as pty from './ptyManager';

const server: FastifyInstance = fastify({ logger: false }); // Fastify server instance running local services.
const observerSockets = new Set<any>(); // Registry containing all active WebSocket connections for the observer sidebar.

// Broadcasts the latest status of all terminal sessions to all observer socket clients.
function broadcastObserverUpdate(): void {
  const payload = JSON.stringify({
    type: 'observer',
    sessions: pty.getAllSessions(),
  }); // Serialized payload containing status mapping of all terminal sessions.
  observerSockets.forEach(ws => {
    try {
      ws.send(payload);
    } catch (err) {
      // Clean up failed sockets.
    }
  });
}

// Registers HTTP routes, WebSockets endpoints, and starts the Fastify service.
async function bootstrap(): Promise<void> {
  await server.register(fastifyCors, { origin: true });
  await server.register(fastifyWebsocket);

  pty.startStatusAuditor(broadcastObserverUpdate);

  server.get('/api/workspaces', async (request, reply) => {
    const list = db.getWorkspaces(); // Workspace list from database.
    return list;
  });

  server.post<{ Body: { name: string; path: string } }>(
    '/api/workspaces',
    async (request, reply) => {
      const { name, path: folderPath } = request.body; // Deconstructed parameters from request body.
      const createdWs = db.createWorkspace(name, folderPath); // Reference to the created workspace.
      const finalResult = createdWs; // Workspace payload returned.
      return finalResult;
    }
  );

  server.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => {
    const id = request.params.id; // Target workspace ID.
    const wsList = db.getWorkspaces(); // Entire registered workspaces array.
    const targetWs = wsList.find(w => w.id === id); // Found workspace object matching the target ID.
    if (targetWs) {
      await Promise.all(
        targetWs.tabs.map(async tab => {
          pty.killPtySession(tab.id);
          if (tab.worktreePath) {
            try {
              await git.removeGitWorktree(targetWs.path, tab.worktreePath);
            } catch (err) {
              // Ignore pruning issues.
            }
          }
        })
      ); // Run PTY shutdowns and worktree cleanups concurrently.
      db.deleteWorkspace(id);
    }
    const successResp = { success: true }; // Server confirmation object.
    return successResp;
  });

  server.put<{ Params: { id: string }; Body: Partial<Omit<db.Workspace, 'id' | 'tabs'>> }>(
    '/api/workspaces/:id',
    async (request, reply) => {
      const id = request.params.id; // Target workspace ID.
      const updates = request.body; // Updated attributes from body.
      const updated = db.updateWorkspace(id, updates); // Workspace with applied patches.
      const returnResult = updated; // Refactored return workspace.
      return returnResult;
    }
  );

  server.post<{ Params: { id: string }; Body: { name: string; shell?: string } }>(
    '/api/workspaces/:id/tabs',
    async (request, reply) => {
      const id = request.params.id; // Parent workspace ID.
      const { name, shell } = request.body; // Input body variables.
      const targetWs = db.getWorkspaces().find(w => w.id === id); // Find matching workspace database entry.
      if (!targetWs) {
        reply.status(404);
        const errorResp = { error: 'Workspace not found' }; // Missing workspace error.
        return errorResp;
      }
      const tab = db.createTerminalTab(id, name, targetWs.path, shell); // New tab object created.
      const returnResult = tab; // Created tab descriptor.
      return returnResult;
    }
  );

  server.put<{ Params: { id: string; tabId: string }; Body: { name?: string; branch?: string } }>(
    '/api/workspaces/:id/tabs/:tabId',
    async (request, reply) => {
      const { id, tabId } = request.params; // Workspace and tab parameter keys.
      const { name, branch } = request.body; // Extracted updates.
      const targetWs = db.getWorkspaces().find(w => w.id === id); // Target workspace object.
      if (!targetWs) {
        reply.status(404);
        const errorResp = { error: 'Workspace not found' }; // Error payload.
        return errorResp;
      }
      const tab = targetWs.tabs.find(t => t.id === tabId); // Selected terminal tab.
      if (!tab) {
        reply.status(404);
        const errorResp = { error: 'Terminal tab not found' }; // Error payload.
        return errorResp;
      }

      let worktreePath = tab.worktreePath; // Preserve current worktree path reference.
      let newCwd = tab.cwd; // Preserve current target current working directory.

      if (branch !== undefined && branch !== tab.branch) {
        pty.killPtySession(tabId);
        if (tab.worktreePath) {
          try {
            await git.removeGitWorktree(targetWs.path, tab.worktreePath);
          } catch (err) {
            // Prune error.
          }
          worktreePath = undefined;
          newCwd = targetWs.path;
        }
        if (branch && branch.trim().length > 0) {
          try {
            const wPath = await git.setupGitWorktree(targetWs.path, branch); // Spawn isolated git worktree folder.
            worktreePath = wPath;
            newCwd = wPath;
          } catch (err: any) {
            reply.status(400);
            const errorResp = { error: err.message || 'Failed to setup git worktree' }; // Setup error.
            return errorResp;
          }
        } else {
          newCwd = targetWs.path;
        }
      }

      const updates: Partial<db.TerminalTab> = {}; // Config updates map.
      if (name !== undefined) {
        updates.name = name;
      }
      if (branch !== undefined) {
        updates.branch = branch ? branch : undefined;
        updates.worktreePath = worktreePath;
        updates.cwd = newCwd;
      }

      const updated = db.updateTerminalTab(id, tabId, updates); // Flush updates to sessions database.
      const returnResult = updated; // Updated tab object.
      return returnResult;
    }
  );

  server.post<{ Params: { id: string; tabId: string }; Body: { name: string } }>(
    '/api/workspaces/:id/tabs/:tabId/branches',
    async (request, reply) => {
      const { id, tabId } = request.params; // Workspace and tab keys.
      const { name: branchName } = request.body; // New branch name.
      const targetWs = db.getWorkspaces().find(w => w.id === id); // Found workspace.
      if (!targetWs) {
        reply.status(404);
        const errorResp = { error: 'Workspace not found' }; // Error payload.
        return errorResp;
      }
      const tab = targetWs.tabs.find(t => t.id === tabId); // Target tab config.
      if (!tab) {
        reply.status(404);
        const errorResp = { error: 'Terminal tab not found' }; // Error.
        return errorResp;
      }
      try {
        await git.createBranch(targetWs.path, branchName);
        pty.killPtySession(tabId);
        if (tab.worktreePath) {
          try {
            await git.removeGitWorktree(targetWs.path, tab.worktreePath);
          } catch (err) {
            // Prune error.
          }
        }
        const wPath = await git.setupGitWorktree(targetWs.path, branchName); // Create new worktree directly.
        const updated = db.updateTerminalTab(id, tabId, {
          branch: branchName,
          worktreePath: wPath,
          cwd: wPath,
        }); // Apply updates to database tab.
        const returnResult = updated; // Tab payload.
        return returnResult;
      } catch (err: any) {
        reply.status(400);
        const errorResp = { error: err.message || 'Failed to create git branch' }; // Error payload.
        return errorResp;
      }
    }
  );

  server.delete<{ Params: { id: string; tabId: string } }>(
    '/api/workspaces/:id/tabs/:tabId',
    async (request, reply) => {
      const { id, tabId } = request.params; // Tab and workspace parameters.
      const targetWs = db.getWorkspaces().find(w => w.id === id); // Found workspace.
      if (targetWs) {
        const tab = targetWs.tabs.find(t => t.id === tabId); // Target tab config.
        pty.killPtySession(tabId);
        if (tab && tab.worktreePath) {
          try {
            await git.removeGitWorktree(targetWs.path, tab.worktreePath);
          } catch (err) {
            // Ignore.
          }
        }
        db.deleteTerminalTab(id, tabId);
      }
      const successResp = { success: true }; // Operation complete.
      return successResp;
    }
  );

  server.get<{ Params: { id: string } }>('/api/workspaces/:id/git/branches', async (request, reply) => {
    const id = request.params.id; // Target workspace ID.
    const ws = db.getWorkspaces().find(w => w.id === id); // Target workspace instance.
    if (!ws) {
      reply.status(404);
      const errorResp = { error: 'Workspace not found' }; // Error workspace message.
      return errorResp;
    }
    try {
      const branches = await git.getBranches(ws.path); // Retrieve active branch array from workspace folder.
      const returnResult = branches; // Branches array result.
      return returnResult;
    } catch (err: any) {
      reply.status(500);
      const errorResp = { error: err.message || 'Failed to query git branches' }; // Error payload.
      return errorResp;
    }
  });

  server.get('/api/browse', async (request, reply) => {
    try {
      const folder = await git.showFolderPicker();
      return { path: folder };
    } catch (err: any) {
      reply.status(500);
      return { path: '', error: err.message || 'Failed to open folder picker' };
    }
  });

  server.route({
    method: 'GET',
    url: '/ws/observer',
    handler: (request, reply) => {
      reply.status(400).send('WebSocket connection expected');
    },
    wsHandler: (connection, req) => {
      observerSockets.add(connection.socket);
      const initialPayload = JSON.stringify({
        type: 'observer',
        sessions: pty.getAllSessions(),
      }); // Initial data load payload for new client.
      connection.socket.send(initialPayload);
      connection.socket.on('close', () => {
        observerSockets.delete(connection.socket);
      });
    },
  });

  server.route({
    method: 'GET',
    url: '/ws/terminal/:tabId',
    handler: (request, reply) => {
      reply.status(400).send('WebSocket connection expected');
    },
    wsHandler: (connection, req) => {
      const tabId = (req.params as any).tabId; // Extract tabId from parameters.
      const workspaces = db.getWorkspaces(); // Load workspaces registry.
      let activeTab: db.TerminalTab | undefined = undefined; // Matches the target active tab.
      let activeWs: db.Workspace | undefined = undefined; // Matches the parent workspace containing the tab.
      for (const ws of workspaces) {
        const found = ws.tabs.find(t => t.id === tabId); // Match lookup.
        if (found) {
          activeTab = found;
          activeWs = ws;
          break;
        }
      }
      if (!activeTab || !activeWs) {
        connection.socket.close(4001, 'Terminal tab not found');
        return;
      }
      const session = pty.getOrCreatePtySession(
        activeWs.id,
        activeTab.id,
        activeTab.cwd,
        activeTab.shell,
        broadcastObserverUpdate
      ); // Spawn or attach persistent session process.

      session.outputBuffer.forEach(chunk => {
        connection.socket.send(chunk);
      });

      session.onData = (data: string) => {
        try {
          connection.socket.send(data);
        } catch (err) {
          // Socket write failed.
        }
      };

      connection.socket.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message); // Parsed client websocket message.
          if (parsed && parsed.type === 'resize') {
            pty.resizePtySession(tabId, parsed.cols, parsed.rows);
          } else if (parsed && parsed.type === 'input') {
            pty.writeToPtySession(tabId, parsed.data);
          }
        } catch (err) {
          pty.writeToPtySession(tabId, message.toString());
        }
      });

      connection.socket.on('close', () => {
        session.onData = () => {};
      });
    },
  });

  const port = 4000; // API network port to deploy fastify on.
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`Backend daemon is listening on port ${port}`);
}

bootstrap().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
