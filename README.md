<p align="center">
  <img src="assets/Dashboard.png" alt="Exeggutor Dashboard" width="100%">
</p>

<p align="center">
  <strong>Exeggutor</strong> — <em>Terminal Multiplexer & Git Worktree Manager</em><br>
  Local-first, subscription-free workspace orchestration dashboard.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-339933?logo=node.js&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/typescript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/react-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="License">
</p>

---

## Features

| | |
|---|---|
| **Multi-Workspace Engine** | Switch projects and automatically swap terminal grids, paths, and configurations. |
| **Tabbed Terminal Grid** | Spawn unlimited terminals, split horizontally/vertically, persist sessions across restarts. |
| **Observer Sidebar** | Real-time terminal state monitoring (Active, Waiting, Idle, Errored) with live text previews. |
| **Git Worktree Isolation** | Run terminals inside branch-isolated worktree folders — no checkout overhead, no conflicts. |

---

## Screenshots

### Workspace Management

<p align="center">
  <img src="assets/Workspaces.png" alt="Workspace Selector" width="70%">
</p>

Switch between registered workspaces, each with its own terminal grid, path mapping, and branch configuration.

### Git Branch Selector

<p align="center">
  <img src="assets/Branches.png" alt="Branch Selector" width="70%">
</p>

Create and switch branches per-terminal. New branches automatically spin up an isolated git worktree — zero context switching.

### Zero-State Onboarding

<p align="center">
  <img src="assets/ZeroState.png" alt="Zero State" width="60%">
</p>

A clean welcome screen guides you through registering your first workspace and getting started in seconds.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Exeggutor CLI                      │
│  (bin/exeggutor.js — server lifecycle, flags)         │
└──────────┬──────────────────────────────────────────┘
           │ starts / stops
┌──────────▼──────────────────────────────────────────┐
│                  Backend (Fastify)                    │
│  Node.js + Fastify + WebSocket + node-pty           │
│  ┌──────────┐ ┌──────────┐ ┌────────────────────┐   │
│  │  Workspace│ │  PTY    │ │  Git Worktree      │   │
│  │  Manager  │ │  Manager │ │  Manager           │   │
│  └──────────┘ └──────────┘ └────────────────────┘   │
└──────────┬──────────────────────────────────────────┘
           │ HTTP / WebSocket (127.0.0.1:17492)
┌──────────▼──────────────────────────────────────────┐
│                 Frontend (Vite + React)               │
│  xterm.js · react-mosaic-component · Tailwind CSS   │
│  Terminal Grid · Observer Sidebar · Branch UI       │
└─────────────────────────────────────────────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| Frontend | Vite · React · TypeScript · Tailwind CSS · xterm.js · react-mosaic-component |
| Backend | Node.js · Fastify · Fastify WebSocket · node-pty |
| State | Local JSON persistent sessions |

---

## Getting Started

```bash
# Install globally
npm install -g exeggutor

# Start the dashboard
exeggutor

# Open in browser
exeggutor --open

# Stop the server
exeggutor --stop

# Check server status
exeggutor --status
```

Once the dashboard loads, register a project directory with a name and path, and you're ready to go.

---

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding conventions, comment rules, and local-first principles.

```bash
# Build all packages
npm run build

# Start in development mode
npm run dev
```
