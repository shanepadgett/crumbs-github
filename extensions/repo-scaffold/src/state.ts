import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEffectiveCrumbsExtensionsConfig } from "../../shared/config/crumbs-loader.js";
import { asObject, readJsonObject } from "../../shared/io/json-file.js";
import { detectPrimaryJsRuntime, detectScopes } from "./detect.js";
import { MISE_TASK_DIRS, parseTaskConfigIncludes } from "./mise-tasks.js";
import type { ScaffoldOptions, Scope } from "./types.js";

export type ExistingState = {
  scopes: Set<Scope>;
  options: ScaffoldOptions;
  miseTools: Record<string, string>;
  packageDevDependencies: Record<string, string>;
  quietValidatorNames: Set<string>;
  quietValidatorTasks: Set<string>;
  taskPathsByName: Map<string, string[]>;
  taskConfigIncludes: string[] | null;
};

async function readMiseToml(cwd: string): Promise<string> {
  try {
    return await readFile(join(cwd, "mise.toml"), "utf8");
  } catch {
    return "";
  }
}

function parseMiseTools(miseToml: string): Record<string, string> {
  const tools: Record<string, string> = {};
  let inTools = false;
  for (const line of miseToml.split(/\r?\n/)) {
    const section = line.match(/^\s*\[([^\]]+)]\s*$/)?.[1];
    if (section) {
      inTools = section === "tools";
      continue;
    }
    if (!inTools) continue;
    const match = line.match(/^\s*("[^"]+"|[A-Za-z0-9_:@/-]+)\s*=\s*"([^"]+)"/);
    if (!match?.[1] || !match[2]) continue;
    tools[match[1].replace(/^"|"$/g, "")] = match[2];
  }
  return tools;
}

async function listTaskPaths(cwd: string): Promise<Map<string, string[]>> {
  const byName = new Map<string, string[]>();

  async function visit(rootDir: string, relativeDir: string): Promise<void> {
    let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
    try {
      entries = (await readdir(join(cwd, rootDir, relativeDir), { withFileTypes: true })) as Array<{
        name: string;
        isFile(): boolean;
        isDirectory(): boolean;
      }>;
    } catch {
      return;
    }

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await visit(rootDir, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const taskName = relativePath.endsWith("/_default")
        ? relativePath.replace(/\/_default$/, "").replaceAll("/", ":")
        : relativePath.replaceAll("/", ":");
      const paths = byName.get(taskName) ?? [];
      paths.push(`${rootDir}/${relativePath}`);
      byName.set(taskName, paths);
    }
  }

  for (const dir of MISE_TASK_DIRS) {
    await visit(dir, "");
  }
  return byName;
}

function parseQuietValidatorState(extensions: Record<string, unknown>): {
  names: Set<string>;
  tasks: Set<string>;
} {
  const names = new Set<string>();
  const tasks = new Set<string>();
  const quiet = asObject(extensions.quietMiseTask);
  const configs = Array.isArray(quiet?.configs) ? quiet.configs : [];
  for (const item of configs) {
    const config = asObject(item);
    if (!config) continue;
    if (typeof config.name === "string") names.add(config.name);
    if (typeof config.task === "string") tasks.add(config.task);
  }
  return { names, tasks };
}

function inferQualityStack(miseTools: Record<string, string>): "ox" | "biome" {
  return miseTools["npm:@biomejs/biome"] ? "biome" : "ox";
}

export async function inspectExistingState(cwd: string): Promise<ExistingState> {
  const [scopes, primaryJsRuntime, packageJson, extensions, miseToml, taskPathsByName] =
    await Promise.all([
      detectScopes(cwd),
      detectPrimaryJsRuntime(cwd),
      readJsonObject(join(cwd, "package.json")),
      loadEffectiveCrumbsExtensionsConfig(cwd),
      readMiseToml(cwd),
      listTaskPaths(cwd),
    ]);
  const quiet = parseQuietValidatorState(extensions);
  const miseTools = parseMiseTools(miseToml);
  const devDependencies = asObject(packageJson.devDependencies) ?? {};
  return {
    scopes,
    options: { primaryJsRuntime, jsQualityStack: inferQualityStack(miseTools) },
    miseTools,
    packageDevDependencies: Object.fromEntries(
      Object.entries(devDependencies).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    quietValidatorNames: quiet.names,
    quietValidatorTasks: quiet.tasks,
    taskPathsByName,
    taskConfigIncludes: parseTaskConfigIncludes(miseToml),
  };
}
