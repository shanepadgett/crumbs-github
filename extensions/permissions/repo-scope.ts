import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { getSandboxScratchSpace } from "../shared/package-manager-env.js";
import { resolveConfiguredPath } from "./config.js";
import type {
  PermissionFilesystem,
  PermissionRepoScope,
  PermissionsConfig,
  PermissionsExec,
  ResolvedPermissionMode,
} from "./types.js";

const GIT_TIMEOUT_MS = 20_000;
const SIMPLE_GIT_COMMAND_PATTERN = /^git(?:\s|$)/;
const GIT_REDIRECT_PATTERN = /(?:^|\s)(?:-C|--git-dir|--work-tree)(?:\s|=)/;
const GIT_ENV_OVERRIDE_PATTERN = /(?:^|\s)(?:GIT_DIR|GIT_WORK_TREE)\s*=/;
const SHELL_CONTROL_PATTERN = /&&|\|\||[;|<>`]|\$\(|\n/;

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function uniquePaths(paths: Array<string | undefined>): string[] {
  return Array.from(new Set(paths.filter((path): path is string => Boolean(path))));
}

function isGitMetadataRoot(path: string): boolean {
  return path.replace(/\\/g, "/").replace(/\/+$/, "") === ".git";
}

function resolveRepoIdentityRoot(worktreeRoot: string, gitDir?: string): string {
  if (!gitDir) return worktreeRoot;

  const normalized = gitDir.replace(/\\/g, "/");
  const match = normalized.match(/^(.*)\/.git\/worktrees\/[^/]+$/);
  if (!match?.[1]) return worktreeRoot;
  return canonicalPath(match[1]);
}

async function execGit(
  exec: PermissionsExec,
  cwd: string,
  args: string[],
): Promise<string | undefined> {
  const result = await exec("git", args, { cwd, timeout: GIT_TIMEOUT_MS });
  if (result.code !== 0) return undefined;

  const stdout = result.stdout.trim();
  return stdout.length > 0 ? stdout : undefined;
}

export async function resolvePermissionRepoScope(
  exec: PermissionsExec,
  cwd: string,
): Promise<PermissionRepoScope> {
  const sessionCwd = canonicalPath(cwd);
  const topLevel = await execGit(exec, cwd, ["rev-parse", "--show-toplevel"]);

  if (!topLevel) {
    return {
      sessionCwd,
      worktreeRoot: sessionCwd,
      repoIdentityRoot: sessionCwd,
    };
  }

  const worktreeRoot = canonicalPath(topLevel);
  const gitPointerPath = canonicalPath(resolve(worktreeRoot, ".git"));
  const gitDir = await execGit(exec, worktreeRoot, ["rev-parse", "--git-dir"]);
  const gitCommonDir = await execGit(exec, worktreeRoot, ["rev-parse", "--git-common-dir"]);
  const resolvedGitDir = gitDir ? canonicalPath(resolve(worktreeRoot, gitDir)) : undefined;
  const resolvedGitCommonDir = gitCommonDir
    ? canonicalPath(resolve(worktreeRoot, gitCommonDir))
    : undefined;
  const repoIdentityRoot = resolveRepoIdentityRoot(worktreeRoot, resolvedGitDir);

  return {
    sessionCwd,
    worktreeRoot,
    repoIdentityRoot,
    gitPointerPath,
    gitDir: resolvedGitDir,
    gitCommonDir: resolvedGitCommonDir,
  };
}

export function modeAllowsGitMetadata(mode: ResolvedPermissionMode): boolean {
  return mode.shellWriteRoots.some(isGitMetadataRoot);
}

export function isSimpleGitCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!SIMPLE_GIT_COMMAND_PATTERN.test(trimmed)) return false;
  if (GIT_REDIRECT_PATTERN.test(trimmed)) return false;
  if (GIT_ENV_OVERRIDE_PATTERN.test(trimmed)) return false;
  return !SHELL_CONTROL_PATTERN.test(trimmed);
}

export async function resolveShellFilesystem(
  exec: PermissionsExec,
  cwd: string,
  mode: ResolvedPermissionMode,
  config: PermissionsConfig,
  command?: string,
): Promise<PermissionFilesystem> {
  const repoScope = await resolvePermissionRepoScope(exec, cwd);
  const basePath = repoScope.worktreeRoot;
  const scratch = getSandboxScratchSpace(`${repoScope.worktreeRoot}:${mode.key}`);
  const allowGitMetadata =
    typeof command === "string" && modeAllowsGitMetadata(mode) && isSimpleGitCommand(command);
  const configuredWriteRoots = mode.shellWriteRoots
    .filter((path) => !isGitMetadataRoot(path))
    .map((path) => resolveConfiguredPath(basePath, path));
  const protectedGitPaths = [repoScope.gitPointerPath, repoScope.gitDir, repoScope.gitCommonDir];

  return {
    denyRead: uniquePaths(config.blockedPaths.map((path) => resolveConfiguredPath(basePath, path))),
    allowWrite: uniquePaths([
      ...configuredWriteRoots,
      scratch.root,
      scratch.home,
      scratch.tmp,
      scratch.cache,
      scratch.state,
      scratch.data,
      ...(allowGitMetadata ? [repoScope.gitDir, repoScope.gitCommonDir] : []),
    ]),
    denyWrite: uniquePaths([
      ...config.blockedPaths.map((path) => resolveConfiguredPath(basePath, path)),
      ...(allowGitMetadata ? [repoScope.gitPointerPath] : protectedGitPaths),
    ]),
  };
}
