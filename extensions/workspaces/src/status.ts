import { basename } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { resolveRepoContext } from "./repo-context.js";
import type { ExecFn } from "./types.js";

const STATUS_KEY = "workspaces";

export async function updateOrientationStatus(ctx: ExtensionContext, exec: ExecFn): Promise<void> {
  try {
    const repo = await resolveRepoContext(exec, ctx.sessionManager.getCwd());
    const location = repo.currentIsLobby ? "Lobby" : `Workspace: ${basename(repo.currentPath)}`;
    ctx.ui.setTitle(`Pi • ${location}`);
  } catch {
    clearOrientationStatus(ctx);
  }
}

export function clearOrientationStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus(STATUS_KEY, undefined);
  ctx.ui.setTitle("Pi");
}
