import type {
  AuthorizedQuestionRequest,
  RequestValidationResult,
  ValidationIssue,
  ValidationIssueCode,
} from "./types.js";

interface QuestionIdOccurrence {
  id: string;
  path: string;
}

interface OptionIdOccurrence {
  questionPath: string;
  optionId: string;
  path: string;
}

const FORBIDDEN_PRODUCT_FIELDS = new Set(["screen", "loopControl", "terminalScreen", "terminal"]);

function issue(
  code: ValidationIssueCode,
  path: string,
  message: string,
  hint: string,
  expected?: string,
  actual?: string,
): ValidationIssue {
  return { code, path, message, hint, expected, actual };
}

function typeName(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function validateRequiredString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): string | null {
  if (!(key in source)) {
    issues.push(
      issue(
        "missing_required",
        `${path}.${key}`,
        `Missing required field \`${key}\``,
        `Add a non-empty string for \`${key}\`.`,
        "non-empty string",
      ),
    );
    return null;
  }

  const raw = source[key];
  if (typeof raw !== "string") {
    issues.push(
      issue(
        "invalid_type",
        `${path}.${key}`,
        `Field \`${key}\` must be a string`,
        `Set \`${key}\` to a non-empty string.`,
        "string",
        typeName(raw),
      ),
    );
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    issues.push(
      issue(
        "empty_string",
        `${path}.${key}`,
        `Field \`${key}\` must not be empty`,
        `Provide a non-empty string for \`${key}\`.`,
        "non-empty string",
        "empty string",
      ),
    );
    return null;
  }

  return trimmed;
}

function appendForbiddenFieldIssues(
  source: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(source)) {
    if (!FORBIDDEN_PRODUCT_FIELDS.has(key)) continue;
    issues.push(
      issue(
        "forbidden_field",
        `${path}.${key}`,
        `Field \`${key}\` is product-level control data and is not allowed in the shared runtime request`,
        `Remove \`${key}\` and keep product loop-control or terminal-screen semantics in the calling extension.`,
      ),
    );
  }
}

function validateQuestionNode(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  questionIds: QuestionIdOccurrence[],
  optionIds: OptionIdOccurrence[],
): void {
  const question = asObject(value);
  if (!question) {
    issues.push(
      issue(
        "invalid_type",
        path,
        "Question must be an object",
        "Replace this item with a question object.",
        "object",
        typeName(value),
      ),
    );
    return;
  }

  appendForbiddenFieldIssues(question, path, issues);

  const questionId = validateRequiredString(question, "questionId", path, issues);
  if (questionId) questionIds.push({ id: questionId, path: `${path}.questionId` });

  const kindRaw = question.kind;
  let kind: "yes_no" | "multiple_choice" | "freeform" | null = null;
  if (!("kind" in question)) {
    issues.push(
      issue(
        "missing_required",
        `${path}.kind`,
        "Missing required field `kind`",
        "Set `kind` to one of: yes_no, multiple_choice, freeform.",
        "yes_no | multiple_choice | freeform",
      ),
    );
  } else if (typeof kindRaw !== "string") {
    issues.push(
      issue(
        "invalid_type",
        `${path}.kind`,
        "Field `kind` must be a string",
        "Set `kind` to one of: yes_no, multiple_choice, freeform.",
        "string",
        typeName(kindRaw),
      ),
    );
  } else if (kindRaw !== "yes_no" && kindRaw !== "multiple_choice" && kindRaw !== "freeform") {
    issues.push(
      issue(
        "invalid_enum",
        `${path}.kind`,
        "Field `kind` has an unsupported value",
        "Use one of: yes_no, multiple_choice, freeform.",
        "yes_no | multiple_choice | freeform",
        kindRaw,
      ),
    );
  } else {
    kind = kindRaw;
  }

  validateRequiredString(question, "prompt", path, issues);

  if (kind === "multiple_choice") {
    if (!("selectionMode" in question)) {
      issues.push(
        issue(
          "missing_required",
          `${path}.selectionMode`,
          "Missing required field `selectionMode` for multiple_choice",
          "Set `selectionMode` to `single` or `multi`.",
          "single | multi",
        ),
      );
    } else if (typeof question.selectionMode !== "string") {
      issues.push(
        issue(
          "invalid_type",
          `${path}.selectionMode`,
          "Field `selectionMode` must be a string",
          "Set `selectionMode` to `single` or `multi`.",
          "string",
          typeName(question.selectionMode),
        ),
      );
    } else if (question.selectionMode !== "single" && question.selectionMode !== "multi") {
      issues.push(
        issue(
          "invalid_enum",
          `${path}.selectionMode`,
          "Field `selectionMode` has an unsupported value",
          "Use `single` or `multi`.",
          "single | multi",
          question.selectionMode,
        ),
      );
    }

    if (!("options" in question)) {
      issues.push(
        issue(
          "missing_required",
          `${path}.options`,
          "Missing required field `options` for multiple_choice",
          "Provide a non-empty `options` array.",
          "non-empty array",
        ),
      );
    } else if (!Array.isArray(question.options)) {
      issues.push(
        issue(
          "invalid_type",
          `${path}.options`,
          "Field `options` must be an array",
          "Provide a non-empty `options` array.",
          "array",
          typeName(question.options),
        ),
      );
    } else if (question.options.length === 0) {
      issues.push(
        issue(
          "empty_array",
          `${path}.options`,
          "Field `options` must not be empty",
          "Add at least one option object.",
          "non-empty array",
          "empty array",
        ),
      );
    } else {
      for (let i = 0; i < question.options.length; i++) {
        const optionValue = question.options[i];
        const optionPath = `${path}.options[${i}]`;
        const option = asObject(optionValue);
        if (!option) {
          issues.push(
            issue(
              "invalid_type",
              optionPath,
              "Option must be an object",
              "Replace this item with an option object.",
              "object",
              typeName(optionValue),
            ),
          );
          continue;
        }

        appendForbiddenFieldIssues(option, optionPath, issues);

        const optionId = validateRequiredString(option, "optionId", optionPath, issues);
        if (optionId) {
          optionIds.push({
            questionPath: path,
            optionId,
            path: `${optionPath}.optionId`,
          });
        }
        validateRequiredString(option, "label", optionPath, issues);
      }
    }
  }

  if ("followUps" in question) {
    if (!Array.isArray(question.followUps)) {
      issues.push(
        issue(
          "invalid_type",
          `${path}.followUps`,
          "Field `followUps` must be an array when provided",
          "Set `followUps` to an array of question objects.",
          "array",
          typeName(question.followUps),
        ),
      );
    } else {
      for (let i = 0; i < question.followUps.length; i++) {
        validateQuestionNode(
          question.followUps[i],
          `${path}.followUps[${i}]`,
          issues,
          questionIds,
          optionIds,
        );
      }
    }
  }

  if (!kind || !questionId || typeof question.prompt !== "string" || !question.prompt.trim())
    return;
}

