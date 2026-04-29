---
description: Batch-fix multiple confirmed ADO Bugs in one approved wave worktree.
argument-hint: "[batch-id] [wave]"
---

Batch-fix multiple confirmed ADO Bugs from one approved batch wave.

Arguments: `$ARGUMENTS`

Argument defaults:

- No args: use the latest approved or active batch and its first unfinished wave.
- Numeric args: treat as ADO Bug IDs. Use or create an approved batch containing those confirmed Bugs.
- Non-numeric args: treat as title/theme selectors. Match confirmed local analyses by title, summary, tags, or source title.
- One explicit batch id can still be used when it matches `bug-analysis/batches/{id}`.

Preflight:

1. Read `AGENTS.md`, `CLAUDE.md` if present, `bug-analysis/batches/{batch-id}/batch-plan.json`, and `active-file-locks.json`.
2. Resolve batch approval gate:
   - if batch status is `approved` or `active`, continue
   - if batch status is `draft`, stop and ask the user verbatim: "Batch {batch-id} is still `draft`. Approve it now? Approving means I will set status to `approved`, stamp `approvedAt`, and start the selected wave." Only on explicit approval, write `status: approved` and `approvedAt: <now>` to `batch-plan.json`, then continue. Do not auto-approve.
   - if batch status is `closed`, hard stop.
3. Choose one wave only:
   - use wave arg when provided
   - otherwise use the first wave whose status is `planned` or `active`
4. Do not start issues listed in `blocked`.
5. Synchronize per-issue confirmation for the selected wave. For every issue in that wave, run the same confirmation sync as `/ado-bug-fix` step 2: when frontmatter is `confirmed` and `agent-run.json` is still `analysis-draft`, advance to `analysis-confirmed`. If any issue's frontmatter is still `draft`, refuse to start the wave and surface the unconfirmed issues to the user.
6. Confirm every issue in the wave has `agent-run.json` status at `analysis-confirmed`, `batch-planned`, or `fix-in-progress`, with selected repair option, non-empty expected touched files, and no active file-lock conflict with another wave.
7. Move only the selected wave lock from `planned` to `active`; keep other wave locks as `planned`. Stamp `owner` (this agent) and `updatedAt`.
8. When the wave starts editing, set batch status to `active` if it is currently `approved`, and advance each in-wave issue's `agent-run.json` status to `fix-in-progress`.

Wave worktree:

1. Use one worktree and one branch for the entire wave, not one per Bug.
2. Preferred names:

```text
../ado-bug-worktrees/{batch-id}-wave-{wave}
fix/ado-{batch-id}-wave-{wave}
```

3. This keeps related fixes that touch the same file in one branch.
4. Do not let multiple agents write to the same wave worktree at the same time.
5. If the wave worktree does not exist yet, create it from the batch's `baseBranch`:

```text
git worktree add ../ado-bug-worktrees/{batch-id}-wave-{wave} -b fix/ado-{batch-id}-wave-{wave} {baseBranch}
```

   If the worktree directory exists but is not a registered git worktree, stop and ask the user — do not delete or overwrite it.

Execution:

1. The parent agent is the wave owner.
2. Fix all issues in the selected wave inside the wave worktree.
3. Process issues in the order listed in `batch-plan.json` unless a dependency requires a different order.
4. If the host supports subagents, use them only for read-only side tasks: inspecting one issue's context, suggesting tests, or reviewing the wave diff. The wave owner applies edits.
5. If a fix needs files outside the selected repair scopes, stop and record a scope-change request.
6. Update one fix report per issue, all pointing to the same wave branch/worktree.
7. As each issue's fix report transitions to `completed`, advance that issue's `agent-run.json` status to `fix-completed` and stamp `fixReportPath`.
8. Mark the wave `completed` only after every issue fix report is `completed`; otherwise leave it `active` with the remaining work listed in `run-summary.md`.
9. When the wave is `completed`, flip its lock entry in `active-file-locks.json` from `active` to `completed`. Leave the lock as `active` while any in-wave issue is unfinished.
10. When this is the last wave and every wave in the batch is `completed`, set `batch-plan.json` status to `closed`. Otherwise stop here and let the user trigger the next wave.

Output:

- update each issue's `{slug}-fix-report.md`
- update `active-file-locks.json`
- update `bug-analysis/batches/{batch-id}/run-summary.md`

Do not commit, merge, push, or start another wave without human confirmation. After fixes land, the human runs PR review and merge outside this command; once a Bug's branch is actually merged, the human can flip that issue's `agent-run.json` status to `closed`.
