/**
 * Web Research Extension
 *
 * What it does:
 * - Adds a `webresearch` tool that launches an isolated web research subagent.
 * - The subagent can web-search, code-search, and fetch pages in disposable context, then return a synthesized result.
 *
 * How to use it:
 * - Provide `task` and `responseShape`.
 * - Use this when the task needs multiple search/fetch steps plus synthesis.
 * - Set `deliverAs: "report"` to write the synthesis to a markdown file.
 * - Pick `researchMode` when you want a quicker or more verified answer style.
 *
 * Example:
 * - "Research RDS Proxy session pinning for Django apps and return 5 bullets with citations"
 */

import * as path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { keyHint, type ExtensionAPI, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type, type Static } from "@sinclair/typebox";
import { truncateInline } from "./shared/common.js";
import { resolveResearchModel, type ResearchMode } from "./shared/research-model-selection.js";
import { buildResearchSystemPrompt, buildResearchTask } from "./shared/research-prompts.js";
import {
  runResearchAgent,
  type ResearchActivity,
  type ResearchPhase,
  type ResearchUsage,
} from "./shared/research-runner.js";

const WEB_RESEARCH_LABEL = "webresearch";
const CHILD_AGENT_NAME = "Web Research Specialist";
const SEARCH_ICON = "⌕";
const CODE_SEARCH_ICON = "⚙";
const FETCH_ICON = "⎘";
const DEFAULT_WEB_RESEARCH_MODEL = "claude-haiku-4-5";

type ResearchModeAlias = "simple" | "cheap" | "expensive" | "quick" | "thorough";

function normalizeResearchMode(value: unknown): ResearchMode | undefined {
  if (typeof value !== "string") return undefined;
  const mode = value.trim().toLowerCase() as ResearchMode | ResearchModeAlias;
  if (mode === "simple" || mode === "cheap" || mode === "quick") return "fast";
  if (mode === "expensive" || mode === "thorough") return "deep";
  if (mode === "fast" || mode === "balanced" || mode === "deep") return mode;
  return undefined;
}

const WEBRESEARCH_PARAMS = Type.Object({
  task: Type.String({
    description:
      "Research task. Include what to find, what matters, and any constraints the research agent should use.",
  }),
  responseShape: Type.String({
    description:
      "Required. Exact shape/style of the synthesis you want back (bullets, JSON schema, sections, required fields, etc.).",
  }),
  researchMode: Type.Optional(
    Type.Union(
      [
        Type.Literal("fast"),
        Type.Literal("balanced"),
        Type.Literal("deep"),
        Type.Literal("simple"),
        Type.Literal("cheap"),
        Type.Literal("expensive"),
        Type.Literal("quick"),
        Type.Literal("thorough"),
      ],
      {
        description:
          "Research posture and model tier. fast = quick focused answer, balanced = normal diligence, deep = stronger verification and synthesis. `simple`/`cheap`/`quick` and `expensive`/`thorough` are accepted as deprecated aliases.",
      },
    ),
  ),
  citationStyle: Type.Optional(
    Type.Union([Type.Literal("numeric"), Type.Literal("inline")], {
      description:
        "Citation format to use only when the required response shape explicitly asks for citations or sources (default: numeric).",
    }),
  ),
  deliverAs: Type.Optional(
    Type.Union([Type.Literal("inline"), Type.Literal("report")], {
      description:
        "Delivery mode. Use report for user-facing research unless the request is a quick ephemeral lookup or the research is only intermediate context for the agent. inline = return synthesis in the tool result. report = write markdown report to a temp file and return the file path instead.",
    }),
  ),
});

type WebResearchParams = Static<typeof WEBRESEARCH_PARAMS>;

interface WebResearchDetails {
  status: "running" | "done" | "error";
  model: string;
  researchMode?: ResearchMode;
  modelReason?: string;
  provider?: string;
  task?: string;
  responseShape?: string;
  deliverAs?: "inline" | "report";
  reportPath?: string;
  suppressRelay?: true;
  phase?: ResearchPhase;
  note?: string;
  activity?: ResearchActivity;
  searches?: number;
  codeSearches?: number;
  fetches?: number;
  usage?: ResearchUsage;
  usageSummary?: string;
  elapsedMs?: number;
  error?: string;
}

