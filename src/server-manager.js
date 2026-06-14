// Exeggutor Server Manager.
// Handles starting and stopping the backend and frontend server processes
// as detached child processes with proper environment variables.

const { spawn, execSync } = require('child_process');
const { existsSync, appendFileSync, writeFileSync, mkdirSync } = require('fs');
const { resolve } = require('path');
const { createServer } = require('net');

// Finds the first available port starting from the preferred port.
function findAvailablePort(preferred) {
  return new Promise((resolve) => {
    const server = createServer();
    const tryPort = (port) => {
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        // Port in use, try next
        tryPort(port + 1);
      });
    };
    tryPort(preferred);
  });
}

// Starts the backend and frontend servers as detached child processes.
// Returns { backendPid, frontendPid } or null on failure.
function startServers(root, config, logDir) {
  const backendPort = config.backendPort || 17492;
  const frontendPort = config.frontendPort || 17493;
  const backendPath = resolve(root, 'packages', 'backend');
  const frontendPath = resolve(root, 'packages', 'frontend');

  // Ensure node_modules are installed
  if (!existsSync(resolve(backendPath, 'node_modules'))) {
    console.log('Installing backend dependencies...');
    execSync('npm install', { cwd: backendPath, stdio: 'inherit' });
  }
  if (!existsSync(resolve(frontendPath, 'node_modules'))) {
    console.log('Installing frontend dependencies...');
    execSync('npm install', { cwd: frontendPath, stdio: 'inherit' });
  }

  const backendLog = resolve(logDir, 'backend.log');
  const frontendLog = resolve(logDir, 'frontend.log');

  // Ensure log files exist
  if (!existsSync(backendLog)) writeFileSync(backendLog, '', 'utf8');
  if (!existsSync(frontendLog)) writeFileSync(frontendLog, '', 'utf8');

  const env = {
    ...process.env,
    EXEGGUTOR_BACKEND_PORT: String(backendPort),
    EXEGGUTOR_FRONTEND_PORT: String(frontendPort),
  };

  // Start backend
  console.log('Starting backend server...');
  const backendCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const backendArgs = ['ts-node-dev', '--respawn', '--transpile-only', 'src/index.ts'];
  const backendProcess = spawn(backendCmd, backendArgs, {
    cwd: backendPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    windowsHide: true,
  });

  const backendStream = require('fs').createWriteStream(backendLog, { flags: 'a' });
  backendProcess.stdout.pipe(backendStream);
  backendProcess.stderr.pipe(backendStream);

  backendProcess.unref();

  config.backendPid = backendProcess.pid;

  // Start frontend
  console.log('Starting frontend server...');
  const frontendCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const frontendArgs = ['vite', '--port', String(frontendPort)];
  const frontendProcess = spawn(frontendCmd, frontendArgs, {
    cwd: frontendPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    windowsHide: true,
  });

  const frontendStream = require('fs').createWriteStream(frontendLog, { flags: 'a' });
  frontendProcess.stdout.pipe(frontendStream);
  frontendProcess.stderr.pipe(frontendStream);

  frontendProcess.unref();

  config.frontendPid = frontendProcess.pid;

  return { backendPid: backendProcess.pid, frontendPid: frontendProcess.pid };
}

// Stops all running servers using the stored PIDs.
function stopServers(config) {
  const backendPid = config.backendPid;
  const frontendPid = config.frontendPid;

  const platform = process.platform;

  const kill = (pid, label) => {
    if (!pid) return;
    try {
      if (platform === 'win32') {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
      console.log(`Stopped ${label} (PID ${pid})`);
    } catch (err) {
      // Process may already be dead
      console.log(`(${label} PID ${pid} already stopped)`);
    }
  };

  // Kill backend, then any orphaned node processes on the backend port
  kill(backendPid, 'Backend');

  // Kill frontend, then any orphaned vite processes on the frontend port
  kill(frontendPid, 'Frontend');

  // Fallback: kill any remaining node/vite processes related to this project
  try {
    if (platform === 'win32') {
      execSync(`taskkill /F /IM node.exe /T 2>nul`, { stdio: 'ignore' });
    }
  } catch { /* ok */ }
}

module.exports = { startServers, stopServers, findAvailablePort };
