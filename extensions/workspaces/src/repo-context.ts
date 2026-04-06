import { basename, dirname, resolve } from "node:path";
import { execGit } from "./git-worktrees.js";
import type { ExecFn, RepoContext } from "./types.js";
import { stableRealpath } from "./workspace-paths.js";

export async function resolveRepoContext(exec: ExecFn, cwd: string): Promise<RepoContext> {
  const top = await execGit(exec, cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) throw new Error(top.error);
  const currentPath = top.stdout.trim();

  const common = await execGit(exec, currentPath, ["rev-parse", "--git-common-dir"]);
  if (!common.ok) throw new Error(common.error);

  const resolvedCommon = resolve(currentPath, common.stdout.trim());
  const lobbyPath = dirname(resolvedCommon);
  const currentPathReal = stableRealpath(currentPath);
  const lobbyPathReal = stableRealpath(lobbyPath);

  return {
    repoName: basename(lobbyPath),
    currentPath,
    currentPathReal,
    lobbyPath,
    lobbyPathReal,
    currentIsLobby: currentPathReal === lobbyPathReal,
  };
}
