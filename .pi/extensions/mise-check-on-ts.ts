/**
 * Deterministic Mise Check on TypeScript Edits
 *
 * What this does:
 * - Tracks successful `edit`/`write` tool executions touching `.ts` files.
 * - Tracks any `bash` execution that runs `mise run check`.
 * - At `turn_end`, only when the turn had no tool calls, it runs
 *   `mise run check` automatically if `.ts` edits happened after the last check.
 * - Only if that command fails (non-zero exit), it injects a custom automation
 *   message with the relevant output so the agent can fix issues without first
 *   spending another tool call to rerun the check.
 *
 * How to use:
 * - Put this file at `.pi/extensions/mise-check-on-ts.ts` (project-local extension).
 * - Reload extensions with `/reload`.
 *
 * Example:
 * - Agent edits `src/foo.ts` and reaches a no-tool-call turn.
 * - Extension runs `mise run check`.
 * - If failing, extension injects an automation message with output context.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const CHECK_COMMAND_REGEX = /\bmise\s+run\s+check\b/;
const CUSTOM_MESSAGE_TYPE = "automation.mise-check";
const MAX_OUTPUT_CHARS = 3_000;

function isTypeScriptPath(pathValue: unknown): boolean {
  if (typeof pathValue !== "string") return false;
  const normalized = pathValue.trim().replace(/^@/, "");
  return normalized.endsWith(".ts");
}

function isCheckCommand(commandValue: unknown): boolean {
  if (typeof commandValue !== "string") return false;
  return CHECK_COMMAND_REGEX.test(commandValue);
}

function tail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `...\n${text.slice(-maxChars)}`;
}

function fenceSafe(text: string): string {
  return text.replace(/```/g, "``\\`");
}

function buildFailureMessage(result: { code: number; stdout?: string; stderr?: string }): string {
  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();
  const output = [
    stdout ? `stdout:\n${tail(stdout, MAX_OUTPUT_CHARS)}` : "",
    stderr ? `stderr:\n${tail(stderr, MAX_OUTPUT_CHARS)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    `Automated check failed (exit code ${result.code}).`,
    "Fix the reported issues and verify with `mise run check` before continuing.",
    output ? `\n\nRecent output:\n\n\`\`\`text\n${fenceSafe(output)}\n\`\`\`` : "",
  ].join(" ");
}

export default function miseCheckOnTsExtension(pi: ExtensionAPI): void {
  let tsEditSeq = 0;
  let lastCheckedTsEditSeq = 0;
  let checkInFlight = false;

  pi.on("agent_start", async () => {
    tsEditSeq = 0;
    lastCheckedTsEditSeq = 0;
    checkInFlight = false;
  });

  pi.on("tool_result", async (event) => {
    if (
      (event.toolName === "edit" || event.toolName === "write") &&
      !event.isError &&
      isTypeScriptPath(event.input?.path)
    ) {
      tsEditSeq += 1;
      return;
    }

    // Any explicit `mise run check` execution counts as a check after the latest edit,
    // regardless of success or failure, matching the requested semantics.
    if (event.toolName === "bash" && isCheckCommand(event.input?.command)) {
      lastCheckedTsEditSeq = tsEditSeq;
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (event.toolResults.length > 0) return;

    const needsCheck = tsEditSeq > 0 && lastCheckedTsEditSeq < tsEditSeq;
    if (!needsCheck || checkInFlight) return;

    checkInFlight = true;
    const result = await pi.exec("mise", ["run", "check"], { signal: ctx.signal });
    checkInFlight = false;

    // Mark this edit generation as checked so we do not re-run until the next TS edit.
    lastCheckedTsEditSeq = tsEditSeq;

    if (result.code === 0) return;

    const content = buildFailureMessage(result);
    const message = {
      customType: CUSTOM_MESSAGE_TYPE,
      content,
      display: true,
      details: {
        command: "mise run check",
        exitCode: result.code,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        tsEditSeq,
      },
    };

    if (ctx.isIdle()) {
      pi.sendMessage(message, { deliverAs: "steer", triggerTurn: true });
    } else {
      pi.sendMessage(message, { deliverAs: "steer" });
    }
  });
}
