# Web Extension

Adds primitive web tools for direct browsing, search, and code/documentation search.

## User-facing surface

- `webfetch` fetches URL content as markdown, text, or HTML.
- `websearch` searches the web through Exa.
- `codesearch` searches code and documentation context through Exa.

## How it works

The extension registers low-level web tools only. Multi-step synthesized research belongs in the `web-research` subagent.
