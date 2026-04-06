# Worktree Management Utilities

Add built-in worktree utilities so users can create, open, inspect, and clean up Git worktrees without leaving Pi. The point is not to wrap `git worktree` with prettier commands. The point is to make parallel task work understandable and safe inside Pi.

For this project, the most useful mental model is:

- **base checkout = lobby**
- **worktree = task workspace**
- **open workspace in Pi = switch to a Pi session whose cwd is that worktree path**

That last point matters. Pi does not need to magically change the parent shell's directory. What it needs to do is switch its own active session and runtime context to the selected worktree. In practice, that means a worktree manager in Pi should feel like a workspace switcher, not like a shell alias.

## Why this matters

Raw Git worktrees are powerful but awkward for normal people:

- users do not think in terms of linked checkout metadata
- users forget which branch lives in which folder
- users hit branch deletion or checkout conflicts and do not know why
- users manually delete worktree folders and end up with stale Git state
- users still have no help connecting a worktree to a task, a review, or a Pi session

Pi can improve this by treating a worktree as a first-class task workspace instead of a low-level Git object.

## Recommended product shape

Pi should present worktrees as task workspaces.

Example:

- `~/code/crumbs` → lobby on `main`
- `~/code/crumbs-feature-a` → feature workspace on `feature/a`
- `~/code/crumbs-pr-123` → review workspace for a PR branch
- `~/code/crumbs-bug-repro` → isolated bug reproduction workspace

Each workspace should feel like:

- one folder
- one checked out branch or detached review state
- one Pi session
- one task context

This is much easier to reason about than constant branch switching in a single checkout.

## How this should work inside Pi

The extension should not rely on changing the user's outer shell directory. Instead, it should use Pi's session model.

When a user launches Pi from the base repo:

- terminal cwd stays wherever the user launched Pi
- Pi starts in the lobby session
- opening a workspace switches Pi into a session whose cwd is the selected worktree path

So if the user starts Pi in `~/code/crumbs` and opens `~/code/crumbs-feature-a`, Pi should begin operating on files, Git state, and tools inside `~/code/crumbs-feature-a` even though the parent shell remains in `~/code/crumbs`.

This gives us clear semantics:

- **Lobby** = base repo session
- **Workspace** = worktree-backed Pi session
- **Open workspace** = switch Pi session to that worktree cwd
- **Return to lobby** = switch back to the base repo session

## TUI shape

The main interaction surface should be a custom overlay or modal inside Pi's TUI.

That is the best fit for this feature because it:

- keeps the current conversation visible underneath
- feels like a native workspace switcher instead of a shell command helper
- works well for list, create, remove, and doctor flows
- gives enough room to show branch, path, state, and actions clearly

The main worktree manager should probably be a single overlay with modes or subviews for:

- workspace list
- create workspace
- doctor / repair helpers
- remove confirmation

The workspace list should show the important state at a glance:

- workspace name or label
- branch
- path
- dirty or clean state
- whether Pi already has a session for that workspace

Likely actions in the overlay:

- open
- new
- return to lobby
- remove
- doctor

Outside the overlay, Pi should use lighter UI elements only for orientation.

Good supporting UI:

- a small footer indicator showing whether Pi is in the lobby or in a workspace
- optionally a small widget with the current workspace name, branch, or status

Those supporting elements should stay lightweight. They should help users remember where Pi is operating without turning the rest of the interface into a dashboard.

The main interaction should not rely only on basic select/input dialogs, and it should not be built primarily as a widget. Those are useful support pieces, but the core experience should feel like a proper workspace manager.

## Build first

The first build should stay narrow and opinionated around the lobby/workspace model.

Core capabilities:

- **List workspaces**
  - show branch, path, dirty state, and whether a session already exists
- **Create workspace**
  - create a worktree from a new or existing branch
  - optionally switch into it immediately
- **Open workspace**
  - switch Pi to the session for that worktree path
- **Return to lobby**
  - switch back to the base checkout session
- **Remove workspace safely**
  - warn or block on dirty state
  - remove the worktree cleanly instead of leaving stale registrations
- **Doctor**
  - explain common blockers
  - prune stale registrations
  - help answer questions like which worktree currently owns this branch

The first build should probably use a modal or overlay inside the TUI as the main interaction surface. That UI should show a simple workspace list and offer actions like:

- new
- open
- return to lobby
- remove
- doctor

## Why this is the right starting point

This approach fits Pi's actual runtime model well.

Pi already has:

- sessions
- session switching
- cwd-bound runtime state
- extension commands
- overlay UI
- persistent session metadata

So the most natural implementation is not arbitrary cwd mutation inside one long-lived session. The natural implementation is:

- one Pi session per worktree
- one lobby session for the base repo
- a worktree manager that routes between them

That is native to Pi and avoids fake shell-like behavior.

## Build later

Once the basic lobby/workspace model feels good, this can grow into a more complete workspace layer.

Useful later additions:

- bind lightweight task metadata to each workspace
  - task name
  - last opened time
  - status
  - notes
- add a more guided **finish workspace** flow
  - summarize what changed
  - warn if branch is unmerged
  - remove workspace and return to lobby
- add better recovery flows
  - repair moved worktrees
  - convert detached experiments into named branches
  - unlock or explain locked worktrees
- track richer workspace state inside Pi
  - last summary
  - pending todos
  - last failures
  - review notes
- support review-specific and bug-repro-specific creation flows instead of only raw branch-based creation
- show a stronger workspace dashboard with more status and context

## Product principle

Stay Git-native in storage and operations, but Pi-native in workflow.

Git should remain the source of truth for worktree state. Pi should provide the missing layer that Git does not:

- task framing
- session binding
- clear workspace switching semantics
- safer cleanup and recovery
- a TUI that makes parallel work understandable
