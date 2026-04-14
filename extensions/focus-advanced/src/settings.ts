import { promises as fs } from "node:fs";
import { join } from "node:path";

export type FocusMode = "soft" | "hidden" | "hard";

export interface FocusAdvancedConfig {
  enabled: boolean;
  mode: FocusMode;
  roots: string[];
  alwaysAllow: string[];
  injectPromptHint: boolean;
}

export interface EffectiveFocusState extends FocusAdvancedConfig {}

export type SessionFocusOverride = Pick<Partial<FocusAdvancedConfig>, "enabled" | "mode" | "roots">;

const SETTINGS_KEY = "crumbs-focus-advanced";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeMode(value: unknown): FocusMode {
  if (value === "soft" || value === "hidden" || value === "hard") return value;
  return "hidden";
}

export function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((pathValue) => normalizePath(pathValue.trim())).filter(Boolean))];
}

async function readJson(path: string): Promise<JsonObject> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return asObject(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

export async function loadFocusAdvancedConfig(cwd: string): Promise<FocusAdvancedConfig> {
  const root = await readJson(join(cwd, ".pi", "crumbs.json"));
  const extensions = asObject(root.extensions);
  const config = asObject(extensions?.focusAdvanced);
  const legacyPathVisibility = asObject(extensions?.pathVisibility);
  const legacyFocus = asObject(legacyPathVisibility?.focus);

  return {
    enabled:
      typeof config?.enabled === "boolean"
        ? config.enabled
        : typeof legacyFocus?.enabled === "boolean"
          ? legacyFocus.enabled
          : false,
    mode:
      config?.mode === "soft" || config?.mode === "hidden" || config?.mode === "hard"
        ? config.mode
        : normalizeMode(legacyFocus?.mode),
    roots: uniquePaths(
      asStringArray(Array.isArray(config?.roots) ? config.roots : legacyFocus?.roots),
    ),
    alwaysAllow: uniquePaths(
      asStringArray(
        Array.isArray(config?.alwaysAllow) ? config.alwaysAllow : legacyFocus?.alwaysAllow,
      ),
    ),
    injectPromptHint:
      typeof config?.injectPromptHint === "boolean" ? config.injectPromptHint : true,
  };
}

export async function loadSessionFocusOverride(
  cwd: string,
): Promise<SessionFocusOverride | undefined> {
  const settings = await readJson(join(cwd, ".pi", "settings.json"));
  const section = asObject(settings[SETTINGS_KEY]);
  if (!section) return undefined;

  const next: SessionFocusOverride = {
    ...(typeof section.enabled === "boolean" ? { enabled: section.enabled } : {}),
    ...(section.mode === "soft" || section.mode === "hidden" || section.mode === "hard"
      ? { mode: section.mode }
      : {}),
    ...(Array.isArray(section.roots) ? { roots: uniquePaths(asStringArray(section.roots)) } : {}),
  };

  return Object.keys(next).length > 0 ? next : undefined;
}

export async function saveSessionFocusOverride(
  cwd: string,
  override: SessionFocusOverride | undefined,
): Promise<void> {
  const settingsPath = join(cwd, ".pi", "settings.json");
  const settings = await readJson(settingsPath);

  if (!override) {
    delete settings[SETTINGS_KEY];
  } else {
    settings[SETTINGS_KEY] = {
      ...(typeof override.enabled === "boolean" ? { enabled: override.enabled } : {}),
      ...(override.mode ? { mode: override.mode } : {}),
      ...(override.roots !== undefined ? { roots: uniquePaths(override.roots) } : {}),
    };
  }

  await fs.mkdir(join(cwd, ".pi"), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

export function mergeFocusAdvancedState(
  config: FocusAdvancedConfig,
  override?: SessionFocusOverride,
): EffectiveFocusState {
  return {
    enabled: override?.enabled ?? config.enabled,
    mode: override?.mode ?? config.mode,
    roots: override?.roots ?? config.roots,
    alwaysAllow: config.alwaysAllow,
    injectPromptHint: config.injectPromptHint,
  };
}
