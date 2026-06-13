import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Helper function that executes a terminal command asynchronously and returns its stdout.
export function execAsync(command: string, cwd: string): Promise<string> {
  const p = new Promise<string>((resolve, reject) => {
    const child = exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        const errMsg = stderr || error.message; // Resolves the exact error details from stderr or standard node error.
        reject(new Error(errMsg));
      } else {
        const cleanedOutput = stdout.trim(); // The stripped stdout returned from the execution.
        resolve(cleanedOutput);
      }
    }); // The child process handle spawned for this command run.
  }); // The promise mapping the command execution flow.
  return p;
}

// Verifies if the target directory is a valid git repository.
export async function isGitRepository(folderPath: string): Promise<boolean> {
  try {
    const resolvedPath = path.resolve(folderPath); // Resolved absolute target path string.
    await execAsync('git rev-parse --is-inside-work-tree', resolvedPath);
    const successResult = true; // Flag denoting a valid git workspace.
    return successResult;
  } catch (err) {
    const failResult = false; // Flag denoting an invalid git workspace.
    return failResult;
  }
}

// Retrieves the list of all local git branches available in the repository.
export async function getBranches(folderPath: string): Promise<string[]> {
  const resolvedPath = path.resolve(folderPath); // Resolved absolute target path string.
  const isGit = await isGitRepository(resolvedPath); // Flag verifying if the directory has git initialized.
  if (!isGit) {
    const emptyList: string[] = []; // Initialized empty branches array.
    return emptyList;
  }
  const rawBranches = await execAsync('git branch --format="%(refname:short)"', resolvedPath); // Raw branch string output from command line.
  const branchesList = rawBranches.split('\n').map(b => b.trim()).filter(b => b.length > 0); // Parsed and filtered array of branch names.
  return branchesList;
}

// Sets up a git worktree for a specific branch inside a hidden sub-folder.
export async function setupGitWorktree(repoPath: string, branch: string): Promise<string> {
  const resolvedRepo = path.resolve(repoPath); // Resolved absolute parent repository path.
  const isGit = await isGitRepository(resolvedRepo); // Check flag verifying if the path is a git repo.
  if (!isGit) {
    throw new Error('Target folder is not a valid Git repository');
  }

  const sanitizedBranch = branch.replace(/[^a-zA-Z0-9-_]/g, '_'); // Sanitized branch name to avoid unsafe folder characters.
  const worktreePath = path.join(resolvedRepo, '.git', 'worktrees-app', sanitizedBranch); // Path to host the worktree inside the local git configuration directory.
  const worktreeParent = path.dirname(worktreePath); // Parent directory of the target worktree path.

  if (!fs.existsSync(worktreeParent)) {
    fs.mkdirSync(worktreeParent, { recursive: true });
  }

  if (fs.existsSync(worktreePath)) {
    const pathExistsResult = worktreePath; // Returns the existing path directly if the worktree directory is already present.
    return pathExistsResult;
  }

  const branches = await getBranches(resolvedRepo); // Fetch the list of local branches.
  const branchExists = branches.includes(branch); // Flag indicating if the requested branch exists locally.

  if (branchExists) {
    await execAsync(`git worktree add "${worktreePath}" "${branch}"`, resolvedRepo);
  } else {
    await execAsync(`git worktree add -b "${branch}" "${worktreePath}"`, resolvedRepo);
  }

  const finalPath = worktreePath; // Path of the newly created worktree.
  return finalPath;
}

// Removes a git worktree and prunes the worktree directory reference.
export async function removeGitWorktree(repoPath: string, worktreePath: string): Promise<void> {
  const resolvedRepo = path.resolve(repoPath); // Resolved absolute repository path.
  const isGit = await isGitRepository(resolvedRepo); // Verification flag.
  if (!isGit) {
    return;
  }
  try {
    const normalizedWorktreePath = path.resolve(worktreePath); // Normalized path of the target worktree.
    await execAsync(`git worktree remove --force "${normalizedWorktreePath}"`, resolvedRepo);
  } catch (err) {
    // If the directory was already manually deleted, force prune.
  }
  await execAsync('git worktree prune', resolvedRepo);
}

// Creates a new Git branch in the specified repository.
export async function createBranch(repoPath: string, branchName: string): Promise<void> {
  const resolvedRepo = path.resolve(repoPath); // Resolved absolute repository path.
  const isGit = await isGitRepository(resolvedRepo); // Verification flag.
  if (!isGit) {
    throw new Error('Target folder is not a valid Git repository');
  }
  await execAsync(`git branch "${branchName}"`, resolvedRepo);
}

// Opens a native folder selection dialog on Windows and returns the selected path.
export async function showFolderPicker(): Promise<string> {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$f = New-Object System.Windows.Forms.OpenFileDialog;",
    "$f.Filter = 'Folders|*';",
    "$f.CheckFileExists = $false;",
    "$f.CheckPathExists = $true;",
    "$f.DereferenceLinks = $true;",
    "$f.Multiselect = $false;",
    "$f.Title = 'Select Workspace Folder';",
    "$type = $f.GetType();",
    "$vista = $type.GetMethod('CreateVistaDialog', [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($f, $null);",
    "$type.GetMethod('OnBeforeVistaDialog', [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($f, $vista);",
    "$opt = [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms').GetType('System.Windows.Forms.FileDialogNative+FOS').GetField('FOS_PICKFOLDERS').GetValue($null);",
    "$opts = $type.GetMethod('get_Options', [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($f, $null) -bor $opt;",
    "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms').GetType('System.Windows.Forms.FileDialogNative+IFileDialog').GetMethod('SetOptions', [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($vista, $opts);",
    "if ($type.GetMethod('Show', [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($vista, [IntPtr]::Zero) -eq 0) {",
    "  $res = [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms').GetType('System.Windows.Forms.FileDialogNative+IFileDialog').GetMethod('GetResult', [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($vista, $null);",
    "  $path = $res.GetType().GetMethod('GetDisplayName', [System.Reflection.BindingFlags]'NonPublic,Instance').Invoke($res, 0x80058000);",
    "  Write-Output $path;",
    "}"
  ].join(' '); // Condensed single-line PowerShell commands block.
  const cmd = "powershell -Command \"" + script.replace(/\$/g, '`$') + "\""; // Full PowerShell command line with escaped variables.
  const result = await execAsync(cmd, process.cwd()); // Executed command stdout output.
  return result;
}
