import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolSpec, VersionSource } from "./types.js";

const execFileAsync = promisify(execFile);

function cleanVersion(value: string): string | null {
  const trimmed = value.trim().replace(/^v/, "");
  return /^\d+\.\d+\.\d+/.test(trimmed) ? trimmed : null;
}

function latestStable(versions: string[]): string[] {
  const seen = new Set<string>();
  return versions
    .map(cleanVersion)
    .filter((version): version is string => !!version && !version.includes("-"))
    .filter((version) => {
      if (seen.has(version)) return false;
      seen.add(version);
      return true;
    })
    .slice(0, 12);
}

function versionParts(version: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = version.split(/[.+-]/, 3);
  return [Number(major), Number(minor), Number(patch)];
}

function isBeforeVersion(version: string, limit: string): boolean {
  const left = versionParts(version);
  const right = versionParts(limit);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
}

async function resolveMise(tool: string): Promise<string[]> {
  const { stdout } = await execFileAsync("mise", ["ls-remote", tool], {
    timeout: 15_000,
    encoding: "utf8",
  });
  return latestStable(stdout.split(/\r?\n/).reverse());
}

async function resolveNpm(packageName: string): Promise<string[]> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
  if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${packageName}`);
  const data = (await response.json()) as { versions?: Record<string, unknown> };
  return latestStable(Object.keys(data.versions ?? {}).reverse());
}

async function resolvePyPi(packageName: string): Promise<string[]> {
  const response = await fetch(`https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`);
  if (!response.ok) throw new Error(`PyPI returned ${response.status} for ${packageName}`);
  const data = (await response.json()) as { releases?: Record<string, unknown> };
  return latestStable(Object.keys(data.releases ?? {}).reverse());
}

async function resolveGitHub(repo: string): Promise<string[]> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases`);
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${repo}`);
  const data = (await response.json()) as Array<{
    tag_name?: string;
    prerelease?: boolean;
    draft?: boolean;
  }>;
  return latestStable(
    data.filter((item) => !item.prerelease && !item.draft).map((item) => item.tag_name ?? ""),
  );
}

export async function resolveVersions(source: VersionSource): Promise<string[]> {
  if (source.kind === "mise") return resolveMise(source.tool);
  if (source.kind === "npm") return resolveNpm(source.packageName);
  if (source.kind === "pypi") return resolvePyPi(source.packageName);
  return resolveGitHub(source.repo);
}

export async function resolveToolVersions(tool: ToolSpec): Promise<string[]> {
  const resolved = await resolveVersions(tool.source);
  const versions = tool.maxVersionExclusive
    ? resolved.filter((version) => isBeforeVersion(version, tool.maxVersionExclusive ?? ""))
    : resolved;
  if (versions.length === 0) throw new Error(`No stable versions found for ${tool.label}`);
  return versions;
}
