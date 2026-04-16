import {
  DynamicBorder,
  parseFrontmatter,
  getSelectListTheme,
  type ExtensionAPI,
  type ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { completeSimple, type Model } from "@mariozechner/pi-ai";
import {
  Container,
  Input,
  Key,
  SelectList,
  Spacer,
  Text,
  matchesKey,
  truncateToWidth,
  type Focusable,
  type SelectItem,
} from "@mariozechner/pi-tui";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveProjectRoot } from "../../shared/config/project-root.js";
import { clearAgentRegistryCache, discoverAgents } from "./agents.js";
import type { AgentRegistry, AgentSource, AgentSpec, AgentThinkingLevel } from "./types.js";

type Scope = "project" | "user";
type InheritMode = "inherit" | "explicit";

type CloneState = {
  source: AgentSpec;
  scope: Scope;
  modelMode: InheritMode;
  model: string;
  thinkingMode: InheritMode;
  thinkingLevel: AgentThinkingLevel;
  toolsMode: InheritMode;
  tools: string[];
};

type CollisionAnalysis = {
  targetPath: string;
  overwrite?: AgentSpec;
  shadows: AgentSpec[];
};

type GeneratedAgent = {
  name: string;
  description: string;
  prompt: string;
};

type CreateState = {
  scope: Scope;
  modelMode: InheritMode;
  model: string;
  thinkingMode: InheritMode;
  thinkingLevel: AgentThinkingLevel;
  toolsMode: InheritMode;
  tools: string[];
};

type GenerationReference = {
  name: string;
  prompt: string;
};

const THINKING_LEVELS: AgentThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const GENERATED_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const GENERATION_SYSTEM_PROMPT = `You create Pi subagent definitions.

Return JSON only. No markdown fences. No prose before or after JSON.

Return exactly this shape:
{
  "name": "string",
  "description": "string",
  "prompt": "string"
}

Rules:
- name: short, reusable, file-friendly, lowercase, letters/numbers/hyphens only
- description: one sentence, concise, specific
- prompt: durable role prompt for repeated reuse
- prompt may use simple markdown-like structure such as short labels and bullet lists
- prompt must not include markdown fences
- prompt must not include YAML frontmatter
- prompt must not mention model, thinking level, or tools
- prompt must not be task-specific to one immediate request
- prompt must avoid generic assistant fluff
- prompt must match caveman style: concise, direct, high-signal, no filler
- prompt should focus on role, goal, rules, and expected output shape when useful`;

