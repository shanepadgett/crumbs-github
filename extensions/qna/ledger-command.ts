import type {
  ExtensionAPI,
  ExtensionCommandContext,
  SessionEntry,
} from "@mariozechner/pi-coding-agent";
import { showQuestionRuntimeFormShell } from "../question-runtime/form-shell.js";
import { validateAuthorizedQuestionRequest } from "../question-runtime/request-validator.js";
import { QnaBranchStateStore } from "./branch-state.js";
import {
  applyQnaLedgerQuestionEdit,
  reopenQnaLedgerQuestion,
  validateQnaLedgerDraftSnapshot,
} from "./ledger-records.js";
import { type QnaLedgerOverlayViewState, showQnaLedgerOverlay } from "./ledger-overlay.js";
import type { QnaLoopController } from "./loop-controller.js";
import { writeQnaLedgerMarkdownSnapshot } from "./markdown-export.js";
import { buildQnaRuntimeRequest } from "./runtime-request.js";
import {
  buildQnaLedgerSendBatch,
  buildQnaLedgerSendMessage,
  getPendingQnaLedgerSendItems,
  markQnaLedgerItemsSent,
} from "./send.js";
import { applyQnaDraftSnapshot } from "./runtime-submit.js";
import type { QnaBranchStateSnapshot } from "./types.js";

const EDITABLE_LEDGER_STATES = [
  "open",
  "answered",
  "skipped",
  "needs_clarification",
  "answered_in_chat",
  "superseded",
] as const;

export interface QnaLedgerCommandOptions {
  loopController: QnaLoopController;
  getAttachedInterviewSessionId: (branch: SessionEntry[]) => string | null;
  showForm?: typeof showQuestionRuntimeFormShell;
  now?: () => Date;
}

export function registerQnaLedgerCommand(pi: ExtensionAPI, options: QnaLedgerCommandOptions): void {
  pi.registerCommand("qna-ledger", {
    description: "Browse and maintain the branch-local ordinary QnA ledger",
    handler: async (_args, ctx) => runQnaLedgerCommand(pi, ctx, options),
  });
}

function getOpenReviewQuestions(state: QnaBranchStateSnapshot) {
  return state.questions
    .filter((question) => question.state === "open")
    .map((question) => ({
      questionId: question.questionId,
      questionText: question.questionText,
      state: "open" as const,
    }));
}

export async function runQnaLedgerCommand(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: QnaLedgerCommandOptions,
): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("/qna-ledger requires interactive UI mode", "error");
    return;
  }

  const branch = ctx.sessionManager.getBranch();
  const attachedInterviewSessionId = options.getAttachedInterviewSessionId(branch);
  if (attachedInterviewSessionId) {
    ctx.ui.notify(
      `This chat is attached to interview ${attachedInterviewSessionId}. Return to /interview instead of /qna-ledger.`,
      "warning",
    );
    return;
  }

  let viewState: QnaLedgerOverlayViewState = { filter: "all" };

  while (true) {
    const store = new QnaBranchStateStore(pi);
    store.hydrateFromBranch(ctx.sessionManager.getBranch());
    const state = store.getSnapshot();

    const overlay = await showQnaLedgerOverlay(ctx, { state, viewState });
    viewState = overlay.viewState;

    if (overlay.action.kind === "close") {
      return;
    }

    if (overlay.action.kind === "edit") {
      const request = buildQnaRuntimeRequest({
        state,
        questionIds: [overlay.action.questionId],
        allowedStates: [...EDITABLE_LEDGER_STATES],
      });
      const validation = validateAuthorizedQuestionRequest(JSON.stringify(request));
      if (!validation.ok) {
        throw new Error(validation.issues[0]?.message ?? "Invalid qna ledger edit request");
      }

      const formResult = await (options.showForm ?? showQuestionRuntimeFormShell)(ctx, {
        requestId: `qna-ledger/${overlay.action.questionId}`,
        projectRelativePath: `qna-ledger/${overlay.action.questionId}`,
        request,
      });

      const latestStore = new QnaBranchStateStore(pi);
      latestStore.hydrateFromBranch(ctx.sessionManager.getBranch());
      const latestState = latestStore.getSnapshot();
      if (formResult.action === "cancel") {
        const nextState = applyQnaDraftSnapshot(
          latestState,
          validateQnaLedgerDraftSnapshot(formResult.draftSnapshot, overlay.action.questionId),
        );
        latestStore.replaceSnapshot(nextState);
        ctx.ui.notify(`Saved draft for ${overlay.action.questionId}`, "info");
        continue;
      }

      const applied = applyQnaLedgerQuestionEdit({
        state: latestState,
        questionId: overlay.action.questionId,
        draftSnapshot: formResult.draftSnapshot,
        submitResult: formResult.submitResult,
      });
      latestStore.replaceSnapshot(applied.nextState);
      ctx.ui.notify(
        applied.changed
          ? `Updated ${overlay.action.questionId} to ${applied.nextQuestionState}`
          : `Saved draft for ${overlay.action.questionId}`,
        "info",
      );
      continue;
    }

    if (overlay.action.kind === "reopen") {
      const nextState = reopenQnaLedgerQuestion({
        state,
        questionId: overlay.action.questionId,
      });
      store.replaceSnapshot(nextState);
      ctx.ui.notify(`Reopened ${overlay.action.questionId}`, "info");
      continue;
    }

    if (overlay.action.kind === "send_updates") {
      const pendingItems = getPendingQnaLedgerSendItems(state);
      if (pendingItems.length === 0) {
        ctx.ui.notify("No unsent ordinary QnA updates", "info");
        continue;
      }

      const sentAt = (options.now?.() ?? new Date()).toISOString();
      const batch = buildQnaLedgerSendBatch({ state, sentAt });
      const message = buildQnaLedgerSendMessage(batch);
      if (batch.requiresClarification) {
        pi.sendMessage(message, { deliverAs: "steer", triggerTurn: false });
        options.loopController.startLoop({
          source: "qna_ledger_send",
          reviewQuestions: getOpenReviewQuestions(state),
          discoverySummary: `Sent ${batch.items.length} ordinary QnA ledger update(s).`,
        });
      } else {
        pi.sendMessage(message, { deliverAs: "steer", triggerTurn: true });
      }

      store.replaceSnapshot(
        markQnaLedgerItemsSent({
          state,
          sentAt,
          questionIds: pendingItems.map((item) => item.questionId),
        }),
      );
      ctx.ui.notify(`Sent ${pendingItems.length} ordinary QnA update(s)`, "info");
      continue;
    }

    const exportResult = await writeQnaLedgerMarkdownSnapshot({
      exec: pi.exec,
      cwd: ctx.cwd,
      state,
      now: options.now?.(),
    });
    ctx.ui.notify(`Exported QnA ledger to ${exportResult.projectRelativePath}`, "info");
  }
}
