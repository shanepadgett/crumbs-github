# Workspaces Extension

Searchable Git worktree manager for Pi.

It does four things:

- shows the lobby checkout and all linked workspaces in one list
- creates a new workspace from a new branch
- switches Pi sessions by workspace path when you open one
- returns to the lobby and removes clean workspaces
- returns to the lobby and removes workspaces (dirty removal is confirmed and force-removed)

## How to use it

Install the package, keep the extension enabled, and reload extensions with `/reload`.

Open the manager with:

- `/workspaces`
- `Ctrl+Shift+W`

Inside the manager:

- `↑` / `↓` move
- `Enter` open selected workspace
- `Ctrl+N` create a new workspace, then enter the branch name in the prompt that appears
- `Ctrl+L` return to the lobby
- `Ctrl+X` remove the selected workspace
- type to filter
- `Esc` clears the filter, then closes the overlay

When create or remove needs more input, the selector closes first, Pi shows the prompt, and the selector reopens if you cancel.

## Quick tutorial

The **lobby** is your main checkout. New workspaces are sibling directories beside it.

Try this flow once:

1. Start in your main repo checkout.
2. Run `/workspaces`.
3. Press `Ctrl+N`.
4. Enter a branch name like `feature/test-workspace`.
5. Pi creates a new Git worktree, creates or switches to that workspace session, and opens it.
6. Run `/workspaces` again and press `Ctrl+L` to return to the lobby.
7. Run `/workspaces` again, select the workspace you made, and press `Enter` to reopen it.

That is the main loop: create, jump in, return to lobby, jump back.

## Removal

To remove a workspace:

1. Make sure you are not currently inside it.
2. Open `/workspaces`.
3. Select the workspace.
4. Press `Ctrl+X` and confirm.

If the workspace is dirty, the confirmation warns that removal will force-delete it.

The extension blocks removal of:

- the lobby
- the current workspace

## Example

- Open `/workspaces`.
- Press `Ctrl+N` and create `feature/refactor-thing`.
- Use `Ctrl+L` to go back to the lobby.
- Type `refactor` to filter.
- Press `Enter` to jump back into that workspace.