function sourceLabel(source: AgentSource): string {
  switch (source) {
    case "builtin":
      return "built-in";
    case "user":
      return "user";
    case "project":
      return "project";
    case "path":
      return "path";
  }
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function buildAgentMarkdown(input: {
  name: string;
  description: string;
  promptText: string;
  model?: string;
  thinkingLevel?: AgentThinkingLevel;
  tools?: string[];
}): string {
  const lines = [
    "---",
    `name: ${yamlString(input.name)}`,
    `description: ${yamlString(input.description)}`,
  ];

  if (input.model) lines.push(`model: ${yamlString(input.model)}`);
  if (input.thinkingLevel) lines.push(`thinkingLevel: ${yamlString(input.thinkingLevel)}`);
  if (input.tools && input.tools.length > 0) {
    lines.push("tools:");
    for (const tool of input.tools) lines.push(`  - ${yamlString(tool)}`);
  }

  lines.push("---", "", input.promptText.trim(), "");
  return lines.join("\n");
}

function renderFramedScreen(
  theme: ExtensionCommandContext["ui"]["theme"],
  width: number,
  title: string,
  body: Container,
  hint?: string,
): string[] {
  const border = new DynamicBorder((text) => theme.fg("border", text));
  const lines = [...border.render(width)];
  lines.push("");
  lines.push(truncateToWidth(theme.fg("accent", theme.bold(title)), width));
  if (hint) lines.push(truncateToWidth(theme.fg("dim", hint), width));
  lines.push("");
  lines.push(...body.render(width));
  lines.push("");
  lines.push(...border.render(width));
  return lines;
}

function renderCloneMarkdown(state: CloneState): string {
  return buildAgentMarkdown({
    name: state.source.name,
    description: state.source.description,
    promptText: state.source.promptText,
    model: state.modelMode === "explicit" ? state.model : undefined,
    thinkingLevel: state.thinkingMode === "explicit" ? state.thinkingLevel : undefined,
    tools: state.toolsMode === "explicit" ? state.tools : undefined,
  });
}

async function resolveTargetPath(
  cwd: string,
  registry: AgentRegistry,
  scope: Scope,
  agentName: string,
): Promise<string> {
  if (scope === "user") return join(registry.userDir, `${agentName}.md`);
  const projectDir =
    registry.projectDir ?? join(await resolveProjectRoot(cwd), ".pi", "crumbs", "agents");
  return join(projectDir, `${agentName}.md`);
}

async function analyzeCloneCollision(
  cwd: string,
  registry: AgentRegistry,
  scope: Scope,
  agentName: string,
): Promise<CollisionAnalysis> {
  const targetPath = await resolveTargetPath(cwd, registry, scope, agentName);
  const overwrite = registry.agents.find(
    (agent) => agent.name === agentName && agent.source === scope,
  );
  const shadows = registry.agents.filter((agent) => {
    if (agent.name !== agentName) return false;
    if (scope === "project") return agent.source === "user" || agent.source === "builtin";
    return agent.source === "builtin";
  });
  return { targetPath, overwrite, shadows };
}

function getCreateStateSummary(state: CreateState): {
  model: string;
  thinking: string;
  tools: string;
} {
  return {
    model: state.modelMode === "inherit" ? "inherit parent" : state.model,
    thinking: state.thinkingMode === "inherit" ? "inherit parent" : state.thinkingLevel,
    tools:
      state.toolsMode === "inherit"
        ? "inherit parent active tools"
        : state.tools.join(", ") || "none",
  };
}

function extractTextContent(content: readonly unknown[]): string {
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if ((item as { type?: unknown }).type !== "text") continue;
    if (typeof (item as { text?: unknown }).text !== "string") continue;
    parts.push((item as { text: string }).text);
  }
  return parts.join("\n").trim();
}

function buildGenerationUserPrompt(description: string, references: GenerationReference[]): string {
  const referenceText = references
    .map(
      (reference) =>
        `<reference name="${reference.name}">\n${reference.prompt.trim()}\n</reference>`,
    )
    .join("\n\n");

  return `Create new Pi subagent from this description:

<description>
${description.trim()}
</description>

Generate:
- name
- description
- prompt

Constraints:
- name must be lowercase and match ^[a-z0-9][a-z0-9-]*$
- description must be one sentence
- prompt must be concise, reusable, and role-focused
- prompt may use simple markdown-like structure such as labels and bullet lists
- prompt must not include markdown fences or frontmatter
- prompt must not mention model, tool, or thinking configuration
- prompt must follow caveman style: concise, direct, practical, no filler
- prompt must be suitable for writing directly as subagent prompt body

Use these built-in agents as style references:
- scout
- planner
- reviewer

Match their level of brevity and durability, not their exact wording.

${referenceText}

Return JSON only.`;
}

function buildGenerationRetryPrompt(raw: string, error: string): string {
  return `Previous response was invalid.

Validation error:
${error}

Previous response:
<previous-response>
${raw}
</previous-response>

Fix it and return JSON only with exactly this shape:
{
  "name": "string",
  "description": "string",
  "prompt": "string"
}

Requirements:
- name must match ^[a-z0-9][a-z0-9-]*$
- description must be one sentence
- prompt must be non-empty
- prompt may use simple markdown-like structure such as labels and bullet lists
- prompt must not include markdown fences
- prompt must not include YAML frontmatter
- prompt must follow caveman style: concise, direct, practical, no filler
- no extra keys
- no prose outside JSON`;
}

