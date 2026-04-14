import { complete } from "@mariozechner/pi-ai";
import {
  convertToLlm,
  DynamicBorder,
  getSelectListTheme,
  keyHint,
  rawKeyHint,
  type ExtensionContext,
  type SessionEntry,
} from "@mariozechner/pi-coding-agent";
import {
  Container,
  Key,
  SelectList,
  Spacer,
  Text,
  matchesKey,
  truncateToWidth,
  wrapTextWithAnsi,
  type SelectItem,
} from "@mariozechner/pi-tui";
import { normalizePath, type EffectiveFocusState, type FocusMode } from "./settings.js";

export interface FocusPermissionRequest {
  toolName: string;
  mode: FocusMode;
  targets: string[];
}

export interface FocusPermissionDecision {
  allow: boolean;
  grantedTargets: string[];
}

function sessionMessages(ctx: ExtensionContext) {
  const branch = ctx.sessionManager.getBranch();
  return branch
    .filter((entry): entry is SessionEntry & { type: "message" } => entry.type === "message")
    .map((entry) => entry.message);
}

async function explainPermissionRequest(
  ctx: ExtensionContext,
  request: FocusPermissionRequest,
  state: EffectiveFocusState,
  signal: AbortSignal,
): Promise<string> {
  if (!ctx.model) throw new Error("No model selected for explanation.");

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok || !auth.apiKey) {
    throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);
  }

  const prompt = [
    "Task: explain one outside-scope access request.",
    "You are actively participating in permission-system test.",
    "Role-play as permission explainer for this test.",
    "Given full conversation context, explain whether blocked file access seems needed for current task.",
    "Do not continue broader conversation. Only produce permission explanation text for test.",
    "Ignore permission-system debugging, UI discussion, extension implementation talk, and any meta conversation.",
    "Do not discuss prompts, bugs, payload shapes, parsing, or what you will change.",
    "Focus on most recent currently active blocked request, not older conversation threads.",
    "Generally in hard mode, outside-scope access is not allowed unless prior in-scope evidence strongly suggests necessary connective tissue outside scope.",
    "Explain only why requested path access may be needed for current user task.",
    "<active_request>",
    `tool=${request.toolName}`,
    `mode=${request.mode}`,
    ...request.targets.map((target) => `target=${normalizePath(target)}`),
    "</active_request>",
    "<allowed_scope>",
    ...(state.roots.length > 0 ? state.roots.map((root) => `root=${root}`) : ["root=(none)"]),
    ...(state.alwaysAllow.length > 0
      ? state.alwaysAllow.map((pathValue) => `always_allow=${pathValue}`)
      : ["always_allow=(none)"]),
    "</allowed_scope>",
    "Return exactly 1 or 2 sentences total.",
    "Sentence 1: say required vs exploratory and why now.",
    "Sentence 2 optional: safer in-scope alternative or say none obvious.",
    "Keep output caveman-short, concrete, no fluff.",
    "If context insufficient, say that plainly in 1 short sentence.",
    "Never output bullets, preamble, analysis, JSON, code fences, XML, or extra commentary.",
  ].join("\n");

  const systemPrompt = [
    ctx.getSystemPrompt(),
    "",
    "Side-task override:",
    "- You are writing copy for permission dialog.",
    "- Be concrete and terse.",
    "- Never discuss debugging process or extension internals.",
    "- Output only requested final explanation text.",
    "- Keep it to 1 or 2 sentences.",
  ].join("\n");

  const response = await complete(
    ctx.model,
    {
      systemPrompt,
      messages: [
        ...convertToLlm(sessionMessages(ctx)),
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: auth.apiKey,
      headers: auth.headers,
      signal,
    },
  );

  if (response.stopReason === "aborted") throw new Error("Explanation aborted.");

  const text = response.content
    .filter((item): item is { type: "text"; text: string } => item.type === "text")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  const sentenceCount = (text.match(/[.!?](?:\s|$)/g) ?? []).length;
  const looksUsable = text.length > 0 && sentenceCount <= 2 && !/^[-*]/m.test(text);
  if (!looksUsable) {
    const contentTypes = response.content.map((item) => item.type).join(", ") || "(none)";
    throw new Error(
      [
        "Malformed explanation response.",
        `stopReason=${response.stopReason}`,
        `contentTypes=${contentTypes}`,
        text ? `text=${text.slice(0, 500)}` : "text=(empty)",
      ].join("\n"),
    );
  }

  return text || "No explanation returned.";
}

function wrapSection(text: string, width: number, indent = "  "): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) =>
      wrapTextWithAnsi(line || " ", Math.max(8, width - indent.length)).map(
        (part) => `${indent}${part}`,
      ),
    );
}

