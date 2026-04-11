import { describe, expect, test } from "bun:test";
import { createEmptyQnaBranchState } from "./branch-state.js";
import {
  buildQnaLedgerSendBatch,
  getPendingQnaLedgerSendItems,
  markQnaLedgerItemsSent,
} from "./send.js";

describe("send", () => {
  test("selects only unsent ledger deltas", () => {
    const state = createEmptyQnaBranchState();
    state.questions = [
      {
        questionId: "qna_0001",
        questionText: "Who owns this?",
        questionFingerprint: "who owns this",
        state: "answered",
        submittedOutcome: {
          questionId: "qna_0001",
          state: "answered",
          answer: { kind: "freeform", text: "Sam" },
        },
        sendState: { localRevision: 2, lastSentRevision: 1 },
      },
      {
        questionId: "qna_0002",
        questionText: "What is blocked?",
        questionFingerprint: "what is blocked",
        state: "open",
        sendState: { localRevision: 1, lastSentRevision: 1 },
      },
    ];

    const items = getPendingQnaLedgerSendItems(state);
    expect(items).toHaveLength(1);
    expect(items[0]?.questionId).toBe("qna_0001");
  });

  test("marks sent revisions and timestamps", () => {
    const state = createEmptyQnaBranchState();
    state.questions = [
      {
        questionId: "qna_0001",
        questionText: "Need more detail?",
        questionFingerprint: "need more detail",
        state: "needs_clarification",
        submittedOutcome: {
          questionId: "qna_0001",
          state: "needs_clarification",
          note: "Ask for owner",
        },
        sendState: { localRevision: 3, lastSentRevision: 1 },
      },
    ];

    const batch = buildQnaLedgerSendBatch({ state, sentAt: "2026-04-11T12:00:00.000Z" });
    expect(batch.requiresClarification).toBe(true);

    const nextState = markQnaLedgerItemsSent({
      state,
      sentAt: "2026-04-11T12:00:00.000Z",
      questionIds: ["qna_0001"],
    });
    expect(nextState.questions[0]?.sendState.lastSentRevision).toBe(3);
    expect(nextState.questions[0]?.sendState.lastSentAt).toBe("2026-04-11T12:00:00.000Z");
  });
});
