// Exeggutor Server Manager.
// Starts the backend process as a truly detached background service.
// On Windows, uses a VBS launcher to avoid job-object child killing.
// On Unix, uses standard spawn with detached.

const { spawn, execSync, exec } = require('child_process');
const { existsSync, writeFileSync } = require('fs');
const { resolve } = require('path');
const { createServer } = require('net');
const os = require('os');

const IS_WIN = process.platform === 'win32';

// Finds the first available port starting from the preferred port.
function findAvailablePort(preferred) {
  return new Promise((resolve) => {
    const server = createServer();
    const tryPort = (port) => {
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
      server.on('error', () => {
        tryPort(port + 1);
      });
    };
    tryPort(preferred);
  });
}

// Resolves the JS entry for the backend process.
function resolveBackendPath(backendPath) {
  const compiled = resolve(backendPath, 'dist', 'index.js');
  if (existsSync(compiled)) return compiled;
  const tsNodeEntry = resolve(backendPath, 'node_modules', 'ts-node-dev', 'lib', 'bin.js');
  if (existsSync(tsNodeEntry)) return tsNodeEntry;
  return null;
}

// Starts the backend server as a detached background process.
function startServers(root, config, logDir) {
  const backendPort = config.backendPort || 17492; // Target port where the server daemon listens.
  const backendPath = resolve(root, 'packages', 'backend'); // Core absolute path of the backend source files.
  const entry = resolveBackendPath(backendPath); // Backend executable entry file reference.
  if (!entry) {
    console.error('Backend entry not found. Ensure backend is built.');
    return null;
  }

  const backendArgs = entry.endsWith('bin.js')
    ? ['--respawn', '--transpile-only', 'src/index.ts']
    : []; // Arguments list parsed to the spawned node runtime.

  const env = {
    ...process.env,
    EXEGGUTOR_BACKEND_PORT: String(backendPort),
    EXEGGUTOR_FRONTEND_DIST: resolve(root, 'packages', 'frontend', 'dist'),
  }; // Combined environment options passed to the spawned process.

  const backendLog = resolve(logDir, 'backend.log'); // Logging path mapping for server output.
  if (!existsSync(backendLog)) writeFileSync(backendLog, '', 'utf8');

  let child; // Reference container of the child background process.
  const fs = require('fs'); // Native file system module reference.
  const stream = fs.createWriteStream(backendLog, { flags: 'a' }); // Log file write stream.

  child = spawn(process.execPath, [entry, ...backendArgs], {
    cwd: backendPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    windowsHide: true,
  }); // Spawn the process in a cross-platform detached state.

  if (child.stdout) child.stdout.pipe(stream);
  if (child.stderr) child.stderr.pipe(stream);
  child.unref();

  const cfgPath = resolve(os.homedir(), '.exeggutor.json'); // Absolute path to the runtime configuration file.
  try {
    const cfgContent = existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {}; // Parsed config options.
    cfgContent.backendPid = child.pid;
    writeFileSync(cfgPath, JSON.stringify(cfgContent, null, 2), 'utf8');
  } catch {}

  config.backendPid = child.pid;
  return { backendPid: child.pid, frontendPid: null };
}

// Stops the backend server.
function stopServers(config) {
  const pid = config.backendPid;
  if (pid) {
    try {
      if (IS_WIN) {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
      console.log(`Stopped Exeggutor (PID ${pid})`);
      return;
    } catch {}
  }
  // Fallback: kill any process on our port
  try {
    if (IS_WIN) {
      const result = execSync(`netstat -ano | findstr ":${config.backendPort || 17492}"`, { encoding: 'utf8', timeout: 5000 });
      const lines = result.trim().split('\n').filter(l => l.includes('LISTENING'));
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const foundPid = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(foundPid)) {
          execSync(`taskkill /F /PID ${foundPid}`, { stdio: 'ignore' });
          console.log(`Stopped Exeggutor (PID ${foundPid})`);
        }
      }
    } else {
      execSync(`lsof -ti:${config.backendPort || 17492} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    }
  } catch {
    console.log('(No running Exeggutor server found)');
  }
}

module.exports = { startServers, stopServers, findAvailablePort };
