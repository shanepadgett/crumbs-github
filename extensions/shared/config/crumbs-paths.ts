import { homedir } from "node:os";
import { join } from "node:path";
import { resolveProjectRoot } from "./project-root.js";

export function getGlobalCrumbsPath(): string {
  return join(homedir(), ".pi", "agent", "crumbs.json");
}

export async function getProjectCrumbsPath(cwd: string): Promise<string> {
  const projectRoot = await resolveProjectRoot(cwd);
  return join(projectRoot, ".pi", "crumbs.json");
}
