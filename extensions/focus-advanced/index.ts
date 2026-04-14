/**
 * Focus Advanced Extension
 *
 * What it does:
 * - Adds `/focus-advanced` with tree UI to scope work to selected folders.
 * - Provides focused discovery tools so agent can list, search, and read inside active focus roots.
 * - Steers or blocks bash discovery in `soft`, `hidden`, and `hard` modes.
 * - Requests user approval before outside-scope path access in `hidden` and `hard` modes.
 *
 * How to use it:
 * - Configure optional defaults in `extensions.focusAdvanced` in `.pi/crumbs.json`.
 * - Run `/focus-advanced ui` to pick exact folders, or `/focus-advanced on <path...>`.
 * - Use `hidden` or `hard` mode to push discovery through focus tools instead of bash.
 * - Use `hidden` or `hard` mode to gate outside-scope reads and writes with permission prompts.
 *
 * Example:
 * - `/focus-advanced ui`
 * - `/focus-advanced mode hidden`
 */

import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CRUMBS_EVENT_FOCUS_ADV_CHANGED } from "../shared/crumbs-events.js";
import {
  bashDiscoveryBlockReason,
  buildFocusAdvancedPromptHint,
  extractPatchTargets,
  findOutsideFocusTargets,
  isFocusActive,
  isPathAllowed,
} from "./src/scope.js";
import { showFocusPermissionDialog } from "./src/permission.js";
import {
  loadFocusAdvancedConfig,
  loadSessionFocusOverride,
  mergeFocusAdvancedState,
  normalizePath,
  saveSessionFocusOverride,
  uniquePaths,
  type EffectiveFocusState,
  type FocusAdvancedConfig,
  type FocusMode,
  type SessionFocusOverride,
} from "./src/settings.js";
import { showFocusAdvancedSelector } from "./src/ui.js";

const DEFAULT_READ_LIMIT = 200;
const MAX_READ_LIMIT = 1000;
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 1000;
const DEFAULT_SEARCH_LIMIT = 200;
const MAX_SEARCH_LIMIT = 1000;
const IGNORED_SCAN_DIRS = new Set([".git", "node_modules"]);

const FOCUS_LIST_FILES_PARAMS = Type.Object({
  query: Type.Optional(
    Type.String({ description: "Optional substring filter matched against relative paths." }),
  ),
  includeDirectories: Type.Optional(
    Type.Boolean({ description: "Include directories in results (default: true)." }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Maximum results to return (default: 200, max: 1000)." }),
  ),
});

const FOCUS_SEARCH_TEXT_PARAMS = Type.Object({
  query: Type.String({ description: "Text or regex pattern to search within active focus roots." }),
  fixedStrings: Type.Optional(
    Type.Boolean({ description: "Treat query as literal text instead of regex (default: false)." }),
  ),
  glob: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      description: "Optional rg globs to include or exclude. Example: ['*.ts', '!dist/**'].",
    }),
  ),
  contextLines: Type.Optional(
    Type.Number({ description: "Context lines around matches (default: 0)." }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Maximum matching lines to return (default: 200, max: 1000)." }),
  ),
});

const FOCUS_READ_PARAMS = Type.Object({
  path: Type.String({
    description: "Path to read. Must be inside active focus roots or alwaysAllow.",
  }),
  offset: Type.Optional(
    Type.Number({ description: "Line number to start reading from (1-indexed)." }),
  ),
  limit: Type.Optional(
    Type.Number({ description: "Maximum number of lines to read (default: 200, max: 1000)." }),
  ),
});

