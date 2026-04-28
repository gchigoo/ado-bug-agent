# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-28

### Added

- Initial release.
- Bundled stdio MCP server (`mcp/ado-bug-agent-mcp.js`) for Azure DevOps:
  - `ado_list_projects`
  - `ado_search_bugs`
  - `ado_get_bug`
  - `ado_get_open_bug_assignees`
  - `ado_search_identities`
- Slash commands: `/ado-bug-setup`, `/ado-bug-analyze`, `/ado-bug-scan`.
- Embedded staged bug-analysis workflow (`skills/ado-bug-agent/SKILL.md`).
- Cursor rule (`rules/ado-bug-agent.mdc`).
- Plugin manifests for Claude Code (`.claude-plugin/plugin.json`),
  Cursor (`.cursor-plugin/plugin.json`), and Codex (`.codex-plugin/plugin.json`).
- MCP server uses NDJSON JSON-RPC stdio transport with protocol version
  negotiation (`2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`).
- Zero npm dependencies; native `fetch` only.

[Unreleased]: https://github.com/Gchigoo/ado-bug-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Gchigoo/ado-bug-agent/releases/tag/v0.1.0