function phaseSummary(phase: ResearchPhase, activity: ResearchActivity, note?: string): string {
  const trimmed = (note ?? "").trim();
  const q = trimmed ? ` "${truncateInline(trimmed, 86)}"` : "";

  if (activity === "websearch") return `web search${q}`;
  if (activity === "codesearch") return `code search${q}`;
  if (activity === "webfetch") return `fetch${q}`;
  if (activity === "synthesizing") return "synthesizing";
  if (phase === "starting") return trimmed ? `starting — ${trimmed}` : "starting";
  return "synthesizing";
}

function renderRunTag(
  details: Partial<WebResearchDetails>,
  options?: { showUnknownWhenMissing?: boolean },
): string {
  const showUnknown = options?.showUnknownWhenMissing ?? false;
  const mode = normalizeResearchMode(details.researchMode);
  const modeTag = mode ?? (showUnknown ? "..." : "fast");
  return `[${modeTag}]`;
}

function activityLine(details: Partial<WebResearchDetails>, fallback?: string): string {
  if (fallback && fallback.trim()) return truncateInline(fallback.trim(), 110);

  const phase = details.phase ?? "starting";
  const activity = details.activity ?? "starting";
  const note = (details.note ?? "").trim();
  const q = note ? ` "${truncateInline(note, 86)}"` : "";

  if (activity === "websearch") return `web search${q}`;
  if (activity === "codesearch") return `code search${q}`;
  if (activity === "webfetch") return `fetch${q}`;
  if (activity === "synthesizing" || phase === "synthesizing") return "synthesizing";
  return "starting";
}

