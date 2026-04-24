import { describe, expect, test } from "bun:test";
import { parseWorktreeList } from "./git-worktrees.js";

describe("parseWorktreeList", () => {
  test("parses branch worktrees and trims ref prefixes", () => {
    const rows = parseWorktreeList(`worktree /repo
HEAD abc123
branch refs/heads/main

worktree /repo-feature
HEAD def456
branch refs/heads/feature/test
locked
`);

    expect(rows).toEqual([
      {
        path: "/repo",
        branch: "main",
        head: "abc123",
        detached: false,
        locked: false,
        prunable: false,
      },
      {
        path: "/repo-feature",
        branch: "feature/test",
        head: "def456",
        detached: false,
        locked: true,
        prunable: false,
      },
    ]);
  });

  test("parses detached and prunable worktrees", () => {
    const rows = parseWorktreeList(`worktree /repo-detached
HEAD cafe123
detached
prunable gitdir file points to non-existent location
`);

    expect(rows).toEqual([
      {
        path: "/repo-detached",
        branch: undefined,
        head: "cafe123",
        detached: true,
        locked: false,
        prunable: true,
      },
    ]);
  });

  test("ignores blocks without worktree path", () => {
    const rows = parseWorktreeList(`HEAD missing-path
branch refs/heads/nope

worktree /repo
HEAD abc123
branch refs/heads/main
`);

    expect(rows).toEqual([
      {
        path: "/repo",
        branch: "main",
        head: "abc123",
        detached: false,
        locked: false,
        prunable: false,
      },
    ]);
  });
});
