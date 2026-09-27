# Security

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's private reporting instead:
**Security** tab → **Report a vulnerability**. You'll get a reply there.

## Security model

TermiCursor's agent can read and write files and run shell commands on your machine, so:

- **Local API auth.** The desktop app starts its Python backend with a random secret
  generated at each launch (`TERMICURSOR_TOKEN`). Every HTTP and WebSocket request must
  carry it, and requests from any browser origin other than the app itself are rejected.
  This stops web pages and other programs from driving the agent.
- **Approvals.** Every shell command, every file delete, and every write outside the open
  project asks the user first. The optional *Auto-approve shell commands* setting skips the
  prompt for commands that don't match the destructive-command list (`rm`, `del`,
  `git reset --hard`, …); those always ask.
- **Project scope.** File tools and the shell's working directory can't leave the project folder.
- **Ask mode** has read-only tools only.
- **Untrusted input.** The agent reads repository files and web pages, which may contain
  instructions aimed at the model (prompt injection). The approval prompts are the defense,
  so review commands before approving them.