function parseGeneratedAgent(raw: string): GeneratedAgent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Generation returned invalid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Generation must return JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";

  if (!name) throw new Error("Generation missing required field: name.");
  if (!description) throw new Error("Generation missing required field: description.");
  if (!prompt) throw new Error("Generation missing required field: prompt.");
  if (!GENERATED_NAME_PATTERN.test(name)) throw new Error("Generated name is invalid.");
  if (prompt.includes("```")) throw new Error("Generated prompt must not include markdown fences.");
  if (prompt.startsWith("---"))
    throw new Error("Generated prompt must not include YAML frontmatter.");

  return { name, description, prompt };
}

async function loadGenerationReferences(registry: AgentRegistry): Promise<GenerationReference[]> {
  const names = ["scout", "planner", "reviewer"];
  const references = await Promise.all(
    names.map(async (name) => {
      const agent = registry.agents.find((item) => item.source === "builtin" && item.name === name);
      if (!agent) return undefined;
      const content = await readFile(agent.filePath, "utf8");
      const parsed = parseFrontmatter<Record<string, unknown>>(content);
      return { name, prompt: parsed.body.trim() };
    }),
  );
  return references.filter((reference): reference is GenerationReference => Boolean(reference));
}

async function resolveGenerationModel(
  ctx: ExtensionCommandContext,
  state: CreateState,
): Promise<Model<any>> {
  if (state.modelMode === "explicit") {
    const [provider, id] = state.model.split("/");
    const model = provider && id ? ctx.modelRegistry.find(provider, id) : undefined;
    if (!model) throw new Error(`Unable to find generation model ${state.model}.`);
    return model;
  }
  if (!ctx.model) throw new Error("No active model available for generation.");
  return ctx.model;
}

async function generateAgentDefinition(
  ctx: ExtensionCommandContext,
  state: CreateState,
  description: string,
  references: GenerationReference[],
): Promise<GeneratedAgent> {
  const model = await resolveGenerationModel(ctx, state);
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) throw new Error(auth.error);

  let prompt = buildGenerationUserPrompt(description, references);
  let lastError = "Generation failed.";

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await completeSimple(
      model,
      {
        systemPrompt: GENERATION_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        signal: ctx.signal,
        maxTokens: 2048,
        ...(model.reasoning ? { reasoning: "medium" as const } : {}),
      },
    );

    if (response.stopReason === "error") {
      throw new Error(response.errorMessage || "Generation failed.");
    }
    if (response.stopReason === "aborted") {
      throw new Error("Generation was aborted.");
    }

    const text = extractTextContent(response.content);
    try {
      return parseGeneratedAgent(text);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      prompt = buildGenerationRetryPrompt(text, lastError);
    }
  }

  throw new Error(`Failed after 3 generation attempts. ${lastError}`);
}

async function pickFromList<T extends string>(
  ctx: ExtensionCommandContext,
  title: string,
  items: Array<{ value: T; label: string; description?: string }>,
  initialIndex = 0,
): Promise<T | undefined> {
  return ctx.ui.custom<T | undefined>((tui, theme, _kb, done) => {
    const listItems: SelectItem[] = items.map((item) => ({
      value: item.value,
      label: item.label,
      description: item.description,
    }));
    const list = new SelectList(
      listItems,
      Math.min(Math.max(listItems.length, 1), 12),
      getSelectListTheme(),
    );

    for (let i = 0; i < initialIndex; i++) list.handleInput(Key.down);

    return {
      focused: true,
      handleInput(data: string) {
        if (matchesKey(data, Key.enter)) {
          done(list.getSelectedItem()?.value as T | undefined);
          return;
        }
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
          done(undefined);
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
        body.addChild(list);
        return renderFramedScreen(
          theme,
          width,
          title,
          body,
          "↑/↓ move • Enter choose • Esc cancel",
        );
      },
    };
  });
}

