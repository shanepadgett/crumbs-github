import { existsSync, writeFileSync } from "node:fs";
import { SessionManager, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { resolveRepoContext } from "./repo-context.js";
import type { ExecFn } from "./types.js";
import { samePath, stableRealpath } from "./workspace-paths.js";

interface SwitchSessionContext extends ExtensionContext {
  switchSession(sessionPath: string): Promise<{ cancelled: boolean }>;
}

function getSwitchSession(ctx: ExtensionContext): SwitchSessionContext["switchSession"] {
  if (!("switchSession" in ctx) || typeof ctx.switchSession !== "function") {
    throw new Error("Session switching unavailable here. Use /workspaces.");
  }

  return (ctx as SwitchSessionContext).switchSession.bind(ctx);
}

function createPersistedSessionPath(cwd: string, sessionName?: string): string {
  const manager = SessionManager.create(cwd);
  if (sessionName) manager.appendSessionInfo(sessionName);
  const sessionPath = manager.getSessionFile();
  if (!sessionPath) throw new Error(`Failed to create session for ${cwd}`);

  const header = manager.getHeader();
  if (!header) throw new Error(`Failed to initialize session header for ${cwd}`);

  const lines = [header, ...manager.getEntries()].map((entry) => JSON.stringify(entry));
  writeFileSync(sessionPath, `${lines.join("\n")}\n`);
  return sessionPath;
}

export async function findMostRecentSessionPath(cwd: string): Promise<string | undefined> {
  try {
    const sessions = await SessionManager.list(cwd);
    return sessions.find((session) => session.cwd.trim() && samePath(session.cwd, cwd))?.path;
  } catch {
    return undefined;
  }
}

export async function switchToWorkspaceSession(
  ctx: ExtensionContext,
  workspacePath: string,
  sessionName?: string,
): Promise<void> {
  const switchSession = getSwitchSession(ctx);
  const existing = await findMostRecentSessionPath(workspacePath);
  await switchSession(existing ?? createPersistedSessionPath(workspacePath, sessionName));
}

export async function switchToLobbySession(
  ctx: ExtensionContext,
  lobbyPath: string,
  preferredLobbySessionByPath: Map<string, string>,
): Promise<void> {
  const switchSession = getSwitchSession(ctx);
  const lobbyKey = stableRealpath(lobbyPath);
  const preferred = preferredLobbySessionByPath.get(lobbyKey);
  if (preferred && existsSync(preferred)) {
    await switchSession(preferred);
    return;
  }

  const existing = await findMostRecentSessionPath(lobbyPath);
  await switchSession(existing ?? createPersistedSessionPath(lobbyPath));
}

export async function rememberLobbySession(
  ctx: ExtensionContext,
  exec: ExecFn,
  preferredLobbySessionByPath: Map<string, string>,
): Promise<void> {
  const sessionPath = ctx.sessionManager.getSessionFile();
  if (!sessionPath) return;

  try {
    const repo = await resolveRepoContext(exec, ctx.sessionManager.getCwd());
    if (!repo.currentIsLobby) return;
    preferredLobbySessionByPath.set(repo.lobbyPathReal, sessionPath);
  } catch {
    return;
  }
}
