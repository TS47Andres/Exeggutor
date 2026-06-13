# Omnishell Multiplexer (Exeggutor)

Omnishell Multiplexer is a subscription-free, local-first web app that acts as an orchestration dashboard for multiple code workspaces. It supports side-by-side terminal grids, session persistence, a global observer sidebar, and Git branch isolation via native worktrees.

## Features
1. **Multi-Workspace Engine**: Switch projects and automatically change terminal grids, target paths, and workspace configurations.
2. **Tabbed Terminal Grid**: Spawn infinite terminals, split them horizontally/vertical using `react-mosaic-component`, and persist sessions when the window closes.
3. **Observer Sidebar**: Monitor workspace and terminal states (Active, Waiting, Idle, Errored) along with real-time text previews.
4. **Git Worktree Isolation**: Run terminal sessions inside branch-isolated git worktree folders without standard checkout overhead.

## Architecture
- **Frontend**: Vite + React + TypeScript + Tailwind CSS + xterm.js + react-mosaic-component
- **Backend**: Node.js + Fastify + Fastify WebSocket + node-pty

## Getting Started
See the [CONTRIBUTING.md](CONTRIBUTING.md) for coding and documentation rules.
