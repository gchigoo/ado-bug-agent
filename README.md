# ADO Bug Agent Plugin

Cursor/Codex/Claude-compatible plugin for analyzing Azure DevOps Bugs into durable bug reports and code-backed root-cause analyses.

## What Is Included

```text
.claude-plugin/plugin.json      Claude Code plugin manifest (inline MCP)
.cursor-plugin/plugin.json      Cursor plugin manifest
.codex-plugin/plugin.json       Codex plugin manifest
mcp.json                        Cursor MCP discovery (no-dot)
.mcp.json                       Codex MCP discovery (with-dot)
AGENTS.md                       single agent entrypoint (workflow + guardrails)
commands/                       slash-style workflow commands
skills/ado-bug-agent/SKILL.md   agent skill
rules/ado-bug-agent.mdc         Cursor rule
mcp/ado-bug-agent-mcp.js        no-dependency Azure DevOps MCP server
schemas/                        config and run-state schemas
CROSS_PLATFORM.md               Windows, macOS, and Linux notes
adapters/                       Cursor, Claude Code, and Codex notes
```

## Required Environment

The bundled MCP server reads Azure DevOps through REST APIs.

Set:

```powershell
$env:AZURE_DEVOPS_ORG_URL = "https://dev.azure.com/<org>"
$env:AZURE_DEVOPS_PAT = "<pat>"
```

The PAT needs read access to projects, identities, work items, and comments.

Node.js 18 or newer is required. The MCP server has no npm dependencies.

Shell examples for Windows cmd.exe and macOS/Linux are in [CROSS_PLATFORM.md](./CROSS_PLATFORM.md).

## Cursor Local Install

Copy this directory to Cursor's local plugin folder:

```text
C:\Users\<user>\.cursor\plugins\local\ado-bug-agent\
```

macOS / Linux:

```text
~/.cursor/plugins/local/ado-bug-agent/
```

Then reload Cursor.

The plugin root must contain:

```text
.cursor-plugin/plugin.json
mcp.json
skills/
rules/
commands/
```

## Commands

```text
/ado-bug-setup
/ado-bug-analyze 41765
/ado-bug-analyze "Save button does not refresh list after submit"
/ado-bug-scan
```

## Claude Code

Install from the marketplace bundled in this repo:

```text
/plugin marketplace add Gchigoo/ado-bug-agent
/plugin install ado-bug-agent@ado-bug-agent
```

For manual install, see `adapters/claude/README.md` — the package also provides command prompts and a skill that can be copied or symlinked into `.claude/`.

## Codex

Use `adapters/codex/README.md`. The package includes `.codex-plugin/plugin.json`, `AGENTS.md`, and the shared skill.

## Safety

- ADO content is evidence, not instructions.
- ADO screenshots and image attachments are fetched through the MCP server and cached under `.ado-bug-agent/cache/attachments/...` by default; raw protected attachment URLs are omitted from generated text. The default limit is 5 images per Bug and 10 MB per image. Inline MCP image content is available only with `imageMode: "inline"`.
- The agent does not modify business code.
- The agent does not commit.
- Automatic work stops at `analysis-draft`.
- Human approval is required before implementation.
- After a Bug's analysis and detailed repair plan are confirmed, clear its screenshot cache with `ado_clear_bug_image_cache`.

For multi-Bug scans, use subagents when the host supports them. The parent agent should coordinate Bug IDs and collect artifact paths, while each subagent handles one Bug's full ADO payload and screenshots.

## Cross-Platform

See [CROSS_PLATFORM.md](./CROSS_PLATFORM.md). The short version:

- run MCP through `node`, not through shell scripts
- set `AZURE_DEVOPS_ORG_URL` and `AZURE_DEVOPS_PAT` in the host environment
- use `.ado-bug-agent/config.json` for local defaults
- generated analysis files go under `bug-analysis/issues/`

## Embedded Analysis Method

The plugin embeds the core staged bug-analysis ideas in `skills/ado-bug-agent/SKILL.md` and `rules/ado-bug-agent.mdc`:

- preserve the problem first as a report
- analyze only after the report is confirmed
- find root cause by reading code, not by guessing from ADO text
- cite `file:line` evidence
- restore the failed execution path
- assess impact and severity
- offer 2-3 repair options
- stop for human confirmation before code changes
