import type { ExecOptions } from "@mariozechner/pi-coding-agent";

export interface RepoContext {
  repoName: string;
  currentPath: string;
  currentPathReal: string;
  lobbyPath: string;
  lobbyPathReal: string;
  currentIsLobby: boolean;
}

export interface WorkspaceRecord {
  path: string;
  pathReal: string;
  branch?: string;
  head: string;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  isLobby: boolean;
  isCurrent: boolean;
  dirty: boolean;
  label: string;
}

export interface WorkspaceMessage {
  type: "error" | "info";
  text: string;
}

export interface UiState {
  query: string;
  selectedIndex: number;
  rows: WorkspaceRecord[];
  message?: WorkspaceMessage;
}

export interface WorkspaceActionResult {
  close: boolean;
  message?: WorkspaceMessage;
}

export type WorkspaceSelectorAction =
  | { type: "open"; workspace: WorkspaceRecord }
  | { type: "create" }
  | { type: "lobby" }
  | { type: "remove"; workspace: WorkspaceRecord };

export type ExecFn = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<{ code: number; stdout: string; stderr: string }>;
