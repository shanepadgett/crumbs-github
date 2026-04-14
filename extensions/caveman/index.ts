/**
 * Caveman Extension
 *
 * What it does:
 * - Adds `/caveman` to toggle a caveman system prompt on/off.
 * - Replaces the full system prompt per turn when enabled.
 * - Supports two user modes: `minimal` and `self-improving`.
 *
 * How to use it:
 * - Run `/caveman on` for minimal caveman coding mode.
 * - Run `/caveman improve` for caveman mode with Pi-doc/self-improvement guidance.
 * - Run `/caveman off` to restore normal prompt behavior.
 *
 * Example:
 * - `/caveman improve`
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CRUMBS_EVENT_CAVEMAN_CHANGED } from "../shared/crumbs-events.js";
import {
  buildCavemanSystemPrompt,
  normalizeCavemanMode,
  type CavemanMode,
} from "./src/system-prompt.js";

type CavemanState = {
  enabled: boolean;
  mode: CavemanMode;
};

type JsonObject = Record<string, unknown>;

const SETTINGS_KEY = "crumbs-caveman";
const DEFAULT_STATE: CavemanState = { enabled: false, mode: "minimal" };

const require = createRequire(import.meta.url);

function asObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "settings.json");
}

function readJsonFile(path: string): JsonObject {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return asObject(parsed) ?? {};
  } catch {
    return {};
  }
}

function parseState(settings: JsonObject): CavemanState {
  const section = asObject(settings[SETTINGS_KEY]);
  if (!section) return { ...DEFAULT_STATE };

  const enabled = typeof section.enabled === "boolean" ? section.enabled : DEFAULT_STATE.enabled;
  const mode = normalizeCavemanMode(section.mode) ?? DEFAULT_STATE.mode;
  return { enabled, mode };
}

function saveState(cwd: string, state: CavemanState): void {
  const settingsPath = getProjectSettingsPath(cwd);
  const settings = readJsonFile(settingsPath);
  settings[SETTINGS_KEY] = {
    enabled: state.enabled,
    mode: state.mode,
  };

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function loadState(cwd: string): CavemanState {
  const settings = readJsonFile(getProjectSettingsPath(cwd));
  return parseState(settings);
}

function getPiDocsPaths(): { readme: string; docs: string; examples: string } {
  try {
    const pkgPath = require.resolve("@mariozechner/pi-coding-agent/package.json");
    const root = dirname(pkgPath);
    return {
      readme: join(root, "README.md"),
      docs: join(root, "docs"),
      examples: join(root, "examples"),
    };
  } catch {
    return {
      readme: "README.md",
      docs: "docs",
      examples: "examples",
    };
  }
}

function notifyMode(ctx: ExtensionContext, state: CavemanState): void {
  if (!ctx.hasUI) return;
  if (!state.enabled) {
    ctx.ui.notify("Caveman mode disabled.", "info");
    return;
  }
  const label = state.mode === "improve" ? "self-improving" : "minimal";
  ctx.ui.notify(`Caveman mode enabled (${label}).`, "info");
}

export default function cavemanExtension(pi: ExtensionAPI): void {
  const stateByCwd = new Map<string, CavemanState>();

  function getState(cwd: string): CavemanState {
    const cached = stateByCwd.get(cwd);
    if (cached) return cached;
    const loaded = loadState(cwd);
    stateByCwd.set(cwd, loaded);
    return loaded;
  }

  function setState(
    ctx: ExtensionContext,
    next: CavemanState,
    options?: { notify?: boolean },
  ): void {
    stateByCwd.set(ctx.cwd, next);
    saveState(ctx.cwd, next);
    pi.events.emit(CRUMBS_EVENT_CAVEMAN_CHANGED, {
      cwd: ctx.cwd,
      enabled: next.enabled,
      mode: next.mode,
    });
    if (options?.notify !== false) notifyMode(ctx, next);
  }

  function applyArg(current: CavemanState, rawArgs: string): CavemanState | "usage" {
    const trimmed = rawArgs.trim().toLowerCase();
    if (!trimmed) {
      return { ...current, enabled: !current.enabled };
    }

    if (trimmed === "off") {
      return { ...current, enabled: false };
    }

    if (trimmed === "on") {
      return { enabled: true, mode: "minimal" };
    }

    if (trimmed === "improve") {
      return { enabled: true, mode: "improve" };
    }

    return "usage";
  }

  pi.registerCommand("caveman", {
    description: "Toggle caveman mode: /caveman [on|off|improve]",
    getArgumentCompletions(prefix) {
      const value = prefix.trim().toLowerCase();
      const options = ["off", "on", "improve"];
      const filtered = options.filter((item) => item.startsWith(value));
      return filtered.length > 0 ? filtered.map((item) => ({ value: item, label: item })) : null;
    },
    handler: async (args, ctx) => {
      const current = getState(ctx.cwd);
      const result = applyArg(current, args);

      if (result === "usage") {
        if (ctx.hasUI) {
          ctx.ui.notify("Usage: /caveman [on|off|improve]", "warning");
        }
        return;
      }

      setState(ctx, result);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const state = getState(ctx.cwd);
    pi.events.emit(CRUMBS_EVENT_CAVEMAN_CHANGED, {
      cwd: ctx.cwd,
      enabled: state.enabled,
      mode: state.mode,
    });
  });

  (pi as any).on("session_switch", async (_event: unknown, ctx: ExtensionContext) => {
    const state = getState(ctx.cwd);
    pi.events.emit(CRUMBS_EVENT_CAVEMAN_CHANGED, {
      cwd: ctx.cwd,
      enabled: state.enabled,
      mode: state.mode,
    });
  });

  (pi as any).on("session_tree", async (_event: unknown, ctx: ExtensionContext) => {
    const state = getState(ctx.cwd);
    pi.events.emit(CRUMBS_EVENT_CAVEMAN_CHANGED, {
      cwd: ctx.cwd,
      enabled: state.enabled,
      mode: state.mode,
    });
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    const state = getState(ctx.cwd);
    if (!state.enabled) return undefined;

    const docs = getPiDocsPaths();
    const systemPrompt = buildCavemanSystemPrompt({
      cwd: ctx.cwd,
      date: new Date().toISOString().slice(0, 10),
      mode: state.mode,
      tools: pi.getActiveTools(),
      docs,
    });

    return { systemPrompt };
  });
}
