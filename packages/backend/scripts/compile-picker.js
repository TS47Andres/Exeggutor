const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SOURCES = [ // C# source files to compile into native helpers.
  { src: 'FolderPicker.cs', out: 'FolderPicker.exe', desc: 'Folder picker' },
  { src: 'PtyHost.cs', out: 'PtyHost.exe', desc: 'PTY host' },
];

const windir = process.env.windir || 'C:\\Windows'; // Windows directory, defaulting to C:\Windows.
const CSC_PATHS = [ // Candidate paths for the C# compiler executable.
  path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];

// Locates the C# compiler executable from the known .NET Framework SDK paths.
function findCsc() {
  return CSC_PATHS.find(p => fs.existsSync(p));
}

// Compiles each native C# source file into a winexe binary.
function compileAll() {
  const csc = findCsc(); // The located csc.exe path, or undefined if not found.

  if (!csc) {
    console.error(
      'Warning: C# compiler (csc.exe) not found.\n' +
      'The Browse folder button and PTY window suppression will not be available.\n' +
      'Install .NET Framework SDK or use Visual Studio Build Tools to enable them.\n' +
      'You can still type workspace paths manually.'
    );
    return false;
  }

  const outDir = path.join(__dirname, '..', 'bin'); // Parent directory for the output binaries.

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let allSuccess = true;

  for (const entry of SOURCES) {
    const srcPath = path.join(__dirname, '..', 'native', entry.src); // Full path to the C# source file.
    const outPath = path.join(outDir, entry.out); // Full path for the compiled binary.

    if (!fs.existsSync(srcPath)) {
      console.error(`Warning: ${entry.src} not found, skipping.`);
      allSuccess = false;
      continue;
    }

    try {
      execFileSync(csc, [
        '/nologo',
        '/target:winexe',
        '/platform:anycpu',
        `/out:${outPath}`,
        srcPath,
      ], { stdio: 'inherit' });

      console.log(`${entry.desc} compiled successfully: ${outPath}`);
    } catch (err) {
      console.error(`Failed to compile ${entry.desc}:`, err.message);
      allSuccess = false;
    }
  }

  return allSuccess;
}

compileAll();
