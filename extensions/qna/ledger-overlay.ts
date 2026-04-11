import { rawKeyHint, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { QnaBranchStateSnapshot, QnaLedgerFilter } from "./types.js";

const FILTERS: QnaLedgerFilter[] = [
  "all",
  "open",
  "answered",
  "skipped",
  "needs_clarification",
  "answered_in_chat",
  "superseded",
];

function getVisibleQuestions(state: QnaBranchStateSnapshot, filter: QnaLedgerFilter) {
  return state.questions.filter((question) => filter === "all" || question.state === filter);
}

function getStateBadge(state: QnaBranchStateSnapshot["questions"][number]["state"]): string {
  switch (state) {
    case "open":
      return "•";
    case "answered":
      return "✓";
    case "skipped":
      return "↷";
    case "needs_clarification":
      return "?";
    case "answered_in_chat":
      return "💬";
    case "superseded":
      return "⇢";
  }
}

function getNextSelection(
  state: QnaBranchStateSnapshot,
  viewState: QnaLedgerOverlayViewState,
): string | undefined {
  const visible = getVisibleQuestions(state, viewState.filter);
  if (visible.some((question) => question.questionId === viewState.selectedQuestionId)) {
    return viewState.selectedQuestionId;
  }
  return visible[0]?.questionId;
}

export interface QnaLedgerOverlayViewState {
  filter: QnaLedgerFilter;
  selectedQuestionId?: string;
}

export type QnaLedgerOverlayAction =
  | { kind: "close" }
  | { kind: "edit"; questionId: string }
  | { kind: "reopen"; questionId: string }
  | { kind: "send_updates" }
  | { kind: "export_markdown" };

export async function showQnaLedgerOverlay(
  ctx: ExtensionContext,
  input: {
    state: QnaBranchStateSnapshot;
    viewState: QnaLedgerOverlayViewState;
  },
): Promise<{ action: QnaLedgerOverlayAction; viewState: QnaLedgerOverlayViewState }> {
  let viewState: QnaLedgerOverlayViewState = {
    filter: input.viewState.filter,
    selectedQuestionId: getNextSelection(input.state, input.viewState),
  };

  return ctx.ui.custom((tui, theme, _kb, done) => ({
    handleInput(data: string) {
      const visible = getVisibleQuestions(input.state, viewState.filter);
      const selectedIndex = Math.max(
        0,
        visible.findIndex((question) => question.questionId === viewState.selectedQuestionId),
      );

      if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || data === "q") {
        done({ action: { kind: "close" }, viewState });
        return;
      }

      if (matchesKey(data, Key.left)) {
        const index = FILTERS.indexOf(viewState.filter);
        const filter = FILTERS[(index - 1 + FILTERS.length) % FILTERS.length]!;
        viewState = {
          filter,
          selectedQuestionId: getNextSelection(input.state, { ...viewState, filter }),
        };
        tui.requestRender();
        return;
      }

      if (matchesKey(data, Key.right)) {
        const index = FILTERS.indexOf(viewState.filter);
        const filter = FILTERS[(index + 1) % FILTERS.length]!;
        viewState = {
          filter,
          selectedQuestionId: getNextSelection(input.state, { ...viewState, filter }),
        };
        tui.requestRender();
        return;
      }

      if (matchesKey(data, Key.up) && visible.length > 0) {
        viewState.selectedQuestionId = visible[Math.max(0, selectedIndex - 1)]?.questionId;
        tui.requestRender();
        return;
      }

      if (matchesKey(data, Key.down) && visible.length > 0) {
        viewState.selectedQuestionId =
          visible[Math.min(visible.length - 1, selectedIndex + 1)]?.questionId;
        tui.requestRender();
        return;
      }

      const selected = visible[selectedIndex];
      if (!selected) {
        if (data === "s") done({ action: { kind: "send_updates" }, viewState });
        if (data === "x") done({ action: { kind: "export_markdown" }, viewState });
        return;
      }

      if (data === "e" || matchesKey(data, Key.enter)) {
        done({ action: { kind: "edit", questionId: selected.questionId }, viewState });
        return;
      }

      if (data === "r" && selected.state !== "open") {
        done({ action: { kind: "reopen", questionId: selected.questionId }, viewState });
        return;
      }

      if (data === "s") {
        done({ action: { kind: "send_updates" }, viewState });
        return;
      }

      if (data === "x") {
        done({ action: { kind: "export_markdown" }, viewState });
      }
    },
    render(width: number) {
      const visible = getVisibleQuestions(input.state, viewState.filter);
      const selected = visible.find(
        (question) => question.questionId === viewState.selectedQuestionId,
      );
      const lines = [
        truncateToWidth(theme.fg("accent", theme.bold("Ordinary QnA Ledger")), width),
        truncateToWidth(
          theme.fg(
            "muted",
            `filter: ${viewState.filter}  visible: ${visible.length}  total: ${input.state.questions.length}`,
          ),
          width,
        ),
        "",
      ];

      if (visible.length === 0) {
        lines.push(truncateToWidth(theme.fg("muted", "No questions match this filter."), width));
      } else {
        for (const question of visible) {
          const selectedRow = question.questionId === viewState.selectedQuestionId;
          const pending =
            question.sendState.localRevision > question.sendState.lastSentRevision ? " *" : "";
          const prefix = selectedRow ? theme.fg("accent", "❯") : " ";
          lines.push(
            truncateToWidth(
              `${prefix} ${getStateBadge(question.state)} ${question.questionId}${pending} ${question.questionText}`,
              width,
            ),
          );
        }
      }

      if (selected) {
        lines.push(
          "",
          truncateToWidth(theme.fg("muted", "Selected"), width),
          truncateToWidth(theme.fg("text", `${selected.questionId} · ${selected.state}`), width),
          truncateToWidth(theme.fg("text", selected.questionText), width),
          truncateToWidth(
            theme.fg(
              "muted",
              `localRevision: ${selected.sendState.localRevision}  lastSentRevision: ${selected.sendState.lastSentRevision}`,
            ),
            width,
          ),
        );
      }

      lines.push(
        "",
        truncateToWidth(
          [
            rawKeyHint("←→", "filter"),
            rawKeyHint("↑↓", "select"),
            rawKeyHint("enter/e", "edit"),
            rawKeyHint("r", "reopen"),
            rawKeyHint("s", "send"),
            rawKeyHint("x", "export"),
            rawKeyHint("q/esc", "close"),
          ].join(theme.fg("dim", " • ")),
          width,
        ),
      );

      return lines;
    },
    invalidate() {},
  }));
}
