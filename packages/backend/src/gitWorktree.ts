import { exec, spawn } from 'child_process';
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

  // Check if the branch is already checked out in any worktree (including the main repository).
  const worktreeListOutput = await execAsync('git worktree list --porcelain', resolvedRepo); // Porcelain worktree list output.
  const worktreeLines = worktreeListOutput.split('\n'); // Split by lines.
  let currentWorktreePath = resolvedRepo; // Holds the path of the current worktree being processed.
  for (const line of worktreeLines) {
    if (line.startsWith('worktree ')) {
      currentWorktreePath = line.substring(9).trim(); // Extract path.
    } else if (line.startsWith('branch ')) {
      const ref = line.substring(7).trim(); // Extract branch ref.
      if (ref === `refs/heads/${branch}`) {
        const foundWorktreePath = path.resolve(currentWorktreePath); // Found matching worktree path.
        return foundWorktreePath;
      }
    }
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

// Spawns the compiled native folder picker binary (FolderPicker.exe).
// Uses .NET OpenFileDialog (modern Vista-style IFileOpenDialog on Win10/11).
// No PowerShell, no cmd.exe, no shell launching involved.
export async function showFolderPicker(): Promise<string> {
  const binaryPath = path.join(__dirname, '..', 'bin', 'FolderPicker.exe');
  const resolvedPath = path.resolve(binaryPath);

  console.log(`[showFolderPicker] __dirname=${__dirname}`);
  console.log(`[showFolderPicker] binaryPath=${resolvedPath}`);
  console.log(`[showFolderPicker] binary exists=${fs.existsSync(resolvedPath)}`);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Native folder picker not available (not found at ${resolvedPath}). ` +
      'Run the compile script (npm run compile-picker) to build it, ' +
      'or type the workspace path manually.'
    );
  }

  return new Promise<string>((resolve, reject) => {
    console.log(`[showFolderPicker] spawning...`);
    const child = spawn(resolvedPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });

    let stdout = '';
    let stderr = '';

    child.on('spawn', () => {
      console.log(`[showFolderPicker] process spawned, pid=${child.pid}`);
    });

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        const trimmed = stdout.trim();
        console.log(`[showFolderPicker] success, path="${trimmed}"`);
        resolve(trimmed);
      } else {
        const errMsg = stderr.trim() || `Folder picker exited with code ${code}`;
        console.error(`[showFolderPicker] failed: ${errMsg}`);
        reject(new Error(errMsg));
      }
    });

    child.on('error', (err: Error) => {
      console.error(`[showFolderPicker] spawn error: ${err.message}`);
      reject(new Error(`Failed to launch folder picker: ${err.message}`));
    });
  });
}
