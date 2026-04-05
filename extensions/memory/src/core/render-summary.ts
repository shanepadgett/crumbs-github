import {
  BRANCH_SECTION_LIMITS,
  DEFAULT_MAX_SUMMARY_CHARS,
  SUMMARY_SECTION_LIMITS,
} from "../config.js";
import type { MemoryState } from "../types.js";
import { redactSensitiveText } from "./redact.js";

interface RenderSectionState {
  goal: string[];
  recentTurns: string[];
  actions: string[];
  evidence: string[];
  files: {
    read: string[];
    modified: string[];
    created: string[];
  };
  outstandingContext: string[];
  preferences: string[];
}

function buildSections(state: RenderSectionState): string[] {
  const sections: string[] = [];

  if (state.goal.length > 0) {
    sections.push(`[Goal]\n${state.goal.map((item) => `- ${item}`).join("\n")}`);
  }

  if (state.recentTurns.length > 0) {
    sections.push(`[Recent Turns]\n${state.recentTurns.map((item) => `- ${item}`).join("\n")}`);
  }

  if (state.actions.length > 0) {
    sections.push(`[Actions Taken]\n${state.actions.map((item) => `- ${item}`).join("\n")}`);
  }

  if (state.evidence.length > 0) {
    sections.push(`[Important Evidence]\n${state.evidence.map((item) => `- ${item}`).join("\n")}`);
  }

  if (
    state.files.read.length > 0 ||
    state.files.modified.length > 0 ||
    state.files.created.length > 0
  ) {
    const lines: string[] = ["[Files]"];
    if (state.files.read.length > 0) {
      lines.push("Read:");
      lines.push(...state.files.read.map((item) => `- ${item}`));
    }
    if (state.files.modified.length > 0) {
      lines.push("Modified:");
      lines.push(...state.files.modified.map((item) => `- ${item}`));
    }
    if (state.files.created.length > 0) {
      lines.push("Created:");
      lines.push(...state.files.created.map((item) => `- ${item}`));
    }
    sections.push(lines.join("\n"));
  }

  if (state.outstandingContext.length > 0) {
    sections.push(
      `[Outstanding Context]\n${state.outstandingContext.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  if (state.preferences.length > 0) {
    sections.push(`[User Preferences]\n${state.preferences.map((item) => `- ${item}`).join("\n")}`);
  }

  return sections;
}

function renderSections(state: RenderSectionState): string {
  const sections = buildSections(state);
  if (sections.length === 0) return "[Recent Turns]\n- No meaningful context captured.";
  return sections.join("\n\n");
}

function trimSections(state: RenderSectionState): boolean {
  if (state.recentTurns.length > 1) {
    state.recentTurns.shift();
    return true;
  }
  if (state.actions.length > 1) {
    state.actions.shift();
    return true;
  }
  if (state.evidence.length > 1) {
    state.evidence.shift();
    return true;
  }
  if (state.files.read.length > 0) {
    state.files.read.shift();
    return true;
  }
  if (state.files.modified.length > 0) {
    state.files.modified.shift();
    return true;
  }
  if (state.files.created.length > 0) {
    state.files.created.shift();
    return true;
  }
  return false;
}

export function renderSummary(
  state: MemoryState,
  options?: {
    mode?: "compaction" | "branch";
    maxChars?: number;
  },
): string {
  const limits = options?.mode === "branch" ? BRANCH_SECTION_LIMITS : SUMMARY_SECTION_LIMITS;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_SUMMARY_CHARS;

  const renderState: RenderSectionState = {
    goal: state.goal.slice(0, limits.goal),
    recentTurns: state.recentTurns.slice(-limits.recentTurns),
    actions: state.actions.slice(-limits.actions),
    evidence: state.evidence.slice(-limits.evidence),
    files: {
      read: state.files.read.slice(-limits.filesPerBucket),
      modified: state.files.modified.slice(-limits.filesPerBucket),
      created: state.files.created.slice(-limits.filesPerBucket),
    },
    outstandingContext: state.outstandingContext.slice(0, limits.outstandingContext),
    preferences: state.preferences.slice(0, limits.preferences),
  };

  let summary = renderSections(renderState);
  while (summary.length > maxChars && trimSections(renderState)) {
    summary = renderSections(renderState);
  }

  return redactSensitiveText(summary);
}

export function summaryToMarkdown(summary: string): string {
  return summary.replace(/^\[(.+)]$/gm, "## $1");
}
