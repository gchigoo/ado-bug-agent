# Cross-Platform Notes

The plugin is designed to run on Windows, macOS, and Linux.

## Runtime

Requirements:

- Node.js 18 or newer
- No npm install required
- No shell-specific scripts required for the MCP server
- Azure DevOps PAT with work item/project/identity read permissions

The MCP server is launched as:

```text
node ./mcp/ado-bug-agent-mcp.js
```

Use `node` explicitly instead of relying on the shebang. This works consistently on Windows, macOS, and Linux.

## Credentials

Two supported paths. The MCP server reads in this order: host env → credentials file.

### Recommended: credentials file

```json
{
  "orgUrl": "https://dev.azure.com/<org>",
  "pat": "<pat>"
}
```

Default location:

- Windows: `%USERPROFILE%\.ado-bug-agent\credentials.json`
- macOS / Linux: `~/.ado-bug-agent/credentials.json` (then `chmod 600`)

This path avoids the most common Windows pitfall: shell-only env vars (e.g. set in `.bashrc`) do not reach the host's MCP child processes, and `${VAR}` placeholders in plugin manifests stay unresolved. Use `/ado-bug-setup` to be walked through creating the file.

### Alternative: host environment variables

#### Windows PowerShell

```powershell
$env:AZURE_DEVOPS_ORG_URL = "https://dev.azure.com/<org>"
$env:AZURE_DEVOPS_PAT = "<pat>"
```

For persistence across sessions:

```powershell
[System.Environment]::SetEnvironmentVariable('AZURE_DEVOPS_ORG_URL', 'https://dev.azure.com/<org>', 'User')
[System.Environment]::SetEnvironmentVariable('AZURE_DEVOPS_PAT', '<pat>', 'User')
```

Then **fully quit and reopen** Claude Code / Cursor / Codex. The running MCP child process inherits env at launch time only — reload-plugin alone is not enough.

#### Windows cmd.exe

```bat
set AZURE_DEVOPS_ORG_URL=https://dev.azure.com/<org>
set AZURE_DEVOPS_PAT=<pat>
```

For persistence: use `setx`, then restart the host.

#### macOS / Linux bash or zsh

```bash
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/<org>"
export AZURE_DEVOPS_PAT="<pat>"
```

For persistence: append to `~/.zshrc` / `~/.bashrc`, then restart the host so the new shell launches it with the new env.

You can also use `AZURE_DEVOPS_ORG=<org>` instead of `AZURE_DEVOPS_ORG_URL`.

### What does not work

- Putting PAT in `.claude/settings.json` `env` block — that field does not reliably propagate to MCP child processes, and even when it does the host must be fully restarted.
- Putting PAT in `.ado-bug-agent/config.json` — that file is committable; the setup wizard will refuse.
- Setting env vars in PowerShell after the host has started — the running MCP child process keeps the old env. Restart, do not reload.

## Local Plugin Paths

### Cursor

Windows:

```text
C:\Users\<user>\.cursor\plugins\local\ado-bug-agent\
```

macOS / Linux:

```text
~/.cursor/plugins/local/ado-bug-agent/
```

### Claude Code

Project-local commands and skills:

```text
<project>/.claude/commands/
<project>/.claude/skills/ado-bug-agent/
```

### Codex

Use the plugin directory directly or point the local marketplace entry at:

```text
./plugins/ado-bug-agent
```

## Generated Files

The plugin writes analysis artifacts under the target repository:

```text
bug-analysis/issues/
.ado-bug-agent/config.json
```

Recommended `.gitignore` entries if these should stay local:

```gitignore
.ado-bug-agent/
```

Do not ignore `bug-analysis/issues/` if the team wants to commit bug analysis artifacts.

## Path Rules

- Use forward slashes in JSON config paths where possible.
- Use quoted paths when copying the plugin on Windows if the user profile contains spaces.
- Do not depend on `bash`, `pwsh`, or `cmd` inside the MCP server. The server is plain Node.js.

## Smoke Tests

From the plugin root:

```bash
node --check mcp/ado-bug-agent-mcp.js
```

With environment variables set:

```bash
node mcp/ado-bug-agent-mcp.js
```

The second command starts the stdio MCP server and waits for MCP client input; stop it with `Ctrl+C`.
