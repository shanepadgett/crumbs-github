import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type {
  AuthorizedMultipleChoiceQuestion,
  AuthorizedQuestionNode,
  AuthorizedQuestionRequest,
} from "./types.js";

interface FlattenedQuestion {
  question: AuthorizedQuestionNode;
  path: string;
}

function flattenQuestions(
  questions: AuthorizedQuestionNode[],
  basePath: string,
  out: FlattenedQuestion[],
): void {
  for (let i = 0; i < questions.length; i++) {
    const path = `${basePath}[${i}]`;
    const question = questions[i]!;
    out.push({ question, path });
    if (Array.isArray(question.followUps)) {
      flattenQuestions(question.followUps, `${path}.followUps`, out);
    }
  }
}

function tabLabel(question: AuthorizedQuestionNode, index: number): string {
  return `${index + 1}:${question.questionId}`;
}

function kindLabel(question: AuthorizedQuestionNode): string {
  if (question.kind === "multiple_choice") {
    return `multiple_choice (${question.selectionMode})`;
  }
  return question.kind;
}

function renderMultipleChoiceLines(question: AuthorizedMultipleChoiceQuestion): string[] {
  const lines: string[] = [];
  for (const option of question.options) {
    lines.push(`- [${option.optionId}] ${option.label}`);
  }
  return lines;
}

export async function showQuestionRuntimeFormShell(
  ctx: ExtensionContext,
  payload: {
    requestId: string;
    projectRelativePath: string;
    request: AuthorizedQuestionRequest;
  },
): Promise<void> {
  const flattened: FlattenedQuestion[] = [];
  flattenQuestions(payload.request.questions, "$.questions", flattened);
  if (flattened.length === 0) return;

  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    let tabIndex = 0;

    function requestRender(): void {
      tui.requestRender();
    }

    return {
      handleInput(data: string) {
        if (
          matchesKey(data, Key.escape) ||
          matchesKey(data, Key.ctrl("c")) ||
          matchesKey(data, Key.enter)
        ) {
          done();
          return;
        }

        if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
          tabIndex = (tabIndex + 1) % flattened.length;
          requestRender();
          return;
        }

        if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
          tabIndex = (tabIndex - 1 + flattened.length) % flattened.length;
          requestRender();
        }
      },
      render(width: number) {
        const lines: string[] = [];
        lines.push(truncateToWidth(theme.fg("accent", "Question Runtime"), width));
        lines.push(
          truncateToWidth(
            theme.fg(
              "muted",
              `requestId: ${payload.requestId}  file: ${payload.projectRelativePath}`,
            ),
            width,
          ),
        );
        lines.push("");

        const tabLine = flattened
          .map((entry, index) => {
            const label = ` ${tabLabel(entry.question, index)} `;
            if (index === tabIndex) {
              return theme.bg("selectedBg", theme.fg("text", label));
            }
            return theme.fg("muted", label);
          })
          .join(" ");
        lines.push(truncateToWidth(tabLine, width));
        lines.push("");

        const active = flattened[tabIndex]!;
        const question = active.question;
        lines.push(truncateToWidth(theme.fg("text", question.prompt), width));
        lines.push(truncateToWidth(theme.fg("muted", `kind: ${kindLabel(question)}`), width));
        lines.push(truncateToWidth(theme.fg("dim", `path: ${active.path}`), width));

        if (question.kind === "multiple_choice") {
          lines.push("");
          for (const line of renderMultipleChoiceLines(question)) {
            lines.push(truncateToWidth(theme.fg("text", line), width));
          }
        }

        lines.push("");
        lines.push(truncateToWidth(theme.fg("dim", "Tab/←→ switch tabs • Enter/Esc close"), width));
        return lines;
      },
      invalidate() {},
    };
  });
}
