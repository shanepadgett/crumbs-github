import { access } from "node:fs/promises";
import { join } from "node:path";

export const STANDARD_MISE_TASK_DIR = ".mise/tasks";

export const MISE_TASK_DIRS = [
  "mise-tasks",
  ".mise-tasks",
  "mise/tasks",
  STANDARD_MISE_TASK_DIR,
  ".config/mise/tasks",
] as const;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findMiseTaskPaths(cwd: string, taskName: string): Promise<string[]> {
  const paths: string[] = [];
  for (const dir of MISE_TASK_DIRS) {
    const directPath = `${dir}/${taskName}`;
    if (await exists(join(cwd, directPath))) paths.push(directPath);

    const groupedPath = `${dir}/${taskName.replaceAll(":", "/")}`;
    if (groupedPath !== directPath && (await exists(join(cwd, groupedPath)))) {
      paths.push(groupedPath);
    }
  }
  return paths;
}

export function standardMiseTaskPath(taskName: string): string {
  return `${STANDARD_MISE_TASK_DIR}/${taskName.replaceAll(":", "/")}`;
}

export function parseTaskConfigIncludes(miseToml: string): string[] | null {
  const lines = miseToml.split(/\r?\n/);
  let inTaskConfig = false;
  let collectingIncludes = false;
  const includes: string[] = [];

  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)]\s*$/)?.[1];
    if (section) {
      inTaskConfig = section === "task_config";
      collectingIncludes = false;
      continue;
    }

    if (!inTaskConfig) continue;

    const inline = line.match(/^\s*includes\s*=\s*\[(.*)]\s*$/)?.[1];
    if (inline !== undefined) {
      return [...inline.matchAll(/"([^"]+)"/g)].flatMap((match) => (match[1] ? [match[1]] : []));
    }

    if (/^\s*includes\s*=\s*\[\s*$/.test(line)) {
      collectingIncludes = true;
      continue;
    }

    if (!collectingIncludes) continue;
    if (/^\s*]/.test(line)) return includes;
    for (const match of line.matchAll(/"([^"]+)"/g)) {
      if (match[1]) includes.push(match[1]);
    }
  }

  return null;
}

export function taskConfigIncludesStandardDir(miseToml: string): boolean {
  const includes = parseTaskConfigIncludes(miseToml);
  return !includes || includes.includes(STANDARD_MISE_TASK_DIR);
}
