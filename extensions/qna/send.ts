import type { QnaBranchStateSnapshot, QnaLedgerSendBatch, QnaLedgerSendItem } from "./types.js";

export const QNA_LEDGER_SEND_CUSTOM_TYPE = "qna.ledger.send";

export function getPendingQnaLedgerSendItems(state: QnaBranchStateSnapshot): QnaLedgerSendItem[] {
  return state.questions
    .filter((record) => record.sendState.localRevision > record.sendState.lastSentRevision)
    .map((record) => ({
      questionId: record.questionId,
      questionText: record.questionText,
      state: record.state,
      localRevision: record.sendState.localRevision,
      lastSentRevision: record.sendState.lastSentRevision,
      submittedOutcome:
        "submittedOutcome" in record ? structuredClone(record.submittedOutcome) : undefined,
      supersededByQuestionId:
        record.state === "superseded" ? record.supersededByQuestionId : undefined,
    }));
}

export function buildQnaLedgerSendBatch(input: {
  state: QnaBranchStateSnapshot;
  sentAt: string;
}): QnaLedgerSendBatch {
  const items = getPendingQnaLedgerSendItems(input.state);
  return {
    schemaVersion: 1,
    type: "ordinary_qna_ledger_updates",
    sentAt: input.sentAt,
    requiresClarification: items.some((item) => item.state === "needs_clarification"),
    items,
  };
}

export function markQnaLedgerItemsSent(input: {
  state: QnaBranchStateSnapshot;
  sentAt: string;
  questionIds: string[];
}): QnaBranchStateSnapshot {
  const questionIds = new Set(input.questionIds);
  const nextState = structuredClone(input.state) as QnaBranchStateSnapshot;
  nextState.questions = nextState.questions.map((record) => {
    if (!questionIds.has(record.questionId)) return record;
    return {
      ...record,
      sendState: {
        ...record.sendState,
        lastSentRevision: record.sendState.localRevision,
        lastSentAt: input.sentAt,
      },
    };
  });
  return nextState;
}

export function buildQnaLedgerSendMessage(batch: QnaLedgerSendBatch): {
  customType: string;
  content: string;
  display: false;
  details: QnaLedgerSendBatch;
} {
  return {
    customType: QNA_LEDGER_SEND_CUSTOM_TYPE,
    content: `ordinary qna ledger updates (${batch.items.length})`,
    display: false,
    details: batch,
  };
}
