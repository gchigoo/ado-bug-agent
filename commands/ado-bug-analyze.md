---
description: Generate ADO Bug Agent issue report and root-cause analysis drafts for one or more Azure DevOps Bugs by ID or title.
argument-hint: "<bug-id-or-title> [more-bug-ids...] [--title <title>] [--project <project>] [--force] [--post-comment]"
---

Analyze one or more Azure DevOps Bugs into report and analysis artifacts. This command is analysis-only.

Arguments: `$ARGUMENTS`

## Argument modes

- Single numeric arg: one ADO Bug ID.
- Multiple numeric args (e.g. `41765 41850 41900`): treat as a list of ADO Bug IDs and fan out one analysis per ID.
- `--title <title>` or a single non-numeric arg: title query, single Bug only. Title queries are not fanned out; if multiple ADO Bugs match, ask the user to pick one ID.
- Mixing numeric IDs with a title query is rejected; ask the user to pick one shape.

## Steps

1. Read `AGENTS.md` and `CLAUDE.md` if present.
2. Read `.ado-bug-agent/config.json` if it exists.
3. Resolve the target Bug list:
   - Collect every numeric arg as a Bug ID. Deduplicate. Preserve user order.
   - For a title query, run `ado_search_bugs` in the resolved project; if multiple match, stop and ask the user to choose one ID before continuing.
   - For each Bug ID, use **this plugin's** `ado_get_bug` to fetch sanitized fields, comments, and image attachments. Do not call `mcp__azure-devops__wit_get_work_item_attachment` or any external ADO MCP attachment endpoint — they will truncate or corrupt screenshots (see SKILL "Image Attachment Routing").
   - Keep `ado_get_bug` image handling at the default `imageMode: "cache"` so ADO screenshots are saved to local cache paths instead of being returned as token-expensive base64 or raw protected URLs.
   - For each `imageEvidence` entry, only Read its `localPath` when `inlineSafe` is `true`. If `inlineSafe` is `false`, do not Read the file; summarize from ADO title, fields, and comments, and ask the user to describe the screenshot if its content is essential.

### Single-Bug path

When exactly one Bug ID is in scope:

4. Create or update `bug-analysis/issues/YYYY-MM-DD-ado-{id}-{slug}/`.
5. Write or update `{slug}-report.md` as observable facts only: phenomenon, reproduction entry, expected behavior, actual behavior, and evidence source. Keep root-cause guesses out of the report.
6. If the report can be confirmed, read code and write `{slug}-analysis.md` using the staged analysis method: locate `file:line`, restore normal/failed paths, confirm root cause, assess impact, and provide 2-3 repair options.
7. In the analysis, include expected touched files, verification, risk, and `fix_scope` so a later human-approved fix workflow can stay scoped.
8. Maintain `agent-run.json`.
9. Stop after `analysis-draft`; do not modify business code and do not commit.
10. After the user confirms the analysis and detailed repair plan, call `ado_clear_bug_image_cache` for this Bug ID to remove cached screenshots.

### Multi-Bug path

When two or more Bug IDs are in scope, this command becomes a coordinator. Reuse the same protocol as `/ado-bug-scan` so analysis stays consistent:

11. If the host supports subagents, keep this agent as coordinator and assign each subagent exactly one Bug ID. Limit active subagents to 2-3 at a time.
12. Each subagent must run the single-Bug path above, fetch only its own Bug's full ADO content and images, and write only its own `bug-analysis/issues/...` files.
13. The coordinator collects summaries and artifact paths only; do not load every Bug's full ADO content or screenshots into the parent context.
14. If subagents are unavailable, process Bugs sequentially and summarize each Bug before moving to the next so the parent context stays bounded.
15. Parallelize analysis only. Do not parallelize or start any fix work in this command.
16. After the user confirms each Bug's analysis individually, call `ado_clear_bug_image_cache` for that Bug ID. Do not bulk-clear caches for unconfirmed analyses.
