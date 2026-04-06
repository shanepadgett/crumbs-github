import type { ExecOptions } from "@mariozechner/pi-coding-agent";

export type BasePermissionMode = "read-only" | "workspace" | "full-access";
export type DirectMutationPolicy = "none" | "workspace" | "any" | "paths";
export type NetworkMode = "restricted" | "open";
export type DestructivePolicy = "block" | "prompt" | "allow";
export type OnNoUiPolicy = "deny" | "allow";
export type SandboxState = "off" | "on" | "unsupported" | "degraded";

export interface PermissionModeDefinition {
  label?: string;
  base: BasePermissionMode;
  sandbox?: boolean;
  networkMode?: NetworkMode;
  direct?: {
    mutation?: DirectMutationPolicy;
    allowPaths?: string[];
  };
  shell?: {
    writeRoots?: string[];
  };
  destructive?: DestructivePolicy;
}

export interface ResolvedPermissionMode {
  key: string;
  label: string;
  base: BasePermissionMode;
  sandbox: boolean;
  networkMode: NetworkMode;
  directMutationPolicy: DirectMutationPolicy;
  directMutationPaths: string[];
  shellWriteRoots: string[];
  destructivePolicy: DestructivePolicy;
}

export interface PermissionsConfig {
  mode: string;
  activeMode: ResolvedPermissionMode;
  modeOrder: string[];
  modes: Record<string, ResolvedPermissionMode>;
  blockedPaths: string[];
  protectedMutationPaths: string[];
  network: {
    allowedDomains: string[];
  };
  ui: {
    showFooterStatus: boolean;
  };
  destructive: {
    onNoUi: OnNoUiPolicy;
  };
}

export interface RuntimeStatus {
  modeKey: string;
  modeLabel: string;
  networkMode: NetworkMode;
  sandboxState: SandboxState;
  sandboxReason?: string;
}

export interface InterlockMatch {
  label: string;
  reason: string;
}

export type PermissionsExec = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface PermissionRepoScope {
  sessionCwd: string;
  worktreeRoot: string;
  repoIdentityRoot: string;
  gitPointerPath?: string;
  gitDir?: string;
  gitCommonDir?: string;
}

export interface PermissionScratchSpace {
  root: string;
  home: string;
  tmp: string;
  cache: string;
  state: string;
  data: string;
}

export interface PermissionFilesystem {
  denyRead: string[];
  allowWrite: string[];
  denyWrite: string[];
}
