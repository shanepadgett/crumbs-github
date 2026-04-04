---
description: Create git commit(s) for current changes
---
Commit the current changes.

- Inspect `git status` and diffs to choose logical commit boundaries.
- First reason about whether the entire change set belongs together. If it does, prefer staging everything with `git add -A`.
- If the full change set should not ship as one commit, split it into a small number of commits based on relevant semantic groupings and stage only the files or hunks for each group.
- Prefer one commit when changes belong together; otherwise create a small number of commits.
- Use unscoped conventional commit messages: `type: concise why-action summary`.
- Stage intentionally and verify each staged commit with `git diff --staged` before committing.
- When executing a commit, prefer a single shell request that stages and commits together once the staged set is clear, instead of separate tool calls for `git add` and `git commit`.