async function pickTools(
  ctx: ExtensionCommandContext,
  allTools: string[],
  initialMode: InheritMode,
  initialTools: string[],
): Promise<{ mode: InheritMode; tools: string[] } | undefined> {
  return ctx.ui.custom<{ mode: InheritMode; tools: string[] } | undefined>(
    (tui, theme, _kb, done) => {
      let mode = initialMode;
      const selected = new Set(initialTools);

      const rows = (): SelectItem[] => [
        {
          value: "inherit",
          label: `${mode === "inherit" ? "[x]" : "[ ]"} inherit parent active tools`,
        },
        ...allTools.map((tool) => ({
          value: tool,
          label: `${selected.has(tool) ? "[x]" : "[ ]"} ${tool}`,
          description: mode === "inherit" ? "Ignored while inherit is selected" : undefined,
        })),
      ];

      let list = new SelectList(
        rows(),
        Math.min(Math.max(allTools.length + 1, 1), 14),
        getSelectListTheme(),
      );

      const rebuild = () => {
        const selectedValue = String(list.getSelectedItem()?.value ?? "inherit");
        const next = rows();
        list = new SelectList(next, Math.min(Math.max(next.length, 1), 14), getSelectListTheme());
        const index = Math.max(
          0,
          next.findIndex((item) => String(item.value) === selectedValue),
        );
        for (let i = 0; i < index; i++) list.handleInput(Key.down);
      };

      return {
        focused: true,
        handleInput(data: string) {
          if (matchesKey(data, Key.enter)) {
            done({ mode, tools: mode === "inherit" ? [] : [...selected].sort() });
            return;
          }
          if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
            done(undefined);
            return;
          }
          if (matchesKey(data, Key.space)) {
            const value = String(list.getSelectedItem()?.value ?? "inherit");
            if (value === "inherit") mode = mode === "inherit" ? "explicit" : "inherit";
            else if (mode === "explicit") {
              if (selected.has(value)) selected.delete(value);
              else selected.add(value);
            }
            rebuild();
            tui.requestRender();
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
          body.addChild(list);
          return renderFramedScreen(
            theme,
            width,
            "Choose tools",
            body,
            "↑/↓ move • Space toggle • Enter confirm • Esc cancel",
          );
        },
      };
    },
  );
}

async function promptForDescription(ctx: ExtensionCommandContext): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
    const input = new Input();
    let message = "";
    let focused = true;
    input.onSubmit = () => {
      const value = input.getValue().trim();
      if (!value) {
        message = "Description required.";
        tui.requestRender();
        return;
      }
      done(value);
    };
    input.onEscape = () => done(undefined);

    const component: Focusable & {
      render(width: number): string[];
      handleInput(data: string): void;
      invalidate(): void;
    } = {
      get focused() {
        return focused;
      },
      set focused(value: boolean) {
        focused = value;
        input.focused = value;
      },
      handleInput(data: string) {
        input.handleInput(data);
        message = "";
        tui.requestRender();
      },
      invalidate() {
        input.invalidate();
      },
      render(width: number) {
        const body = new Container();
        body.addChild(
          new Text(
            truncateToWidth(
              theme.fg(
                "muted",
                "Describe agent so Pi can generate it. You can edit generated file afterward.",
              ),
              width,
            ),
            0,
            0,
          ),
        );
        body.addChild(new Spacer(1));
        body.addChild(input);
        if (message) {
          body.addChild(new Spacer(1));
          body.addChild(new Text(truncateToWidth(theme.fg("warning", message), width), 0, 0));
        }
        return renderFramedScreen(
          theme,
          width,
          "Describe agent",
          body,
          "Enter generate • Esc cancel",
        );
      },
    };

    return component;
  });
}

