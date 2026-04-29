# ADO Bug Agent Plugin

Cursor/Codex/Claude-compatible plugin for taking Azure DevOps Bugs through durable issue reports, code-backed root-cause analyses, human-gated repair plans, and controlled fixes. Merging is left to the human's normal PR review.

The issue workflow is native to ADO Bug Agent: report observable behavior, prove root cause from code, stop for human confirmation, and keep fixes scoped to the accepted analysis. The plugin remains self-contained and does not require any external workflow package in the target project.

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
schemas/                        config, run-state, batch, lock, and fix-report schemas
CROSS_PLATFORM.md               Windows, macOS, and Linux notes
adapters/                       Cursor, Claude Code, and Codex notes
```

## Credentials

The bundled MCP server reads Azure DevOps through REST APIs and resolves credentials in this priority order:

1. Host process environment variables: `AZURE_DEVOPS_ORG_URL` + `AZURE_DEVOPS_PAT` (aliases: `AZDO_*`, `ADO_*`).
2. The path in `ADO_BUG_AGENT_CREDENTIALS_FILE` if set.
3. `~/.ado-bug-agent/credentials.json`
4. `<cwd>/.ado-bug-agent/credentials.json`

The PAT needs read access to projects, identities, work items, and comments.

### Recommended: credentials file (Windows-friendly)

`/ado-bug-setup` walks you through creating this file. To do it manually:

```json
{
  "orgUrl": "https://dev.azure.com/<org>",
  "pat": "<pat>"
}
```

Save to `~/.ado-bug-agent/credentials.json` (i.e. `%USERPROFILE%\.ado-bug-agent\credentials.json` on Windows). On macOS / Linux, also run `chmod 600` on the file.

This path is preferred when the host (Claude Code / Cursor / Codex) does not propagate shell-only env vars to MCP child processes — a common Windows pitfall. Setting the credentials in `.claude/settings.json.env` is **not** equivalent: that field does not always reach MCP children, and even when it does, the host must be fully restarted.

### Alternative: host environment variables

```powershell
$env:AZURE_DEVOPS_ORG_URL = "https://dev.azure.com/<org>"
$env:AZURE_DEVOPS_PAT = "<pat>"
```

Use this path for CI / containers, or when you have a controlled shell that always launches the host. Restart the host after changing env vars; running MCP children inherit env at launch time only.

Shell examples for Windows cmd.exe and macOS / Linux are in [CROSS_PLATFORM.md](./CROSS_PLATFORM.md).

### Do NOT put PAT in committable config

- `.ado-bug-agent/config.json` — project / assignee defaults, safe to commit, **never put PAT here**.
- `.claude/settings.json`, `.cursor/mcp.json`, `mcp.json`, `.mcp.json`, `plugin.json` — committable, never put PAT here either.

The PAT must only live in `~/.ado-bug-agent/credentials.json` (default-gitignored by being outside any repo) or in host environment variables.

### Requirements

Node.js 18 or newer. The MCP server has no npm dependencies.

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
/ado-bug-batch-plan 41765 41850
/ado-bug-batch-plan "speaker settlement"
/ado-bug-batch-fix
/ado-bug-fix 41765
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
- Analyze, scan, and batch-plan do not modify business code.
- `/ado-bug-batch-plan` can accept Bug IDs or title/theme selectors. If selected Bugs are missing local report or analysis artifacts, it runs the normal single-Bug report/analyze workflow first, then blocks newly generated drafts until the user confirms them.
- Batch plans create `planned` waves and file-lock reservations. `/ado-bug-batch-fix` activates one selected wave at a time.
- `/ado-bug-fix` may modify business code only after a confirmed analysis, accepted repair scope, and single-issue or wave worktree/branch check.
- `/ado-bug-batch-fix` fixes one approved wave in one shared wave worktree/branch, with one fix report per issue.
- The agent does not commit.
- Analyze and scan stop at `analysis-draft`.
- Human approval is required before implementation.
- After a Bug's analysis and detailed repair plan are confirmed, clear its screenshot cache with `ado_clear_bug_image_cache`.

For multi-Bug scans, use subagents when the host supports them. The parent agent should coordinate Bug IDs and collect artifact paths, while each subagent handles one Bug's full ADO payload and screenshots.

## Cross-Platform

See [CROSS_PLATFORM.md](./CROSS_PLATFORM.md). The short version:

- run MCP through `node`, not through shell scripts
- set `AZURE_DEVOPS_ORG_URL` and `AZURE_DEVOPS_PAT` in the host environment
- use `.ado-bug-agent/config.json` for local defaults
- generated analysis files go under `bug-analysis/issues/`

## Embedded Issue Method

The plugin embeds the core staged issue ideas in `skills/ado-bug-agent/SKILL.md` and `rules/ado-bug-agent.mdc`:

- preserve observable behavior first as a report
- analyze only after the report is confirmed
- find root cause by reading code, not by guessing from ADO text
- cite `file:line` evidence
- restore the failed execution path
- assess impact and severity
- offer 2-3 repair options with expected touched files, verification, and risk
- stop for human confirmation before code changes
- use batch plans and wave file locks before controlled fixes; batch planning is the integration of multiple single-Bug lifecycles
- write fix reports per issue and stop at `fix-completed`; merging is the human's responsibility through normal PR review