function clampInteger(value: unknown, fallback: number, max: number, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseArgs(args: string): string[] {
  return args
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function textResult(text: string) {
  return [{ type: "text" as const, text }];
}

function renderTextResult(
  result: { content: Array<{ type: string; text?: string }> },
  expanded: boolean,
  theme: any,
) {
  if (!expanded) return new Text("", 0, 0);
  const text = result.content.find((item) => item.type === "text" && typeof item.text === "string");
  if (!text || typeof text.text !== "string") return new Text("", 0, 0);
  const body = text.text
    .split("\n")
    .map((line) => theme.fg("toolOutput", line))
    .join("\n");
  return body ? new Text(`\n${body}`, 0, 0) : new Text("", 0, 0);
}

type ScopeEntry = {
  path: string;
  absolutePath: string;
  kind: "file" | "directory";
};

async function resolveScopeEntries(cwd: string, state: EffectiveFocusState): Promise<ScopeEntry[]> {
  const rawPaths = uniquePaths([...state.roots, ...state.alwaysAllow]);
  const entries: ScopeEntry[] = [];

  for (const rawPath of rawPaths) {
    const normalized = normalizePath(rawPath);
    const absolutePath = resolve(cwd, normalized);

    try {
      const stats = await fs.stat(absolutePath);
      entries.push({
        path: normalized,
        absolutePath,
        kind: stats.isDirectory() ? "directory" : "file",
      });
    } catch {
      continue;
    }
  }

  return entries;
}

async function listFocusedPaths(
  cwd: string,
  state: EffectiveFocusState,
  options?: { query?: string; includeDirectories?: boolean; maxResults?: number },
): Promise<string[]> {
  const scopeEntries = await resolveScopeEntries(cwd, state);
  const query = options?.query?.trim().toLowerCase() ?? "";
  const includeDirectories = options?.includeDirectories !== false;
  const maxResults = clampInteger(options?.maxResults, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, 1);
  const results: string[] = [];
  const seen = new Set<string>();

  function matches(pathValue: string): boolean {
    return query.length === 0 || pathValue.toLowerCase().includes(query);
  }

  function push(pathValue: string): void {
    if (results.length >= maxResults || seen.has(pathValue) || !matches(pathValue)) return;
    seen.add(pathValue);
    results.push(pathValue);
  }

  async function walk(relativeRoot: string, absoluteRoot: string): Promise<void> {
    if (results.length >= maxResults) return;

    let entries: Array<{ isDirectory(): boolean; isFile(): boolean; name: string }>;
    try {
      const dirents = await fs.readdir(absoluteRoot, { withFileTypes: true, encoding: "utf8" });
      entries = dirents.map((entry) => ({
        isDirectory: () => entry.isDirectory(),
        isFile: () => entry.isFile(),
        name: String(entry.name),
      }));
    } catch {
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const childPath = normalizePath(relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name);

      if (entry.isDirectory()) {
        if (includeDirectories) push(`${childPath}/`);
        if (IGNORED_SCAN_DIRS.has(entry.name)) continue;
        await walk(childPath, resolve(absoluteRoot, entry.name));
        continue;
      }

      if (entry.isFile()) push(childPath);
    }
  }

  for (const entry of scopeEntries) {
    if (results.length >= maxResults) break;
    if (entry.kind === "file") {
      push(entry.path);
      continue;
    }

    if (includeDirectories) push(`${entry.path}/`);
    await walk(entry.path, entry.absolutePath);
  }

  return results;
}

async function readFocusedFile(
  cwd: string,
  state: EffectiveFocusState,
  pathValue: string,
  offset?: number,
  limit?: number,
): Promise<string> {
  if (!(await isPathAllowed(cwd, state, pathValue))) {
    throw new Error(`Path outside active focus roots: ${pathValue}`);
  }

  const absolutePath = resolve(cwd, normalizePath(pathValue));
  const content = await fs.readFile(absolutePath, "utf8");
  const lines = content.split(/\r?\n/);
  const start = clampInteger(offset, 1, Number.MAX_SAFE_INTEGER, 1) - 1;
  const count = clampInteger(limit, DEFAULT_READ_LIMIT, MAX_READ_LIMIT, 1);
  const selected = lines.slice(start, start + count);
  return selected.join("\n");
}

function summarizeState(state: EffectiveFocusState): string {
  const roots = state.roots.length > 0 ? state.roots.join(", ") : "(none)";
  const allow = state.alwaysAllow.length > 0 ? state.alwaysAllow.join(", ") : "(none)";
  return `Focus Advanced ${isFocusActive(state) ? "on" : "off"} · mode=${state.mode} · roots=${roots} · alwaysAllow=${allow}`;
}

export default function focusAdvancedExtension(pi: ExtensionAPI): void {
  const overrideByCwd = new Map<string, SessionFocusOverride>();
  const loadedCwds = new Set<string>();
  const grantsBySession = new Map<string, Set<string>>();

  function getSessionKey(ctx: ExtensionContext): string {
    return `${ctx.cwd}::${ctx.sessionManager.getSessionFile() ?? "ephemeral"}`;
  }

  function getGrantedPaths(sessionKey: string): Set<string> {
    let granted = grantsBySession.get(sessionKey);
    if (!granted) {
      granted = new Set<string>();
      grantsBySession.set(sessionKey, granted);
    }
    return granted;
  }

  async function isPathAllowedWithGrants(
    cwd: string,
    state: EffectiveFocusState,
    sessionKey: string,
    pathValue: string,
  ): Promise<boolean> {
    if (await isPathAllowed(cwd, state, pathValue)) return true;

    const grantedPaths = [...getGrantedPaths(sessionKey)];
    if (grantedPaths.length === 0) return false;

    return isPathAllowed(
      cwd,
      {
        ...state,
        alwaysAllow: uniquePaths([...state.alwaysAllow, ...grantedPaths]),
      },
      pathValue,
    );
  }

  async function requestOutsideFocusPermission(
    ctx: ExtensionContext,
    state: EffectiveFocusState,
    toolName: string,
    targets: string[],
  ): Promise<boolean> {
    const normalizedTargets = uniquePaths(targets);
    if (normalizedTargets.length === 0) return true;
    if (!ctx.hasUI) return state.mode !== "hard";

    const decision = await showFocusPermissionDialog(
      ctx,
      {
        toolName,
        mode: state.mode,
        targets: normalizedTargets,
      },
      state,
    );

    if (!decision.allow) return false;

    const granted = getGrantedPaths(getSessionKey(ctx));
    for (const target of decision.grantedTargets) granted.add(normalizePath(target));
    return true;
  }

  async function ensureLoaded(cwd: string): Promise<void> {
    if (loadedCwds.has(cwd)) return;
    loadedCwds.add(cwd);

    const saved = await loadSessionFocusOverride(cwd);
    if (!saved) return;
    overrideByCwd.set(cwd, {
      ...(typeof saved.enabled === "boolean" ? { enabled: saved.enabled } : {}),
      ...(saved.mode ? { mode: saved.mode } : {}),
      ...(saved.roots !== undefined ? { roots: uniquePaths(saved.roots) } : {}),
    });
  }

  async function getState(cwd: string): Promise<EffectiveFocusState> {
    await ensureLoaded(cwd);
    const config = await loadFocusAdvancedConfig(cwd);
    return mergeFocusAdvancedState(config, overrideByCwd.get(cwd));
  }

  async function setOverride(cwd: string, next?: SessionFocusOverride): Promise<void> {
    await ensureLoaded(cwd);

    if (!next) {
      overrideByCwd.delete(cwd);
      await saveSessionFocusOverride(cwd, undefined);
      return;
    }

    const normalized: SessionFocusOverride = {
      ...(typeof next.enabled === "boolean" ? { enabled: next.enabled } : {}),
      ...(next.mode ? { mode: next.mode } : {}),
      ...(next.roots !== undefined ? { roots: uniquePaths(next.roots) } : {}),
    };

    overrideByCwd.set(cwd, normalized);
    await saveSessionFocusOverride(cwd, normalized);
  }

  async function emitState(cwd: string): Promise<void> {
    const state = await getState(cwd);
    const active = isFocusActive(state);
    pi.events.emit(CRUMBS_EVENT_FOCUS_ADV_CHANGED, {
      cwd,
      enabled: active,
      mode: active ? state.mode : "off",
    });
  }

  pi.registerCommand("focus-advanced", {
    description:
      "Control focused discovery tools: /focus-advanced [on <path...>|off|mode <soft|hidden|hard>|reset|ui]",
    handler: async (args, ctx) => {
      const tokens = parseArgs(args ?? "");
      const subcommand = tokens[0]?.toLowerCase();
      const state = await getState(ctx.cwd);
      const currentOverride = overrideByCwd.get(ctx.cwd) ?? {};

      if (!subcommand) {
        if (ctx.hasUI) ctx.ui.notify(summarizeState(state), "info");
        return;
      }

      if (subcommand === "off") {
        await setOverride(ctx.cwd, { ...currentOverride, enabled: false, roots: [] });
        await emitState(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify("Focus Advanced disabled.", "info");
        return;
      }

      if (subcommand === "reset") {
        await setOverride(ctx.cwd, undefined);
        await emitState(ctx.cwd);
        const nextState = await getState(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify(`Focus Advanced reset. ${summarizeState(nextState)}`, "info");
        return;
      }

      if (subcommand === "mode") {
        const nextMode = tokens[1];
        if (nextMode !== "soft" && nextMode !== "hidden" && nextMode !== "hard") {
          if (ctx.hasUI) ctx.ui.notify("Usage: /focus-advanced mode <soft|hidden|hard>", "warning");
          return;
        }

        await setOverride(ctx.cwd, { ...currentOverride, mode: nextMode });
        await emitState(ctx.cwd);
        const nextState = await getState(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify(summarizeState(nextState), "info");
        return;
      }

      if (subcommand === "on") {
        const roots = uniquePaths(tokens.slice(1));
        if (roots.length === 0) {
          if (ctx.hasUI) ctx.ui.notify("Usage: /focus-advanced on <path...>", "warning");
          return;
        }

        await setOverride(ctx.cwd, {
          ...currentOverride,
          enabled: true,
          mode: currentOverride.mode ?? state.mode,
          roots,
        });
        await emitState(ctx.cwd);
        const nextState = await getState(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify(summarizeState(nextState), "info");
        return;
      }

      if (subcommand === "ui") {
        if (!ctx.hasUI) return;
        const selected = await showFocusAdvancedSelector(ctx, ctx.cwd, state.roots);
        if (!selected) return;

        const roots = uniquePaths(selected);
        await setOverride(ctx.cwd, {
          ...currentOverride,
          enabled: roots.length > 0,
          mode: currentOverride.mode ?? state.mode,
          roots,
        });
        await emitState(ctx.cwd);
        const nextState = await getState(ctx.cwd);
        ctx.ui.notify(summarizeState(nextState), "info");
        return;
      }

      if (ctx.hasUI) {
        ctx.ui.notify(
          "Usage: /focus-advanced [on <path...>|off|mode <soft|hidden|hard>|reset|ui]",
          "warning",
        );
      }
    },
  });

  pi.registerTool({
    name: "focus_list_files",
    label: "Focus List Files",
    description:
      "List files and directories inside active focus roots. Preferred over bash ls/find/tree for scoped discovery.",
    promptSnippet: "List scoped files under active focus roots",
    promptGuidelines: [
      "Use focus_list_files instead of bash ls/find/tree when focus advanced is active.",
      "Pass query to narrow by relative path substring.",
      "Use focus_search_text for content search and focus_read for reading file bodies.",
    ],
    parameters: FOCUS_LIST_FILES_PARAMS,
    renderCall(args, theme) {
      const query =
        typeof args.query === "string" && args.query.trim()
          ? ` ${theme.fg("muted", `(${args.query.trim()})`)}`
          : "";
      return new Text(`${theme.fg("toolTitle", theme.bold("focus_list_files"))}${query}`, 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      return renderTextResult(result as any, expanded, theme);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = await getState(ctx.cwd);
      if (!isFocusActive(state)) {
        throw new Error("Focus Advanced is not active. Run /focus-advanced on <path...> first.");
      }

      const items = await listFocusedPaths(ctx.cwd, state, {
        query: typeof params.query === "string" ? params.query : undefined,
        includeDirectories:
          typeof params.includeDirectories === "boolean" ? params.includeDirectories : true,
        maxResults: params.maxResults,
      });

      return {
        content: textResult(items.length > 0 ? items.join("\n") : "No matching files."),
        details: {
          count: items.length,
          query: typeof params.query === "string" ? params.query : undefined,
        },
      };
    },
  });

  pi.registerTool({
    name: "focus_search_text",
    label: "Focus Search Text",
    description:
      "Search text inside active focus roots. Preferred over bash rg/grep/find for scoped discovery.",
    promptSnippet: "Search text within active focus roots",
    promptGuidelines: [
      "Use focus_search_text instead of bash rg/grep when focus advanced is active.",
      "Search first, then use focus_read for exact files you need to inspect.",
      "Use glob when you want to narrow to certain file types or exclude noisy paths.",
      "Set fixedStrings=true when the query is literal text or may contain regex metacharacters.",
    ],
    parameters: FOCUS_SEARCH_TEXT_PARAMS,
    renderCall(args, theme) {
      const query = typeof args.query === "string" ? args.query : "";
      const suffix = args.fixedStrings ? theme.fg("muted", " (literal)") : "";
      return new Text(
        `${theme.fg("toolTitle", theme.bold("focus_search_text"))} ${theme.fg("accent", query || "…")}${suffix}`,
        0,
        0,
      );
    },
    renderResult(result, { expanded }, theme) {
      return renderTextResult(result as any, expanded, theme);
    },
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const state = await getState(ctx.cwd);
      if (!isFocusActive(state)) {
        throw new Error("Focus Advanced is not active. Run /focus-advanced on <path...> first.");
      }

      const query = typeof params.query === "string" ? params.query.trim() : "";
      if (!query) throw new Error("Missing search query.");

      const scopeEntries = await resolveScopeEntries(ctx.cwd, state);
      const scopePaths = uniquePaths(scopeEntries.map((entry) => entry.path));
      if (scopePaths.length === 0) {
        return { content: textResult("No searchable focus roots."), details: { count: 0 } };
      }

      const maxResults = clampInteger(params.maxResults, DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT, 1);
      const contextLines = clampInteger(params.contextLines, 0, 10, 0);
      const fixedStrings = params.fixedStrings === true;
      const globs = Array.isArray(params.glob)
        ? params.glob.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          )
        : [];

      const args = ["-n", "--no-heading", "--color", "never", "--max-count", String(maxResults)];
      if (fixedStrings) args.push("-F");
      if (contextLines > 0) args.push("-C", String(contextLines));
      args.push("--glob", "!.git/**", "--glob", "!node_modules/**");
      for (const glob of globs) args.push("-g", glob);
      args.push(query, ...scopePaths);

      const result = await pi.exec("rg", args, { cwd: ctx.cwd, signal });
      if (result.code !== 0 && result.code !== 1) {
        const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
        if (/regex parse error/i.test(message)) {
          throw new Error(
            `${message}\nUse fixedStrings=true when the query should be treated as literal text.`,
          );
        }
        throw new Error(message || `rg failed with exit code ${result.code}`);
      }

      const lines = [result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .slice(0, maxResults);

      return {
        content: textResult(lines.length > 0 ? lines.join("\n") : "No matches."),
        details: { count: lines.length, query, fixedStrings },
      };
    },
  });

  pi.registerTool({
    name: "focus_read",
    label: "Focus Read",
    description:
      "Read file content from active focus roots or alwaysAllow paths. Preferred over builtin read when focus advanced is active.",
    promptSnippet: "Read file content within active focus roots",
    promptGuidelines: [
      "Use focus_read for file inspection when focus advanced is active.",
      "Use offset and limit for large files.",
      "Use focus_search_text first when you need to locate relevant files.",
    ],
    parameters: FOCUS_READ_PARAMS,
    renderCall(args, theme) {
      const pathValue = typeof args.path === "string" ? args.path : "";
      const offset = typeof args.offset === "number" ? Math.floor(args.offset) : undefined;
      const limit = typeof args.limit === "number" ? Math.floor(args.limit) : undefined;
      let pathDisplay = theme.fg("accent", pathValue || "…");

      if (offset !== undefined || limit !== undefined) {
        const startLine = offset ?? 1;
        const endLine = limit !== undefined ? startLine + limit - 1 : "";
        pathDisplay += theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
      }

      return new Text(`${theme.fg("toolTitle", theme.bold("focus_read"))} ${pathDisplay}`, 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      return renderTextResult(result as any, expanded, theme);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = await getState(ctx.cwd);
      if (!isFocusActive(state)) {
        throw new Error("Focus Advanced is not active. Run /focus-advanced on <path...> first.");
      }

      const pathValue = typeof params.path === "string" ? params.path.trim() : "";
      if (!pathValue) throw new Error("Missing path.");

      const text = await readFocusedFile(ctx.cwd, state, pathValue, params.offset, params.limit);
      return {
        content: textResult(text),
        details: { path: pathValue },
      };
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const state = await getState(ctx.cwd);
    if (!isFocusActive(state) || !state.injectPromptHint) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildFocusAdvancedPromptHint(state)}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    const state = await getState(ctx.cwd);
    if (!isFocusActive(state)) return undefined;
    const sessionKey = getSessionKey(ctx);

    if (event.toolName === "bash") {
      const input = event.input as { command?: unknown };
      const command = typeof input.command === "string" ? input.command : "";
      if (!command) return undefined;

      const discoveryReason = bashDiscoveryBlockReason(command, state);
      if (discoveryReason) return { block: true, reason: discoveryReason };

      const outsideTargets = await findOutsideFocusTargets(command, state, ctx.cwd);
      const pendingTargets: string[] = [];
      for (const target of outsideTargets) {
        if (!(await isPathAllowedWithGrants(ctx.cwd, state, sessionKey, target))) {
          pendingTargets.push(target);
        }
      }

      if (pendingTargets.length > 0) {
        const allowed = await requestOutsideFocusPermission(
          ctx,
          state,
          event.toolName,
          pendingTargets,
        );
        if (!allowed) {
          return {
            block: true,
            reason: `Blocked by focus-advanced ${state.mode} mode: path outside active focus roots: ${pendingTargets[0]}`,
          };
        }
      }

      return undefined;
    }

    if (event.toolName === "read") {
      const input = event.input as { path?: unknown };
      const pathValue = typeof input.path === "string" ? input.path : "";
      if (!pathValue) return undefined;
      if (!(await isPathAllowedWithGrants(ctx.cwd, state, sessionKey, pathValue))) {
        const allowed = await requestOutsideFocusPermission(ctx, state, event.toolName, [
          pathValue,
        ]);
        if (allowed) return undefined;
        return {
          block: true,
          reason: `Blocked by focus-advanced ${state.mode} mode: path outside active focus roots: ${pathValue}`,
        };
      }
      return undefined;
    }

    if (event.toolName === "apply_patch") {
      const input = event.input as { input?: unknown };
      const patchInput = typeof input.input === "string" ? input.input : "";
      const targets = extractPatchTargets(patchInput);

      const pendingTargets: string[] = [];
      for (const target of targets) {
        if (await isPathAllowedWithGrants(ctx.cwd, state, sessionKey, target)) continue;
        pendingTargets.push(target);
      }

      if (pendingTargets.length > 0) {
        const allowed = await requestOutsideFocusPermission(
          ctx,
          state,
          event.toolName,
          pendingTargets,
        );
        if (allowed) return undefined;
        return {
          block: true,
          reason: `Blocked by focus-advanced ${state.mode} mode: patch target outside active focus roots: ${pendingTargets[0]}`,
        };
      }

      return undefined;
    }

    if (["edit", "write", "multiedit"].includes(event.toolName)) {
      const input = event.input as Record<string, unknown>;
      const pathValue =
        typeof input.path === "string"
          ? input.path
          : typeof input.filePath === "string"
            ? input.filePath
            : typeof input.file_path === "string"
              ? input.file_path
              : typeof input.filename === "string"
                ? input.filename
                : "";

      if (pathValue && !(await isPathAllowedWithGrants(ctx.cwd, state, sessionKey, pathValue))) {
        const allowed = await requestOutsideFocusPermission(ctx, state, event.toolName, [
          pathValue,
        ]);
        if (allowed) return undefined;
        return {
          block: true,
          reason: `Blocked by focus-advanced ${state.mode} mode: write target outside active focus roots: ${pathValue}`,
        };
      }
    }

    return undefined;
  });

  pi.on("session_start", async (_event, ctx) => {
    grantsBySession.delete(getSessionKey(ctx));
    await emitState(ctx.cwd);
  });

  (pi as any).on("session_switch", async (_event: unknown, ctx: any) => {
    grantsBySession.delete(getSessionKey(ctx));
    await emitState(ctx.cwd);
  });

  (pi as any).on("session_tree", async (_event: unknown, ctx: any) => {
    await emitState(ctx.cwd);
  });
}