async function confirmClone(
  ctx: ExtensionCommandContext,
  state: CloneState,
  collision: CollisionAnalysis,
): Promise<boolean> {
  const toolsSummary =
    state.toolsMode === "inherit"
      ? "inherit parent active tools"
      : state.tools.join(", ") || "none";
  const lines = [
    "Mode: clone",
    `Source: ${state.source.name} (${sourceLabel(state.source.source)})`,
    `Destination scope: ${state.scope}`,
    `Target path: ${collision.targetPath}`,
    `Model: ${state.modelMode === "inherit" ? "inherit parent" : state.model}`,
    `Thinking level: ${state.thinkingMode === "inherit" ? "inherit parent" : state.thinkingLevel}`,
    `Tools: ${toolsSummary}`,
    ...(collision.overwrite ? [``, `Warning: will overwrite existing ${state.scope} agent.`] : []),
    ...collision.shadows.map((agent) =>
      state.scope === "project"
        ? `Note: project agent "${state.source.name}" will shadow ${sourceLabel(agent.source)} agent.`
        : `Note: user agent "${state.source.name}" will shadow built-in agent.`,
    ),
  ];
  return ctx.ui.custom<boolean>((tui, theme, _kb, done) => {
    const actions: SelectItem[] = [
      { value: "create", label: collision.overwrite ? "Update agent" : "Create agent" },
      { value: "cancel", label: "Cancel" },
    ];
    const list = new SelectList(actions, actions.length, getSelectListTheme());
    list.handleInput(Key.down);

    return {
      focused: true,
      handleInput(data: string) {
        if (matchesKey(data, Key.enter)) {
          done(String(list.getSelectedItem()?.value ?? "cancel") === "create");
          return;
        }
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
          done(false);
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
        for (const line of lines) body.addChild(new Text(truncateToWidth(line, width), 0, 0));
        body.addChild(new Spacer(1));
        body.addChild(list);
        return renderFramedScreen(
          theme,
          width,
          "Confirm clone",
          body,
          "↑/↓ move • Enter confirm • Esc cancel",
        );
      },
    };
  });
}

async function showTextScreen(
  ctx: ExtensionCommandContext,
  title: string,
  lines: string[],
): Promise<void> {
  await ctx.ui.custom<void>((_tui, theme, _kb, done) => ({
    focused: true,
    handleInput(data: string) {
      if (
        matchesKey(data, Key.enter) ||
        matchesKey(data, Key.escape) ||
        matchesKey(data, Key.ctrl("c"))
      ) {
        done();
      }
    },
    render(width: number) {
      const body = new Container();
      for (const line of lines) body.addChild(new Text(truncateToWidth(line, width), 0, 0));
      return renderFramedScreen(theme, width, title, body, "Enter or Esc close");
    },
    invalidate() {},
  }));
}

async function runBusyScreen<T>(
  ctx: ExtensionCommandContext,
  title: string,
  lines: string[],
  work: () => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let failure: unknown;
  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    void work()
      .then((value) => {
        result = value;
      })
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        tui.requestRender();
        done();
      });

    return {
      focused: true,
      handleInput() {},
      render(width: number) {
        const body = new Container();
        for (const line of lines) body.addChild(new Text(truncateToWidth(line, width), 0, 0));
        return renderFramedScreen(theme, width, title, body);
      },
      invalidate() {},
    };
  });
  if (failure) throw failure;
  return result as T;
}