function formatElapsedShort(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m${seconds}s`;
}

function usageSummary(usage: ResearchUsage): string {
  return [
    `↑${usage.input} ↓${usage.output}`,
    `$${usage.cost.toFixed(4)}`,
    usage.model ?? "(unknown model)",
  ].join(" | ");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function writeResearchReport(cwd: string, task: string, body: string): Promise<string> {
  const dir = path.resolve(cwd, ".pi", "tmp", "research");
  await mkdir(dir, { recursive: true });
  const slug = slugify(task) || "research-report";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(dir, `${stamp}-${slug}.md`);
  await writeFile(filePath, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  return filePath;
}

function actionSummary(
  details: Partial<WebResearchDetails>,
  fg: (color: "error" | "muted", text: string) => string,
): string {
  return fg(
    "muted",
    `${SEARCH_ICON}${details.searches ?? 0} ${CODE_SEARCH_ICON}${details.codeSearches ?? 0} ${FETCH_ICON}${details.fetches ?? 0}`,
  );
}

export default function webResearchExtension(pi: ExtensionAPI) {
  if (process.env.CRUMBS_WEBRESEARCH_CHILD === "1") {
    return;
  }

  const extensionDir = path.dirname(fileURLToPath(import.meta.url));
  let lastProvider: string | undefined;
  let lastModelId: string | undefined;

  pi.on("model_select", async (event) => {
    lastProvider = event.model.provider;
    lastModelId = event.model.id;
  });

  pi.registerTool({
    name: "webresearch",
    label: "Web Research",
    description:
      "Delegate multi-step web research to an isolated agent. Use report output for substantive user-facing research so the result persists as a markdown file instead of being repeated in chat.",
    promptSnippet:
      "Delegate multi-step web research; prefer report output for substantive user-facing research",
    promptGuidelines: [
      "Use websearch, codesearch, or webfetch directly for quick single-step lookups.",
      "Do not use webresearch for simple factual lookups, single URL discovery, single-source verification, or version checks.",
      "Use webresearch when the task needs multiple search/fetch steps plus synthesis, comparison, evaluation, or distillation across sources and you want to save context.",
      "Always provide responseShape so results match the exact output format you need.",
      "Default to deliverAs=report for substantive user-facing research so the result persists in a markdown file.",
      "Use deliverAs=inline only for quick ephemeral research answers or when the research is only intermediate context for the agent's own work.",
      "If the user asked for research, comparison, investigation, recommendation, or a report-like answer, use deliverAs=report.",
      "When deliverAs=report returns a file path, do not restate the report unless the user asks for a summary.",
      "Use researchMode=fast for quick focused answers, balanced for normal work, and deep for stronger verification.",
      "Put the actual research ask inside task, including what matters and any constraints.",
      "Examples that should not use webresearch: latest Bun version, find Bun docs URL, verify one config flag.",
      "Examples that should use webresearch inline: quick internal fact-finding before implementation when the user does not need a durable report.",
      "Examples that should use webresearch report: compare tools, evaluate tradeoffs, investigate a behavior across docs/issues/posts, produce a recommendation, or distill a vetted answer the user may want to revisit.",
    ],
    parameters: WEBRESEARCH_PARAMS,
    prepareArguments(args): WebResearchParams {
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        return args as WebResearchParams;
      }
      const {
        timeout: _timeout,
        idleTimeout: _idleTimeout,
        ...rest
      } = args as Record<string, unknown>;
      return rest as WebResearchParams;
    },
    renderCall(args, theme) {
      const task = truncateInline((args.task ?? "").trim(), 76);
      const tag = renderRunTag(
        {
          researchMode: normalizeResearchMode(args.researchMode),
        },
        { showUnknownWhenMissing: true },
      );
      const title = `${theme.fg("toolTitle", theme.bold(WEB_RESEARCH_LABEL))} ${theme.fg("muted", tag)} ${theme.fg("accent", `"${task || "..."}"`)}`;
      return new Text(title, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      const details = (result.details ?? {}) as Partial<WebResearchDetails>;

      if (isPartial || details.status === "running") {
        const textPart = result.content.find((c) => c.type === "text");
        const activity = activityLine(
          details,
          textPart?.type === "text" ? textPart.text : undefined,
        );
        const elapsed = formatElapsedShort(details.elapsedMs ?? 0);
        const status = theme.fg("muted", `└ [${elapsed}] ${activity}`);
        return new Text(status, 0, 0);
      }

      if (details.status === "error") {
        const message = details.error || "Research failed";
        return new Text(theme.fg("error", `✗ ${message}`), 0, 0);
      }

      const content = result.content.find((c) => c.type === "text");
      const output = content?.type === "text" ? content.text : "";
      const hasReport = details.deliverAs === "report" && typeof details.reportPath === "string";

      if (!expanded) {
        const parts: string[] = [];
        if (Number.isFinite(details.elapsedMs)) {
          parts.push(theme.fg("dim", formatElapsedShort(details.elapsedMs ?? 0)));
        }
        parts.push(actionSummary(details, (color, text) => theme.fg(color, text)));
        if (details.usageSummary) {
          parts.push(theme.fg("dim", details.usageSummary));
        }
        if (hasReport) {
          parts.push(theme.fg("dim", truncateInline(details.reportPath ?? "", 64)));
        } else if (output.trim()) {
          parts.push(theme.fg("dim", keyHint("app.tools.expand", "to expand")));
        }
        const line = parts.join(theme.fg("dim", " | "));
        return new Text(line, 0, 0);
      }

      const expandedParts: string[] = [];
      if (Number.isFinite(details.elapsedMs)) {
        expandedParts.push(theme.fg("dim", formatElapsedShort(details.elapsedMs ?? 0)));
      }
      expandedParts.push(actionSummary(details, (color, text) => theme.fg(color, text)));
      if (details.usageSummary) {
        expandedParts.push(theme.fg("dim", details.usageSummary));
      }
      if (hasReport) {
        expandedParts.push(theme.fg("dim", details.reportPath ?? ""));
      } else if (output.trim()) {
        expandedParts.push(theme.fg("dim", keyHint("app.tools.expand", "to collapse")));
      }
      const summaryLine = expandedParts.join(theme.fg("dim", " | "));
      const footer = summaryLine ? `\n${summaryLine}` : "";
      if (!output && !footer) return new Text("", 0, 0);
      return new Text(`${theme.fg("toolOutput", output)}${footer}`, 0, 0);
    },
    async execute(_toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      const researchMode = normalizeResearchMode(params.researchMode) ?? "fast";
      const citationStyle = (params.citationStyle ?? "numeric") as "numeric" | "inline";
      const deliverAs = (params.deliverAs ?? "inline") as "inline" | "report";
      const responseShape = params.responseShape.trim();
      const taskText = params.task.trim();

      if (!taskText) {
        return {
          content: [{ type: "text", text: "Provide `task`." }],
          details: {
            status: "error",
            model: DEFAULT_WEB_RESEARCH_MODEL,
            researchMode,
            error: "missing_task",
          } as WebResearchDetails,
          isError: true,
        };
      }

      if (!responseShape) {
        return {
          content: [{ type: "text", text: "Provide `responseShape`." }],
          details: {
            status: "error",
            model: DEFAULT_WEB_RESEARCH_MODEL,
            researchMode,
            error: "missing_response_shape",
          } as WebResearchDetails,
          isError: true,
        };
      }

      const resolution = await resolveResearchModel({
        mode: researchMode,
        provider: ctx.model?.provider ?? lastProvider,
        currentModelId: ctx.model?.id ?? lastModelId,
        cwd: ctx.cwd,
      });
      const model = resolution.model;

      const systemPrompt = buildResearchSystemPrompt({
        agentName: CHILD_AGENT_NAME,
        researchMode,
        citationStyle,
        responseShape,
      });

      const task = buildResearchTask({
        task: taskText,
        responseShape,
      });

      const extensionPaths = [
        path.resolve(extensionDir, "search.ts"),
        path.resolve(extensionDir, "code-search.ts"),
        path.resolve(extensionDir, "fetch.ts"),
      ];

      let phase: ResearchPhase = "starting";
      let activity: ResearchActivity = "starting";
      let note = "";
      let searches = 0;
      let codeSearches = 0;
      let fetches = 0;
      const startedAt = Date.now();

      const emitProgress = () => {
        const text = phaseSummary(phase, activity, note);
        onUpdate?.({
          content: [{ type: "text", text }],
          details: {
            status: "running",
            model,
            researchMode: resolution.mode,
            modelReason: resolution.reason,
            provider: resolution.provider,
            task: taskText,
            responseShape,
            deliverAs,
            phase,
            activity,
            note,
            searches,
            codeSearches,
            fetches,
            elapsedMs: Date.now() - startedAt,
          } as WebResearchDetails,
        });
      };

      const tick = setInterval(() => {
        emitProgress();
      }, 250);

      emitProgress();

      try {
        const run = await runResearchAgent({
          cwd: ctx.cwd,
          task,
          systemPrompt,
          model,
          extensionPaths,
          signal,
          onProgress: (progress) => {
            phase = progress.phase;
            activity = progress.activity;
            note = progress.note ?? "";
            searches = progress.searches;
            codeSearches = progress.codeSearches;
            fetches = progress.fetches;
            emitProgress();
          },
        });

        if (signal?.aborted || run.abortedBy === "signal") {
          return {
            content: [{ type: "text", text: `${WEB_RESEARCH_LABEL} was canceled.` }],
            details: {
              status: "error",
              model,
              researchMode: resolution.mode,
              modelReason: resolution.reason,
              provider: resolution.provider,
              task: taskText,
              responseShape,
              deliverAs,
              phase,
              searches: run.searches,
              codeSearches: run.codeSearches,
              fetches: run.fetches,
              elapsedMs: run.elapsedMs,
              error: "canceled",
            } as WebResearchDetails,
            isError: true,
          };
        }

        if (run.exitCode !== 0) {
          const message =
            run.stderr.trim() || run.output.trim() || "Web research failed with no output.";
          return {
            content: [{ type: "text", text: `Research failed: ${message}` }],
            details: {
              status: "error",
              model,
              researchMode: resolution.mode,
              modelReason: resolution.reason,
              provider: resolution.provider,
              task: taskText,
              responseShape,
              deliverAs,
              phase,
              searches: run.searches,
              codeSearches: run.codeSearches,
              fetches: run.fetches,
              usage: run.usage,
              elapsedMs: run.elapsedMs,
              error: message,
            } as WebResearchDetails,
            isError: true,
          };
        }

        const output = run.output.trim() || "No synthesis produced.";
        const summary = usageSummary(run.usage);

        if (deliverAs === "report") {
          const reportPath = await writeResearchReport(ctx.cwd, taskText, output);
          return {
            content: [
              {
                type: "text",
                text: `Research done. Read report: ${reportPath}. Do not restate report; point user to file.`,
              },
            ],
            details: {
              status: "done",
              model: run.usage.model ?? model,
              researchMode: resolution.mode,
              modelReason: resolution.reason,
              provider: resolution.provider,
              task: taskText,
              responseShape,
              deliverAs,
              reportPath,
              suppressRelay: true as const,
              phase: "synthesizing",
              searches: run.searches,
              codeSearches: run.codeSearches,
              fetches: run.fetches,
              usage: run.usage,
              usageSummary: summary,
              elapsedMs: run.elapsedMs,
            } as WebResearchDetails,
          };
        }

        return {
          content: [{ type: "text", text: output }],
          details: {
            status: "done",
            model: run.usage.model ?? model,
            researchMode: resolution.mode,
            modelReason: resolution.reason,
            provider: resolution.provider,
            task: taskText,
            responseShape,
            deliverAs,
            phase: "synthesizing",
            searches: run.searches,
            codeSearches: run.codeSearches,
            fetches: run.fetches,
            usage: run.usage,
            usageSummary: summary,
            elapsedMs: run.elapsedMs,
          } as WebResearchDetails,
        };
      } finally {
        clearInterval(tick);
      }
    },
  });
}
