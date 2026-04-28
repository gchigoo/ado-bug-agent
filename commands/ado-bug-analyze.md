---
description: Generate a bug report and root-cause analysis draft for one Azure DevOps Bug by ID or title.
argument-hint: "<bug-id-or-title> [--title <title>] [--project <project>] [--force] [--post-comment]"
---

Analyze one Azure DevOps Bug into report and analysis artifacts.

Arguments: `$ARGUMENTS`

Steps:

1. Read `AGENTS.md` and `CLAUDE.md`.
2. Read `.ado-bug-agent/config.json` if it exists.
3. Resolve the target Bug:
   - Pure numeric input is a Bug ID; use `ado_get_bug`.
   - `--title` or non-numeric input is a title query; use `ado_search_bugs` in the resolved project.
   - If multiple Bugs match, ask the user to choose one ID.
4. Create or update `bug-analysis/issues/YYYY-MM-DD-ado-{id}-{slug}/`.
5. Write or update `{slug}-report.md`.
6. If the report can be confirmed, read code and write `{slug}-analysis.md` using the staged analysis method from this plugin.
7. Maintain `agent-run.json`.
8. Stop after `analysis-draft`; do not modify business code and do not commit.
