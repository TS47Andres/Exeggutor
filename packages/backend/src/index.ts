import fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as db from './workspaceDb';
import * as git from './gitWorktree';
import * as pty from './ptyManager';

const PORT = parseInt(process.env.EXEGGUTOR_BACKEND_PORT || '17492', 10); // Backend API port from env or default.
const FRONTEND_DIST = process.env.EXEGGUTOR_FRONTEND_DIST || ''; // Path to built frontend dist/ folder.
const configPath = path.resolve(os.homedir(), '.exeggutor.json'); // Path to CLI config file.
let authToken = process.env.EXEGGUTOR_AUTH_TOKEN || ''; // Active authorization token.
try {
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); // Loaded configuration settings.
    if (cfg.authToken) {
      authToken = cfg.authToken;
    }
  }
} catch (_) {
  // Safe ignore config load errors.
}

const server: FastifyInstance = fastify({ logger: true }); // Fastify server instance running local services with logging enabled.
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
  // Clean up any orphaned terminal shell processes from previous runs.
  pty.cleanOrphanedPtyProcesses();

  await server.register(fastifyCors, { origin: true });
  await server.register(fastifyWebsocket);

  server.addHook('preHandler', async (request, reply) => {
    const url = request.url; // Target request URL path.
    if (url.startsWith('/api') || url.startsWith('/ws')) {
      let token = (request.query as any)?.token; // Token extracted from query parameter.
      if (!token) {
        const authHeader = request.headers.authorization; // Auth header content.
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }
      if (!authToken || token !== authToken) {
        reply.status(401).send({ error: 'Unauthorized' });
        return reply;
      }
    }
  }); // Registers authentication pre-handler hook.

  // Serve built frontend statically when EXEGGUTOR_FRONTEND_DIST is set (production mode).
  if (FRONTEND_DIST && fs.existsSync(FRONTEND_DIST)) {
    await server.register(fastifyStatic, {
      root: FRONTEND_DIST,
      wildcard: false,
      prefix: '/',
    });
    // SPA fallback: serve index.html for all non-API, non-WS routes.
    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        reply.status(404).send({ error: 'Not found' });
      } else {
        const indexPath = path.join(FRONTEND_DIST, 'index.html');
        if (fs.existsSync(indexPath)) {
          reply.type('text/html').send(fs.readFileSync(indexPath, 'utf8'));
        } else {
          reply.status(404).send('Not found');
        }
      }
    });
  }

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

  server.get<{ Querystring: { name: string } }>('/api/branches/in-use', async (request, reply) => {
    const { name } = request.query; // Branch name to check.
    const allWorkspaces = db.getWorkspaces(); // All registered workspaces.
    let inUse = false; // Default safety flag.
    for (const ws of allWorkspaces) {
      for (const tab of ws.tabs) {
        if (tab.branch === name) {
          inUse = true;
          break;
        }
      }
      if (inUse) { break; }
    }
    const result = { inUse }; // Response payload.
    return result;
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
      observerSockets.add(connection);
      const initialPayload = JSON.stringify({
        type: 'observer',
        sessions: pty.getAllSessions(),
      }); // Initial data load payload for new client.
      connection.send(initialPayload);
      connection.on('close', () => {
        observerSockets.delete(connection);
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
        connection.close(4001, 'Terminal tab not found');
        return;
      }
      const session = pty.getOrCreatePtySession(
        activeWs.id,
        activeTab.id,
        activeTab.cwd,
        activeTab.shell,
        broadcastObserverUpdate
      ); // Spawn or attach persistent session process.

      session.activeSocket = connection; // Register the newly connected socket as the active connection.

      session.outputBuffer.forEach(chunk => {
        connection.send(chunk);
      });

      // Handles incoming data from the persistent PTY process by sending it over the WebSocket.
      session.onData = (data: string) => {
        try {
          if (session.activeSocket === connection) {
            connection.send(data);
          }
        } catch (err) {
          // Socket write failed.
        }
      };

      // Receives input and resize instructions from the WebSocket and forwards them to the PTY session.
      connection.on('message', (messageData: any) => {
        const rawMessage = messageData.toString(); // Normalized string representation of the incoming socket message.
        try {
          const parsed = JSON.parse(rawMessage); // Parsed client websocket message.
          if (parsed && parsed.type === 'resize') {
            pty.resizePtySession(tabId, parsed.cols, parsed.rows);
          } else if (parsed && parsed.type === 'input') {
            pty.writeToPtySession(tabId, parsed.data);
          }
        } catch (err) {
          // Ignore invalid JSON payloads to prevent writing garbage or raw JSON controls to the shell.
        }
      });

      // Disconnects the WebSocket connection and marks the PTY session active socket as empty.
      connection.on('close', () => {
        if (session.activeSocket === connection) {
          session.activeSocket = undefined;
          session.onData = () => {};
        }
      });
    },
  });

  await server.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`Backend daemon is listening on port ${PORT}`);
}

bootstrap().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
