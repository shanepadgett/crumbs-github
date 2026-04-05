# Memory Extension

Deterministic session memory for Pi.

It does three things:

- custom compaction without extra model calls
- exact recall from session history on the current branch
- branch handoff summaries when you move around `/tree`

## How to use it

Install the package and keep the extension enabled.

The extension adds:

- `memory_recall` tool
- `/memory-compact`
- `/memory-show`

## Example

- Ask Pi to continue working after a long session.
- Use `/memory-compact` if you want to compact right away.
- If you need something older than the summary, Pi can call `memory_recall` to search the current branch history and expand exact entries.
