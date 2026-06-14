#!/usr/bin/env node

// Exeggutor CLI entry point.
// Parses command-line arguments and dispatches to the appropriate handler.

const { resolve } = require('path');
const { existsSync, readFileSync } = require('fs');
const cli = require('../src/cli');

// Resolve the package root to locate workspaces and config.
const ROOT = resolve(__dirname, '..');

// Determine the active config from home directory.
const CONFIG_PATH = resolve(require('os').homedir(), '.exeggutor.json');

const args = process.argv.slice(2);
const first = args[0] || '';

// --version
if (first === '--version' || first === '-v') {
  cli.showVersion(ROOT);
  process.exit(0);
}

// --help
if (first === '--help' || first === '-h') {
  cli.showHelp();
  process.exit(0);
}

// --start (default if no recognized flag or no args)
if (first === '--start' || !first || (first && !first.startsWith('--'))) {
  const passive = first === '--start';
  const extraArgs = passive ? args.slice(1) : args;
  cli.startServers(ROOT, CONFIG_PATH, extraArgs).catch(err => {
    console.error('Fatal error starting servers:', err.message);
    process.exit(1);
  });
  return;
}

// --stop / --kill
if (first === '--stop' || first === '--kill') {
  cli.stopServers(CONFIG_PATH);
  process.exit(0);
}

// --restart
if (first === '--restart') {
  cli.restartServers(ROOT, CONFIG_PATH).catch(err => {
    console.error('Fatal error restarting servers:', err.message);
    process.exit(1);
  });
  return;
}

// --status
if (first === '--status' || first === '-s') {
  cli.showStatus(CONFIG_PATH).catch(err => {
    console.error('Failed to get status:', err.message);
    process.exit(1);
  });
  return;
}

// --open
if (first === '--open') {
  cli.openDashboard(CONFIG_PATH).catch(err => {
    console.error('Failed to open dashboard:', err.message);
    process.exit(1);
  });
  return;
}

// --log
if (first === '--log') {
  cli.showLogs(CONFIG_PATH);
  process.exit(0);
}

// --workspaces
if (first === '--workspaces' || first === '-w') {
  cli.listWorkspaces(CONFIG_PATH).catch(err => {
    console.error('Failed to list workspaces:', err.message);
    process.exit(1);
  });
  return;
}

// --terminals <workspace-hash>
if (first === '--terminals') {
  const wsHash = args[1];
  if (!wsHash) {
    console.error('Usage: exeggutor --terminals <workspace-hash>');
    process.exit(1);
  }
  cli.listTerminals(CONFIG_PATH, wsHash).catch(err => {
    console.error('Failed to list terminals:', err.message);
    process.exit(1);
  });
  return;
}

// --create-workspace <name> <path>
if (first === '--create-workspace') {
  const name = args[1];
  const wsPath = args[2];
  if (!name || !wsPath) {
    console.error('Usage: exeggutor --create-workspace <name> <absolute-path>');
    process.exit(1);
  }
  cli.createWorkspace(CONFIG_PATH, name, wsPath).catch(err => {
    console.error('Failed to create workspace:', err.message);
    process.exit(1);
  });
  return;
}

// --add-terminal <workspace-hash> <name>
if (first === '--add-terminal') {
  const wsHash = args[1];
  const termName = args[2] || `Terminal`;
  if (!wsHash) {
    console.error('Usage: exeggutor --add-terminal <workspace-hash> [name]');
    process.exit(1);
  }
  cli.addTerminal(CONFIG_PATH, wsHash, termName).catch(err => {
    console.error('Failed to add terminal:', err.message);
    process.exit(1);
  });
  return;
}

// --rename <workspace-hash> <terminal-hash> <new-name>
if (first === '--rename') {
  const wsHash = args[1];
  const termHash = args[2];
  const newName = args[3];
  if (!wsHash || !termHash || !newName) {
    console.error('Usage: exeggutor --rename <workspace-hash> <terminal-hash> <new-name>');
    process.exit(1);
  }
  cli.renameTerminal(CONFIG_PATH, wsHash, termHash, newName).catch(err => {
    console.error('Failed to rename terminal:', err.message);
    process.exit(1);
  });
  return;
}

// --close <workspace-hash> <terminal-name-or-hash>
if (first === '--close') {
  const wsHash = args[1];
  const termId = args[2];
  if (!wsHash || !termId) {
    console.error('Usage: exeggutor --close <workspace-hash> <terminal-name-or-hash>');
    process.exit(1);
  }
  cli.closeTerminal(CONFIG_PATH, wsHash, termId).catch(err => {
    console.error('Failed to close terminal:', err.message);
    process.exit(1);
  });
  return;
}

// --delete-workspace <workspace-hash>
if (first === '--delete-workspace') {
  const wsHash = args[1];
  if (!wsHash) {
    console.error('Usage: exeggutor --delete-workspace <workspace-hash>');
    process.exit(1);
  }
  cli.deleteWorkspace(CONFIG_PATH, wsHash).catch(err => {
    console.error('Failed to delete workspace:', err.message);
    process.exit(1);
  });
  return;
}

// --install-service
if (first === '--install-service') {
  cli.installAutostart(ROOT).catch(err => {
    console.error('Failed to install autostart service:', err.message);
    process.exit(1);
  });
  return;
}

// --remove-service
if (first === '--remove-service') {
  cli.removeAutostart().catch(err => {
    console.error('Failed to remove autostart service:', err.message);
    process.exit(1);
  });
  return;
}

// Unknown command
console.error(`Unknown command: ${first}`);
console.error('Run "exeggutor --help" for usage information.');
process.exit(1);
