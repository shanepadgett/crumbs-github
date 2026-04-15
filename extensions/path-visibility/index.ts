/**
 * Path Visibility Extension
 *
 * What it does:
 * - Hides denied files and folders from tool results.
 * - Blocks direct reads of denied paths.
 * - Blocks risky bash forms that can bypass simple path checks.
 * - Adds `/focus` session controls to steer or constrain agent scope.
 *
 * How to use it:
 * - Configure `extensions.pathVisibility` in `.pi/crumbs.json`.
 * - Add sensitive globs to `hardDeny`.
 * - Run `/focus on <path...>` or `/focus ui` to scope current session.
 * - Keep `injectPromptHint` enabled to reduce wasted tool calls.
 *
 * Example:
 * - Set `hardDeny: ["docs/_hidden/**", ".env*"]` to hide those paths from
 *   `bash` output and block direct `read` calls.
 * - Run `/focus on extensions/path-visibility` to keep exploration focused there.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { getSelectListTheme, keyHint, rawKeyHint } from "@mariozechner/pi-coding-agent";
import {
  Input,
  Key,
  SelectList,
  matchesKey,
  truncateToWidth,
  type SelectItem,
} from "@mariozechner/pi-tui";
import { buildCombinedPromptHint, createPathVisibilityPolicy } from "./src/policy.js";
import { normalizePath, type FocusConfig, type FocusMode } from "./src/settings.js";
import { CRUMBS_EVENT_FOCUS_CHANGED } from "../shared/crumbs-events.js";
import {
  loadProjectCrumbsConfig,
  updateProjectCrumbsConfig,
} from "../shared/config/crumbs-loader.js";
import { asObject } from "../shared/io/json-file.js";

type SessionFocusOverride = Pick<Partial<FocusConfig>, "enabled" | "mode" | "roots">;
const COMPLEX_SHELL_RE = /\|\||&&|[|;`]|\$\(|\bxargs\b|\beval\b/;
const DISCOVERY_TOOL_RE = /\b(ls|find|fd|fdfind|rg|tree)\b/;

function parseSavedFocus(value: unknown): SessionFocusOverride | undefined {
  const section = asObject(value);
  if (!section) return undefined;

  const next: SessionFocusOverride = {};
  if (typeof section.enabled === "boolean") next.enabled = section.enabled;
  if (section.mode === "soft" || section.mode === "hidden" || section.mode === "hard") {
    next.mode = section.mode;
  }
  if (Array.isArray(section.roots)) {
    next.roots = section.roots.filter((item): item is string => typeof item === "string");
  }

  if (next.enabled === undefined && next.mode === undefined && next.roots === undefined) {
    return undefined;
  }
  return next;
}

function asUniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((item) => normalizePath(item.trim())).filter(Boolean))];
}

function parseArgs(args: string): string[] {
  return args
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type DirectoryNode = {
  path: string;
  name: string;
  parent?: string;
  children: string[];
};

type TreeRow = {
  path: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
};

const IGNORED_TREE_DIRS = new Set([".git", "node_modules"]);

function parentPath(pathValue: string): string | undefined {
  const index = pathValue.lastIndexOf("/");
  if (index <= 0) return index === 0 ? "" : undefined;
  return pathValue.slice(0, index);
}

function collectAncestors(pathValue: string): string[] {
  const ancestors: string[] = [];
  let current = parentPath(pathValue);
  while (current !== undefined) {
    if (current.length > 0) ancestors.push(current);
    current = parentPath(current);
  }
  return ancestors;
}

async function scanDirectoryTree(cwd: string): Promise<Map<string, DirectoryNode>> {
  const nodes = new Map<string, DirectoryNode>();
  nodes.set("", { path: "", name: "", children: [] });

  const stack = [""];
  while (stack.length > 0) {
    const current = stack.pop() ?? "";
    const currentNode = nodes.get(current);
    if (!currentNode) continue;

    const fullPath = current ? join(cwd, current) : cwd;
    let entries: Array<{ isDirectory(): boolean; name: string }>;

    try {
      const dirents = await fs.readdir(fullPath, { withFileTypes: true, encoding: "utf8" });
      entries = dirents.map((entry) => ({
        isDirectory: () => entry.isDirectory(),
        name: String(entry.name),
      }));
    } catch {
      continue;
    }

    const children = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !IGNORED_TREE_DIRS.has(name))
      .sort((left, right) => left.localeCompare(right));

    currentNode.children = children.map((name) => (current ? `${current}/${name}` : name));

    for (const child of currentNode.children) {
      const slash = child.lastIndexOf("/");
      const name = slash >= 0 ? child.slice(slash + 1) : child;
      nodes.set(child, {
        path: child,
        name,
        parent: current || undefined,
        children: [],
      });
      stack.push(child);
    }
  }

  return nodes;
}

function buildVisibleRows(
  nodes: Map<string, DirectoryNode>,
  expanded: Set<string>,
  filter: string,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const query = filter.trim().toLowerCase();
  const root = nodes.get("");
  if (!root) return rows;

  const include = new Set<string>();
  if (query.length > 0) {
    for (const [pathValue] of nodes) {
      if (!pathValue) continue;
      if (pathValue.toLowerCase().includes(query)) {
        include.add(pathValue);
        for (const ancestor of collectAncestors(pathValue)) include.add(ancestor);
      }
    }
  }

  const walk = (pathValue: string, depth: number): void => {
    const node = nodes.get(pathValue);
    if (!node) return;
    const hasChildren = node.children.length > 0;

    if (query.length > 0 && !include.has(pathValue)) return;

    const expandedByFilter =
      query.length > 0 && hasChildren && node.children.some((child) => include.has(child));
    const isExpanded = hasChildren && (expandedByFilter || expanded.has(pathValue));
    rows.push({
      path: pathValue,
      depth,
      hasChildren,
      expanded: isExpanded,
    });

    if (!isExpanded) return;
    for (const child of node.children) walk(child, depth + 1);
  };

  for (const child of root.children) walk(child, 0);
  return rows;
}

async function openFocusSelector(
  ctx: any,
  cwd: string,
  current: string[],
): Promise<string[] | undefined> {
  const nodes = await scanDirectoryTree(cwd);

  return ctx.ui.custom((tui: any, theme: any, _kb: any, done: any) => {
    const selected = new Set(asUniquePaths(current));
    const expanded = new Set<string>();
    for (const pathValue of selected) {
      for (const ancestor of collectAncestors(pathValue)) expanded.add(ancestor);
    }

    const filterInput = new Input();
    let filterActive = false;
    let rows: TreeRow[] = [];
    let selectedPath = "";
    let list: SelectList | undefined;

    const currentRow = (): TreeRow | undefined => rows.find((row) => row.path === selectedPath);

    const rowItem = (row: TreeRow): SelectItem => {
      const node = nodes.get(row.path);
      const name = node?.name ?? row.path;
      const depthIndent = "  ".repeat(row.depth);
      const treeMarker = row.hasChildren ? (row.expanded ? "▾" : "▸") : " ";
      const check = selected.has(row.path) ? "[x]" : "[ ]";
      return {
        value: row.path,
        label: `${check} ${depthIndent}${treeMarker} ${name}`,
        description: row.path,
      };
    };

    const rebuildList = (): void => {
      rows = buildVisibleRows(nodes, expanded, filterInput.getValue());
      const items = rows.map(rowItem);
      list = new SelectList(items, Math.min(Math.max(items.length, 1), 14), getSelectListTheme());

      let selectedIndex = rows.findIndex((row) => row.path === selectedPath);
      if (selectedIndex < 0) selectedIndex = 0;
      list.setSelectedIndex(selectedIndex);
      selectedPath = rows[selectedIndex]?.path ?? "";

      list.onSelectionChange = (item) => {
        selectedPath = String(item.value);
      };
    };

    rebuildList();

    return {
      handleInput(data: string) {
        if (filterActive) {
          const before = filterInput.getValue();

          if (matchesKey(data, Key.ctrl("c"))) {
            filterInput.setValue("");
            rebuildList();
            tui.requestRender();
            return;
          }

          if (matchesKey(data, Key.escape)) {
            filterActive = false;
            filterInput.focused = false;
            rebuildList();
            tui.requestRender();
            return;
          }

          filterInput.handleInput(data);
          if (filterInput.getValue() !== before) {
            rebuildList();
            tui.requestRender();
          }
          return;
        }

        if (data === "/") {
          filterActive = true;
          filterInput.focused = true;
          tui.requestRender();
          return;
        }

        if (matchesKey(data, Key.escape)) {
          done(undefined);
          return;
        }

        if (matchesKey(data, Key.enter)) {
          done(asUniquePaths([...selected]));
          return;
        }

        if (matchesKey(data, Key.ctrl("c"))) {
          selected.clear();
          rebuildList();
          tui.requestRender();
          return;
        }

        if (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) {
          const row = currentRow();
          if (!row || !row.hasChildren) return;
          expanded.add(row.path);
          rebuildList();
          tui.requestRender();
          return;
        }

        if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) {
          const row = currentRow();
          if (!row) return;
          if (expanded.has(row.path)) {
            expanded.delete(row.path);
            rebuildList();
            tui.requestRender();
            return;
          }

          const parent = parentPath(row.path);
          if (parent === undefined) return;
          selectedPath = parent;
          rebuildList();
          tui.requestRender();
          return;
        }

        if (matchesKey(data, Key.space)) {
          const row = currentRow();
          if (!row) return;
          if (selected.has(row.path)) selected.delete(row.path);
          else selected.add(row.path);
          rebuildList();
          tui.requestRender();
          return;
        }

        list?.handleInput(data);
        tui.requestRender();
      },

      render(width: number) {
        if (!list) rebuildList();

        const lines: string[] = [];
        lines.push(truncateToWidth(theme.fg("accent", theme.bold("Focus roots")), width));
        lines.push(
          truncateToWidth(
            theme.fg(
              "dim",
              [
                rawKeyHint("↑/↓", "move"),
                rawKeyHint("→/tab", "expand"),
                rawKeyHint("←/shift+tab", "collapse"),
                rawKeyHint("space", "toggle"),
                rawKeyHint("/", "filter"),
                rawKeyHint("ctrl+c", filterActive ? "clear filter" : "clear all"),
                keyHint("tui.select.confirm", "save"),
                keyHint("tui.select.cancel", "cancel"),
              ].join(" · "),
            ),
            width,
          ),
        );
        const filterValue = filterInput.getValue();
        const filterLabel = filterActive
          ? `Filter: ${filterValue || ""}`
          : filterValue
            ? `Filter: ${filterValue}`
            : "Filter: press /";
        lines.push(truncateToWidth(theme.fg("muted", filterLabel), width));
        lines.push(
          truncateToWidth(theme.fg("muted", `Selected: ${selected.size} folder(s)`), width),
        );
        lines.push("");

        if (rows.length === 0) {
          lines.push(truncateToWidth(theme.fg("warning", "No matching folders."), width));
          return lines;
        }

        lines.push(...(list?.render(width) ?? []));

        return lines;
      },

      invalidate() {},
    };
  }) as Promise<string[] | undefined>;
}

export default function pathVisibilityExtension(pi: ExtensionAPI): void {
  const focusByCwd = new Map<string, SessionFocusOverride>();
  const loadedCwds = new Set<string>();

  async function ensureFocusLoaded(cwd: string): Promise<void> {
    if (loadedCwds.has(cwd)) return;
    loadedCwds.add(cwd);

    const config = await loadProjectCrumbsConfig(cwd);
    const extensions = asObject(config.extensions);
    const pathVisibility = asObject(extensions?.pathVisibility);
    const parsed = parseSavedFocus(pathVisibility?.sessionFocus);
    if (!parsed) return;

    const normalized: SessionFocusOverride = {};
    if (typeof parsed.enabled === "boolean") normalized.enabled = parsed.enabled;
    if (parsed.mode) normalized.mode = parsed.mode;
    if (parsed.roots !== undefined) normalized.roots = asUniquePaths(parsed.roots);
    focusByCwd.set(cwd, normalized);
  }

  async function persistFocus(cwd: string): Promise<void> {
    const current = focusByCwd.get(cwd);

    await updateProjectCrumbsConfig(cwd, (config) => {
      const next = { ...config };
      const extensions = asObject(next.extensions) ?? {};
      const pathVisibility = asObject(extensions.pathVisibility) ?? {};

      if (!current) {
        delete pathVisibility.sessionFocus;
      } else {
        pathVisibility.sessionFocus = {
          ...(typeof current.enabled === "boolean" ? { enabled: current.enabled } : {}),
          ...(current.mode ? { mode: current.mode } : {}),
          ...(current.roots !== undefined ? { roots: current.roots } : {}),
        };
      }

      if (Object.keys(pathVisibility).length === 0) {
        delete extensions.pathVisibility;
      } else {
        extensions.pathVisibility = pathVisibility;
      }

      if (Object.keys(extensions).length === 0) {
        delete next.extensions;
      } else {
        next.extensions = extensions;
      }

      return next;
    });
  }

  function getSessionFocusOverride(cwd: string): SessionFocusOverride | undefined {
    return focusByCwd.get(cwd);
  }

  async function setSessionFocus(cwd: string, next: SessionFocusOverride): Promise<void> {
    const normalized: SessionFocusOverride = {};
    if (typeof next.enabled === "boolean") normalized.enabled = next.enabled;
    if (next.mode) normalized.mode = next.mode;
    if (next.roots !== undefined) normalized.roots = asUniquePaths(next.roots);
    focusByCwd.set(cwd, normalized);
    await persistFocus(cwd);
  }

  async function clearSessionFocus(cwd: string): Promise<void> {
    focusByCwd.delete(cwd);
    await persistFocus(cwd);
  }

  async function getPolicy(cwd: string) {
    await ensureFocusLoaded(cwd);
    const override = getSessionFocusOverride(cwd);
    if (!override) return createPathVisibilityPolicy(cwd);
    return createPathVisibilityPolicy(cwd, { focusOverride: override });
  }

  async function emitFocusState(cwd: string): Promise<void> {
    const policy = await getPolicy(cwd);
    pi.events.emit(CRUMBS_EVENT_FOCUS_CHANGED, {
      cwd,
      enabled: policy.focus.enabled,
      mode: policy.focus.enabled ? policy.focus.mode : "off",
    });
  }

  function focusSummary(focus: FocusConfig): string {
    const roots = focus.roots.length > 0 ? focus.roots.join(", ") : "(none)";
    const allow = focus.alwaysAllow.length > 0 ? focus.alwaysAllow.join(", ") : "(none)";
    return `Focus ${focus.enabled ? "on" : "off"} · mode=${focus.mode} · roots=${roots} · alwaysAllow=${allow}`;
  }

  pi.registerCommand("focus", {
    description: "Control focus scope: /focus [on <path...>|off|mode <soft|hidden|hard>|reset|ui]",
    handler: async (args, ctx) => {
      const tokens = parseArgs(args ?? "");
      const sub = tokens[0]?.toLowerCase();
      const currentOverride = getSessionFocusOverride(ctx.cwd) ?? {};
      const effective = (await getPolicy(ctx.cwd)).focus;

      if (!sub) {
        if (ctx.hasUI) ctx.ui.notify(focusSummary(effective), "info");
        return;
      }

      if (sub === "off") {
        await setSessionFocus(ctx.cwd, { ...currentOverride, enabled: false, roots: [] });
        await emitFocusState(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify("Focus disabled for current session.", "info");
        return;
      }

      if (sub === "reset") {
        await clearSessionFocus(ctx.cwd);
        await emitFocusState(ctx.cwd);
        const policy = await getPolicy(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify(`Focus reset. ${focusSummary(policy.focus)}`, "info");
        return;
      }

      if (sub === "mode") {
        const nextMode = tokens[1] as FocusMode | undefined;
        if (!nextMode || !["soft", "hidden", "hard"].includes(nextMode)) {
          if (ctx.hasUI) ctx.ui.notify("Usage: /focus mode <soft|hidden|hard>", "warning");
          return;
        }

        await setSessionFocus(ctx.cwd, { ...currentOverride, mode: nextMode });
        await emitFocusState(ctx.cwd);
        const policy = await getPolicy(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify(focusSummary(policy.focus), "info");
        return;
      }

      if (sub === "on") {
        const roots = asUniquePaths(tokens.slice(1));
        if (roots.length === 0) {
          if (ctx.hasUI) ctx.ui.notify("Usage: /focus on <path...>", "warning");
          return;
        }

        await setSessionFocus(ctx.cwd, {
          ...currentOverride,
          enabled: true,
          mode: currentOverride.mode ?? effective.mode,
          roots,
        });
        await emitFocusState(ctx.cwd);
        const policy = await getPolicy(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify(focusSummary(policy.focus), "info");
        return;
      }

      if (sub === "ui") {
        const selected = await openFocusSelector(ctx, ctx.cwd, effective.roots);
        if (!selected) return;

        const nextRoots = asUniquePaths(selected);
        await setSessionFocus(ctx.cwd, {
          ...currentOverride,
          enabled: nextRoots.length > 0,
          mode: currentOverride.mode ?? effective.mode,
          roots: nextRoots,
        });

        await emitFocusState(ctx.cwd);
        const policy = await getPolicy(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify(focusSummary(policy.focus), "info");
        return;
      }

      if (ctx.hasUI) {
        ctx.ui.notify(
          "Usage: /focus [on <path...>|off|mode <soft|hidden|hard>|reset|ui]",
          "warning",
        );
      }
    },
  });

  const onAny = pi.on as unknown as (
    event: string,
    handler: (event: any, ctx: any) => Promise<any> | any,
  ) => void;

  pi.on("before_agent_start", async (event, ctx) => {
    const policy = await getPolicy(ctx.cwd);
    if (!policy.enabled || !policy.injectPromptHint) return undefined;

    const promptHint = buildCombinedPromptHint(policy);
    if (!promptHint.trim()) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${promptHint}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    const policy = await getPolicy(ctx.cwd);
    if (!policy.enabled) return undefined;

    if (event.toolName === "read") {
      const input = event.input as { path?: unknown };
      const filePath = typeof input.path === "string" ? input.path : "";
      if (!filePath) return undefined;

      if (await policy.isHardDenied(filePath)) {
        return { block: true, reason: `Blocked by path visibility hard deny: ${filePath}` };
      }

      if (policy.focus.mode === "hard" && (await policy.isOutsideFocus(filePath))) {
        return {
          block: true,
          reason: `Blocked by hard focus mode (outside focus roots): ${filePath}`,
        };
      }

      return undefined;
    }

    if (event.toolName === "bash") {
      const input = event.input as { command?: unknown };
      const command = typeof input.command === "string" ? input.command : "";
      if (!command) return undefined;

      if (
        policy.focus.mode !== "soft" &&
        COMPLEX_SHELL_RE.test(command) &&
        DISCOVERY_TOOL_RE.test(command)
      ) {
        return {
          block: true,
          reason:
            "Blocked by hidden/hard focus mode: use direct non-piped discovery command scoped to focus roots",
        };
      }

      if (await policy.referencesHardDeniedPath(command)) {
        return {
          block: true,
          reason: "Blocked by path visibility hard deny: command references denied path",
        };
      }

      if (policy.focus.mode === "hard" && (await policy.referencesOutsideFocusPath(command))) {
        return {
          block: true,
          reason: "Blocked by hard focus mode: command references path outside focus roots",
        };
      }

      input.command = policy.rewriteBashCommand(command);
      return undefined;
    }

    return undefined;
  });

  onAny("tool_result", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const policy = await getPolicy(ctx.cwd);
    if (!policy.enabled) return undefined;

    const nextContent = policy.sanitizeBashContent(event.content);
    if (!nextContent) return undefined;
    return { content: nextContent };
  });

  pi.on("session_start", async (_event, ctx) => {
    await emitFocusState(ctx.cwd);
  });

  (pi as any).on("session_switch", async (_event: unknown, ctx: any) => {
    await emitFocusState(ctx.cwd);
  });

  (pi as any).on("session_tree", async (_event: unknown, ctx: any) => {
    await emitFocusState(ctx.cwd);
  });
}
