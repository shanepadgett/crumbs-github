import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, matchesKey, Text } from "@mariozechner/pi-tui";
import { selectTreeEntries } from "./core/cut-policy.js";
import { buildMemory, readLatestMemorySnapshot } from "./core/memory-state.js";
import { renderSummary, summaryToMarkdown } from "./core/render-summary.js";

async function showSummary(summary: string, ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI) return;

  await ctx.ui.custom((_tui, theme, _keybindings, done) => {
    const container = new Container();
    const border = new DynamicBorder((value: string) => theme.fg("accent", value));
    const markdownTheme = getMarkdownTheme();

    container.addChild(border);
    container.addChild(new Text(theme.fg("accent", theme.bold("Session Memory")), 1, 0));
    container.addChild(new Markdown(summaryToMarkdown(summary), 1, 1, markdownTheme));
    container.addChild(new Text(theme.fg("dim", "Press Enter or Esc to close"), 1, 0));
    container.addChild(border);

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (input: string) => {
        if (matchesKey(input, "enter") || matchesKey(input, "escape")) done(undefined);
      },
    };
  });
}

export function registerMemoryCommands(pi: ExtensionAPI): void {
  pi.registerCommand("memory-compact", {
    description: "Trigger session compaction with the memory extension",
    handler: async (args, ctx) => {
      ctx.compact({
        customInstructions: args?.trim() ? args.trim() : undefined,
        onComplete: () => ctx.ui.notify("memory: compaction complete", "info"),
        onError: (error) => ctx.ui.notify(`memory: compaction failed (${error.message})`, "error"),
      });
    },
  });

  pi.registerCommand("memory-show", {
    description: "Show the latest stored memory summary",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      const branch = ctx.sessionManager.getBranch();
      const snapshot = readLatestMemorySnapshot(branch);
      const summary = snapshot
        ? renderSummary(snapshot.state)
        : renderSummary(buildMemory(selectTreeEntries(branch)).state);

      if (!summary.trim()) {
        ctx.ui.notify("memory: no stored summary yet", "warning");
        return;
      }

      await showSummary(summary, ctx);
    },
  });
}
