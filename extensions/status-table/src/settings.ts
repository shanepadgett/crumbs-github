import {
  CAVEMAN_NAME,
  normalizeCavemanEnhancements,
  type CavemanEnhancement,
} from "../../caveman/src/system-prompt.js";
import {
  loadEffectiveCrumbsExtensionsConfig,
  updateGlobalCrumbsConfig,
} from "../../shared/config/crumbs-loader.js";
import { asObject, type JsonObject } from "../../shared/io/json-file.js";
import type { StatusFlags, StatusTableMode, StatusTablePrefs } from "./types.js";

const DEFAULT_PREFS: StatusTablePrefs = {
  enabled: true,
  mode: "full",
};

const STATUS_TABLE_EXTENSION_KEY = "statusTable";
const CODEX_COMPAT_EXTENSION_KEY = "codexCompat";
const CAVEMAN_EXTENSION_KEY = "caveman";
const FOCUS_ADV_EXTENSION_KEY = "focusAdvanced";

function normalizeMode(value: unknown): StatusTableMode {
  return value === "minimal" ? "minimal" : "full";
}

function normalizeLegacyCavemanMode(value: unknown): CavemanEnhancement[] {
  return value === "improve" ? ["improve"] : [];
}

function normalizeFocusMode(value: unknown): "soft" | "hidden" | "hard" {
  if (value === "soft" || value === "hidden" || value === "hard") return value;
  return "hidden";
}

function readEnabled(section: JsonObject | null): boolean {
  return typeof section?.enabled === "boolean" ? section.enabled : false;
}

export async function loadStatusTablePrefs(cwd: string): Promise<StatusTablePrefs> {
  const extensions = await loadEffectiveCrumbsExtensionsConfig(cwd);
  const section = asObject(extensions[STATUS_TABLE_EXTENSION_KEY]);

  return {
    enabled: typeof section?.enabled === "boolean" ? section.enabled : DEFAULT_PREFS.enabled,
    mode: normalizeMode(section?.mode),
  };
}

export async function loadStatusFlags(cwd: string): Promise<StatusFlags> {
  const extensions = await loadEffectiveCrumbsExtensionsConfig(cwd);
  const codexCompatSection = asObject(extensions[CODEX_COMPAT_EXTENSION_KEY]);
  const cavemanSection = asObject(extensions[CAVEMAN_EXTENSION_KEY]);
  const focusSection = asObject(extensions[FOCUS_ADV_EXTENSION_KEY]);
  const cavemanEnhancements = normalizeCavemanEnhancements(cavemanSection?.enhancements);

  return {
    fastEnabled: typeof codexCompatSection?.fast === "boolean" ? codexCompatSection.fast : false,
    cavemanName: CAVEMAN_NAME,
    cavemanEnabled: readEnabled(cavemanSection),
    cavemanEnhancements:
      cavemanEnhancements.length > 0
        ? cavemanEnhancements
        : normalizeLegacyCavemanMode(cavemanSection?.mode),
    focusEnabled: readEnabled(focusSection),
    focusMode: normalizeFocusMode(focusSection?.mode),
  };
}

export async function saveStatusTablePrefs(_cwd: string, prefs: StatusTablePrefs): Promise<void> {
  await updateGlobalCrumbsConfig((current) => {
    const next = { ...current };
    const extensions = asObject(next.extensions) ?? {};
    const statusTable = asObject(extensions[STATUS_TABLE_EXTENSION_KEY]) ?? {};

    extensions[STATUS_TABLE_EXTENSION_KEY] = {
      ...statusTable,
      enabled: prefs.enabled,
      mode: prefs.mode,
    };

    next.extensions = extensions;
    return next;
  });
}
