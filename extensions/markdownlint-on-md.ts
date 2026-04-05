/**
 * Deterministic markdownlint Check on Markdown Edits
 *
 * What this does:
 * - Tracks successful `edit`/`write` tool executions touching Markdown files.
 * - Tracks any `bash` execution that runs `bunx markdownlint-cli` or `npx markdownlint-cli`.
 * - At `turn_end`, only when the turn had no tool calls, it runs markdownlint
 *   automatically (prefers `bunx`, falls back to `npx`) if Markdown edits are still dirty.
 * - Only if linting fails (non-zero exit), it injects a custom automation
 *   message with the relevant output so the agent can fix issues without first
 *   spending another tool call to rerun the check.
 *
 * How to use:
 * - Put this file at `extensions/markdownlint-on-md.ts`.
 * - Reload extensions with `/reload`.
 *
 * Example:
 * - Agent edits `docs/guide.md` and reaches a no-tool-call turn.
 * - Extension runs `bunx markdownlint-cli --fix docs/guide.md`.
 * - If failing, extension injects an automation message with output context.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  ensurePackageManagerDirectories,
  formatCommandForDisplay,
  wrapCommandWithPackageManagerEnvironment,
} from "./shared/package-manager-env.js";

const MARKDOWNLINT_BASH_REGEX =
  /\b(?:bunx\s+markdownlint-cli|npx(?:\s+--yes)?\s+markdownlint-cli)\b/;
const CUSTOM_MESSAGE_TYPE = "automation.markdownlint";
const MAX_OUTPUT_CHARS = 3_000;

function normalizePath(pathValue: unknown): string | null {
  if (typeof pathValue !== "string") return null;
  const normalized = pathValue.trim().replace(/^@/, "");
  return normalized.length > 0 ? normalized : null;
}

function isMarkdownPath(pathValue: unknown): boolean {
  const path = normalizePath(pathValue);
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function isMarkdownLintCommand(commandValue: unknown): boolean {
  if (typeof commandValue !== "string") return false;
  return MARKDOWNLINT_BASH_REGEX.test(commandValue);
}

function tail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `...\n${text.slice(-maxChars)}`;
}

function fenceSafe(text: string): string {
  return text.replace(/```/g, "``\\`");
}

function buildFailureMessage(
  result: { code: number; stdout?: string; stderr?: string },
  rerunCmd: string,
): string {
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  const output = [
    stdout ? `stdout:\n${tail(stdout, MAX_OUTPUT_CHARS)}` : "",
    stderr ? `stderr:\n${tail(stderr, MAX_OUTPUT_CHARS)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    `Automated markdownlint check with --fix failed (exit code ${result.code}).`,
    `Address remaining Markdown issues and verify with \`${rerunCmd}\` before continuing.`,
    output ? `\n\nRecent output:\n\n\`\`\`text\n${fenceSafe(output)}\n\`\`\`` : "",
  ].join(" ");
}

export default function markdownlintOnMdExtension(pi: ExtensionAPI): void {
  const dirtyMarkdownFiles = new Set<string>();
  let checkInFlight = false;
  let preferredRunner: "bunx" | "npx" | null = null;

  async function detectRunner(signal?: AbortSignal): Promise<"bunx" | "npx"> {
    if (preferredRunner) return preferredRunner;

    ensurePackageManagerDirectories();
    const bunxCommand = wrapCommandWithPackageManagerEnvironment("bunx", ["--version"]);
    const bunxResult = await pi.exec(bunxCommand.command, bunxCommand.args, {
      timeout: 2_000,
      signal,
    });
    preferredRunner = bunxResult.code === 0 ? "bunx" : "npx";
    return preferredRunner;
  }

  pi.on("agent_start", async () => {
    dirtyMarkdownFiles.clear();
    checkInFlight = false;
    preferredRunner = null;
  });

  pi.on("tool_result", async (event) => {
    if (
      (event.toolName === "edit" || event.toolName === "write") &&
      !event.isError &&
      isMarkdownPath(event.input?.path)
    ) {
      const path = normalizePath(event.input?.path);
      if (path) dirtyMarkdownFiles.add(path);
      return;
    }

    // Any explicit markdownlint run counts as a check for currently dirty markdown files,
    // regardless of success/failure, matching the existing mise-check-on-ts semantics.
    if (event.toolName === "bash" && isMarkdownLintCommand(event.input?.command)) {
      dirtyMarkdownFiles.clear();
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (event.toolResults.length > 0) return;
    if (dirtyMarkdownFiles.size === 0 || checkInFlight) return;

    checkInFlight = true;
    const files = [...dirtyMarkdownFiles];

    const runner = await detectRunner(ctx.signal);
    const args =
      runner === "bunx"
        ? ["markdownlint-cli", "--fix", ...files]
        : ["--yes", "markdownlint-cli", "--fix", ...files];

    ensurePackageManagerDirectories();
    const command = wrapCommandWithPackageManagerEnvironment(runner, args);
    const result = await pi.exec(command.command, command.args, { signal: ctx.signal });
    checkInFlight = false;

    // Mark currently dirty files as checked by this run.
    for (const file of files) {
      dirtyMarkdownFiles.delete(file);
    }

    if (result.code === 0) return;

    const rerunCmd = formatCommandForDisplay(command.command, command.args);
    const content = buildFailureMessage(result, rerunCmd);
    const message = {
      customType: CUSTOM_MESSAGE_TYPE,
      content,
      display: true,
      details: {
        command: rerunCmd,
        exitCode: result.code,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        files,
      },
    };

    if (ctx.isIdle()) {
      pi.sendMessage(message, { deliverAs: "steer", triggerTurn: true });
    } else {
      pi.sendMessage(message, { deliverAs: "steer" });
    }
  });
}
