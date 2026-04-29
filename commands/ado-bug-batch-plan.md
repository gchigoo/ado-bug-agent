---
description: Build a batch repair plan from ADO Bugs, generating missing analysis drafts when needed, without modifying business code.
argument-hint: "[bug-id-or-title ...] [--force]"
---

Create a batch plan for multiple ADO Bugs. This command is the coordinator for the single-Bug report/analyze flow plus batch repair planning.

Arguments: `$ARGUMENTS`

Argument defaults:

- No args: include all `analysis-confirmed` issues under `bug-analysis/issues/` and create a dated batch id.
- Numeric args: ADO Bug IDs. If report or analysis artifacts are missing, run the same `/ado-bug-analyze` report/analyze workflow for that Bug first.
- Non-numeric args: title/theme selectors. Match local analyses by title, summary, tags, or source title; if needed, search ADO and run the single-Bug analyze workflow for matched Bugs.
- Generated `analysis-draft` artifacts are not repair-ready. Put them in `blocked` with reason `analysis-awaiting-confirmation` until the user confirms the analysis and selected repair option.
- `--force` allows replacing an existing draft batch.

Rules:

1. Read `AGENTS.md`, `CLAUDE.md` if present, `README.md`, and existing `bug-analysis/issues/...` artifacts.
2. Resolve each explicit Bug ID or title/theme selector.
3. For any selected Bug without a complete local report and analysis, fetch it through the bundled ADO MCP tools and run the normal single-Bug lifecycle:
   - create/update `{slug}-report.md`
   - create/update `{slug}-analysis.md`
   - update `agent-run.json`
   - stop generated work at `analysis-draft`
4. Synchronize human confirmation into run state. For every candidate issue, read `{slug}-analysis.md` frontmatter:
   - if `status: confirmed` and `agent-run.json` status is still `analysis-draft`, write `agent-run.json` status to `analysis-confirmed` and set `lastAnalyzedAt` to now.
   - if `status: draft`, leave `agent-run.json` untouched and treat the issue as not ready.
   - never downgrade an `agent-run.json` status that is already past `analysis-confirmed`.
5. Only include Bugs in repair waves when run state is `analysis-confirmed` or later, the analysis frontmatter is `confirmed`, and a selected repair option plus non-empty expected touched files exist.
6. Put all non-ready Bugs in `blocked`, including:
   - `missing-report-info` when required observable facts are missing
   - `analysis-awaiting-confirmation` when analysis was generated but not confirmed
   - `missing-selected-option` when no repair option has been accepted
   - `missing-fix-scope` when expected touched files are empty
7. Do not modify business code, create worktrees, merge branches, or commit.
8. For each repair-ready issue, extract:
   - `adoId`, `issue`, severity, selected repair option
   - `fix_scope.expected_touched_files`
   - dependencies, risk level, and parallel safety
   - verification commands or manual checks
9. Build waves:
   - dependency targets must appear in earlier waves
   - `parallel_safety: serial|required-root-cause|unknown` cannot be parallelized without human override
   - issues in the same wave will be fixed in one shared wave worktree/branch
   - group tightly related issues or same-file fixes into the same wave when they should be resolved together
   - split issues into different waves only when ordering, risk, or root-cause uncertainty requires it
   - set each wave to `status: planned`
   - record planned `branch` and `worktree` names for each wave
10. Write planned file locks for each wave. These locks reserve expected touched files for planning only; `/ado-bug-batch-fix` changes a selected wave lock to `active`.
11. For each ready issue, advance `agent-run.json` status from `analysis-confirmed` to `batch-planned` and set `batchId`. Leave blocked issues at their current run state.
12. Write:

```text
bug-analysis/batches/{batch-id}/
  batch-plan.json
  conflict-matrix.md
  active-file-locks.json
  run-summary.md
```

13. Set batch status to `draft`. Summarize ready waves and blocked Bugs separately. Tell the user to confirm blocked analyses first, then approve the batch and run `/ado-bug-batch-fix` to repair ready waves.
14. Image cache hygiene:
    - for every Bug whose analysis is `confirmed` and that landed in a ready wave, call `ado_clear_bug_image_cache` for that Bug ID.
    - for newly generated `analysis-draft` Bugs, leave the image cache in place; clear it later when the user confirms that Bug's analysis.
