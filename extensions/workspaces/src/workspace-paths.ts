import { realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export function stableRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function samePath(a: string, b: string): boolean {
  return stableRealpath(a) === stableRealpath(b);
}

export function trimRefPrefix(branchRef: string): string {
  return branchRef.replace(/^refs\/heads\//, "");
}

export function slugBranchName(branchName: string): string {
  return branchName
    .trim()
    .replace(/\//g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function deriveWorkspaceTarget(
  lobbyPath: string,
  repoName: string,
  branchName: string,
): { path: string; slug: string } {
  const slug = slugBranchName(branchName);
  return {
    path: resolve(dirname(lobbyPath), `${repoName}-${slug}`),
    slug,
  };
}

export function deriveWorkspaceLabel(
  lobbyPath: string,
  lobbyPathReal: string,
  path: string,
  pathReal: string,
  branch?: string,
): string {
  if (pathReal === lobbyPathReal) return "lobby";

  if (branch) {
    const last = branch.split("/").filter(Boolean).at(-1);
    if (last) return last;
  }

  const repoBase = basename(lobbyPath);
  const dir = basename(path);
  const prefix = `${repoBase}-`;
  return dir.startsWith(prefix) ? dir.slice(prefix.length) : dir;
}

export function compactPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 3) return normalized;
  return `…/${parts.slice(-3).join("/")}`;
}
