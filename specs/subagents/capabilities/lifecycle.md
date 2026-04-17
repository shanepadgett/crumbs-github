# Capability: Lifecycle

## Overview

Lifecycle defines subagent behavior tied to session lifecycle and registry refresh touchpoints.

This capability covers:

- startup behavior
- reload behavior
- shutdown behavior
- command completion behavior

## Requirements

### Startup and Reload Diagnostics

- On session start, the system SHALL inspect session start reason.
- When session start reason is `startup`, the system SHALL run refreshed registry diagnostics.
- When session start reason is `reload`, the system SHALL run refreshed registry diagnostics.
- When session start reason is neither `startup` nor `reload`, the system SHALL NOT run startup diagnostic pass.
- Startup and reload diagnostics SHALL include registration diagnostics and runtime validation diagnostics.
- When startup or reload finds zero warnings and zero errors, the system SHALL emit no notice.
- When startup or reload finds one or more warnings or errors, the system SHALL emit notice summarizing issue count and directing user to `/subagents doctor`.
- When startup or reload diagnostic pass itself fails, the system SHALL emit failure notice containing phase and caught error text.

### Shutdown Behavior

- On session shutdown, the system SHALL clear in-memory agent registry cache.

### Command Routing

- The system SHALL expose `/subagents` command with subcommands `list`, `doctor`, and `create`.
- `/subagents list` SHALL refresh agent discovery before reporting.
- `/subagents doctor` SHALL refresh diagnostics before reporting.
- `/subagents create` SHALL enter interactive creation flow.
- Unknown `/subagents` usage SHALL show usage text.

### Registry Refresh Touchpoints

- Startup and reload diagnostic pass SHALL force registry refresh.
- `/subagents list` SHALL force registry refresh.
- `/subagents doctor` SHALL force registry refresh.
- Successful create and clone writes SHALL clear registry cache and SHALL force rediscovery.
- Workflow execution SHALL resolve runnable agents using refreshed discovery under current behavior.

## Current Behavioral Notes

- Current lifecycle behavior uses cache clear on shutdown but still refreshes on many read paths, so cache is opportunistic rather than strongly authoritative.
