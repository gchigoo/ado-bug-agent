---
description: Generate an ADO Bug Agent issue report and root-cause analysis draft for one Azure DevOps Bug by ID or title.
argument-hint: "<bug-id-or-title> [--title <title>] [--project <project>] [--force] [--post-comment]"
---

Analyze one Azure DevOps Bug into report and analysis artifacts. This command is analysis-only.

Arguments: `$ARGUMENTS`

Steps:

1. Read `AGENTS.md` and `CLAUDE.md`.
2. Read `.ado-bug-agent/config.json` if it exists.
3. Resolve the target Bug:
   - Pure numeric input is a Bug ID; use `ado_get_bug`.
   - `--title` or non-numeric input is a title query; use `ado_search_bugs` in the resolved project.
   - If multiple Bugs match, ask the user to choose one ID.
   - Keep `ado_get_bug` image handling enabled by default. Use the default `imageMode: "cache"` so ADO screenshots and image attachments are saved to local cache paths instead of being returned as token-expensive base64 or raw protected URLs.
4. Create or update `bug-analysis/issues/YYYY-MM-DD-ado-{id}-{slug}/`.
5. Write or update `{slug}-report.md` as observable facts only: phenomenon, reproduction entry, expected behavior, actual behavior, and evidence source. Keep root-cause guesses out of the report.
6. If the report can be confirmed, read code and write `{slug}-analysis.md` using the staged analysis method from this plugin: locate `file:line`, restore normal/failed paths, confirm root cause, assess impact, and provide 2-3 repair options.
7. In the analysis, include expected touched files, verification, risk, and `fix_scope` so a later human-approved fix workflow can stay scoped.
8. Maintain `agent-run.json`.
9. Stop after `analysis-draft`; do not modify business code and do not commit.
10. After the user confirms the analysis and detailed repair plan, call `ado_clear_bug_image_cache` for this Bug ID to remove cached screenshots.
