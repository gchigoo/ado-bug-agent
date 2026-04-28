# MCP Server

`ado-bug-agent-mcp.js` is a no-dependency stdio MCP server for Azure DevOps.

## Compatibility

- Windows, macOS, Linux
- Node.js 18+
- No package install required
- Uses native `fetch`
- Uses `node` command explicitly; does not rely on executable bit or shebang

## Tools

- `ado_list_projects`
- `ado_search_bugs`
- `ado_get_bug`
- `ado_get_open_bug_assignees`
- `ado_search_identities`

## Credentials

Resolved in this priority order:

1. `AZURE_DEVOPS_ORG_URL` + `AZURE_DEVOPS_PAT` from the host process environment.
2. JSON file at `$ADO_BUG_AGENT_CREDENTIALS_FILE` (if set).
3. `~/.ado-bug-agent/credentials.json`
4. `<cwd>/.ado-bug-agent/credentials.json`

Aliases for env vars: `AZDO_PAT` / `ADO_PAT`, `AZDO_ORG_URL` / `ADO_ORG_URL`, `AZURE_DEVOPS_ORG` / `AZDO_ORG` / `ADO_ORG` (org short name; built into `https://dev.azure.com/<org>`).

Literal `${VAR}` and `%VAR%` placeholders are detected and treated as unset — the server falls through to the credentials file instead of failing later with a confusing URL-parse error.

### Credentials file format

```json
{
  "orgUrl": "https://dev.azure.com/<org>",
  "pat": "<pat>"
}
```

Or with org short name:

```json
{
  "org": "<org>",
  "pat": "<pat>"
}
```

Schema: `schemas/credentials.schema.json`.

The file is read on every credentialed call; once a valid file is found, its path is cached. Updating the file mid-session takes effect on the next MCP call.

## MCP Config

Relative-path config for plugin hosts:

```json
{
  "mcpServers": {
    "ado-bug-agent": {
      "command": "node",
      "args": ["./mcp/ado-bug-agent-mcp.js"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "${env:AZURE_DEVOPS_ORG_URL}",
        "AZURE_DEVOPS_PAT": "${env:AZURE_DEVOPS_PAT}"
      }
    }
  }
}
```

If a host does not resolve relative paths from the plugin root, replace the script path with an absolute path.
