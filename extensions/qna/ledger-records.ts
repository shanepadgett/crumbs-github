import type {
  QuestionRuntimeQuestionDraft,
  QuestionRuntimeStructuredSubmitResult,
} from "../question-runtime/types.js";
import {
  applyQnaDraftSnapshot,
  applySubmittedOutcomeToLedgerRecord,
  didLedgerRecordAuthoritativeStateChange,
} from "./runtime-submit.js";
import type { QnaBranchStateSnapshot, QnaLedgerRecordState } from "./types.js";

function cloneState(state: QnaBranchStateSnapshot): QnaBranchStateSnapshot {
  return structuredClone(state);
}

function assertDraftSnapshotQuestionIds(
  draftSnapshot: QuestionRuntimeQuestionDraft[],
  questionId: string,
): void {
  for (const draft of draftSnapshot) {
    if (draft.questionId !== questionId) {
      throw new Error(`Draft snapshot question ${draft.questionId} is outside the selected record`);
    }
  }
}

export function reopenQnaLedgerQuestion(input: {
  state: QnaBranchStateSnapshot;
  questionId: string;
}): QnaBranchStateSnapshot {
  const nextState = cloneState(input.state);
  nextState.questions = nextState.questions.map((record) => {
    if (record.questionId !== input.questionId) return record;
    if (record.state === "open") return record;

    return {
      questionId: record.questionId,
      questionText: record.questionText,
      questionFingerprint: record.questionFingerprint,
      state: "open" as const,
      sendState: {
        ...record.sendState,
        localRevision: record.sendState.localRevision + 1,
      },
    };
  });

  return nextState;
}

export function applyQnaLedgerQuestionEdit(input: {
  state: QnaBranchStateSnapshot;
  questionId: string;
  draftSnapshot: QuestionRuntimeQuestionDraft[];
  submitResult: QuestionRuntimeStructuredSubmitResult;
}): {
  nextState: QnaBranchStateSnapshot;
  changed: boolean;
  nextQuestionState: QnaLedgerRecordState;
} {
  assertDraftSnapshotQuestionIds(input.draftSnapshot, input.questionId);
  const nextState = applyQnaDraftSnapshot(input.state, input.draftSnapshot);
  const recordIndex = nextState.questions.findIndex(
    (record) => record.questionId === input.questionId,
  );
  if (recordIndex < 0) {
    throw new Error(`Question ${input.questionId} was not found in the ledger`);
  }

  const currentRecord = nextState.questions[recordIndex]!;
  if (input.submitResult.kind === "no_user_response") {
    return {
      nextState,
      changed: false,
      nextQuestionState: currentRecord.state,
    };
  }

  const outcomes = input.submitResult.outcomes.filter(
    (outcome) => outcome.questionId === input.questionId,
  );
  if (outcomes.length > 1) {
    throw new Error(`Duplicate submitted outcome for ${input.questionId}`);
  }

  const outcome = outcomes[0];
  if (!outcome) {
    return {
      nextState,
      changed: false,
      nextQuestionState: currentRecord.state,
    };
  }

  const nextRecord = applySubmittedOutcomeToLedgerRecord({
    record: currentRecord,
    outcome,
  });
  const changed = didLedgerRecordAuthoritativeStateChange(currentRecord, nextRecord);
  nextState.questions[recordIndex] = changed
    ? nextRecord
    : {
        ...nextRecord,
        sendState: currentRecord.sendState,
      };

  return {
    nextState,
    changed,
    nextQuestionState: nextState.questions[recordIndex]!.state,
  };
}

export function validateQnaLedgerDraftSnapshot(
  draftSnapshot: QuestionRuntimeQuestionDraft[],
  questionId: string,
): QuestionRuntimeQuestionDraft[] {
  assertDraftSnapshotQuestionIds(draftSnapshot, questionId);
  return draftSnapshot;
}
