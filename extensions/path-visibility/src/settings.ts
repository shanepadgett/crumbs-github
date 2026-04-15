import { loadEffectiveExtensionConfig } from "../../shared/config/crumbs-loader.js";
import { asObject } from "../../shared/io/json-file.js";

export type FocusMode = "soft" | "hidden" | "hard";

export interface FocusConfig {
  enabled: boolean;
  mode: FocusMode;
  roots: string[];
  alwaysAllow: string[];
}

export interface PathVisibilityConfig {
  enabled: boolean;
  hardDeny: string[];
  injectPromptHint: boolean;
  focus: FocusConfig;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

function normalizeMode(value: unknown): FocusMode {
  if (value === "soft" || value === "hidden" || value === "hard") return value;
  return "hidden";
}

function asFocusConfig(value: unknown): FocusConfig {
  const config = asObject(value);
  return {
    enabled: typeof config?.enabled === "boolean" ? config.enabled : false,
    mode: normalizeMode(config?.mode),
    roots: asStringArray(config?.roots).map(normalizePath),
    alwaysAllow: asStringArray(config?.alwaysAllow).map(normalizePath),
  };
}

export async function loadPathVisibilityConfig(cwd: string): Promise<PathVisibilityConfig> {
  const config = asObject(await loadEffectiveExtensionConfig(cwd, "pathVisibility"));
  const legacyDeny = asStringArray(config?.deny);
  const hardDeny = asStringArray(config?.hardDeny);

  return {
    enabled: typeof config?.enabled === "boolean" ? config.enabled : true,
    hardDeny: (hardDeny.length > 0 ? hardDeny : legacyDeny).map(normalizePath),
    injectPromptHint:
      typeof config?.injectPromptHint === "boolean" ? config.injectPromptHint : true,
    focus: asFocusConfig(config?.focus),
  };
}
