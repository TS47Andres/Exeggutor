Contribution Guidelines
Welcome to the project. To maintain high code quality and strict structural alignment, all contributions must follow the guidelines detailed below. Violating these guidelines will result in rejected code reviews. These rules apply to every TypeScript file in this repository.

1. Strict Comment Pragmatism (No Historical Commemorations)
Do not write comments detailing the history, modifications, or reason for changes (e.g., // Changed this from map to filter because of performance).

Comments must exclusively express what the code is currently doing right now and state technical realities as they stand.

2. The One-Line Function Requirement
Directly above every single function declaration, you must write a single-line comment detailing its precise entry prerequisites, expected behavior, or return conditions.

Example:

TypeScript
// Estimates the input token count of the supplied message using a character-to-token heuristic plus a fudge factor.
function estimateInputTokens(message: Message): number { ... }

## 3. Inline Variable Documentation

- Immediately following **every single** non-trivial variable declaration, you must add an inline comment explaining what the reference represents or handles, unless the assignment is an obvious utility tracker (like a loop index `i`).
- **Example:**

  ```typescript
  const activeSandboxes = new Map<string, SandboxSession>(); // Maps chat ids to their live SandboxSession objects.
4. Local Execution and Data Integrity
The application must remain 100% free of external cloud infrastructure, analytical tracking, or remote telemetry layers. The only outbound network egress permitted from the server is to the authorized API endpoints and admin-registered MCP servers.

All state persistence happens locally: Postgres + MinIO on the server, SQLite + OS keychain on the desktop client.

The desktop client must not call any third-party SDK. No Sentry, no PostHog, no Mixpanel, no Datadog RUM, no Amplitude. This rule has zero exceptions.

5. Zero Emojis Anywhere
No emojis in code, comments, copy, audit labels, error messages, in-app strings, commit messages, PR titles, PR descriptions, issue titles, or test names.

The repository's ESLint configuration includes a custom rule that fails on emoji unicode ranges; the commitlint configuration applies the same rule to commit messages. Both run in CI and on the pre-commit hook.

Where another product would use an emoji glyph (a clip icon for attachments, a magnifying-glass icon for search), this project uses a Lucide React icon at the size and stroke conventions defined in DESIGN_SYSTEM.md.

6. Icon and Font Discipline
The only icon library permitted is lucide-react. Imports of any other icon library are blocked by ESLint.

The only font families permitted in product surfaces are Inter Variable and JetBrains Mono Variable, self-hosted. The product never makes a network request to external font hosting services like Google Fonts.

The full design system rules are documented in DESIGN_SYSTEM.md. Pull requests that violate the design system are rejected without further review.

7. Commit Conventions
Conventional Commits format. Allowed types: feat, fix, chore, docs, refactor, test, perf, build, ci.

Commit message subject line maximum 72 characters.

Bodies must use complete sentences and end with periods.

No emojis. No Gitmoji shortcodes either (e.g., :rocket:).

8. Code Review Checklist
Every PR description includes the following checklist that the reviewer ticks before approving:

[ ] One-line comment above every new function declaration

[ ] Inline comment after every new non-trivial variable declaration

[ ] No historical comments

[ ] No emoji unicode introduced anywhere

[ ] No new icon library import

[ ] No new external SDK or telemetry import

[ ] No new dependency on external font APIs

[ ] All new tests pass and the affected app typechecks

9. Branch and Merge
Default branch: main.

Feature branches: phase-N/short-slug (for example, phase-1/api-proxy).

Squash merges only. The squash commit message must be a valid Conventional Commit.

Tags: vX.Y.Z. The desktop release workflow and the server image workflow are both gated on a tag matching v*.