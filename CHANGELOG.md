# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- `/ado-bug-merge-gate` command and the `ado_bug_merge_gate` MCP prompt. Merge ordering and regression planning are left to normal PR review; this plugin now stops at `fix-completed`.
- `merge-gate` from `agent-run.json` and `batch-plan.json` status enums.
- `released` from `active-file-locks.json` status enum (`completed` is now the terminal lock state).
- `merge-plan.md` and `regression-report.md` artifacts.

### Changed

- `/ado-bug-batch-fix` flips `batch-plan.json` to `closed` once every wave is `completed`. Per-issue `closed` remains a human action after the fix branch is actually merged.
- `commands/ado-bug-batch-fix.md` references to `merge-gate` removed; only `closed` is a hard stop now.

### Added

- Credentials file fallback (`~/.ado-bug-agent/credentials.json` and project-local `.ado-bug-agent/credentials.json`), removing the requirement that the host process expose `AZURE_DEVOPS_*` env vars to MCP children. Resolves the common Windows pitfall where shell-only env vars and `.claude/settings.json` `env` blocks do not propagate to MCP child processes.
- `ADO_BUG_AGENT_CREDENTIALS_FILE` env override for explicit file path. Literal `${VAR}` and `%VAR%` placeholders in this env var are detected and ignored so unresolved manifest substitutions fall through to the home-dir candidate cleanly.
- `schemas/credentials.schema.json` documenting the credentials file format.
- `tests/mcp-credentials.js` covering env precedence, placeholder detection, file fallback, env-overrides-file, mid-session pickup, **PAT rotation in same file path**, **placeholder pollution of the credentials-file env var**, and **PAT non-leakage across all throw paths** (parse error, missing org, missing PAT).
- `/ado-bug-setup` now starts with a credentials wizard that probes via `ado_list_projects`, scans `.claude/settings.json` / `.cursor/mcp.json` / `.ado-bug-agent/config.json` / `~/.claude/settings.json` for stale PAT entries and offers to remove them, then walks the user through writing `~/.ado-bug-agent/credentials.json`.

### Changed

- `getConfig()` detects literal `${VAR}` and `%VAR%` placeholders and treats them as unset, falling through to the credentials file. Error message now lists where it looked and how to fix.
- Credentials file is re-read on every credentialed MCP call (no in-process cache). Mid-session rotation takes effect immediately on the next call without host restart.
- Credentials-file read and JSON-parse error messages no longer include `error.message`, since `JSON.parse` errors can echo input fragments and the credentials file may contain a PAT.
- README, `mcp/README.md`, `CROSS_PLATFORM.md`, `AGENTS.md`, `skills/ado-bug-agent/SKILL.md`, and `rules/ado-bug-agent.mdc` recommend the credentials file as the primary path on Windows; host env vars become the CI / container path.

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
