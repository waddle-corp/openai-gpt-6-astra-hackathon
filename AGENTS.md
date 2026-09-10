# Project instructions

These instructions apply to all work in this repository.

## Shared feedback boundary

- Before changing customer submissions, feedback fixtures, or merchant-agent inputs, read `docs/feedback-contract.md` and use `FeedbackRecord` from `contracts/feedback.ts`.
- Validate boundary data with `assertFeedbackRecord` or `parseFeedbackRecords`. Do not create a parallel feedback schema or silently change contract v1.0.
- Keep `evaluation/` labels out of model inputs. Preserve synthetic provenance and unknown values; never manufacture customer or browser-execution evidence.

## Branch workflow

- Before starting any code work, always check the current branch and working tree with `git status --short --branch` and inspect the available branches as needed.
- Confirm that the current branch is the intended task branch. Do not implement changes directly on `main`, `master`, or another unrelated branch.
- If the current branch is not the intended task branch, switch to the appropriate existing branch or create one before editing code. Use a descriptive name such as `feat/customer-feedback`, `fix/checkout-validation`, or `chore/update-tooling`.
- Preserve existing uncommitted changes when switching branches. Do not discard, overwrite, or include unrelated work in a task commit.

## Incremental commits

- Commit each completed, coherent subtask as work progresses. Do not leave all completed subtasks uncommitted until the end of a larger task.
- Run checks appropriate to the subtask before committing. Review the staged diff and stage explicit files or hunks so each commit contains only its intended changes.
- Write every commit message in English and follow Conventional Commits, as used by Commitizen: `<type>[optional scope]: <description>`.
- Use standard types such as `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, and `style`.
- Use a concise, imperative description. Examples: `feat: add customer feedback flow`, `fix: preserve feedback drafts during navigation`, and `docs: document merchant feedback handoff`.
- Commit locally as part of this workflow. Push or publish only when requested or otherwise authorized by the user.
