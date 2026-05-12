# Crumbs Doctor Extension

Adds `/crumbs doctor` for report-only checks of crumbs config files.

## User-facing surface

- `/crumbs doctor` inspects global and project crumbs config health.
- `/crumbs doctor --fix` repairs supported known-key type conflicts.

## How it works

The extension reads crumbs config files, reports malformed JSON and known schema conflicts, and writes fixes only when explicitly requested.
