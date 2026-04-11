import { describe, expect, test } from "bun:test";
import { createEmptyQnaBranchState } from "./branch-state.js";
import { buildQnaLedgerDraft, buildQnaRuntimeRequest } from "./runtime-request.js";

describe("runtime-request", () => {
  test("reuses stored runtime drafts when present", () => {
    const state = createEmptyQnaBranchState();
    state.questions = [
      {
        questionId: "qna_0001",
        questionText: "Who owns this?",
        questionFingerprint: "who owns this",
        state: "open",
        sendState: { localRevision: 1, lastSentRevision: 0 },
      },
    ];
    state.runtimeDraftsByQuestionId.qna_0001 = {
      questionId: "qna_0001",
      closureState: "needs_clarification",
      questionNote: "Need owner",
      answerDraft: { kind: "freeform", text: "", note: "" },
    };

    const request = buildQnaRuntimeRequest({
      state,
      questionIds: ["qna_0001"],
      allowedStates: ["open"],
    });

    expect(request.draftSnapshot?.[0]?.questionNote).toBe("Need owner");
  });

  test("reconstructs answered drafts from submitted outcomes", () => {
    const draft = buildQnaLedgerDraft({
      record: {
        questionId: "qna_0001",
        questionText: "Who owns this?",
        questionFingerprint: "who owns this",
        state: "answered",
        submittedOutcome: {
          questionId: "qna_0001",
          state: "answered",
          answer: { kind: "freeform", text: "Sam", note: "Confirmed" },
        },
        sendState: { localRevision: 2, lastSentRevision: 1 },
      },
    });

    expect(draft.closureState).toBe("open");
    expect(draft.answerDraft).toEqual({ kind: "freeform", text: "Sam", note: "Confirmed" });
  });
});
