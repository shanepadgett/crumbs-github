# Status Table Extension

Attached status table for Pi that renders below the editor and replaces the built-in footer.

It shows:

- git cleanliness summary
- current branch
- current path
- model provider
- model id
- thinking level
- Codex fast mode
- caveman mode placeholder/state
- context usage as `used / total`

## Notes

- The built-in footer is hidden and replaced by this extension's attached status table.
- The table refreshes on session start, model changes, turn updates, and a short background poll.
- Status table preferences read/write `extensions.statusTable` in crumbs config.
- Global defaults: `~/.pi/agent/crumbs.json`
- Project override: `<projectRoot>/.pi/crumbs.json`

## Usage

Install/load the extension, then reload Pi:

```text
/reload
```

If you change files under `extensions/status-table/`, reload Pi before testing.
