import type { ExecFn, RepoContext, WorkspaceRecord } from "./types.js";
import { deriveWorkspaceLabel, stableRealpath, trimRefPrefix } from "./workspace-paths.js";

interface ParsedWorktreeRecord {
  path: string;
  branch?: string;
  head: string;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
}

export async function execGit(
  exec: ExecFn,
  cwd: string,
  args: string[],
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  const result = await exec("git", args, { cwd, timeout: 20_000 });
  if (result.code === 0) return { ok: true, stdout: result.stdout };

  const message = result.stderr.trim() || result.stdout.trim() || `git ${args.join(" ")} failed`;
  return { ok: false, error: message };
}

export function parseWorktreeList(stdout: string): ParsedWorktreeRecord[] {
  return stdout
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const row: ParsedWorktreeRecord = {
        path: "",
        branch: undefined,
        head: "",
        detached: false,
        locked: false,
        prunable: false,
      };

      for (const line of block.split("\n")) {
        if (line.startsWith("worktree ")) row.path = line.slice("worktree ".length).trim();
        else if (line.startsWith("HEAD ")) row.head = line.slice("HEAD ".length).trim();
        else if (line.startsWith("branch ")) {
          row.branch = trimRefPrefix(line.slice("branch ".length).trim());
        } else if (line === "detached") {
          row.detached = true;
        } else if (line.startsWith("locked")) {
          row.locked = true;
        } else if (line.startsWith("prunable")) {
          row.prunable = true;
        }
      }

      return row;
    })
    .filter((row) => row.path.length > 0);
}

async function isWorkspaceDirty(exec: ExecFn, path: string): Promise<boolean> {
  const result = await exec("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: path,
    timeout: 20_000,
  });
  if (result.code !== 0) return false;
  return result.stdout.trim().length > 0;
}

export async function listWorkspaces(exec: ExecFn, repo: RepoContext): Promise<WorkspaceRecord[]> {
  const list = await execGit(exec, repo.currentPath, ["worktree", "list", "--porcelain"]);
  if (!list.ok) throw new Error(list.error);

  const rows = await Promise.all(
    parseWorktreeList(list.stdout).map(async (item) => {
      const pathReal = stableRealpath(item.path);
      const dirty = await isWorkspaceDirty(exec, item.path);
      return {
        path: item.path,
        pathReal,
        branch: item.branch,
        head: item.head,
        detached: item.detached,
        locked: item.locked,
        prunable: item.prunable,
        isLobby: pathReal === repo.lobbyPathReal,
        isCurrent: pathReal === repo.currentPathReal,
        dirty,
        label: deriveWorkspaceLabel(
          repo.lobbyPath,
          repo.lobbyPathReal,
          item.path,
          pathReal,
          item.branch,
        ),
      } satisfies WorkspaceRecord;
    }),
  );

  rows.sort((a, b) => {
    if (a.isLobby && !b.isLobby) return -1;
    if (!a.isLobby && b.isLobby) return 1;
    return a.label.localeCompare(b.label);
  });

  return rows;
}
