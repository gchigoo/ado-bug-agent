# Codex Adapter

The plugin root includes a Codex manifest:

```text
.codex-plugin/plugin.json
```

Codex should use:

- `AGENTS.md` for high-level guardrails
- `skills/ado-bug-agent/SKILL.md` for the workflow
- `mcp.json` for the bundled MCP server
- `commands/` as reusable prompt templates

## Local Install

Install or register this directory as a local Codex plugin. If using a local marketplace, point the plugin source to:

```text
./plugins/ado-bug-agent
```

## Required Environment

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

MCP environment values:

```text
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/<org>
AZURE_DEVOPS_PAT=<pat>
```

Node.js 18+ must be available as `node`.

## Expected Prompts

```text
Use the ado-bug-agent skill to set up defaults.
Use the ado-bug-agent skill to analyze ADO Bug 41765.
Use the ado-bug-agent skill to scan my assigned ADO Bugs.
```

Codex should create or update bug report and analysis files only, then stop for human confirmation.
