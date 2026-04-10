import type { ValidationIssue } from "./types.js";

const CUSTOM_TYPE = "question-runtime.control";

function formatIssue(issue: ValidationIssue): string {
  const parts = [`- ${issue.path}: ${issue.message}`];
  if (issue.expected) parts.push(`  expected: ${issue.expected}`);
  if (issue.actual) parts.push(`  actual: ${issue.actual}`);
  parts.push(`  fix: ${issue.hint}`);
  return parts.join("\n");
}

export function buildValidationFailureMessage(input: {
  requestId: string;
  path: string;
  projectRelativePath: string;
  issues: ValidationIssue[];
  failureCount: number;
  allowedFailures: number;
  retryDecisionRequired: boolean;
}) {
  const issuesBlock = input.issues.map(formatIssue).join("\n");
  const content = [
    "Authorized request is invalid. Repair the same file in place.",
    `requestId: ${input.requestId}`,
    `path: @${input.path}`,
    `projectRelativePath: ${input.projectRelativePath}`,
    `failures: ${input.failureCount}/${input.allowedFailures}`,
    input.retryDecisionRequired
      ? "retryDecision: required (wait for user Continue/Abort)"
      : "retryDecision: not required",
    "issues:",
    issuesBlock,
  ].join("\n");

  return {
    customType: CUSTOM_TYPE,
    content,
    display: false,
    details: {
      type: "validation_failure",
      requestId: input.requestId,
      path: `@${input.path}`,
      projectRelativePath: input.projectRelativePath,
      failureCount: input.failureCount,
      allowedFailures: input.allowedFailures,
      retryDecisionRequired: input.retryDecisionRequired,
      issues: input.issues,
    },
  };
}

export function buildRetryGrantedMessage(input: {
  requestId: string;
  path: string;
  projectRelativePath: string;
  allowedFailures: number;
}) {
  return {
    customType: CUSTOM_TYPE,
    content: [
      "Retry block granted for authorized request.",
      `requestId: ${input.requestId}`,
      `path: @${input.path}`,
      `projectRelativePath: ${input.projectRelativePath}`,
      `allowedFailures: ${input.allowedFailures}`,
    ].join("\n"),
    display: false,
    details: {
      type: "retry_granted",
      requestId: input.requestId,
      path: `@${input.path}`,
      projectRelativePath: input.projectRelativePath,
      allowedFailures: input.allowedFailures,
    },
  };
}

export function buildAbortMessage(input: {
  requestId: string;
  path: string;
  projectRelativePath: string;
}) {
  return {
    customType: CUSTOM_TYPE,
    content: [
      "Authorized request aborted by user decision.",
      `requestId: ${input.requestId}`,
      `path: @${input.path}`,
      `projectRelativePath: ${input.projectRelativePath}`,
    ].join("\n"),
    display: false,
    details: {
      type: "aborted",
      requestId: input.requestId,
      path: `@${input.path}`,
      projectRelativePath: input.projectRelativePath,
    },
  };
}
