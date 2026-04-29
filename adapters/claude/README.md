# Claude Code Adapter

Claude Code can use the same package contents as a plugin-style bundle:

- `commands/` provide slash command prompts.
- `skills/ado-bug-agent/SKILL.md` provides the reusable workflow.
- `mcp.json` defines the bundled stdio MCP server.
- `AGENTS.md` contains the full protocol.

## Project-Local Use

Copy or symlink these directories into the target project:

```text
.claude/commands/ado-bug-setup.md
.claude/commands/ado-bug-analyze.md
.claude/commands/ado-bug-scan.md
.claude/commands/ado-bug-batch-plan.md
.claude/commands/ado-bug-batch-fix.md
.claude/commands/ado-bug-fix.md
.claude/skills/ado-bug-agent/SKILL.md
```

Use the package `mcp.json` as the MCP server definition, or copy the `ado-bug-agent` server entry into Claude Code's MCP config.

The MCP entry is cross-platform as long as Claude Code resolves `./mcp/ado-bug-agent-mcp.js` from the plugin root. If not, use an absolute path for the script.

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

Claude must stop at human checkpoints. Analyze, scan, and batch-plan do not modify business code. `/ado-bug-fix` may modify code only after a confirmed analysis, accepted repair scope, and single-issue or wave worktree check. Do not commit by default. Merging the fix branch is the human's responsibility through normal PR review.
