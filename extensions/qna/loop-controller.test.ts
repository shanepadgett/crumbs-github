import { describe, expect, test } from "bun:test";
import { QnaLoopController } from "./loop-controller.js";

function makePi(initialActiveTools: string[] = []) {
  const state = {
    activeTools: [...initialActiveTools],
    sentMessages: [] as Array<{ message: unknown; options: unknown }>,
  };

  return {
    state,
    pi: {
      getActiveTools() {
        return [...state.activeTools];
      },
      setActiveTools(next: string[]) {
        state.activeTools = [...next];
      },
      getAllTools() {
        return [{ name: "qna" }, { name: "question_runtime_request" }, { name: "bash" }];
      },
      sendMessage(message: unknown, options: unknown) {
        state.sentMessages.push({ message, options });
      },
    },
  };
}

describe("QnaLoopController", () => {
  test("activates qna and hides question_runtime_request during loop", () => {
    const { pi, state } = makePi(["bash", "question_runtime_request"]);
    const controller = new QnaLoopController(pi as any);

    const started = controller.startLoop({
      source: "manual_qna",
      reviewQuestions: [{ questionId: "qna_0001", questionText: "Who owns this?", state: "open" }],
    });

    expect(started.startedNewLoop).toBe(true);
    expect(state.activeTools.sort()).toEqual(["bash", "qna"].sort());
    expect(state.sentMessages).toHaveLength(1);
  });

  test("restores tool diff after settle and agent end", () => {
    const { pi, state } = makePi(["bash", "question_runtime_request"]);
    const controller = new QnaLoopController(pi as any);

    controller.startLoop({
      source: "manual_qna",
      reviewQuestions: [{ questionId: "qna_0001", questionText: "Who owns this?", state: "open" }],
    });
    controller.markSettled("agent_complete");
    expect(state.activeTools.sort()).toEqual(["bash"].sort());

    controller.handleAgentEnd({} as any);
    expect(state.activeTools.sort()).toEqual(["bash", "question_runtime_request"].sort());
  });

  test("filters stale kickoff messages when loop is inactive", () => {
    const { pi } = makePi(["bash"]);
    const controller = new QnaLoopController(pi as any);
    const event = {
      messages: [
        {
          role: "custom",
          customType: "qna.loop.control",
          content: "qna loop kickoff",
          display: false,
          details: {
            type: "kickoff",
            loopId: "loop_1",
            source: "manual_qna",
            reviewQuestionIds: ["qna_0001"],
          },
          timestamp: Date.now(),
        },
        { role: "user", content: "hi", timestamp: Date.now() },
      ] as any[],
    };

    const result = controller.handleContext(event);
    expect(result?.messages).toHaveLength(1);
    expect(result?.messages[0]?.role).toBe("user");
  });

  test("tracks allowed ids for ledger-send loops", () => {
    const { pi } = makePi(["bash"]);
    const controller = new QnaLoopController(pi as any);

    controller.startLoop({
      source: "qna_ledger_send",
      reviewQuestions: [{ questionId: "qna_0002", questionText: "What changed?", state: "open" }],
    });

    expect(controller.getAllowedQuestionIds()).toEqual(["qna_0002"]);
    const prompt = controller.handleBeforeAgentStart({ systemPrompt: "base" }, {} as any);
    expect(prompt?.systemPrompt).toContain("/qna-ledger sent branch-local updates");
  });
});
