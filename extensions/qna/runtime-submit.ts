import type {
  QuestionRuntimeQuestionDraft,
  SubmittedQuestionRuntimeQuestionOutcome,
  QuestionRuntimeStructuredSubmitResult,
} from "../question-runtime/types.js";
import type { QnaBranchStateSnapshot, QnaLedgerQuestionRecord } from "./types.js";

function cloneState(state: QnaBranchStateSnapshot): QnaBranchStateSnapshot {
  return structuredClone(state);
}

function bumpRevision(record: QnaLedgerQuestionRecord): QnaLedgerQuestionRecord["sendState"] {
  return {
    ...record.sendState,
    localRevision: record.sendState.localRevision + 1,
  };
}

function getAuthoritativeRecordShape(
  record: QnaLedgerQuestionRecord,
): Omit<QnaLedgerQuestionRecord, "sendState"> {
  const { sendState: _sendState, ...rest } = record;
  return rest;
}

export function didLedgerRecordAuthoritativeStateChange(
  left: QnaLedgerQuestionRecord,
  right: QnaLedgerQuestionRecord,
): boolean {
  return (
    JSON.stringify(getAuthoritativeRecordShape(left)) !==
    JSON.stringify(getAuthoritativeRecordShape(right))
  );
}

export function applySubmittedOutcomeToLedgerRecord(input: {
  record: QnaLedgerQuestionRecord;
  outcome: SubmittedQuestionRuntimeQuestionOutcome;
}): QnaLedgerQuestionRecord {
  const { record, outcome } = input;
  if (record.questionId !== outcome.questionId) {
    throw new Error(`Outcome ${outcome.questionId} does not match record ${record.questionId}`);
  }

  if (outcome.state === "answered") {
    return {
      ...record,
      state: "answered",
      submittedOutcome: structuredClone(outcome),
      sendState: bumpRevision(record),
    };
  }

  if (outcome.state === "skipped") {
    return {
      ...record,
      state: "skipped",
      submittedOutcome: structuredClone(outcome),
      sendState: bumpRevision(record),
    };
  }

  return {
    ...record,
    state: "needs_clarification",
    submittedOutcome: structuredClone(outcome),
    sendState: bumpRevision(record),
  };
}

export function applyQnaDraftSnapshot(
  state: QnaBranchStateSnapshot,
  draftSnapshot: QuestionRuntimeQuestionDraft[],
): QnaBranchStateSnapshot {
  const nextState = cloneState(state);

  for (const draft of draftSnapshot) {
    nextState.runtimeDraftsByQuestionId[draft.questionId] = structuredClone(draft);
  }

  return nextState;
}

export function applyQnaStructuredSubmitResult(input: {
  state: QnaBranchStateSnapshot;
  batchQuestionIds: string[];
  draftSnapshot: QuestionRuntimeQuestionDraft[];
  submitResult: QuestionRuntimeStructuredSubmitResult;
}): {
  nextState: QnaBranchStateSnapshot;
  stats: {
    answered: number;
    skipped: number;
    needsClarification: number;
    untouched: number;
  };
  changedQuestionIds: string[];
  remainingOpenQuestionIds: string[];
} {
  const nextState = applyQnaDraftSnapshot(input.state, input.draftSnapshot);
  const batchQuestionIds = new Set(input.batchQuestionIds);
  const openRecordsById = new Map(
    nextState.questions
      .filter((question) => question.state === "open")
      .map((question) => [question.questionId, question]),
  );

  if (input.submitResult.kind === "no_user_response") {
    return {
      nextState,
      stats: {
        answered: 0,
        skipped: 0,
        needsClarification: 0,
        untouched: input.batchQuestionIds.length,
      },
      changedQuestionIds: [],
      remainingOpenQuestionIds: nextState.questions
        .filter((question) => question.state === "open")
        .map((question) => question.questionId),
    };
  }

  const outcomesByQuestionId = new Map<string, (typeof input.submitResult.outcomes)[number]>();
  for (const outcome of input.submitResult.outcomes) {
    if (!batchQuestionIds.has(outcome.questionId)) {
      throw new Error(`Question ${outcome.questionId} is outside the submitted batch`);
    }
    if (outcomesByQuestionId.has(outcome.questionId)) {
      throw new Error(`Duplicate submitted outcome for ${outcome.questionId}`);
    }
    if (!openRecordsById.has(outcome.questionId)) {
      throw new Error(`Question ${outcome.questionId} is not currently open`);
    }
    outcomesByQuestionId.set(outcome.questionId, structuredClone(outcome));
  }

  let answered = 0;
  let skipped = 0;
  let needsClarification = 0;
  let untouched = 0;
  const changedQuestionIds: string[] = [];

  nextState.questions = nextState.questions.map((question) => {
    if (question.state !== "open") return question;
    if (!batchQuestionIds.has(question.questionId)) return question;

    const outcome = outcomesByQuestionId.get(question.questionId);
    if (!outcome) {
      untouched += 1;
      return question;
    }

    changedQuestionIds.push(question.questionId);
    const nextRecord = applySubmittedOutcomeToLedgerRecord({ record: question, outcome });

    if (nextRecord.state === "answered") {
      answered += 1;
      return nextRecord;
    }

    if (nextRecord.state === "skipped") {
      skipped += 1;
      return nextRecord;
    }

    needsClarification += 1;
    return nextRecord;
  });

  return {
    nextState,
    stats: {
      answered,
      skipped,
      needsClarification,
      untouched,
    },
    changedQuestionIds,
    remainingOpenQuestionIds: nextState.questions
      .filter((question) => question.state === "open")
      .map((question) => question.questionId),
  };
}
