import { existsSync } from "node:fs";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { execGit } from "./git-worktrees.js";
import type { ExecFn, RepoContext, WorkspaceActionResult, WorkspaceRecord } from "./types.js";
import { deriveWorkspaceTarget, samePath } from "./workspace-paths.js";
import {
  rememberLobbySession,
  switchToLobbySession,
  switchToWorkspaceSession,
} from "./workspace-sessions.js";

export async function openWorkspace(
  ctx: ExtensionContext,
  exec: ExecFn,
  workspace: WorkspaceRecord,
  preferredLobbySessionByPath: Map<string, string>,
): Promise<WorkspaceActionResult> {
  if (workspace.isCurrent || samePath(workspace.path, ctx.sessionManager.getCwd())) {
    return { close: true };
  }

  await rememberLobbySession(ctx, exec, preferredLobbySessionByPath);
  await switchToWorkspaceSession(ctx, workspace.path, workspace.label);
  return { close: true };
}

export async function createWorkspace(
  ctx: ExtensionContext,
  exec: ExecFn,
  repo: RepoContext,
  preferredLobbySessionByPath: Map<string, string>,
): Promise<WorkspaceActionResult> {
  const branchRaw = await ctx.ui.input("New workspace branch", "feature/my-task");
  const branch = branchRaw?.trim();
  if (!branch) {
    return {
      close: false,
      message: { type: "info", text: "Workspace creation cancelled" },
    };
  }

  const valid = await execGit(exec, repo.lobbyPath, ["check-ref-format", "--branch", branch]);
  if (!valid.ok) throw new Error(valid.error);

  const target = deriveWorkspaceTarget(repo.lobbyPath, repo.repoName, branch);
  if (!target.slug) throw new Error("Branch name slug is empty");
  if (existsSync(target.path)) throw new Error(`Path already exists: ${target.path}`);

  const create = await execGit(exec, repo.lobbyPath, [
    "worktree",
    "add",
    "-b",
    branch,
    target.path,
    "HEAD",
  ]);
  if (!create.ok) throw new Error(create.error);

  await rememberLobbySession(ctx, exec, preferredLobbySessionByPath);
  await switchToWorkspaceSession(ctx, target.path, target.slug);
  ctx.ui.notify(`Created ${target.slug}`, "info");
  return { close: true };
}

export async function returnToLobby(
  ctx: ExtensionContext,
  repo: RepoContext,
  preferredLobbySessionByPath: Map<string, string>,
): Promise<WorkspaceActionResult> {
  if (samePath(ctx.sessionManager.getCwd(), repo.lobbyPath)) {
    return { close: true };
  }

  await switchToLobbySession(ctx, repo.lobbyPath, preferredLobbySessionByPath);
  return { close: true };
}

export async function removeWorkspace(
  ctx: ExtensionContext,
  exec: ExecFn,
  repo: RepoContext,
  workspace: WorkspaceRecord,
): Promise<WorkspaceActionResult> {
  if (workspace.isLobby) throw new Error("Cannot remove lobby");
  if (workspace.isCurrent || samePath(workspace.path, ctx.sessionManager.getCwd())) {
    throw new Error("Cannot remove current workspace");
  }

  const prompt = workspace.dirty
    ? `Remove ${workspace.label}?\n${workspace.path}\n\nThis workspace has uncommitted changes and will be force removed.`
    : `Remove ${workspace.label}?\n${workspace.path}`;

  const ok = await ctx.ui.confirm("Remove workspace", prompt);
  if (!ok) {
    return { close: false, message: { type: "info", text: "Workspace removal cancelled" } };
  }

  const removeArgs = workspace.dirty
    ? ["worktree", "remove", "--force", workspace.path]
    : ["worktree", "remove", workspace.path];
  const remove = await execGit(exec, repo.lobbyPath, removeArgs);
  if (!remove.ok) throw new Error(remove.error);

  ctx.ui.notify(`Removed ${workspace.label}`, "info");
  return { close: false };
}
