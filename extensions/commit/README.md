# commit extension

Adds a deterministic `/commit` command for git worktrees with local changes.

## What it does

- collects a fixed evidence bundle from git status, summaries, and focused diffs
- scores the relative size and complexity of that bundle
- switches `/commit` to `openai-codex/gpt-5.4-mini` or `openai-codex/gpt-5.4` with medium thinking for the run
- restores the prior model and thinking level after the run finishes
- injects the evidence into the agent so it can split work into semantic commits without re-inspecting the repo

## How to use it

Run `/commit` inside a git repository with uncommitted changes.

The extension prepares commit evidence, chooses the `/commit` model profile, and asks the agent to create one or more semantic commits.
