import { promises as fs } from "node:fs";
import { join } from "node:path";
import { rawKeyHint, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Input, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { normalizePath, uniquePaths } from "./settings.js";

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
const MAX_VISIBLE_ROWS = 16;

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
      nodes.set(child, { path: child, name, parent: current || undefined, children: [] });
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
    if (query.length > 0 && !include.has(pathValue)) return;

    const expandedByFilter = query.length > 0 && node.children.some((child) => include.has(child));
    const isExpanded = node.children.length > 0 && (expandedByFilter || expanded.has(pathValue));
    rows.push({
      path: pathValue,
      depth,
      hasChildren: node.children.length > 0,
      expanded: isExpanded,
    });

    if (!isExpanded) return;
    for (const child of node.children) walk(child, depth + 1);
  };

  for (const child of root.children) walk(child, 0);
  return rows;
}

export async function showFocusAdvancedSelector(
  ctx: ExtensionContext,
  cwd: string,
  current: string[],
): Promise<string[] | undefined> {
  const nodes = await scanDirectoryTree(cwd);

  return ctx.ui.custom<string[] | undefined>((tui, theme, _kb, done) => {
    const selected = new Set(uniquePaths(current));
    const expanded = new Set<string>();
    for (const pathValue of selected) {
      for (const ancestor of collectAncestors(pathValue)) expanded.add(ancestor);
    }

    const filterInput = new Input();
    let filterActive = false;
    let rows: TreeRow[] = [];
    let cursor = 0;
    let selectedPath = current[0] ?? "";

    filterInput.onSubmit = () => {
      filterActive = false;
      filterInput.focused = false;
      rebuildList();
      tui.requestRender();
    };
    filterInput.onEscape = () => {
      filterActive = false;
      filterInput.focused = false;
      rebuildList();
      tui.requestRender();
    };

    const currentRow = (): TreeRow | undefined => rows[cursor];

    const clampCursor = (): void => {
      if (rows.length === 0) {
        cursor = 0;
        selectedPath = "";
        return;
      }

      const selectedIndex = rows.findIndex((row) => row.path === selectedPath);
      if (selectedIndex >= 0) {
        cursor = selectedIndex;
      } else {
        cursor = Math.max(0, Math.min(cursor, rows.length - 1));
      }

      selectedPath = rows[cursor]?.path ?? "";
    };

    const rebuildList = (): void => {
      rows = buildVisibleRows(nodes, expanded, filterInput.getValue());
      clampCursor();
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
          done(uniquePaths([...selected]));
          return;
        }

        if (matchesKey(data, Key.up)) {
          cursor = Math.max(0, cursor - 1);
          selectedPath = rows[cursor]?.path ?? "";
          tui.requestRender();
          return;
        }

        if (matchesKey(data, Key.down)) {
          cursor = Math.min(rows.length - 1, cursor + 1);
          selectedPath = rows[cursor]?.path ?? "";
          tui.requestRender();
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

        tui.requestRender();
      },

      render(width: number) {
        clampCursor();

        const lines: string[] = [];
        lines.push(truncateToWidth(theme.fg("accent", theme.bold("Focus Advanced")), width));
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
                rawKeyHint("enter", "save"),
                rawKeyHint("esc", "cancel"),
              ].join(" · "),
            ),
            width,
          ),
        );
        lines.push(truncateToWidth(theme.fg("muted", "Select focus roots"), width));
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

        const start = Math.max(
          0,
          Math.min(cursor - Math.floor(MAX_VISIBLE_ROWS / 2), rows.length - MAX_VISIBLE_ROWS),
        );
        const end = Math.min(rows.length, start + MAX_VISIBLE_ROWS);

        for (let i = start; i < end; i++) {
          const row = rows[i]!;
          const node = nodes.get(row.path);
          const isCurrent = i === cursor;
          const marker = isCurrent ? theme.fg("accent", "❯") : " ";
          const check = selected.has(row.path)
            ? theme.fg("success", "[x]")
            : theme.fg("dim", "[ ]");
          const depthIndent = "  ".repeat(row.depth);
          const treeMarker = row.hasChildren ? (row.expanded ? "▾" : "▸") : "•";
          const name = node?.name ?? row.path;
          const label = isCurrent ? theme.fg("accent", name) : theme.fg("text", name);
          const fullPath = theme.fg("dim", `(${normalizePath(row.path)})`);
          lines.push(
            truncateToWidth(
              `${marker} ${check} ${depthIndent}${treeMarker} ${label} ${fullPath}`,
              width,
            ),
          );
        }

        if (rows.length > MAX_VISIBLE_ROWS) {
          lines.push("");
          lines.push(
            truncateToWidth(
              theme.fg("dim", `Showing ${start + 1}-${end} of ${rows.length} folders`),
              width,
            ),
          );
        }

        return lines;
      },

      invalidate() {},
    };
  });
}
