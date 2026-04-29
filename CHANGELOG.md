# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-29

### Added

- Controlled fix lifecycle: `/ado-bug-batch-plan`, `/ado-bug-fix`, `/ado-bug-batch-fix` slash commands and matching `ado_bug_*` MCP prompts.
- New schemas: `schemas/batch-plan.schema.json`, `schemas/active-file-locks.schema.json`, `schemas/fix-report.schema.json`.
- `/ado-bug-analyze` accepts a space-separated list of Bug IDs and fans out to one subagent per Bug (2-3 active at a time); single ID and title query keep their original behavior.
- Confirmation sync: every command that reads a Bug advances `agent-run.json` from `analysis-draft` to `analysis-confirmed` when the analysis frontmatter is `confirmed`. Status never downgrades.
- Explicit batch approval gate: `/ado-bug-batch-fix` asks before flipping `batch-plan.json` from `draft` to `approved` and stamps `approvedAt`.
- Worktree creation: fix commands create the declared worktree via `git worktree add` from the batch's `baseBranch` (wave mode) or the repository default branch (single-issue mode), and refuse to overwrite existing non-worktree directories.
- File-lock state machine: `planned` → `active` → `completed`, scoped to the selected wave only.
- `ado_bug_setup` credentials wizard and `~/.ado-bug-agent/credentials.json` fallback (also project-local), removing the requirement that the host expose `AZURE_DEVOPS_*` env vars to MCP children. Fixes the Windows pitfall where shell-only env vars and `.claude/settings.json` `env` blocks do not propagate.
- `ADO_BUG_AGENT_CREDENTIALS_FILE` env override; literal `${VAR}` / `%VAR%` placeholders are detected and ignored.
- `schemas/credentials.schema.json` documents the credentials file format.
- `tests/schema-contracts.js` covers state-enum and required-field invariants. `tests/mcp-credentials.js` covers env precedence, placeholder detection, file fallback, mid-session rotation, and PAT non-leakage in error paths.

### Changed

- MCP `serverInfo.version` reads from `package.json` instead of being hardcoded.
- `fix-report.schema.json` requires `selectedOption` so fix reports stay traceable to the confirmed analysis option.
- `/ado-bug-batch-fix` flips `batch-plan.json` to `closed` once every wave is `completed`. Per-issue `closed` remains a human action after the fix branch is actually merged through normal PR review.
- README, AGENTS.md, SKILL.md, Cursor rule, manifests, and adapter docs all aligned to the controlled-fix lifecycle and "merging is the human's job" boundary.
- `getConfig()` detects literal `${VAR}` / `%VAR%` placeholders and treats them as unset; error message lists where it looked and how to fix.
- Credentials file is re-read on every credentialed MCP call. Mid-session rotation takes effect on the next call without restarting the host.
- Credentials-file read and JSON-parse error messages no longer include `error.message`, since parse errors can echo file fragments and the file may contain a PAT.

### Removed

- `/ado-bug-merge-gate` command and the `ado_bug_merge_gate` MCP prompt. Merge ordering and regression planning are left to normal PR review; this plugin stops at `fix-completed`.
- `merge-gate` from `agent-run.json` and `batch-plan.json` status enums.
- `released` from `active-file-locks.json` status enum (`completed` is now the terminal lock state).
- `merge-plan.md` and `regression-report.md` artifacts; `wave.status: blocked` enum.

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

[Unreleased]: https://github.com/Gchigoo/ado-bug-agent/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Gchigoo/ado-bug-agent/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Gchigoo/ado-bug-agent/releases/tag/v0.1.0
