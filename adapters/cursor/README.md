# Cursor Adapter

The plugin root is already in Cursor plugin format:

```text
ado-bug-agent/
  .cursor-plugin/plugin.json
  mcp.json
  skills/
  rules/
  commands/
```

## Local Install

Copy `ado-bug-agent/` to:

```text
C:\Users\<user>\.cursor\plugins\local\ado-bug-agent\
```

macOS / Linux:

```text
~/.cursor/plugins/local/ado-bug-agent/
```

Then reload Cursor.

## Environment

Set these where Cursor can pass them to the MCP server:

PowerShell:

```powershell
$env:AZURE_DEVOPS_ORG_URL = "https://dev.azure.com/<org>"
$env:AZURE_DEVOPS_PAT = "<pat>"
```

bash / zsh:

```bash
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/<org>"
export AZURE_DEVOPS_PAT="<pat>"
```

MCP config uses:

```text
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/<org>
AZURE_DEVOPS_PAT=<pat>
```

Node.js 18+ must be available as `node`.

## Commands

```text
/ado-bug-setup
/ado-bug-analyze 41765
/ado-bug-analyze "Bug title"
/ado-bug-scan
/ado-bug-batch-plan
/ado-bug-batch-fix
/ado-bug-fix 41765
```

Cursor should load:

- bundled MCP tools from `mcp.json`
- skill from `skills/ado-bug-agent/SKILL.md`
- rule from `rules/ado-bug-agent.mdc`
- commands from `commands/`
