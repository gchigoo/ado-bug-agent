---
description: Configure default Azure DevOps project and assignee for ADO Bug analysis.
argument-hint: "[--project <project>] [--assigned-to <name-or-email>] [--limit 5] [--post-comment]"
---

Set up ADO Bug Agent defaults.

Arguments: `$ARGUMENTS`

Steps:

1. Use bundled MCP tool `ado_list_projects` to list Azure DevOps projects.
2. If `--project` is missing, ask the user to choose one project.
3. Resolve assignee:
   - If `--assigned-to` is present, use `ado_search_identities` to validate when possible.
   - Otherwise use `ado_get_open_bug_assignees` to show project assignee candidates.
   - If the desired user is not listed, ask for name/email and validate with `ado_search_identities`.
4. Write `.ado-bug-agent/config.json` with `project`, `assignedTo`, `assignedToDisplayName`, `limit`, `postComment`, and `updatedAt`.
5. Do not generate issue documents, modify business code, or commit.
