import { promises as fs } from "node:fs";
import { extname, join, relative } from "node:path";
import { matchesAny, normalizePath } from "../config.js";
import type { Snapshot } from "../core/types.js";
import type { MiseTaskConfig } from "./config.js";

export const BUILT_IN_IGNORED_DIRECTORIES = [
  ".build",
  ".cache",
  ".git",
  ".gradle",
  ".mypy_cache",
  ".pi",
  ".pytest_cache",
  ".ruff_cache",
  ".swiftpm",
  ".tox",
  ".venv",
  "DerivedData",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "tmp",
  "venv",
  "vendor",
] as const;

const IGNORED_DIRECTORIES = new Set<string>(BUILT_IN_IGNORED_DIRECTORIES);

function isGlobExcluded(pathValue: string, config: MiseTaskConfig): boolean {
  return (
    matchesAny(pathValue, config.globalExcludeGlobs) || matchesAny(pathValue, config.excludeGlobs)
  );
}

export function shouldSkipDirectory(relativePath: string, config: MiseTaskConfig): boolean {
  const normalizedPath = normalizePath(relativePath);
  if (normalizedPath.length === 0) return false;
  return isGlobExcluded(`${normalizedPath}/__pi_probe__`, config);
}

export function shouldTrackPath(relativePath: string, config: MiseTaskConfig): boolean {
  const normalizedPath = normalizePath(relativePath);
  if (matchesAny(normalizedPath, config.globalExcludeGlobs)) return false;
  if (config.includeGlobs.length > 0 && !matchesAny(normalizedPath, config.includeGlobs))
    return false;
  if (matchesAny(normalizedPath, config.excludeGlobs)) return false;
  if (config.trackedExtensions.length === 0) return false;
  return config.trackedExtensions.includes(extname(normalizedPath).toLowerCase());
}

export async function scanMiseInputs(root: string, config: MiseTaskConfig): Promise<Snapshot> {
  const snapshot: Snapshot = new Map();

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        const directoryKey = normalizePath(relative(root, join(currentPath, entry.name)));
        if (shouldSkipDirectory(directoryKey, config)) continue;
        await walk(join(currentPath, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;

      const fullPath = join(currentPath, entry.name);
      const fileKey = normalizePath(relative(root, fullPath));
      if (!shouldTrackPath(fileKey, config)) continue;

      const stats = await fs.stat(fullPath);
      snapshot.set(fileKey, `${stats.size}:${stats.mtimeMs}`);
    }
  }

  await walk(root);
  return snapshot;
}
