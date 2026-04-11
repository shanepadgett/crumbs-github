import type { QnaLoopSource } from "./types.js";

export const QNA_LOOP_CONTROL_CUSTOM_TYPE = "qna.loop.control";

export interface QnaLoopKickoffDetails {
  type: "kickoff";
  loopId: string;
  source: QnaLoopSource;
  reviewQuestionIds: string[];
  discoverySummary?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseQnaLoopKickoffDetails(value: unknown): QnaLoopKickoffDetails | null {
  if (!isObject(value)) return null;
  if (value.type !== "kickoff") return null;
  if (!isNonEmptyString(value.loopId)) return null;
  if (value.source !== "manual_qna" && value.source !== "qna_ledger_send") return null;
  if (!Array.isArray(value.reviewQuestionIds)) return null;

  const reviewQuestionIds = value.reviewQuestionIds.filter(isNonEmptyString);
  if (reviewQuestionIds.length !== value.reviewQuestionIds.length) return null;

  if (value.discoverySummary !== undefined && !isNonEmptyString(value.discoverySummary)) {
    return null;
  }

  return {
    type: "kickoff",
    loopId: value.loopId,
    source: value.source,
    reviewQuestionIds,
    discoverySummary: value.discoverySummary,
  };
}

export function buildQnaLoopKickoffMessage(details: QnaLoopKickoffDetails) {
  return {
    customType: QNA_LOOP_CONTROL_CUSTOM_TYPE,
    content: "qna loop kickoff",
    display: false as const,
    details,
  };
}

export function isQnaLoopKickoffMessage(message: {
  role?: unknown;
  customType?: unknown;
  details?: unknown;
}): boolean {
  if (message.role !== "custom") return false;
  if (message.customType !== QNA_LOOP_CONTROL_CUSTOM_TYPE) return false;
  return parseQnaLoopKickoffDetails(message.details) !== null;
}
