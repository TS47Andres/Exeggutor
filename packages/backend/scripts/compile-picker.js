const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'native', 'FolderPicker.cs');
const OUTPUT = path.join(__dirname, '..', 'bin', 'FolderPicker.exe');

const windir = process.env.windir || 'C:\\Windows';
const CSC_PATHS = [
  path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];

function findCsc() {
  return CSC_PATHS.find(p => fs.existsSync(p));
}

function compile() {
  const csc = findCsc();
  if (!csc) {
    console.error(
      'Warning: C# compiler (csc.exe) not found.\n' +
      'The Browse folder button will not be available.\n' +
      'Install .NET Framework SDK or use Visual Studio Build Tools to enable it.\n' +
      'You can still type workspace paths manually.'
    );
    return false;
  }

  const outDir = path.dirname(OUTPUT);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    execFileSync(csc, [
      '/nologo',
      '/target:winexe',
      '/platform:anycpu',
      `/out:${OUTPUT}`,
      '/r:System.Windows.Forms.dll',
      '/r:System.dll',
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
