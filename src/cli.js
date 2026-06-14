// Exeggutor CLI - main command implementations.
// Each exported function implements a specific CLI command, communicating
// with the backend via HTTP API or managing server processes directly.

const { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } = require('fs');
const { resolve } = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const { startServers, stopServers, findAvailablePort } = require('./server-manager');

const PKG = resolve(__dirname, '..', 'package.json');

// Loads the package version from package.json.
function getVersion(root) {
  try {
    return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

// Prints the current version.
function showVersion(root) {
  console.log(`Exeggutor v${getVersion(root)}`);
}

// Prints the help text with all available commands.
function showHelp() {
  console.log(`
Exeggutor - Terminal Multiplexer & Git Worktree Manager

Usage:
  exeggutor [command]

Commands:
  (no args)               Start all servers in background
  --start                 Start all servers in background
  --stop, --kill          Stop all running servers
  --restart               Restart all servers
  --status, -s            Show status of servers and workspaces
  --open                  Open dashboard in default browser
  --log                   Show server logs (tail)
  --version, -v           Show version
  --help, -h              Show this help

  Workspace Commands:
  --workspaces, -w        List all workspaces
  --create-workspace <name> <path>
                          Register a new workspace
  --delete-workspace <hash>
                          Delete a workspace and all its terminals
  --terminals <hash>      List terminals in a workspace
  --add-terminal <hash> [name]
                          Add a new terminal to a workspace
  --rename <ws-hash> <term-hash> <new-name>
                          Rename a terminal
  --close <ws-hash> <term-name-or-hash>
                          Close a terminal

  Service Management:
  --install-service       Install auto-start on system boot
  --remove-service        Remove auto-start service

Notes:
  - Workspace hashes are the short IDs shown in --workspaces
  - Terminal identifiers can be name or hash (shown in --terminals)
  - Servers must be running for workspace/terminal commands
`);
}

// Starts all servers in background, auto-resolving ports.
async function handleStartServers(root, configPath, extraArgs) {
  const config = loadConfig(configPath); // Loaded configuration settings dictionary.

  // Generate secure token if not present
  if (!config.authToken) {
    config.authToken = require('crypto').randomBytes(16).toString('hex'); // Secure random hex token.
  }

  // Resolve port
  const backendPort = config.backendPort || await findAvailablePort(17492); // Resolved server API port.

  // Save port to config for consistency
  config.backendPort = backendPort;
  config.root = root;
  saveConfig(configPath, config);

  console.log(`Starting Exeggutor...`);
  console.log(`  Port: ${backendPort}`);

  // Set up log directory
  const logDir = resolve(require('os').homedir(), '.exeggutor-logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const result = startServers(root, config, logDir);

  if (!result) {
    console.error('Failed to start servers.');
    process.exit(1);
  }

  console.log(`PID: ${result.backendPid}`);
  console.log(`Dashboard: http://localhost:${backendPort}`);
  console.log('Logs: ~/.exeggutor-logs/');
  console.log('Use "exeggutor --stop" to stop all servers.');
  console.log('Use "exeggutor --open" to open in browser.');
}

// Stops all running servers.
function stopServersCmd(configPath) {
  const config = loadConfig(configPath);
  stopServers(config);
  config.backendPid = undefined;
  saveConfig(configPath, config);
  console.log('All servers stopped.');
}

// Restarts all servers.
async function restartServers(root, configPath) {
  stopServersCmd(configPath);
  // Wait a moment for ports to be released
  await new Promise(r => setTimeout(r, 1500));
  await handleStartServers(root, configPath, []);
}

// Shows status of servers and optionally workspaces.
async function showStatus(configPath) {
  const config = loadConfig(configPath);
  const backendPort = config.backendPort || 17492;

  console.log('Exeggutor Status');
  console.log('================\n');

  // Check backend
  try {
    const alive = await pingBackend(backendPort);
    if (alive) {
      console.log(`Exeggutor: RUNNING (port ${backendPort})`);
    } else {
      console.log(`Exeggutor: STOPPED`);
    }
  } catch {
    console.log('Exeggutor: STOPPED');
  }

  // PID
  if (config.backendPid) console.log(`PID: ${config.backendPid}`);

  console.log('');

  // Fetch workspaces from backend
  try {
    const data = await apiGet(backendPort, '/api/workspaces');
    const workspaces = JSON.parse(data);
    if (!workspaces || workspaces.length === 0) {
      console.log('No workspaces registered.');
      return;
    }
    for (const ws of workspaces) {
      console.log(`\nWorkspace: ${ws.name} (${ws.id})`);
      console.log(`  Path: ${ws.path}`);
      console.log(`  Terminals: ${ws.tabs.length}`);
      for (const tab of ws.tabs) {
        const branchInfo = tab.branch ? ` [branch: ${tab.branch}]` : '';
        console.log(`    - ${tab.name} (${tab.id})${branchInfo}`);
      }
    }
  } catch (err) {
    console.log('Could not connect to backend to fetch workspace details.');
    console.log(`  (Is the server running on port ${backendPort}?)`);
  }
}

// Opens the dashboard in the default browser.
function openDashboard(configPath) {
  const config = loadConfig(configPath); // Loaded configuration settings.
  const port = config.backendPort || 17492; // Active backend port.
  const token = config.authToken || ''; // Active authorization token.
  const url = `http://localhost:${port}/?token=${token}`; // Formatted dashboard URL with token query string.

  const platform = process.platform;
  try {
    if (platform === 'win32') {
      execSync(`start "" "${url}"`, { shell: true });
    } else if (platform === 'darwin') {
      execSync(`open "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
    console.log(`Opened dashboard: ${url}`);
  } catch (err) {
    console.error(`Could not open browser. Visit: ${url}`);
  }
}

// Shows logs (last N lines from log files).
function showLogs(configPath) {
  const logDir = resolve(require('os').homedir(), '.exeggutor-logs');
  const backendLog = resolve(logDir, 'backend.log');
  const frontendLog = resolve(logDir, 'frontend.log');

  console.log('Server Logs (last 20 lines each):\n');

  if (existsSync(backendLog)) {
    console.log('--- Backend ---');
    const lines = readFileSync(backendLog, 'utf8').split('\n').filter(Boolean);
    const tail = lines.slice(-20);
    tail.forEach(l => console.log(l));
  } else {
    console.log('(backend log not found)');
  }

  console.log('');

  if (existsSync(frontendLog)) {
    console.log('--- Frontend ---');
    const lines = readFileSync(frontendLog, 'utf8').split('\n').filter(Boolean);
    const tail = lines.slice(-20);
    tail.forEach(l => console.log(l));
  } else {
    console.log('(frontend log not found)');
  }
}

// Lists all workspaces.
async function listWorkspaces(configPath) {
  const config = loadConfig(configPath);
  const backendPort = config.backendPort || 17492;

  try {
    const data = await apiGet(backendPort, '/api/workspaces');
    const workspaces = JSON.parse(data);
    if (!workspaces || workspaces.length === 0) {
      console.log('No workspaces registered.');
      return;
    }
    console.log('Workspaces:\n');
    for (const ws of workspaces) {
      console.log(`  ${ws.id.padEnd(12)} ${ws.name.padEnd(20)} ${ws.path}`);
    }
  } catch (err) {
    console.error('Could not connect to backend. Is it running?');
    process.exit(1);
  }
}

// Lists terminals in a workspace.
async function listTerminals(configPath, wsHash) {
  const config = loadConfig(configPath);
  const backendPort = config.backendPort || 17492;

  try {
    const data = await apiGet(backendPort, '/api/workspaces');
    const workspaces = JSON.parse(data);
    const ws = workspaces.find(w => w.id === wsHash || w.name === wsHash);
    if (!ws) {
      console.error(`Workspace not found: ${wsHash}`);
      process.exit(1);
    }
    console.log(`Terminals for workspace "${ws.name}" (${ws.id}):\n`);
    if (ws.tabs.length === 0) {
      console.log('  No terminals.');
      return;
    }
    for (const tab of ws.tabs) {
      const branchInfo = tab.branch ? ` [branch: ${tab.branch}]` : '';
      console.log(`  ${tab.id.padEnd(12)} ${tab.name}${branchInfo}`);
    }
  } catch (err) {
    console.error('Could not connect to backend. Is it running?');
    process.exit(1);
  }
}

// Creates a new workspace via the API.
async function createWorkspace(configPath, name, wsPath) {
  const config = loadConfig(configPath);
  const backendPort = config.backendPort || 17492;

  try {
    const result = await apiPost(backendPort, '/api/workspaces', { name, path: wsPath });
    const ws = JSON.parse(result);
    console.log(`Workspace created:`);
    console.log(`  ID: ${ws.id}`);
    console.log(`  Name: ${ws.name}`);
    console.log(`  Path: ${ws.path}`);
  } catch (err) {
    console.error('Failed to create workspace:', err.message);
    process.exit(1);
  }
}

// Adds a new terminal to a workspace via the API.
async function addTerminal(configPath, wsHash, termName) {
  const config = loadConfig(configPath);
  const backendPort = config.backendPort || 17492;

  try {
    const data = await apiGet(backendPort, '/api/workspaces');
    const workspaces = JSON.parse(data);
    const ws = workspaces.find(w => w.id === wsHash || w.name === wsHash);
    if (!ws) {
      console.error(`Workspace not found: ${wsHash}`);
      process.exit(1);
    }
    const result = await apiPost(backendPort, `/api/workspaces/${ws.id}/tabs`, { name: termName });
    const tab = JSON.parse(result);
    console.log(`Terminal added:`);
    console.log(`  ID: ${tab.id}`);
    console.log(`  Name: ${tab.name}`);
    console.log(`  Workspace: ${ws.name}`);
  } catch (err) {
    console.error('Failed to add terminal:', err.message);
    process.exit(1);
  }
}

// Renames a terminal via the API.
async function renameTerminal(configPath, wsHash, termHash, newName) {
  const config = loadConfig(configPath);
  const backendPort = config.backendPort || 17492;

  try {
    const data = await apiGet(backendPort, '/api/workspaces');
    const workspaces = JSON.parse(data);
    const ws = workspaces.find(w => w.id === wsHash || w.name === wsHash);
    if (!ws) {
      console.error(`Workspace not found: ${wsHash}`);
      process.exit(1);
    }
    const tab = ws.tabs.find(t => t.id === termHash || t.name === termHash);
    if (!tab) {
      console.error(`Terminal not found: ${termHash}`);
      process.exit(1);
    }
    await apiPut(backendPort, `/api/workspaces/${ws.id}/tabs/${tab.id}`, { name: newName });
    console.log(`Terminal renamed: ${tab.name} -> ${newName}`);
  } catch (err) {
    console.error('Failed to rename terminal:', err.message);
    process.exit(1);
  }
}

// Closes (deletes) a terminal via the API.
async function closeTerminal(configPath, wsHash, termId) {
  const config = loadConfig(configPath);
  const backendPort = config.backendPort || 17492;

  try {
    const data = await apiGet(backendPort, '/api/workspaces');
    const workspaces = JSON.parse(data);
    const ws = workspaces.find(w => w.id === wsHash || w.name === wsHash);
    if (!ws) {
      console.error(`Workspace not found: ${wsHash}`);
      process.exit(1);
    }
    const tab = ws.tabs.find(t => t.id === termId || t.name === termId);
    if (!tab) {
      console.error(`Terminal not found: ${termId}`);
      process.exit(1);
    }
    await apiDelete(backendPort, `/api/workspaces/${ws.id}/tabs/${tab.id}`);
    console.log(`Terminal closed: ${tab.name} (${tab.id})`);
  } catch (err) {
    console.error('Failed to close terminal:', err.message);
    process.exit(1);
  }
}

// Deletes a workspace via the API.
async function deleteWorkspace(configPath, wsHash) {
  const config = loadConfig(configPath);
  const backendPort = config.backendPort || 17492;

  try {
    const data = await apiGet(backendPort, '/api/workspaces');
    const workspaces = JSON.parse(data);
    const ws = workspaces.find(w => w.id === wsHash || w.name === wsHash);
    if (!ws) {
      console.error(`Workspace not found: ${wsHash}`);
      process.exit(1);
    }
    await apiDelete(backendPort, `/api/workspaces/${ws.id}`);
    console.log(`Workspace deleted: ${ws.name} (${ws.id})`);
  } catch (err) {
    console.error('Failed to delete workspace:', err.message);
    process.exit(1);
  }
}

// Installs auto-start service.
async function installAutostart(root) {
  const autostartModule = require('./autostart');
  await autostartModule.install(root);
  console.log('Auto-start service installed. Exeggutor will start on system boot.');
}

// Removes auto-start service.
async function removeAutostart() {
  const autostartModule = require('./autostart');
  await autostartModule.remove();
  console.log('Auto-start service removed.');
}

// ---------------------------------------------------------------------------
// Utility functions

// Loads the runtime config from ~/.exeggutor.json.
function loadConfig(configPath) {
  try {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf8'));
    }
  } catch { /* ignore corrupted config */ }
  return {};
}

// Saves the runtime config to ~/.exeggutor.json.
function saveConfig(configPath, config) {
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Warning: could not save config:', err.message);
  }
}

// Helper to resolve the active authentication token.
function getAuthToken() {
  try {
    const configPath = resolve(require('os').homedir(), '.exeggutor.json'); // Path to CLI config file.
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8')); // Loaded configuration settings.
      return cfg.authToken || '';
    }
  } catch (_) {}
  return '';
}

// Pings the backend to check if it is alive.
function pingBackend(port) {
  return new Promise((resolve) => {
    const token = getAuthToken(); // Active authentication token.
    const req = http.get(`http://localhost:${port}/api/workspaces?token=${token}`, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

// HTTP GET helper.
function apiGet(port, path) {
  return new Promise((resolve, reject) => {
    const token = getAuthToken(); // Active authentication token.
    const options = {
      headers: { 'Authorization': `Bearer ${token}` }
    }; // Request options dictionary.
    http.get(`http://localhost:${port}${path}`, options, (res) => {
      let data = ''; // Accumulated response text.
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

// HTTP POST helper.
function apiPost(port, path, body) {
  return new Promise((resolve, reject) => {
    const token = getAuthToken(); // Active authentication token.
    const json = JSON.stringify(body); // Serialized payload body.
    const req = http.request(`http://localhost:${port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
        'Authorization': `Bearer ${token}`
      },
    }, (res) => {
      let data = ''; // Accumulated response text.
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

// HTTP PUT helper.
function apiPut(port, path, body) {
  return new Promise((resolve, reject) => {
    const token = getAuthToken(); // Active authentication token.
    const json = JSON.stringify(body); // Serialized payload body.
    const req = http.request(`http://localhost:${port}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
        'Authorization': `Bearer ${token}`
      },
    }, (res) => {
      let data = ''; // Accumulated response text.
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

// HTTP DELETE helper.
function apiDelete(port, path) {
  return new Promise((resolve, reject) => {
    const token = getAuthToken(); // Active authentication token.
    const req = http.request(`http://localhost:${port}${path}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      },
    }, (res) => {
      let data = ''; // Accumulated response text.
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  showVersion,
  showHelp,
  startServers: handleStartServers,
  stopServers: stopServersCmd,
  restartServers,
  showStatus,
  openDashboard,
  showLogs,
  listWorkspaces,
  listTerminals,
  createWorkspace,
  addTerminal,
  renameTerminal,
  closeTerminal,
  deleteWorkspace,
  installAutostart,
  removeAutostart,
};
