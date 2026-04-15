import {
  loadEffectiveCrumbsExtensionsConfig,
  loadProjectCrumbsConfig,
  updateProjectCrumbsConfig,
} from "../../shared/config/crumbs-loader.js";
import { asObject } from "../../shared/io/json-file.js";

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

export async function loadFocusAdvancedConfig(cwd: string): Promise<FocusAdvancedConfig> {
  const extensions = asObject(await loadEffectiveCrumbsExtensionsConfig(cwd));
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
  const config = await loadProjectCrumbsConfig(cwd);
  const extensions = asObject(config.extensions);
  const focusAdvanced = asObject(extensions?.focusAdvanced);
  const section = asObject(focusAdvanced?.sessionFocus);
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
  await updateProjectCrumbsConfig(cwd, (current) => {
    const next = { ...current };
    const extensions = asObject(next.extensions) ?? {};
    const focusAdvanced = asObject(extensions.focusAdvanced) ?? {};

    if (!override) {
      delete focusAdvanced.sessionFocus;
    } else {
      focusAdvanced.sessionFocus = {
        ...(typeof override.enabled === "boolean" ? { enabled: override.enabled } : {}),
        ...(override.mode ? { mode: override.mode } : {}),
        ...(override.roots !== undefined ? { roots: uniquePaths(override.roots) } : {}),
      };
    }

    if (Object.keys(focusAdvanced).length === 0) {
      delete extensions.focusAdvanced;
    } else {
      extensions.focusAdvanced = focusAdvanced;
    }

    if (Object.keys(extensions).length === 0) {
      delete next.extensions;
    } else {
      next.extensions = extensions;
    }

    return next;
  });
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
