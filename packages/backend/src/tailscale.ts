import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

// Describes the parsed result of `tailscale status --json` for the local node.
export interface TailscaleInfo {
  ip: string; // Tailscale IPv4 address of the local machine.
  dnsName: string; // MagicDNS hostname (e.g. "hostname.tailnet.ts.net").
  online: boolean; // Whether this node is currently connected to the tailnet.
  tailnetName: string; // Human-readable tailnet name from status.
}

// Resolved path to the tailscale binary, or null if not found.
let _tailscalePath: string | null | undefined = undefined;

// Common installation paths for the tailscale CLI across platforms.
function getCommonTailscalePaths(): string[] {
  const platform = os.platform(); // Operating system identifier.
  const paths: string[] = [];
  if (platform === 'win32') {
    paths.push('C:\\Program Files\\Tailscale\\tailscale.exe');
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    if (programFilesX86) {
      paths.push(path.join(programFilesX86, 'Tailscale', 'tailscale.exe'));
    }
  } else if (platform === 'darwin') {
    paths.push('/Applications/Tailscale.app/Contents/MacOS/Tailscale');
    paths.push('/usr/local/bin/tailscale');
  } else {
    paths.push('/usr/bin/tailscale');
    paths.push('/usr/local/bin/tailscale');
    paths.push('/opt/tailscale/tailscale');
  }
  return paths;
}

// Locates the tailscale binary by checking common install paths in addition to PATH.
function findTailscaleBinary(): string | null {
  if (_tailscalePath !== undefined) {
    return _tailscalePath;
  }
  try {
    execSync('tailscale version', { stdio: 'ignore', timeout: 3000 });
    _tailscalePath = 'tailscale';
    return _tailscalePath;
  } catch {
    // Not in PATH, check common install locations.
  }
  for (const candidate of getCommonTailscalePaths()) {
    if (existsSync(candidate)) {
      _tailscalePath = candidate;
      return _tailscalePath;
    }
  }
  _tailscalePath = null;
  return null;
}

// Returns true if the `tailscale` CLI binary is found on the system.
export function isTailscaleInstalled(): boolean {
  return findTailscaleBinary() !== null;
}

// Resolves the tailscale CLI binary path for executing commands.
function tailscaleBin(): string {
  const bin = findTailscaleBinary(); // Located tailscale binary path.
  if (!bin) {
    throw new Error('Tailscale CLI not found');
  }
  return bin;
}

// Parses the local node state from `tailscale status --json`.
// Returns null if Tailscale is not running or the binary is unavailable.
export function getTailscaleInfo(): TailscaleInfo | null {
  if (!isTailscaleInstalled()) {
    return null;
  }
  try {
    const raw = execSync(`"${tailscaleBin()}" status --json`, {
      encoding: 'utf8',
      timeout: 5000,
    }); // Raw JSON output from the tailscale status command.

    const parsed = JSON.parse(raw); // Parsed status payload from the tailscale daemon.

    const self = parsed.Self; // The local node descriptor from the status object.
    if (!self) {
      return null;
    }

    const ipv4 = (self.TailscaleIPs || []).find((addr: string) =>
      addr.startsWith('100.')
    ) as string | undefined; // First 100.x.x.x Tailscale IP assigned to this node.

    const dnsNameRaw = self.DNSName || ''; // Raw DNS name with trailing dot.
    const dnsName = dnsNameRaw.replace(/\.$/, ''); // Strip the trailing dot.

    const tailnetName = dnsName.split('.').slice(1).join('.') || 'unknown'; // Tailnet identifier extracted from the DNS name.

    return {
      ip: ipv4 || 'unknown',
      dnsName: dnsName || 'unknown',
      online: self.Online !== false,
      tailnetName,
    };
  } catch {
    return null;
  }
}

// Returns the Tailscale IPv4 address of this node, or null if unavailable.
export function getTailscaleIP(): string | null {
  const info = getTailscaleInfo(); // Parsed Tailscale status for the local node.
  return info ? info.ip : null;
}

// Returns the MagicDNS hostname (e.g. "mybox.tailnet.ts.net") or null.
export function getMagicDNSName(): string | null {
  const info = getTailscaleInfo(); // Parsed Tailscale status for the local node.
  return info ? info.dnsName : null;
}

// Returns the full URL to access Exeggutor via Tailscale, or null.
export function getTailscaleURL(port: number): string | null {
  const dnsName = getMagicDNSName(); // MagicDNS hostname of the local node.
  if (dnsName) {
    return `https://${dnsName}:${port}`;
  }
  const ip = getTailscaleIP(); // Tailscale IP of the local node.
  if (ip) {
    return `http://${ip}:${port}`;
  }
  return null;
}


