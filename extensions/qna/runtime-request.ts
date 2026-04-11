import type {
  AuthorizedQuestionRequest,
  QuestionAnswerDraft,
  QuestionRuntimeQuestionDraft,
  SubmittedQuestionRuntimeQuestionOutcome,
} from "../question-runtime/types.js";
import type {
  QnaBranchStateSnapshot,
  QnaLedgerQuestionRecord,
  QnaLedgerRecordState,
} from "./types.js";

function buildEmptyAnswerDraft(): QuestionAnswerDraft {
  return {
    kind: "freeform",
    text: "",
    note: "",
  };
}

function buildAnswerDraftFromSubmittedOutcome(
  outcome: Extract<SubmittedQuestionRuntimeQuestionOutcome, { state: "answered" }>,
): QuestionAnswerDraft {
  if (outcome.answer.kind === "yes_no") {
    return {
      kind: "yes_no",
      selectedOptionId: outcome.answer.optionId,
      note: outcome.answer.note ?? "",
    };
  }

  if (outcome.answer.kind === "multiple_choice") {
    return {
      kind: "multiple_choice",
      selectedOptionIds: outcome.answer.selections.map((selection) => selection.optionId),
      otherText: outcome.answer.otherText ?? "",
      optionNoteDrafts: Object.fromEntries(
        outcome.answer.selections
          .filter((selection) => !!selection.note)
          .map((selection) => [selection.optionId, selection.note ?? ""]),
      ),
    };
  }

  return {
    kind: "freeform",
    text: outcome.answer.text,
    note: outcome.answer.note ?? "",
  };
}

export function buildQnaLedgerDraft(input: {
  record: QnaLedgerQuestionRecord;
  runtimeDraft?: QuestionRuntimeQuestionDraft;
}): QuestionRuntimeQuestionDraft {
  if (input.runtimeDraft) {
    return structuredClone(input.runtimeDraft);
  }

  const base = {
    questionId: input.record.questionId,
    questionNote: "",
  };

  switch (input.record.state) {
    case "open":
    case "answered_in_chat":
    case "superseded":
      return {
        ...base,
        closureState: "open",
        answerDraft: buildEmptyAnswerDraft(),
      };
    case "answered":
      return {
        ...base,
        closureState: "open",
        answerDraft: buildAnswerDraftFromSubmittedOutcome(input.record.submittedOutcome),
      };
    case "skipped":
      return {
        ...base,
        closureState: "skipped",
        answerDraft: buildEmptyAnswerDraft(),
        questionNote: input.record.submittedOutcome.note ?? "",
      };
    case "needs_clarification":
      return {
        ...base,
        closureState: "needs_clarification",
        answerDraft: buildEmptyAnswerDraft(),
        questionNote: input.record.submittedOutcome.note,
      };
  }
}

export function buildQnaRuntimeRequest(input: {
  state: QnaBranchStateSnapshot;
  questionIds: string[];
  allowedStates: QnaLedgerRecordState[];
}): AuthorizedQuestionRequest {
  const recordsById = new Map(input.state.questions.map((record) => [record.questionId, record]));
  const allowedStates = new Set(input.allowedStates);

  return {
    questions: input.questionIds.map((questionId) => {
      const record = recordsById.get(questionId);
      if (!record) {
        throw new Error(`Question ${questionId} was not found in the ledger`);
      }
      if (!allowedStates.has(record.state)) {
        throw new Error(`Question ${questionId} is not editable from state ${record.state}`);
      }

      return {
        questionId: record.questionId,
        kind: "freeform" as const,
        prompt: record.questionText,
        justification:
          record.state === "open"
            ? "Structured manual QnA review captures the current authoritative outcome for this open ledger question."
            : "Structured ledger editing updates the current authoritative outcome for this ordinary QnA record.",
        suggestedAnswer: "Answer with the clearest current decision, fact, or unresolved blocker.",
      };
    }),
    draftSnapshot: input.questionIds.map((questionId) => {
      const record = recordsById.get(questionId);
      if (!record) {
        throw new Error(`Question ${questionId} was not found in the ledger`);
      }

      return buildQnaLedgerDraft({
        record,
        runtimeDraft: input.state.runtimeDraftsByQuestionId[questionId],
      });
    }),
  };
}
