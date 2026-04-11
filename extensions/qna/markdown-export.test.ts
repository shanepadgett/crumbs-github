import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createEmptyQnaBranchState } from "./branch-state.js";
import {
  formatQnaLedgerMarkdownSnapshot,
  writeQnaLedgerMarkdownSnapshot,
} from "./markdown-export.js";

describe("markdown-export", () => {
  test("formats grouped markdown snapshot content", () => {
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

    const markdown = formatQnaLedgerMarkdownSnapshot({
      state,
      exportedAt: "2026-04-11T12:00:00.000Z",
    });

    expect(markdown).toContain("# Ordinary QnA Ledger Snapshot");
    expect(markdown).toContain("## open");
    expect(markdown).toContain("### qna_0001");
  });

  test("writes timestamped snapshots under docs/qna", async () => {
    const root = await mkdtemp(join(tmpdir(), "qna-ledger-export-"));
    try {
      const state = createEmptyQnaBranchState();
      const result = await writeQnaLedgerMarkdownSnapshot({
        exec: async () => ({ code: 0, stdout: `${root}\n`, stderr: "" }) as any,
        cwd: root,
        state,
        now: new Date("2026-04-11T15:02:09.000Z"),
      });

      expect(result.projectRelativePath).toBe("docs/qna/qna-ledger-2026-04-11T15-02-09.000Z.md");
      const content = await readFile(join(root, result.projectRelativePath), "utf8");
      expect(content).toContain("exportedAt: 2026-04-11T15:02:09.000Z");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
