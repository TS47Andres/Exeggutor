// Exeggutor Autostart Manager.
// Installs or removes system-level auto-start configurations so that
// Exeggutor launches automatically when the user logs in.

const { execSync } = require('child_process');
const { existsSync, writeFileSync, unlinkSync, readFileSync } = require('fs');
const { resolve } = require('os');
const { homedir } = require('os');
const path = require('path');

const PLATFORM = process.platform;

// Installs the auto-start service for the current platform.
async function install(root) {
  const exePath = process.execPath; // Full path to node executable
  const cliPath = path.resolve(root, 'bin', 'exeggutor.js');

  if (PLATFORM === 'win32') {
    await installWindows(exePath, cliPath, root);
  } else if (PLATFORM === 'darwin') {
    await installMacOS(exePath, cliPath, root);
  } else {
    await installLinux(exePath, cliPath, root);
  }
}

// Removes the auto-start service for the current platform.
async function remove() {
  if (PLATFORM === 'win32') {
    await removeWindows();
  } else if (PLATFORM === 'darwin') {
    await removeMacOS();
  } else {
    await removeLinux();
  }
}

// Windows: creates a scheduled task to run on user logon.
async function installWindows(exePath, cliPath, root) {
  const taskName = 'ExeggutorAutoStart';
  const cmd = `schtasks /Create /TN "${taskName}" /TR "${exePath} ${cliPath}" /SC ONLOGON /DELAY 0000:15 /IT /RL HIGHEST /F`;

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`Scheduled task "${taskName}" created for user logon.`);
  } catch (err) {
    // Try without /IT if it fails
    try {
      const fallbackCmd = `schtasks /Create /TN "${taskName}" /TR "${exePath} ${cliPath}" /SC ONLOGON /DELAY 0000:15 /RL HIGHEST /F`;
      execSync(fallbackCmd, { stdio: 'pipe' });
      console.log(`Scheduled task "${taskName}" created.`);
    } catch (innerErr) {
      throw new Error(`Failed to create scheduled task: ${innerErr.stderr ? innerErr.stderr.toString() : innerErr.message}`);
    }
  }
}

// Windows: removes the scheduled task.
async function removeWindows() {
  const taskName = 'ExeggutorAutoStart';
  try {
    execSync(`schtasks /Delete /TN "${taskName}" /F`, { stdio: 'pipe' });
    console.log(`Scheduled task "${taskName}" removed.`);
  } catch (err) {
    throw new Error(`Failed to remove scheduled task: ${err.stderr ? err.stderr.toString() : err.message}`);
  }
}

// macOS: creates a launchd plist in ~/Library/LaunchAgents.
async function installMacOS(exePath, cliPath, root) {
  const plistName = 'com.exeggutor.plist';
  const plistPath = path.resolve(homedir(), 'Library', 'LaunchAgents', plistName);

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.exeggutor</string>
  <key>ProgramArguments</key>
  <array>
    <string>${exePath}</string>
    <string>${cliPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>WorkingDirectory</key>
  <string>${root}</string>
  <key>StandardOutPath</key>
  <string>${homedir()}/.exeggutor-logs/autostart.log</string>
  <key>StandardErrorPath</key>
  <string>${homedir()}/.exeggutor-logs/autostart.log</string>
</dict>
</plist>`;

  writeFileSync(plistPath, plistContent, 'utf8');
  execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
  console.log(`LaunchAgent installed at ${plistPath}`);
}

// macOS: unloads and removes the plist.
async function removeMacOS() {
  const plistName = 'com.exeggutor.plist';
  const plistPath = path.resolve(homedir(), 'Library', 'LaunchAgents', plistName);

  if (existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}"`, { stdio: 'pipe' });
    } catch { /* ok */ }
    unlinkSync(plistPath);
    console.log('LaunchAgent removed.');
  } else {
    console.log('No LaunchAgent found.');
  }
}

// Linux: creates a systemd user service.
async function installLinux(exePath, cliPath, root) {
  const serviceName = 'exeggutor.service';
  const serviceDir = path.resolve(homedir(), '.config', 'systemd', 'user');
  const servicePath = path.resolve(serviceDir, serviceName);

  const unitContent = `[Unit]
Description=Exeggutor Terminal Multiplexer
After=network.target

[Service]
Type=oneshot
ExecStart=${exePath} ${cliPath}
WorkingDirectory=${root}
RemainAfterExit=yes

[Install]
WantedBy=default.target
`;

  if (!existsSync(serviceDir)) {
    require('fs').mkdirSync(serviceDir, { recursive: true });
  }

  writeFileSync(servicePath, unitContent, 'utf8');
  execSync(`systemctl --user daemon-reload`, { stdio: 'pipe' });
  execSync(`systemctl --user enable ${serviceName}`, { stdio: 'pipe' });
  console.log(`Systemd user service installed at ${servicePath}`);
}

// Linux: disables and removes the systemd service.
async function removeLinux() {
  const serviceName = 'exeggutor.service';
  try {
    execSync(`systemctl --user disable ${serviceName}`, { stdio: 'pipe' });
  } catch { /* ok */ }
  const servicePath = path.resolve(homedir(), '.config', 'systemd', 'user', serviceName);
  if (existsSync(servicePath)) {
    unlinkSync(servicePath);
    console.log('Systemd service removed.');
  }
}

module.exports = { install, remove };
