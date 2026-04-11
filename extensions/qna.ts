/**
 * QnA Ledger Extension
 *
 * What it does: adds `/qna` transcript reconciliation and `/qna-ledger`
 * branch-local ledger maintenance for ordinary QnA.
 *
 * How to use it: run `/qna` after new chat to refresh discovery, or run
 * `/qna-ledger` to browse, edit, send, and export existing ordinary QnA items.
 *
 * Example:
 * 1) Chat until open questions or decisions appear.
 * 2) Run `/qna` or `/qna-ledger`.
 * 3) Use chat or the scoped `qna` tool to review unresolved items.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerQnaCommand } from "./qna/command.js";
import { getAttachedInterviewSessionIdFromBranch } from "./qna/interview-attachment.js";
import { registerQnaLedgerCommand } from "./qna/ledger-command.js";
import { QnaLoopController, registerQnaLoopLifecycle } from "./qna/loop-controller.js";
import { registerQnaTool } from "./qna/tool.js";

export default function qnaExtension(pi: ExtensionAPI): void {
  const loopController = new QnaLoopController(pi);
  loopController.handleSessionReset();

  registerQnaCommand(pi, {
    loopController,
    getAttachedInterviewSessionId: getAttachedInterviewSessionIdFromBranch,
  });
  registerQnaLedgerCommand(pi, {
    loopController,
    getAttachedInterviewSessionId: getAttachedInterviewSessionIdFromBranch,
  });
  registerQnaTool(pi, { loopController });
  registerQnaLoopLifecycle(pi, loopController);
}
