export type QuestionKind = "yes_no" | "multiple_choice" | "freeform";

export interface AuthorizedQuestionRequest {
  questions: AuthorizedQuestionNode[];
}

export interface AuthorizedQuestionBase {
  questionId: string;
  prompt: string;
  followUps?: AuthorizedQuestionNode[];
}

export interface AuthorizedYesNoQuestion extends AuthorizedQuestionBase {
  kind: "yes_no";
}

export interface AuthorizedFreeformQuestion extends AuthorizedQuestionBase {
  kind: "freeform";
}

export interface AuthorizedMultipleChoiceOption {
  optionId: string;
  label: string;
}

export interface AuthorizedMultipleChoiceQuestion extends AuthorizedQuestionBase {
  kind: "multiple_choice";
  selectionMode: "single" | "multi";
  options: AuthorizedMultipleChoiceOption[];
}

export type AuthorizedQuestionNode =
  | AuthorizedYesNoQuestion
  | AuthorizedFreeformQuestion
  | AuthorizedMultipleChoiceQuestion;

export type ValidationIssueCode =
  | "json_parse"
  | "expected_object"
  | "forbidden_field"
  | "missing_required"
  | "invalid_type"
  | "invalid_enum"
  | "empty_string"
  | "empty_array"
  | "duplicate_question_id"
  | "duplicate_option_id";

export interface ValidationIssue {
  code: ValidationIssueCode;
  path: string;
  message: string;
  expected?: string;
  actual?: string;
  hint: string;
}

export type RequestValidationResult =
  | {
      ok: true;
      issues: [];
      request: AuthorizedQuestionRequest;
    }
  | {
      ok: false;
      issues: ValidationIssue[];
      request?: undefined;
    };

export const QUESTION_RUNTIME_STATE_ENTRY = "question-runtime.state";

export type RuntimeRequestStatus = "pending" | "ready" | "locked" | "aborted";

export interface RuntimeRequestRecord {
  requestId: string;
  path: string;
  projectRelativePath: string;
  status: RuntimeRequestStatus;
  failureCount: number;
  extraRetryBlocksGranted: number;
  pendingRetryDecision: boolean;
  lastProcessedContentHash?: string;
}

export interface QuestionRuntimeStateSnapshot {
  requests: RuntimeRequestRecord[];
}
