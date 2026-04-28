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

## Environment

Required:

```text
AZURE_DEVOPS_PAT=<pat>
```

One of:

```text
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/<org>
AZURE_DEVOPS_ORG=<org>
```

Aliases are also accepted:

```text
AZDO_PAT
ADO_PAT
AZDO_ORG_URL
ADO_ORG_URL
AZDO_ORG
ADO_ORG
```

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
