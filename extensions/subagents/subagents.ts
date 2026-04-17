import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { renderCollapsibleTextResult } from "../shared/ui/collapsible-text-result.js";
import { notifyForSessionStart } from "../shared/ui/notify.js";
import {
  collectRegistryDiagnostics,
  formatDiagnosticSummary,
  renderDoctorReport,
  renderListReport,
  resolveRunnableAgents,
  clearAgentRegistryCache,
  discoverAgents,
} from "./src/agents.js";
import { runCreateCommand } from "./src/create/command.js";
import {
  formatWorkflowLabel,
  getDiagnosticResultColor,
  getWorkflowResultColor,
  hasExpandableContent,
  renderDiagnosticDetails,
  renderWorkflowBlock,
  renderWorkflowSummary,
  renderWorkflow,
} from "./src/render.js";
import { executeWorkflow } from "./src/run.js";
import type { AgentIssue, WorkflowResult } from "./src/types.js";
import { TOOL_PARAMS, resolveWorkflow, workflowHasFailures } from "./src/workflow.js";

function formatRegistryIssueNotice(
  diagnostics: AgentIssue[],
  phase: "startup" | "reload",
): { message: string; level: "warning" | "error" } | null {
  const errors = diagnostics.filter((item) => item.level === "error").length;
  const warnings = diagnostics.filter((item) => item.level === "warning").length;
  if (!errors && !warnings) return null;
  return {
    message: `subagents: found ${errors + warnings} agent issue(s) during ${phase}. Run /subagents doctor.`,
    level: errors ? "error" : "warning",
  };
}

export default function subagentsExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "startup" && event.reason !== "reload") return;
    try {
      const { diagnostics } = await collectRegistryDiagnostics(ctx.cwd, {
        modelRegistry: ctx.modelRegistry,
        allTools: pi.getAllTools(),
      });
      const notice = formatRegistryIssueNotice(diagnostics, event.reason);
      if (notice) notifyForSessionStart(ctx, event.reason, notice.message, notice.level);
    } catch (error) {
      notifyForSessionStart(
        ctx,
        event.reason,
        `subagents: failed during ${event.reason}: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  });

  pi.on("session_shutdown", async () => {
    clearAgentRegistryCache();
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: "Run isolated subagent workflows. Supports single, chain, and parallel modes.",
    promptSnippet: "Delegate focused work to isolated subagents",
    promptGuidelines: [
      "Use subagent when context isolation or role specialization helps.",
      "Use single mode for one specialist, chain for sequential handoff, parallel for independent tasks.",
      "Keep task text explicit. Chain forwards prior step output automatically as received handoff.",
      "Run /subagents doctor when agent definitions seem broken.",
    ],
    parameters: TOOL_PARAMS,
    renderCall(args, theme) {
      let label = "subagent";
      try {
        label = formatWorkflowLabel(resolveWorkflow(args as Record<string, unknown>));
      } catch {}
      return new Text(theme.fg("toolTitle", theme.bold(label)), 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const typed = result as {
        details?: WorkflowResult | { diagnostics: AgentIssue[] };
        isError?: boolean;
      };
      const details = typed.details;
      if (!details || "diagnostics" in details) {
        const color = getDiagnosticResultColor(details?.diagnostics, typed.isError);
        return new Text(theme.fg(color, renderDiagnosticDetails(details?.diagnostics)), 0, 0);
      }
      const block = renderWorkflowBlock(details);
      const color = getWorkflowResultColor(details, typed.isError);
      return renderCollapsibleTextResult(theme, {
        expanded,
        collapsedText: block.collapsedText,
        expandedText: hasExpandableContent(details) ? block.expandedText : undefined,
        footer: block.footer,
        bodyColor: color,
        footerColor: color,
      });
    },
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const workflow = resolveWorkflow(params as Record<string, unknown>);
      const { agents, availableAgentNames, diagnostics } = await resolveRunnableAgents(
        ctx.cwd,
        workflow,
        {
          modelRegistry: ctx.modelRegistry,
          allTools: pi.getAllTools(),
        },
      );
      const blocking = diagnostics.filter((item) => item.level === "error");
      if (blocking.length > 0) throw new Error(formatDiagnosticSummary(blocking));
      if (availableAgentNames.length === 0)
        throw new Error("No agents found. Run /subagents list.");

      const result = await executeWorkflow({
        defaultCwd: ctx.cwd,
        agents,
        availableAgentNames,
        workflow,
        parentActiveTools: pi.getActiveTools(),
        signal,
        onUpdate: (update) =>
          onUpdate?.({
            content: [{ type: "text", text: renderWorkflowSummary(update) }],
            details: update,
          }),
      });

      if (workflowHasFailures(result)) {
        throw new Error(renderWorkflow(result, true));
      }

      return {
        content: [{ type: "text", text: renderWorkflow(result, true) }],
        details: result,
      };
    },
  });

  pi.registerCommand("subagents", {
    description: "Subagents utilities. Usage: /subagents [list|doctor|create]",
    getArgumentCompletions(prefix) {
      const value = prefix.trim().toLowerCase();
      const options = ["list", "doctor", "create"];
      const filtered = options.filter((option) => option.startsWith(value));
      return filtered.length ? filtered.map((option) => ({ value: option, label: option })) : null;
    },
    handler: async (args, ctx) => {
      const [command = ""] = args.trim().split(/\s+/, 2);
      if (command === "list") {
        const registry = await discoverAgents(ctx.cwd, { refresh: true });
        if (ctx.hasUI) ctx.ui.notify(renderListReport(registry), "info");
        return;
      }
      if (command === "doctor") {
        const { registry, runtimeDiagnostics, diagnostics } = await collectRegistryDiagnostics(
          ctx.cwd,
          {
            modelRegistry: ctx.modelRegistry,
            allTools: pi.getAllTools(),
          },
        );
        if (ctx.hasUI)
          ctx.ui.notify(
            renderDoctorReport(registry, runtimeDiagnostics),
            diagnostics.some((item) => item.level === "error") ? "warning" : "info",
          );
        return;
      }
      if (command === "create") {
        await runCreateCommand(ctx, pi);
        return;
      }
      if (ctx.hasUI) ctx.ui.notify("Usage: /subagents [list|doctor|create]", "warning");
    },
  });
}
