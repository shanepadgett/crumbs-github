import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { resolveProjectRoot } from "../question-runtime/request-paths.js";
import type { QnaBranchStateSnapshot, QnaLedgerRecordState } from "./types.js";

const EXPORT_STATE_ORDER: QnaLedgerRecordState[] = [
  "open",
  "needs_clarification",
  "answered",
  "skipped",
  "answered_in_chat",
  "superseded",
];

function formatFilenameTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-");
}

function formatSubmittedOutcome(record: QnaBranchStateSnapshot["questions"][number]): string[] {
  if (!("submittedOutcome" in record)) return [];
  if (record.submittedOutcome.state === "answered") {
    if (record.submittedOutcome.answer.kind === "freeform") {
      return [
        `- answer: ${record.submittedOutcome.answer.text}`,
        ...(record.submittedOutcome.answer.note
          ? [`- answer note: ${record.submittedOutcome.answer.note}`]
          : []),
      ];
    }

    if (record.submittedOutcome.answer.kind === "yes_no") {
      return [
        `- answer: ${record.submittedOutcome.answer.optionId}`,
        ...(record.submittedOutcome.answer.note
          ? [`- answer note: ${record.submittedOutcome.answer.note}`]
          : []),
      ];
    }

    return [
      `- selections: ${record.submittedOutcome.answer.selections.map((selection) => selection.optionId).join(", ")}`,
      ...(record.submittedOutcome.answer.otherText
        ? [`- other text: ${record.submittedOutcome.answer.otherText}`]
        : []),
    ];
  }

  return record.submittedOutcome.note ? [`- note: ${record.submittedOutcome.note}`] : [];
}

function formatStateSection(input: {
  state: QnaBranchStateSnapshot;
  recordState: QnaLedgerRecordState;
}): string[] {
  const records = input.state.questions.filter((record) => record.state === input.recordState);
  const lines = [`## ${input.recordState}`];
  if (records.length === 0) {
    lines.push("", "_None._");
    return lines;
  }

  for (const record of records) {
    lines.push("", `### ${record.questionId}`, "", record.questionText, "");
    lines.push(`- send revision: ${record.sendState.localRevision}`);
    lines.push(`- last sent revision: ${record.sendState.lastSentRevision}`);
    if (record.sendState.lastSentAt) {
      lines.push(`- last sent at: ${record.sendState.lastSentAt}`);
    }
    if (record.state === "superseded") {
      lines.push(`- superseded by: ${record.supersededByQuestionId}`);
    }
    lines.push(...formatSubmittedOutcome(record));
  }

  return lines;
}

export interface QnaLedgerMarkdownExportResult {
  absolutePath: string;
  projectRelativePath: string;
}

export function formatQnaLedgerMarkdownSnapshot(input: {
  state: QnaBranchStateSnapshot;
  exportedAt: string;
}): string {
  const counts = Object.fromEntries(
    EXPORT_STATE_ORDER.map((state) => [
      state,
      input.state.questions.filter((record) => record.state === state).length,
    ]),
  ) as Record<QnaLedgerRecordState, number>;

  const lines = [
    "# Ordinary QnA Ledger Snapshot",
    "",
    `- exportedAt: ${input.exportedAt}`,
    `- totalQuestions: ${input.state.questions.length}`,
    "",
    "| state | count |",
    "| --- | ---: |",
    ...EXPORT_STATE_ORDER.map((state) => `| ${state} | ${counts[state]} |`),
  ];

  for (const recordState of EXPORT_STATE_ORDER) {
    lines.push("", ...formatStateSection({ state: input.state, recordState }));
  }

  return `${lines.join("\n")}\n`;
}

export async function writeQnaLedgerMarkdownSnapshot(input: {
  exec: Parameters<typeof resolveProjectRoot>[0];
  cwd: string;
  state: QnaBranchStateSnapshot;
  now?: Date;
}): Promise<QnaLedgerMarkdownExportResult> {
  const now = input.now ?? new Date();
  const projectRoot = await resolveProjectRoot(input.exec, input.cwd);
  const exportDirectory = normalize(join(projectRoot, "docs", "qna"));
  await mkdir(exportDirectory, { recursive: true });

  const filename = `qna-ledger-${formatFilenameTimestamp(now)}.md`;
  const absolutePath = normalize(join(exportDirectory, filename));
  await writeFile(
    absolutePath,
    formatQnaLedgerMarkdownSnapshot({
      state: input.state,
      exportedAt: now.toISOString(),
    }),
    "utf8",
  );

  return {
    absolutePath,
    projectRelativePath: `docs/qna/${filename}`,
  };
}
