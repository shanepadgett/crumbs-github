/**
 * Path Visibility Extension
 *
 * What it does:
 * - Hides denied files and folders from tool results.
 * - Blocks direct reads of denied paths.
 * - Blocks risky bash forms that can bypass simple path checks.
 *
 * How to use it:
 * - Configure `extensions.pathVisibility` in `.pi/crumbs.json`.
 * - Add deny globs to `deny`.
 * - Keep `injectPromptHint` enabled to reduce wasted tool calls.
 *
 * Example:
 * - Set `deny: ["docs/_hidden/**", "external/**", ".env*"]` to hide those paths from
 *   `bash` output and block direct `read` calls.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  buildPromptHint,
  createPathVisibilityPolicy,
  maybeRewriteBashCommand,
} from "./src/policy.js";

export default function pathVisibilityExtension(pi: ExtensionAPI): void {
  const onAny = pi.on as unknown as (
    event: string,
    handler: (event: any, ctx: any) => Promise<any> | any,
  ) => void;

  pi.on("before_agent_start", async (event, ctx) => {
    const policy = await createPathVisibilityPolicy(ctx.cwd);
    if (!policy.enabled || !policy.injectPromptHint || policy.deny.length === 0) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildPromptHint(policy.deny)}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    const policy = await createPathVisibilityPolicy(ctx.cwd);
    if (!policy.enabled || policy.deny.length === 0) return undefined;

    if (event.toolName === "read") {
      const input = event.input as { path?: unknown };
      const filePath = typeof input.path === "string" ? input.path : "";
      if (!filePath) return undefined;

      if (await policy.isDenied(filePath)) {
        return { block: true, reason: `Blocked by path visibility policy: ${filePath}` };
      }
      return undefined;
    }

    if (event.toolName === "bash") {
      const input = event.input as { command?: unknown };
      const command = typeof input.command === "string" ? input.command : "";
      if (!command) return undefined;

      if (await policy.referencesDeniedPath(command)) {
        return {
          block: true,
          reason: "Blocked by path visibility policy: command references denied path",
        };
      }

      input.command = maybeRewriteBashCommand(command, policy.deny);
      return undefined;
    }

    return undefined;
  });

  onAny("tool_result", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const policy = await createPathVisibilityPolicy(ctx.cwd);
    if (!policy.enabled || policy.deny.length === 0) return undefined;

    const nextContent = policy.sanitizeBashContent(event.content);
    if (!nextContent) return undefined;
    return { content: nextContent };
  });
}
