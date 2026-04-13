import { promises as fs } from "node:fs";
import { join } from "node:path";

interface PathVisibilityConfig {
  enabled: boolean;
  deny: string[];
  injectPromptHint: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

export async function loadPathVisibilityConfig(cwd: string): Promise<PathVisibilityConfig> {
  try {
    const filePath = join(cwd, ".pi", "crumbs.json");
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = asRecord(JSON.parse(raw));
    const extensions = asRecord(parsed?.extensions);
    const config = asRecord(extensions?.pathVisibility);

    return {
      enabled: typeof config?.enabled === "boolean" ? config.enabled : true,
      deny: asStringArray(config?.deny),
      injectPromptHint:
        typeof config?.injectPromptHint === "boolean" ? config.injectPromptHint : true,
    };
  } catch {
    return {
      enabled: false,
      deny: [],
      injectPromptHint: true,
    };
  }
}
