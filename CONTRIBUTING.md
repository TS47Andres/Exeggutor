# Contribution Guidelines - Omnishell Multiplexer

Welcome to the **Omnishell Multiplexer** project (codename `Exeggutor`). To maintain high code quality and strict structural alignment, all contributions must follow the guidelines detailed below. Violating these guidelines will result in rejected code reviews.

## 1. Strict Comment Pragmatism (No Historical Commemorations)
*   **Do not** write comments detailing the history, modifications, or reason for changes (e.g., `// Changed this from map to filter because of performance`).
*   Comments must exclusively express what the code is currently doing **right now** and state technical realities as they stand.

## 2. The One-Line Function Requirement
*   Directly above **every single** function declaration, you must write a single-line comment detailing its precise entry prerequisites, expected behavior, or return conditions.
*   **Example:**
    ```typescript
    // Spawns a raw node-pty process configured for the specified working directory.
    function spawnTerminalProcess(cwd: string): PtyProcess { ... }
    ```

## 3. Inline Variable Documentation
*   Immediately following **every single** variable declaration, you must add an inline comment explaining what the reference represents or handles, unless the assignment is an obvious utility tracker (like a loop index `i`).
*   **Example:**
    ```typescript
    const activeSessions = new Map<string, IPty>(); // Maps unique session IDs to their live node-pty process objects.
    ```

## 4. Local Execution & Data Integrity
*   The application must remain 100% free of external cloud infrastructure, analytical tracking, or remote telemetry layers.
*   All state persistence must happen locally via `sessions.json` or SQLite.
*   All Git worktree operations must run using local system commands.
