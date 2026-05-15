import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEffectiveCrumbsExtensionsConfig } from "../../shared/config/crumbs-loader.js";
import { asObject } from "../../shared/io/json-file.js";
import { detectScopes } from "./detect.js";
import {
  findMiseTaskPaths,
  STANDARD_MISE_TASK_DIR,
  standardMiseTaskPath,
  taskConfigIncludesStandardDir,
} from "./mise-tasks.js";
import type { Scope } from "./types.js";

function expectedTools(scope: Scope): string[] {
  if (scope === "ts")
    return ["bun|node", "npm:oxlint|npm:@biomejs/biome", "npm:oxfmt|npm:@biomejs/biome"];
  if (scope === "markdown") return ["npm:markdownlint-cli2", "python", "uv"];
  if (scope === "yaml") return ["python", "uv", "pipx:yamllint"];
  if (scope === "go") return ["go", "golangci-lint"];
  if (scope === "swift") return ["swiftformat", "swiftlint"];
  return [];
}

async function readMiseToml(cwd: string): Promise<string> {
  try {
    return await readFile(join(cwd, "mise.toml"), "utf8");
  } catch {
    return "";
  }
}

function hasQuietConfig(
  extensions: Record<string, unknown>,
  scope: Scope,
): "ok" | "disabled" | "missing" {
  const quiet = asObject(extensions.quietMiseTask);
  const configs = Array.isArray(quiet?.configs) ? quiet.configs : [];
  for (const item of configs) {
    const config = asObject(item);
    if (!config) continue;
    if (config.name !== scope && config.task !== `check:${scope}`) continue;
    return config.enabled === false ? "disabled" : "ok";
  }
  return "missing";
}

export async function runDoctor(cwd: string): Promise<string> {
  const scopes = await detectScopes(cwd);
  const extensions = await loadEffectiveCrumbsExtensionsConfig(cwd);
  const miseToml = await readMiseToml(cwd);
  const lines = ["repo-scaffold doctor", ""];
  if (!taskConfigIncludesStandardDir(miseToml)) {
    lines.push(`missing: mise [task_config].includes excludes ${STANDARD_MISE_TASK_DIR}`);
    lines.push("");
  }

  if (scopes.size === 0) {
    lines.push("suggested: no supported repo scopes detected");
    return lines.join("\n");
  }

  for (const scope of scopes) {
    const taskName = `check:${scope}`;
    const taskPath = standardMiseTaskPath(taskName);
    const taskPaths = await findMiseTaskPaths(cwd, taskName);
    const taskStatus = taskPaths.includes(taskPath)
      ? "ok"
      : taskPaths.length > 0
        ? `non-standard (${taskPaths.join(", ")})`
        : "missing";
    const quietStatus = hasQuietConfig(extensions, scope);
    const tools = expectedTools(scope);
    const missingTools = tools.filter(
      (tool) => !tool.split("|").some((part) => miseToml.includes(part)),
    );
    lines.push(`${scope}:`);
    lines.push(`- task ${taskName}: ${taskStatus}`);
    lines.push(`- quiet-validator config: ${quietStatus}`);
    lines.push(
      `- tool pins: ${missingTools.length === 0 ? "ok" : `missing ${missingTools.join(", ")}`}`,
    );
  }

  return lines.join("\n");
}