async function runCloneFlow(
  ctx: ExtensionCommandContext,
  registry: AgentRegistry,
  allTools: string[],
  modelIds: string[],
): Promise<void> {
  const source = await pickFromList(
    ctx,
    "Choose source agent",
    registry.agents.map((agent) => ({
      value: agent.name,
      label: agent.name,
      description: `${sourceLabel(agent.source)} • ${agent.description}`,
    })),
  );
  if (!source) return;

  const sourceAgent = registry.agents.find((agent) => agent.name === source);
  if (!sourceAgent) {
    await showTextScreen(ctx, "Clone failed", [`Source agent "${source}" no longer exists.`]);
    return;
  }

  const scope = await pickFromList(ctx, "Choose destination scope", [
    { value: "project", label: "Project", description: "Write to .pi/crumbs/agents in project" },
    { value: "user", label: "User", description: "Write to ~/.pi/crumbs/agents" },
  ]);
  if (!scope) return;

  const modelChoices =
    sourceAgent.model && !modelIds.includes(sourceAgent.model)
      ? [sourceAgent.model, ...modelIds]
      : modelIds;

  const modelChoice = await pickFromList(
    ctx,
    "Choose model",
    [
      { value: "__inherit__", label: "inherit parent" },
      ...modelChoices.map((model) => ({ value: model, label: model })),
    ],
    sourceAgent.model ? Math.max(1, modelChoices.indexOf(sourceAgent.model) + 1) : 0,
  );
  if (!modelChoice) return;

  const thinkingChoice = await pickFromList(
    ctx,
    "Choose thinking level",
    [
      { value: "__inherit__", label: "inherit parent" },
      ...THINKING_LEVELS.map((level) => ({ value: level, label: level })),
    ],
    sourceAgent.thinkingLevel
      ? Math.max(1, THINKING_LEVELS.indexOf(sourceAgent.thinkingLevel) + 1)
      : 0,
  );
  if (!thinkingChoice) return;

  const toolsChoice = await pickTools(
    ctx,
    allTools,
    sourceAgent.tools?.length ? "explicit" : "inherit",
    sourceAgent.tools ?? [],
  );
  if (!toolsChoice) return;

  const state: CloneState = {
    source: sourceAgent,
    scope,
    modelMode: modelChoice === "__inherit__" ? "inherit" : "explicit",
    model: modelChoice === "__inherit__" ? "" : modelChoice,
    thinkingMode: thinkingChoice === "__inherit__" ? "inherit" : "explicit",
    thinkingLevel:
      thinkingChoice === "__inherit__"
        ? (sourceAgent.thinkingLevel ?? "low")
        : (thinkingChoice as AgentThinkingLevel),
    toolsMode: toolsChoice.mode,
    tools: toolsChoice.tools,
  };

  const collision = await analyzeCloneCollision(ctx.cwd, registry, state.scope, state.source.name);
  const confirmed = await confirmClone(ctx, state, collision);
  if (!confirmed) return;

  try {
    await runBusyScreen(ctx, "Creating agent...", ["Writing cloned agent file."], async () => {
      await mkdir(dirname(collision.targetPath), { recursive: true });
      await writeFile(collision.targetPath, renderCloneMarkdown(state), "utf8");
      clearAgentRegistryCache();
      await discoverAgents(ctx.cwd, { refresh: true });
    });
    await showTextScreen(ctx, collision.overwrite ? "Agent updated" : "Agent created", [
      `Agent: ${state.source.name}`,
      `Path: ${collision.targetPath}`,
    ]);
  } catch (error) {
    await showTextScreen(ctx, "Create failed", [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

async function confirmNewAgent(
  ctx: ExtensionCommandContext,
  state: CreateState,
  generated: GeneratedAgent,
  collision: CollisionAnalysis,
): Promise<boolean> {
  const summary = getCreateStateSummary(state);
  const lines = [
    "Mode: new",
    `Name: ${generated.name}`,
    `Description: ${generated.description}`,
    `Destination scope: ${state.scope}`,
    `Target path: ${collision.targetPath}`,
    `Model: ${summary.model}`,
    `Thinking level: ${summary.thinking}`,
    `Tools: ${summary.tools}`,
    ...(collision.overwrite ? [``, `Warning: will overwrite existing ${state.scope} agent.`] : []),
    ...collision.shadows.map((agent) =>
      state.scope === "project"
        ? `Note: project agent "${generated.name}" will shadow ${sourceLabel(agent.source)} agent.`
        : `Note: user agent "${generated.name}" will shadow built-in agent.`,
    ),
  ];

  return ctx.ui.custom<boolean>((tui, theme, _kb, done) => {
    const actions: SelectItem[] = [
      { value: "create", label: collision.overwrite ? "Update agent" : "Create agent" },
      { value: "cancel", label: "Cancel" },
    ];
    const list = new SelectList(actions, actions.length, getSelectListTheme());
    list.handleInput(Key.down);

    return {
      focused: true,
      handleInput(data: string) {
        if (matchesKey(data, Key.enter)) {
          done(String(list.getSelectedItem()?.value ?? "cancel") === "create");
          return;
        }
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
          done(false);
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
        for (const line of lines) body.addChild(new Text(truncateToWidth(line, width), 0, 0));
        body.addChild(new Spacer(1));
        body.addChild(list);
        return renderFramedScreen(
          theme,
          width,
          "Confirm new agent",
          body,
          "↑/↓ move • Enter confirm • Esc cancel",
        );
      },
    };
  });
}

async function collectCreateState(
  ctx: ExtensionCommandContext,
  allTools: string[],
  modelIds: string[],
): Promise<CreateState | undefined> {
  const scope = await pickFromList(ctx, "Choose destination scope", [
    { value: "project", label: "Project", description: "Write to .pi/crumbs/agents in project" },
    { value: "user", label: "User", description: "Write to ~/.pi/crumbs/agents" },
  ]);
  if (!scope) return undefined;

  const modelChoice = await pickFromList(ctx, "Choose model", [
    { value: "__inherit__", label: "inherit parent" },
    ...modelIds.map((model) => ({ value: model, label: model })),
  ]);
  if (!modelChoice) return undefined;

  const thinkingChoice = await pickFromList(ctx, "Choose thinking level", [
    { value: "__inherit__", label: "inherit parent" },
    ...THINKING_LEVELS.map((level) => ({ value: level, label: level })),
  ]);
  if (!thinkingChoice) return undefined;

  const toolsChoice = await pickTools(ctx, allTools, "inherit", []);
  if (!toolsChoice) return undefined;

  return {
    scope,
    modelMode: modelChoice === "__inherit__" ? "inherit" : "explicit",
    model: modelChoice === "__inherit__" ? "" : modelChoice,
    thinkingMode: thinkingChoice === "__inherit__" ? "inherit" : "explicit",
    thinkingLevel:
      thinkingChoice === "__inherit__" ? "low" : (thinkingChoice as AgentThinkingLevel),
    toolsMode: toolsChoice.mode,
    tools: toolsChoice.tools,
  };
}

async function runNewFlow(
  ctx: ExtensionCommandContext,
  registry: AgentRegistry,
  allTools: string[],
  modelIds: string[],
): Promise<void> {
  const state = await collectCreateState(ctx, allTools, modelIds);
  if (!state) return;

  const description = await promptForDescription(ctx);
  if (!description) return;

  const references = await loadGenerationReferences(registry);

  try {
    const generated = await runBusyScreen(
      ctx,
      "Creating agent...",
      ["Generating agent definition."],
      () => generateAgentDefinition(ctx, state, description, references),
    );
    const collision = await analyzeCloneCollision(ctx.cwd, registry, state.scope, generated.name);
    const confirmed = await confirmNewAgent(ctx, state, generated, collision);
    if (!confirmed) return;

    await runBusyScreen(ctx, "Creating agent...", ["Writing generated agent file."], async () => {
      await mkdir(dirname(collision.targetPath), { recursive: true });
      await writeFile(
        collision.targetPath,
        buildAgentMarkdown({
          name: generated.name,
          description: generated.description,
          promptText: generated.prompt,
          model: state.modelMode === "explicit" ? state.model : undefined,
          thinkingLevel: state.thinkingMode === "explicit" ? state.thinkingLevel : undefined,
          tools: state.toolsMode === "explicit" ? state.tools : undefined,
        }),
        "utf8",
      );
      clearAgentRegistryCache();
      await discoverAgents(ctx.cwd, { refresh: true });
    });

    await showTextScreen(ctx, collision.overwrite ? "Agent updated" : "Agent created", [
      `Agent: ${generated.name}`,
      `Path: ${collision.targetPath}`,
    ]);
  } catch (error) {
    await showTextScreen(ctx, "Create failed", [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

export async function runCreateCommand(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  if (!ctx.hasUI) throw new Error("/subagent create requires interactive mode.");

  const registry = await discoverAgents(ctx.cwd, { refresh: true });
  if (registry.agents.length === 0) {
    await showTextScreen(ctx, "No agents found", ["Run /subagent list or add agent files first."]);
    return;
  }

  const allTools = [...new Set(pi.getAllTools().map((tool) => tool.name))].sort((a, b) =>
    a.localeCompare(b),
  );
  const modelIds = [
    ...new Set(
      (await ctx.modelRegistry.getAvailable()).map((model) => `${model.provider}/${model.id}`),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const mode = await pickFromList(ctx, "Create subagent", [
    { value: "new", label: "New", description: "Generate new agent from description" },
    {
      value: "clone",
      label: "Clone",
      description: "Copy existing agent into user or project scope",
    },
  ]);
  if (!mode) return;
  if (mode === "new") {
    await runNewFlow(ctx, registry, allTools, modelIds);
    return;
  }

  await runCloneFlow(ctx, registry, allTools, modelIds);
}
