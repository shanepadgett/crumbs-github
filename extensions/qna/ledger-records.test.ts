import { describe, expect, test } from "bun:test";
import { createEmptyQnaBranchState } from "./branch-state.js";
import { applyQnaLedgerQuestionEdit, reopenQnaLedgerQuestion } from "./ledger-records.js";

function buildState() {
  const state = createEmptyQnaBranchState();
  state.questions = [
    {
      questionId: "qna_0001",
      questionText: "Who owns this?",
      questionFingerprint: "who owns this",
      state: "answered_in_chat",
      sendState: { localRevision: 2, lastSentRevision: 1 },
    },
  ];
  return state;
}

describe("ledger-records", () => {
  test("reopens closed records as open and bumps revision", () => {
    const nextState = reopenQnaLedgerQuestion({ state: buildState(), questionId: "qna_0001" });
    expect(nextState.questions[0]?.state).toBe("open");
    expect(nextState.questions[0]?.sendState.localRevision).toBe(3);
  });

  test("applies single-record edits to closed records", () => {
    const result = applyQnaLedgerQuestionEdit({
      state: buildState(),
      questionId: "qna_0001",
      draftSnapshot: [
        {
          questionId: "qna_0001",
          closureState: "open",
          questionNote: "",
          answerDraft: { kind: "freeform", text: "Sam", note: "" },
        },
      ],
      submitResult: {
        kind: "question_outcomes",
        requiresClarification: false,
        outcomes: [
          {
            questionId: "qna_0001",
            state: "answered",
            answer: { kind: "freeform", text: "Sam" },
          },
        ],
      },
    });

    expect(result.changed).toBe(true);
    expect(result.nextQuestionState).toBe("answered");
    expect(result.nextState.questions[0]?.sendState.localRevision).toBe(3);
  });
});
