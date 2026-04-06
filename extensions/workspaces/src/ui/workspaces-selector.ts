import { basename } from "node:path";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key, decodeKittyPrintable, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { RepoContext, UiState, WorkspaceSelectorAction, WorkspaceRecord } from "../types.js";
import { compactPath } from "../workspace-paths.js";

function fit(text: string, width: number): string {
  return truncateToWidth(text, width, "");
}

function selectorText(item: WorkspaceRecord): string {
  return [item.label, item.branch ?? "detached", item.path].join(" ").toLowerCase();
}

export function filterRows(rows: WorkspaceRecord[], query: string): WorkspaceRecord[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return rows;

  return rows.filter((row) => {
    const text = selectorText(row);
    return tokens.every((token) => text.includes(token));
  });
}

export function clampSelectedIndex(selectedIndex: number, rowCount: number): number {
  if (rowCount === 0) return 0;
  return Math.max(0, Math.min(selectedIndex, rowCount - 1));
}

export function normalizeSelection(state: UiState): void {
  state.selectedIndex = clampSelectedIndex(
    state.selectedIndex,
    filterRows(state.rows, state.query).length,
  );
}

interface VisibleSelection {
  rows: WorkspaceRecord[];
  selectedIndex: number;
}

export class WorkspaceSelector {
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly ctx: ExtensionContext,
    private readonly repo: RepoContext,
    private readonly state: UiState,
    private readonly requestRender: () => void,
    private readonly done: (action?: WorkspaceSelectorAction) => void,
  ) {}

  private border(width: number): string {
    return this.ctx.ui.theme.fg("border", "─".repeat(Math.max(1, width)));
  }

  private visibleSelection(): VisibleSelection {
    const rows = filterRows(this.state.rows, this.state.query);
    return {
      rows,
      selectedIndex: clampSelectedIndex(this.state.selectedIndex, rows.length),
    };
  }

  private selectedRow(): WorkspaceRecord | undefined {
    const visible = this.visibleSelection();
    return visible.rows[visible.selectedIndex];
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private rerender(): void {
    this.invalidate();
    this.requestRender();
  }

  private renderHeader(width: number): string[] {
    const mode = this.repo.currentIsLobby ? "Lobby" : basename(this.repo.currentPath);
    const title = this.ctx.ui.theme.bold(`  Workspaces (${mode})`);
    const hints = this.ctx.ui.theme.fg(
      "muted",
      "  ↑/↓ move · enter open · ctrl+n new · ctrl+l lobby · ctrl+x remove · type filter · esc clear/close",
    );
    const queryPrefix = this.ctx.ui.theme.fg("muted", "  Search:");
    const query = this.state.query ? ` ${this.ctx.ui.theme.fg("accent", this.state.query)}` : "";
    const message = this.state.message
      ? this.state.message.type === "error"
        ? fit(`  ${this.ctx.ui.theme.fg("warning", this.state.message.text)}`, width)
        : fit(`  ${this.ctx.ui.theme.fg("muted", this.state.message.text)}`, width)
      : undefined;

    return [
      this.border(width),
      fit(title, width),
      fit(hints, width),
      fit(`${queryPrefix}${query}`, width),
      ...(message ? [message] : []),
      this.border(width),
      "",
    ];
  }

  private renderRow(row: WorkspaceRecord, selected: boolean, width: number): string[] {
    const prefix = selected ? this.ctx.ui.theme.fg("accent", "  › ") : "    ";
    const name = row.isCurrent ? this.ctx.ui.theme.fg("success", row.label) : row.label;
    const branch = this.ctx.ui.theme.fg("muted", row.branch ?? "detached");
    const dirty = row.dirty
      ? this.ctx.ui.theme.fg("warning", "dirty")
      : this.ctx.ui.theme.fg("success", "clean");
    const path = this.ctx.ui.theme.fg("dim", compactPath(row.path));

    return [fit(`${prefix}${name}  ${branch}  ${dirty}`, width), fit(`      ${path}`, width)];
  }

  private renderBody(width: number): string[] {
    const visible = this.visibleSelection();
    if (visible.rows.length === 0) {
      return [fit(this.ctx.ui.theme.fg("dim", "  No matching workspaces."), width)];
    }

    return visible.rows.flatMap((row, index) =>
      this.renderRow(row, index === visible.selectedIndex, width),
    );
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const lines = [...this.renderHeader(width), ...this.renderBody(width), "", this.border(width)];
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      if (this.state.query) {
        this.state.query = "";
        this.state.message = undefined;
        normalizeSelection(this.state);
        this.rerender();
        return;
      }

      this.done(undefined);
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.state.message = undefined;
      const visible = this.visibleSelection();
      if (visible.rows.length === 0) return;
      this.state.selectedIndex =
        visible.selectedIndex === 0 ? visible.rows.length - 1 : visible.selectedIndex - 1;
      this.rerender();
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.state.message = undefined;
      const visible = this.visibleSelection();
      if (visible.rows.length === 0) return;
      this.state.selectedIndex =
        visible.selectedIndex === visible.rows.length - 1 ? 0 : visible.selectedIndex + 1;
      this.rerender();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      const selected = this.selectedRow();
      if (!selected) return;
      this.done({ type: "open", workspace: selected });
      return;
    }

    if (matchesKey(data, Key.backspace)) {
      this.state.query = this.state.query.slice(0, -1);
      this.state.message = undefined;
      normalizeSelection(this.state);
      this.rerender();
      return;
    }

    if (matchesKey(data, Key.ctrl("n"))) {
      this.done({ type: "create" });
      return;
    }

    if (matchesKey(data, Key.ctrl("l"))) {
      this.done({ type: "lobby" });
      return;
    }

    if (matchesKey(data, Key.ctrl("x"))) {
      const selected = this.selectedRow();
      if (!selected) return;
      this.done({ type: "remove", workspace: selected });
      return;
    }

    const printable = decodeKittyPrintable(data) ?? (data.length === 1 ? data : undefined);
    if (!printable) return;

    const code = printable.charCodeAt(0);
    if (code < 32 || code === 127) return;

    this.state.message = undefined;
    this.state.query += printable;
    this.state.selectedIndex = 0;
    this.rerender();
  }
}
