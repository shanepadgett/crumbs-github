# Crumbs Doctor Extension

Adds `/crumbs doctor` utilities for crumbs config files.

## User-facing surface

- `/crumbs doctor` inspects global and project crumbs config health.
- `/crumbs init` creates project `.pi/crumbs.json`.
- `/crumbs schema` updates project `.pi/crumbs.json` `$schema` to the schema URL this installed package would use for init.

## How it works

The extension reads crumbs config files, reports malformed JSON and known schema conflicts, and writes config files only from explicit init/schema commands.
