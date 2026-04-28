---
description: Scan open Azure DevOps Bugs assigned to a configured user and generate report and analysis drafts.
argument-hint: "[--project <project>] [--assigned-to <name-or-email>] [--limit 5] [--force] [--post-comment]"
---

Run one ADO Bug scan tick.

Arguments: `$ARGUMENTS`

Steps:

1. Read `AGENTS.md`, `CLAUDE.md`, and `.ado-bug-agent/config.json` if it exists.
2. Resolve `project`, `assignedTo`, `limit`, and `postComment` from explicit arguments first, then local config.
3. If project or assignee is missing, run the setup workflow first.
4. Use `ado_search_bugs` to find open Bugs assigned to the resolved user.
5. Process at most `limit` Bugs in priority/changed-date order.
6. If more than one Bug is eligible and the host supports subagents, keep this agent as coordinator and assign each subagent exactly one Bug ID. Limit active subagents to 2-3 at a time.
7. Each subagent must run the same report/analysis workflow as `ado-bug-analyze`, fetch only its own Bug's full ADO content and images, and write only its own `bug-analysis/issues/...` files.
8. The coordinator should collect summaries and artifact paths only; do not load every Bug's full ADO content or screenshots into the parent context.
9. If subagents are unavailable, process Bugs sequentially and summarize each Bug before moving to the next.
10. This is one scan tick only; do not sleep or create an endless loop.
11. Stop after `analysis-draft`; do not modify business code and do not commit.
12. After the user confirms a Bug's analysis and detailed repair plan, call `ado_clear_bug_image_cache` for that Bug ID to remove cached screenshots.