export async function showFocusPermissionDialog(
  ctx: ExtensionContext,
  request: FocusPermissionRequest,
  state: EffectiveFocusState,
): Promise<FocusPermissionDecision> {
  if (!ctx.hasUI) {
    return { allow: false, grantedTargets: [] };
  }

  const chrome = {
    busy: false,
    flashMessage: "",
  };

  ctx.ui.setFooter(() => ({
    invalidate() {},
    render(width: number): string[] {
      return wrapTextWithAnsi(
        ctx.ui.theme.fg(
          "dim",
          [
            rawKeyHint("↑/↓", "move"),
            keyHint("tui.select.confirm", "confirm"),
            keyHint("tui.select.cancel", "deny"),
            rawKeyHint("ctrl+e", "explain"),
          ].join(" · "),
        ),
        Math.max(1, width),
      );
    },
  }));

  try {
    return await ctx.ui.custom<FocusPermissionDecision>((tui, theme, _kb, done) => {
      const items: SelectItem[] = [
        {
          value: "allow",
          label: "Yes",
          description: "Grant access for requested path(s) in this session",
        },
        {
          value: "deny",
          label: "No",
          description: "Block this outside-scope access request",
        },
      ];
      const list = new SelectList(items, items.length, getSelectListTheme());
      const border = new DynamicBorder((text) => theme.fg("border", text));
      let explanation = "";
      let explainError = "";
      let loading = false;
      let controller: AbortController | null = null;

      const syncStatus = () => {
        chrome.busy = loading;
        chrome.flashMessage = loading
          ? "Explaining permission request..."
          : explainError
            ? "Explain failed"
            : explanation
              ? "Explanation ready"
              : "";
        ctx.ui.setStatus(
          "focus-advanced",
          chrome.flashMessage
            ? ctx.ui.theme.fg(chrome.busy ? "warning" : "muted", chrome.flashMessage)
            : undefined,
        );
      };

      const stopExplain = () => {
        controller?.abort();
        controller = null;
        loading = false;
        syncStatus();
      };

      const allow = () => {
        stopExplain();
        done({
          allow: true,
          grantedTargets: request.targets.map((target) => normalizePath(target)),
        });
      };

      const deny = () => {
        stopExplain();
        done({ allow: false, grantedTargets: [] });
      };

      const confirmSelection = () => {
        const value = String(list.getSelectedItem()?.value ?? "deny");
        if (value === "allow") allow();
        else deny();
      };

      const runExplain = () => {
        if (loading) return;
        loading = true;
        explainError = "";
        explanation = "";
        controller = new AbortController();
        syncStatus();
        tui.requestRender();

        const signal = ctx.signal
          ? AbortSignal.any([ctx.signal, controller.signal])
          : controller.signal;

        void explainPermissionRequest(ctx, request, state, signal)
          .then((text) => {
            explanation = text;
          })
          .catch((error: unknown) => {
            if ((error as { name?: string })?.name === "AbortError") return;
            explainError = error instanceof Error ? error.message : String(error);
          })
          .finally(() => {
            controller = null;
            loading = false;
            syncStatus();
            tui.requestRender();
          });
      };

      syncStatus();

      return {
        focused: true,

        handleInput(data: string) {
          if (matchesKey(data, Key.escape) || data.toLowerCase() === "n") {
            deny();
            return;
          }

          if (matchesKey(data, Key.enter) || data.toLowerCase() === "y") {
            if (data.toLowerCase() === "y") {
              allow();
              return;
            }

            confirmSelection();
            return;
          }

          if (matchesKey(data, Key.ctrl("e")) || data.toLowerCase() === "e") {
            runExplain();
            return;
          }

          list.handleInput(data);
          tui.requestRender();
        },

        invalidate() {
          list.invalidate();
        },

        render(width: number) {
          const body = new Container();
          const title = `Focus Advanced ${request.mode} permission`;
          const targets = request.targets.map((target) => `• ${normalizePath(target)}`).join("\n");

          body.addChild(new Text(theme.fg("accent", theme.bold(title)), 0, 0));
          body.addChild(new Spacer(1));
          body.addChild(
            new Text(
              truncateToWidth(
                theme.fg(
                  "dim",
                  `${request.toolName} wants path access outside active focus roots.`,
                ),
                width,
              ),
              0,
              0,
            ),
          );
          body.addChild(new Spacer(1));
          body.addChild(list);
          body.addChild(new Spacer(1));
          body.addChild(new Text(theme.fg("warning", "Requested targets:"), 0, 0));
          body.addChild(new Text(wrapSection(targets, width).join("\n"), 0, 0));

          if (state.roots.length > 0) {
            body.addChild(new Spacer(1));
            body.addChild(new Text(theme.fg("muted", "Focus roots:"), 0, 0));
            body.addChild(
              new Text(
                wrapSection(state.roots.map((root) => `• ${root}`).join("\n"), width).join("\n"),
                0,
                0,
              ),
            );
          }

          body.addChild(new Spacer(1));
          if (loading) {
            body.addChild(new Text(theme.fg("accent", "Explaining…"), 0, 0));
          } else if (explainError) {
            body.addChild(new Text(theme.fg("error", "Explain failed:"), 0, 0));
            body.addChild(new Text(wrapSection(explainError, width).join("\n"), 0, 0));
          } else if (explanation) {
            body.addChild(new Text(theme.fg("success", "Explanation:"), 0, 0));
            body.addChild(new Text(wrapSection(explanation, width).join("\n"), 0, 0));
          } else {
            body.addChild(
              new Text(
                truncateToWidth(
                  theme.fg(
                    "muted",
                    "Press Ctrl+E for side explanation without adding to main session.",
                  ),
                  width,
                ),
                0,
                0,
              ),
            );
          }

          return [...border.render(width), "", ...body.render(width), "", ...border.render(width)];
        },
      };
    });
  } finally {
    ctx.ui.setStatus("focus-advanced", undefined);
    ctx.ui.setFooter(undefined);
  }
}