function appendDuplicateQuestionIssues(
  questionIds: QuestionIdOccurrence[],
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const occurrence of questionIds) {
    if (!seen.has(occurrence.id)) {
      seen.add(occurrence.id);
      continue;
    }

    issues.push(
      issue(
        "duplicate_question_id",
        occurrence.path,
        `Duplicate questionId \`${occurrence.id}\``,
        "Use a unique questionId for every question in pre-order traversal.",
      ),
    );
  }
}

function appendDuplicateOptionIssues(
  optionIds: OptionIdOccurrence[],
  issues: ValidationIssue[],
): void {
  const seenByQuestion = new Map<string, Set<string>>();

  for (const occurrence of optionIds) {
    let seen = seenByQuestion.get(occurrence.questionPath);
    if (!seen) {
      seen = new Set<string>();
      seenByQuestion.set(occurrence.questionPath, seen);
    }

    if (!seen.has(occurrence.optionId)) {
      seen.add(occurrence.optionId);
      continue;
    }

    issues.push(
      issue(
        "duplicate_option_id",
        occurrence.path,
        `Duplicate optionId \`${occurrence.optionId}\` within the same question`,
        "Use unique optionId values within each multiple_choice question.",
      ),
    );
  }
}

export function validateAuthorizedQuestionRequest(text: string): RequestValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return {
      ok: false,
      issues: [
        issue(
          "json_parse",
          "$",
          `Failed to parse JSON: ${message}`,
          "Write one valid JSON object with a non-empty `questions` array.",
          "valid JSON object",
        ),
      ],
    };
  }

  const root = asObject(parsed);
  if (!root) {
    return {
      ok: false,
      issues: [
        issue(
          "expected_object",
          "$",
          "Top-level value must be a JSON object",
          "Wrap the payload in `{ ... }`.",
          "object",
          typeName(parsed),
        ),
      ],
    };
  }

  const issues: ValidationIssue[] = [];
  const questionIds: QuestionIdOccurrence[] = [];
  const optionIds: OptionIdOccurrence[] = [];

  appendForbiddenFieldIssues(root, "$", issues);

  if (!("questions" in root)) {
    issues.push(
      issue(
        "missing_required",
        "$.questions",
        "Missing required field `questions`",
        "Add a non-empty `questions` array.",
        "non-empty array",
      ),
    );
  } else if (!Array.isArray(root.questions)) {
    issues.push(
      issue(
        "invalid_type",
        "$.questions",
        "Field `questions` must be an array",
        "Set `questions` to an array of question objects.",
        "array",
        typeName(root.questions),
      ),
    );
  } else if (root.questions.length === 0) {
    issues.push(
      issue(
        "empty_array",
        "$.questions",
        "Field `questions` must not be empty",
        "Add at least one question object.",
        "non-empty array",
        "empty array",
      ),
    );
  } else {
    for (let i = 0; i < root.questions.length; i++) {
      validateQuestionNode(root.questions[i], `$.questions[${i}]`, issues, questionIds, optionIds);
    }
  }

  appendDuplicateQuestionIssues(questionIds, issues);
  appendDuplicateOptionIssues(optionIds, issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    request: root as unknown as AuthorizedQuestionRequest,
  };
}
