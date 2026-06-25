const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// FolderPicker is Windows-only; skip silently on other platforms.
if (process.platform !== 'win32') {
  process.exit(0);
}

const SOURCE = path.join(__dirname, '..', 'native', 'FolderPicker.cs'); // Path to the C# source file.
const OUTPUT = path.join(__dirname, '..', 'bin', 'FolderPicker.exe'); // Output path for the compiled binary.

const windir = process.env.windir || 'C:\\Windows'; // Windows directory, defaulting to C:\Windows.
const CSC_PATHS = [ // Candidate paths for the C# compiler executable.
  path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];

// Locates the C# compiler executable from the known .NET Framework SDK paths.
function findCsc() {
  return CSC_PATHS.find(p => fs.existsSync(p));
}

// Compiles FolderPicker.cs into a winexe binary using the .NET Framework C# compiler.
function compile() {
  const csc = findCsc(); // The located csc.exe path, or undefined if not found.

  if (!csc) {
    console.error(
      'Warning: C# compiler (csc.exe) not found.\n' +
      'The Browse folder button will not be available.\n' +
      'Install .NET Framework SDK or use Visual Studio Build Tools to enable it.\n' +
      'You can still type workspace paths manually.'
    );
    return false;
  }

  const outDir = path.dirname(OUTPUT); // Parent directory for the output binary.

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    execFileSync(csc, [
      '/nologo',
      '/target:winexe',
      '/platform:anycpu',
      `/out:${OUTPUT}`,
      SOURCE,
    ], { stdio: 'inherit' });

    console.log(`Folder picker compiled successfully: ${OUTPUT}`);
    return true;
  } catch (err) {
    console.error('Failed to compile folder picker:', err.message);
    return false;
  }
}

compile();
