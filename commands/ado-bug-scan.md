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
6. For each Bug, run the same report/analysis workflow as `ado-bug-analyze`.
7. This is one scan tick only; do not sleep or create an endless loop.
8. Stop after `analysis-draft`; do not modify business code and do not commit.
