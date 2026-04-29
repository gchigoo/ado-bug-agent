---
description: Fix one confirmed ADO Bug by id, issue slug, or title/theme selector.
argument-hint: "<bug-id-or-title>"
---

Run a controlled fix for exactly one ADO Bug.

Arguments: `$ARGUMENTS`

Argument defaults:

- Numeric arg: ADO Bug ID.
- Non-numeric arg: issue slug or title/theme selector. Match confirmed local analyses by title, summary, tags, or source title.
- If multiple confirmed Bugs match, ask the user to choose one or switch to `/ado-bug-batch-fix`.
- Infer the latest approved or active batch containing the issue when available.
- The selected repair option comes from the confirmed analysis or batch plan. If ambiguous, ask the user.

Preflight:

1. Read `AGENTS.md`, `CLAUDE.md` if present, the issue report, confirmed analysis, `agent-run.json`, and the batch plan when provided.
2. Synchronize human confirmation into run state. Read `{slug}-analysis.md` frontmatter:
   - if `status: confirmed` and `agent-run.json` status is still `analysis-draft`, write `agent-run.json` status to `analysis-confirmed` and set `lastAnalyzedAt` to now.
   - if `status: draft`, stop and tell the user the analysis is not confirmed yet.
   - never downgrade an `agent-run.json` status that is already past `analysis-confirmed`.
3. Confirm the issue is approved for repair:
   - `agent-run.json` status is `analysis-confirmed`, `batch-planned`, or `fix-in-progress`
   - selected repair option is explicit
   - `fix_scope.expected_touched_files` is non-empty
   - batch status is `approved` or `active` when a batch is used
4. Confirm workspace isolation:
   - current directory is either a dedicated single-issue worktree or the approved wave worktree
   - branch name should match `fix/ado-{id}-{slug}` for single-issue mode or `fix/ado-{batch-id}-wave-{wave}` for wave mode
   - working tree should not contain unrelated edits
   - if the expected worktree does not exist, create it from a clean base:
     - single-issue mode: resolve `{baseBranch}` as the repository default branch (e.g. `main`/`master`) unless the user named a different base, then run `git worktree add ../ado-bug-worktrees/ado-{id}-{slug} -b fix/ado-{id}-{slug} {baseBranch}`
     - wave mode: use the wave's `worktree` and `branch` declared in `batch-plan.json`, branched from the batch's `baseBranch`
     - if the target directory exists but is not a registered git worktree, stop and ask the user — never delete or overwrite it
5. Check file locks only when a batch is associated:
   - if `batchId` is unset and `bug-analysis/batches/{batch-id}/active-file-locks.json` does not exist, skip lock checks
   - otherwise read `bug-analysis/batches/{batch-id}/active-file-locks.json`:
     - if any expected file is locked by another active wave, stop
     - planned locks from other waves are conflict warnings; stop and ask before editing the same file outside the selected wave
     - otherwise add or update this issue's lock entry before editing

Implementation rules:

1. Before the first edit, advance `agent-run.json` status to `fix-in-progress` and record `branch` plus `worktree`.
2. Modify only files declared in the selected repair option.
3. If a new file must be modified, stop and write a scope-change request in the fix report. Do not keep editing.
4. Do not refactor, redesign, or implement adjacent feature work unless the user explicitly expands the repair plan.
5. Add or update focused tests when the codebase has a reasonable nearby test path.
6. Run the selected verification commands from the analysis/batch plan.
7. Do not commit, merge, or push unless the user explicitly asks.

Output:

```text
bug-analysis/issues/YYYY-MM-DD-ado-{id}-{slug}/
  {slug}-fix-report.md
```

The fix report must include actual touched files, verification results, residual risk, and whether any scope change was requested.

When the fix is verified and the fix report is `status: completed`, advance `agent-run.json` status to `fix-completed` and set `fixReportPath`. If the fix is paused or blocked, leave `agent-run.json` at `fix-in-progress` and record the reason in `notes`.
