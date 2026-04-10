import { mkdir } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { ExtensionContext, ExecResult } from "@mariozechner/pi-coding-agent";

const REQUEST_DIR_RELATIVE = ".pi/local/question-runtime/requests";

type ExecFn = (
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
) => Promise<ExecResult>;

export interface RuntimeRequestPaths {
  absolutePath: string;
  path: string;
  projectRelativePath: string;
  directory: string;
}

export async function resolveProjectRoot(exec: ExecFn, cwd: string): Promise<string> {
  const result = await exec("git", ["rev-parse", "--show-toplevel"], { cwd });
  if (result.code !== 0) {
    const message =
      result.stderr.trim() || result.stdout.trim() || "Failed to resolve git top-level";
    throw new Error(message);
  }

  const root = result.stdout.trim();
  if (!root) throw new Error("Git top-level path was empty");
  return normalize(root);
}

export function getRequestDirectory(projectRoot: string): string {
  return normalize(join(projectRoot, REQUEST_DIR_RELATIVE));
}

export async function ensureRequestDirectory(projectRoot: string): Promise<string> {
  const directory = getRequestDirectory(projectRoot);
  await mkdir(directory, { recursive: true });
  return directory;
}

export function buildRuntimeRequestPaths(
  projectRoot: string,
  requestId: string,
): RuntimeRequestPaths {
  const directory = getRequestDirectory(projectRoot);
  const absolutePath = normalize(join(directory, `${requestId}.json`));
  const displayRelative = toProjectRelativePath(projectRoot, absolutePath);
  return {
    absolutePath,
    path: withToolPathPrefix(absolutePath),
    projectRelativePath: withToolPathPrefix(displayRelative),
    directory,
  };
}

export function toProjectRelativePath(projectRoot: string, absolutePath: string): string {
  const value = normalize(relative(projectRoot, absolutePath));
  return value.startsWith(".") ? value : `.${value ? `/${value}` : ""}`;
}

export function withToolPathPrefix(path: string): string {
  return path.startsWith("@") ? path : `@${path}`;
}

export function stripToolPathPrefix(path: string): string {
  return path.trim().replace(/^@/, "");
}

export function normalizeCanonicalAbsolutePath(path: string, cwd?: string): string {
  const stripped = stripToolPathPrefix(path);
  if (!stripped) return "";
  if (isAbsolute(stripped)) return normalize(stripped);
  return normalize(resolve(cwd ?? process.cwd(), stripped));
}

export async function resolveRuntimeRequestDirectory(
  exec: ExecFn,
  ctx: Pick<ExtensionContext, "cwd">,
): Promise<{ projectRoot: string; requestDirectory: string }> {
  const projectRoot = await resolveProjectRoot(exec, ctx.cwd);
  const requestDirectory = await ensureRequestDirectory(projectRoot);
  return { projectRoot, requestDirectory };
}
