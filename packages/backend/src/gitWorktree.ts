import { exec, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Validates git branch names to prevent command injection and ensure compliance with git rules.
export function validateBranchName(branch: string): void {
  const cleanPattern = /^[a-zA-Z0-9-_./@]+$/; // Pattern matching safe git branch characters.
  if (!branch || !cleanPattern.test(branch)) {
    throw new Error('Invalid branch name. Only alphanumeric, dashes, underscores, dots, slashes, and @ are permitted.');
  }
}

// Helper function that executes a terminal command asynchronously and returns its stdout.
export function execAsync(command: string, cwd: string): Promise<string> {
  console.log(`[GIT] execAsync(command="${command}", cwd="${cwd}")`);
  const p = new Promise<string>((resolve, reject) => {
    const child = exec(command, { cwd, windowsHide: true }, (error, stdout, stderr) => {
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
  console.log(`[GIT] setupGitWorktree(repoPath="${repoPath}", branch="${branch}")`);
  validateBranchName(branch);
  const resolvedRepo = path.resolve(repoPath); // Resolved absolute parent repository path.
  const isGit = await isGitRepository(resolvedRepo); // Check flag verifying if the path is a git repo.
  if (!isGit) {
    throw new Error('Target folder is not a valid Git repository');
  }

  console.log(`[GIT] setupGitWorktree: checking existing worktrees for branch="${branch}"`);
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
  const worktreePath = path.join(resolvedRepo, '.exeggutor-worktrees', sanitizedBranch); // Path to host the worktree outside the hidden git directory.
  const worktreeParent = path.dirname(worktreePath); // Parent directory of the target worktree path.

  if (!fs.existsSync(worktreeParent)) {
    fs.mkdirSync(worktreeParent, { recursive: true });
  }

  // Ensure .exeggutor-worktrees is ignored in git.
  const gitignorePath = path.join(resolvedRepo, '.gitignore'); // Path to workspace gitignore file.
  const ignorePattern = '.exeggutor-worktrees/'; // Pattern to ignore.
  try {
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8'); // Loaded gitignore content.
      if (!gitignoreContent.includes(ignorePattern)) {
        const finalContent = gitignoreContent.endsWith('\n') || gitignoreContent.length === 0
          ? gitignoreContent + ignorePattern + '\n'
          : gitignoreContent + '\n' + ignorePattern + '\n'; // Structured appended content.
        fs.writeFileSync(gitignorePath, finalContent, 'utf8');
      }
    } else {
      fs.writeFileSync(gitignorePath, ignorePattern + '\n', 'utf8');
    }
  } catch (_) {
    // Safe ignore ignore-write errors.
  }

  if (fs.existsSync(worktreePath)) {
    console.log(`[GIT] setupGitWorktree: worktree path already exists at "${worktreePath}"`);
    const pathExistsResult = worktreePath; // Returns the existing path directly if the worktree directory is already present.
    return pathExistsResult;
  }

  const branches = await getBranches(resolvedRepo); // Fetch the list of local branches.
  const branchExists = branches.includes(branch); // Flag indicating if the requested branch exists locally.

  if (branchExists) {
    console.log(`[GIT] setupGitWorktree: adding existing branch "${branch}" to worktree`);
    await execAsync(`git worktree add "${worktreePath}" "${branch}"`, resolvedRepo);
  } else {
    console.log(`[GIT] setupGitWorktree: creating new branch "${branch}" with worktree`);
    await execAsync(`git worktree add -b "${branch}" "${worktreePath}"`, resolvedRepo);
  }
  console.log(`[GIT] setupGitWorktree: done, path="${worktreePath}"`);

  const finalPath = worktreePath; // Path of the newly created worktree.
  return finalPath;
}

// Removes a git worktree and prunes the worktree directory reference.
export async function removeGitWorktree(repoPath: string, worktreePath: string): Promise<void> {
  console.log(`[GIT] removeGitWorktree(repoPath="${repoPath}", worktreePath="${worktreePath}")`);
  const resolvedRepo = path.resolve(repoPath); // Resolved absolute repository path.
  const isGit = await isGitRepository(resolvedRepo); // Verification flag.
  if (!isGit) {
    console.log(`[GIT] removeGitWorktree: "${resolvedRepo}" is not a git repo, skipping`);
    return;
  }
  const normalizedWorktreePath = path.resolve(worktreePath); // Normalized path of the target worktree.
  let retries = 5; // Maximum retries count for lock back-off.
  while (retries > 0) {
    try {
      console.log(`[GIT] removeGitWorktree: running "git worktree remove --force" (attempt ${6 - retries})`);
      await execAsync(`git worktree remove --force "${normalizedWorktreePath}"`, resolvedRepo);
      console.log(`[GIT] removeGitWorktree: remove OK`);
      break;
    } catch (err) {
      console.log(`[GIT] removeGitWorktree: remove attempt ${6 - retries} failed: ${err}`);
      retries--;
      if (retries === 0) {
        // Final fallback skip.
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  console.log(`[GIT] removeGitWorktree: pruning worktrees`);
  await execAsync('git worktree prune', resolvedRepo);
  console.log(`[GIT] removeGitWorktree: done`);
}

// Creates a new Git branch in the specified repository.
export async function createBranch(repoPath: string, branchName: string): Promise<void> {
  console.log(`[GIT] createBranch(repoPath="${repoPath}", branchName="${branchName}")`);
  validateBranchName(branchName);
  const resolvedRepo = path.resolve(repoPath); // Resolved absolute repository path.
  const isGit = await isGitRepository(resolvedRepo); // Verification flag.
  if (!isGit) {
    throw new Error('Target folder is not a valid Git repository');
  }
  await execAsync(`git branch "${branchName}"`, resolvedRepo);
  console.log(`[GIT] createBranch: branch "${branchName}" created`);
}

// Mutex flag preventing more than one concurrent folder picker dialog.
let pickerInFlight = false;

// Opens a native folder picker dialog using platform-specific tools.
// Windows: compiled FolderPicker.exe (C#/.NET) using FolderBrowserDialog.
// macOS: osascript with choose folder AppleScript command.
// Linux: zenity --file-selection, with kdialog as a fallback.
// Returns the selected path, or an empty string if the user cancelled.
export async function showFolderPicker(): Promise<string> {
  // Guard: reject concurrent requests — only one picker dialog at a time.
  if (pickerInFlight) {
    return ''; // A dialog is already open; silently return empty.
  }
  pickerInFlight = true;

  try {
    const platform = os.platform();

    if (platform === 'win32') {
      const binaryPath = path.join(__dirname, '..', 'bin', 'FolderPicker.exe');
      const resolvedPath = path.resolve(binaryPath);

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(
          `Native folder picker not available (not found at ${resolvedPath}). ` +
          'Type the workspace path manually.'
        );
      }

      return await new Promise<string>((resolve, reject) => {
        const child = spawn(resolvedPath, [], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: false, // Show the dialog window.
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        child.on('close', (code: number | null) => {
          if (code === 0) {
            resolve(stdout.trim()); // Path selected.
          } else if (code === 2) {
            resolve(''); // User cancelled — not an error.
          } else {
            const errMsg = stderr.trim() || `Folder picker exited with code ${code}`;
            reject(new Error(errMsg));
          }
        });

        child.on('error', (err: Error) => {
          reject(new Error(`Failed to launch folder picker: ${err.message}`));
        });
      });
    }

    if (platform === 'darwin') {
      // osascript exits with code 1 and stderr containing 'User canceled.' on cancel.
      return await new Promise<string>((resolve, reject) => {
        const child = spawn('osascript', [
          '-e',
          'POSIX path of (choose folder with prompt "Select workspace folder")'
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        child.on('close', (code: number | null) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else if (stderr.toLowerCase().includes('user canceled') || stderr.toLowerCase().includes('cancelled')) {
            resolve(''); // User dismissed the dialog.
          } else {
            reject(new Error('Failed to open macOS folder picker. Type the workspace path manually.'));
          }
        });
        child.on('error', () => {
          reject(new Error('osascript not found. Type the workspace path manually.'));
        });
      });
    }

    // Linux: zenity exits 0 on OK, 1 on cancel. kdialog exits 0 on OK, 1 on cancel.
    try {
      return await new Promise<string>((resolve, reject) => {
        const child = spawn('zenity', [
          '--file-selection', '--directory',
          '--title=Select workspace folder'
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        child.on('close', (code: number | null) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            resolve(''); // code 1 = cancel (or dismiss), not an error.
          }
        });
        child.on('error', (_err: Error) => {
          reject(new Error('zenity_not_found'));
        });
      });
    } catch (err1: any) {
      // zenity not installed — try kdialog (KDE).
      try {
        return await new Promise<string>((resolve, reject) => {
          const child = spawn('kdialog', [
            '--getexistingdirectory',
            '--title', 'Select workspace folder'
          ], { stdio: ['ignore', 'pipe', 'pipe'] });
          let stdout = '';
          child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
          child.on('close', (code: number | null) => {
            if (code === 0) {
              resolve(stdout.trim());
            } else {
              resolve(''); // code 1 = cancel.
            }
          });
          child.on('error', (_err: Error) => {
            reject(new Error('kdialog_not_found'));
          });
        });
      } catch (err2: any) {
        throw new Error(
          'Folder picker not available. Install zenity (GNOME) or kdialog (KDE), ' +
          'or type the workspace path manually.'
        );
      }
    }
  } finally {
    pickerInFlight = false; // Always release the lock.
  }
}

