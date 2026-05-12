# Quiet Validators Extension

Runs configured validators quietly after relevant file changes.

## User-facing surface

- Background validation for supported checks.
- System prompt guidance tells agents not to run duplicate manual validations unless requested.

## How it works

The extension registers validator definitions, watches file-change snapshots, groups failures, and renders validation output separately from normal chat flow.
