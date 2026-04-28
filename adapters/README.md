# Tool Adapters

This plugin is packaged for three agent hosts:

| Host | Primary files |
|---|---|
| Cursor | `.cursor-plugin/plugin.json`, `mcp.json`, `skills/`, `rules/`, `commands/` |
| Claude Code | `.claude-plugin/plugin.json`, `commands/`, `skills/ado-bug-agent/SKILL.md`, `AGENTS.md` |
| Codex | `.codex-plugin/plugin.json`, `AGENTS.md`, `skills/`, `mcp.json` |

All adapters share the same bundled MCP server and the same staged bug-analysis method.
