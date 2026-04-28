---
description: Configure ADO credentials, default project, and assignee for ADO Bug analysis.
argument-hint: "[--project <project>] [--assigned-to <name-or-email>] [--limit 5] [--post-comment]"
---

Set up ADO Bug Agent.

Arguments: `$ARGUMENTS`

## Step 1 — Verify credentials

Call `ado_list_projects` first to probe whether the bundled MCP server already has working credentials.

- If the call succeeds, skip to Step 2.
- If the error mentions `ADO credentials not found` (or any URL-parse error containing a literal `${...}` placeholder), enter the credentials wizard below.

### Credentials wizard

The bundled MCP server reads credentials in this priority order:

1. Host process environment variables (`AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PAT`, plus `AZDO_*` / `ADO_*` aliases).
2. The path in `ADO_BUG_AGENT_CREDENTIALS_FILE` if set.
3. `~/.ado-bug-agent/credentials.json` (recommended on Windows where host env vars are awkward to set).
4. `<cwd>/.ado-bug-agent/credentials.json` (per-project; this directory is typically gitignored).

When credentials are missing, ask the user:

> "I need an Azure DevOps organization URL (e.g. `https://dev.azure.com/<org>`) and a Personal Access Token with Work Items Read, Identity Read, and Project & Team Read scopes. Paste them here, or tell me to skip if you would rather set host environment variables yourself."

Only after the user provides them, write a JSON file:

```json
{
  "orgUrl": "https://dev.azure.com/<org>",
  "pat": "<pat>"
}
```

Default destination: `~/.ado-bug-agent/credentials.json` (cross-project, no repo leakage). Only use the project-local `<cwd>/.ado-bug-agent/credentials.json` if the user explicitly asks for it.

After writing the file:

- On macOS / Linux, run `chmod 600` on it.
- On Windows, the file lives in `%USERPROFILE%\.ado-bug-agent\` which is already user-only by default; do not chmod.
- Never echo the PAT back into chat or paste it into any analysis or report file. Refer to it as `<pat>` from this point on.
- Call `ado_list_projects` again to verify. If it still fails, surface the new error message verbatim and stop.

If the user prefers host env vars, tell them:

- Windows: `setx AZURE_DEVOPS_ORG_URL "..."` and `setx AZURE_DEVOPS_PAT "..."` from PowerShell or cmd, then **fully quit and reopen** Claude Code / Cursor / Codex so the MCP child process inherits the new values. Setting them in `.claude/settings.json.env` does not propagate to MCP children.
- macOS / Linux: `export` from the shell that launches the host, or persist in `~/.zshrc` / `~/.bashrc`, then restart the host.

Do not write `AZURE_DEVOPS_PAT` into `.claude/settings.json`, `.ado-bug-agent/config.json`, `.cursor/mcp.json`, or any committable file.

## Step 2 — Choose project and assignee

1. Use `ado_list_projects` to list Azure DevOps projects.
2. If `--project` is missing, ask the user to choose one.
3. Resolve assignee:
   - If `--assigned-to` is present, validate via `ado_search_identities` when possible.
   - Otherwise use `ado_get_open_bug_assignees` to show project assignee candidates.
   - If the desired user is not listed, ask for name or email and validate via `ado_search_identities`.
4. Write `.ado-bug-agent/config.json` with `project`, `assignedTo`, `assignedToDisplayName`, `limit`, `postComment`, `updatedAt`. **This file is committable; never put PAT in it.**
5. Do not generate issue documents, modify business code, or commit.
