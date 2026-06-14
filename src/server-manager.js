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
  const backendPort = config.backendPort || 17492;
  const backendPath = resolve(root, 'packages', 'backend');

  // Ensure backend dependencies are installed
  if (!existsSync(resolve(backendPath, 'node_modules'))) {
    console.log('Installing dependencies...');
    try {
      execSync('npm install', { cwd: backendPath, stdio: 'inherit', shell: IS_WIN, timeout: 120000 });
    } catch (err) {
      console.error('Install failed:', err.message);
      return null;
    }
  }

  const entry = resolveBackendPath(backendPath);
  if (!entry) {
    console.error('Backend entry not found. Run "npm install" in packages/backend.');
    return null;
  }

  const backendArgs = entry.endsWith('bin.js')
    ? ['--respawn', '--transpile-only', 'src/index.ts']
    : [];

  const env = { // Custom environment variables mapping configuration parameters passed to the backend daemon.
    ...process.env,
    EXEGGUTOR_BACKEND_PORT: String(backendPort),
    EXEGGUTOR_FRONTEND_DIST: resolve(root, 'packages', 'frontend', 'dist'),
  };

  const backendLog = resolve(logDir, 'backend.log');
  if (!existsSync(backendLog)) writeFileSync(backendLog, '', 'utf8');

  let child;

  if (IS_WIN) {
    // Windows: write a batch script to execute node with redirection,
    // then use VBS script to run it hidden and detached.
    const batPath = resolve(os.tmpdir(), 'exeggutor-launch.bat'); // Absolute path to the temporary launcher batch script.
    const batContent = `@echo off\n"${process.execPath}" "${entry}" ${backendArgs.join(' ')} >> "${backendLog}" 2>&1`; // Command execution content redirecting logs.
    writeFileSync(batPath, batContent, 'utf8');

    const vbsScript = `
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c ""${batPath}""", 0, False
`; // Script block running the launcher batch file hidden.
    const vbsPath = resolve(os.tmpdir(), 'exeggutor-launch.vbs'); // Absolute path to the temporary VBScript launcher file.
    writeFileSync(vbsPath, vbsScript.trim(), 'utf8');
    const { exec: execCmd } = require('child_process'); // Reference to child_process exec function.
    execCmd(`start /b "" wscript.exe "${vbsPath}"`, {
      windowsHide: true,
      env,
    }); // Launches wscript using the Windows start command to break away from the job object.
    // Wait a moment for the backend to start, then try to find its PID via netstat
    config.backendPid = null; // Will be populated if we can detect it
    // Try to find the PID by scanning port
    setTimeout(() => {
      try {
        const result = execSync(`netstat -ano | findstr ":${backendPort}"`, { encoding: 'utf8', timeout: 5000 });
        const lines = result.trim().split('\n').filter(l => l.includes('LISTENING'));
        if (lines.length > 0) {
          const parts = lines[0].trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(pid) && pid > 0) {
            config.backendPid = pid;
            // Persist the discovered PID
            const fs2 = require('fs');
            const cfgPath = resolve(os.homedir(), '.exeggutor.json');
            try {
              const cfg = JSON.parse(fs2.readFileSync(cfgPath, 'utf8'));
              cfg.backendPid = pid;
              fs2.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
            } catch {}
          }
        }
      } catch {}
    }, 3000);

    return { backendPid: null, frontendPid: null };
  }

  // Unix: standard detached spawn
  child = spawn(process.execPath, [entry, ...backendArgs], {
    cwd: backendPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  const fs = require('fs');
  const stream = fs.createWriteStream(backendLog, { flags: 'a' });
  if (child.stdout) child.stdout.pipe(stream);
  if (child.stderr) child.stderr.pipe(stream);
  child.unref();

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
