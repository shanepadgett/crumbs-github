import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { sendRefinementPrompt } from "./follow-up.js";
import { buildPlan } from "./plan.js";
import { activeToolsForProfile, getProfile, PROFILES } from "./profiles.js";
import { inspectExistingState, type ExistingState } from "./state.js";
import type { Profile, ScaffoldOptions, ToolSpec } from "./types.js";
import { resolveToolVersions } from "./versions.js";
import { previewPlan, writePlan } from "./writers.js";

function needsAgentPython(profile: Profile): boolean {
  return profile.tools.some((tool) => tool.source.kind === "pypi");
}

function withImplicitProfiles(profiles: Profile[]): Profile[] {
  if (!profiles.some(needsAgentPython)) return profiles;
  const agentPython = getProfile("agent-python");
  if (!agentPython || profiles.some((profile) => profile.id === "agent-python")) return profiles;
  return [agentPython, ...profiles];
}

function uniqueTools(profiles: Profile[], options: ScaffoldOptions): ToolSpec[] {
  const byId = new Map<string, ToolSpec>();
  for (const profile of profiles) {
    for (const tool of activeToolsForProfile(profile, options)) byId.set(tool.id, tool);
  }
  return [...byId.values()];
}

function currentVersion(tool: ToolSpec, state: ExistingState): string | null {
  if (tool.miseKey && state.miseTools[tool.miseKey]) return state.miseTools[tool.miseKey];
  if (tool.packageDevDependency && state.packageDevDependencies[tool.packageDevDependency]) {
    return state.packageDevDependencies[tool.packageDevDependency];
  }
  return null;
}

function isExactVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}

function profileStatus(profile: Profile, state: ExistingState): string {
  const taskNames = profile.quietValidators.map((config) => config.task);
  const hasTasks = taskNames.some((task) => state.taskPathsByName.has(task));
  const hasQuiet = profile.quietValidators.some(
    (config) =>
      state.quietValidatorNames.has(config.name) || state.quietValidatorTasks.has(config.task),
  );
  if (state.scopes.has(profile.id))
    return hasTasks || hasQuiet ? "detected, configured" : "detected, missing scaffold wiring";
  if (hasTasks || hasQuiet) return "configured, scope not detected";
  return profile.defaultOn ? "optional baseline" : "not detected";
}

async function chooseProfiles(
  ctx: ExtensionCommandContext,
  state: ExistingState,
): Promise<Profile[]> {
  const selected: Profile[] = [];
  for (const profile of PROFILES) {
    const status = profileStatus(profile, state);
    const recommended = status !== "not detected";
    const include = await ctx.ui.confirm(
      `Upgrade ${profile.label}?`,
      `${profile.description}\nState: ${status}\nRecommended: ${recommended ? "yes" : "no"}`,
    );
    if (include) selected.push(profile);
  }
  return withImplicitProfiles(selected);
}

async function chooseVersions(
  ctx: ExtensionCommandContext,
  tools: ToolSpec[],
  state: ExistingState,
  updateExisting: boolean,
): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const tool of tools) {
    const current = currentVersion(tool, state);
    if (current && isExactVersion(current) && !updateExisting) {
      versions[tool.id] = current;
      continue;
    }

    const candidates = await resolveToolVersions(tool);
    const options =
      current && isExactVersion(current) && !candidates.includes(current)
        ? [current, ...candidates]
        : candidates;
    const reason = current
      ? updateExisting
        ? `Current: ${current}. Select exact version.`
        : `Current is not exact (${current}). Select exact version.`
      : "Missing pin. Select exact version.";
    const selected = await ctx.ui.select(`${tool.label} version`, options);
    if (!selected) throw new Error(`No version selected for ${tool.label}. ${reason}`);
    versions[tool.id] = selected;
  }
  return versions;
}

function renderUpgradeReport(state: ExistingState, planPreview: string[]): string {
  const lines = [
    "Will write:",
    ...planPreview.map((line) => `- ${line}`),
    "",
    "Policy:",
    "- selected standard task files in .mise/tasks are created/replaced",
    "- existing non-task config files are skipped when present",
    "- exact existing version pins are preserved unless version updates were selected",
    "",
    "Existing task locations:",
  ];
  for (const [task, paths] of [...state.taskPathsByName.entries()].sort()) {
    if (!task.includes(":")) continue;
    lines.push(`- ${task}: ${paths.join(", ")}`);
  }
  if (state.taskConfigIncludes && !state.taskConfigIncludes.includes(".mise/tasks")) {
    lines.push(
      "",
      "Needs mise task discovery update:",
      "- [task_config].includes will include .mise/tasks",
    );
  }
  return lines.join("\n");
}

export async function runUpgradeWizard(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!ctx.hasUI) return;
  const state = await inspectExistingState(ctx.cwd);
  const profiles = await chooseProfiles(ctx, state);
  if (profiles.length === 0) {
    ctx.ui.notify("scaffold upgrade: no profiles selected", "warning");
    return;
  }

  const updateExisting = await ctx.ui.confirm(
    "Update existing pinned versions?",
    "No preserves exact existing pins. Yes fetches latest choices for existing pins too.",
  );
  const versions = await chooseVersions(
    ctx,
    uniqueTools(profiles, state.options),
    state,
    updateExisting,
  );
  const plan = buildPlan(profiles, versions, state.options);
  const preview = await previewPlan(ctx.cwd, plan);
  const proceed = await ctx.ui.confirm(
    "Apply scaffold upgrade?",
    `${renderUpgradeReport(state, preview)}\n\nExisting files are skipped. Missing files/config are added. Selected version pins may be updated.`,
  );
  if (!proceed) return;

  const touched = await writePlan(ctx.cwd, plan, {
    overwriteFiles: false,
    overwriteTaskFiles: true,
    overwriteMiseTools: updateExisting,
    overwritePackageDevDependencies: updateExisting,
  });
  ctx.ui.notify(
    `scaffold upgrade: touched ${touched.length} file(s)\n${touched.join("\n")}`,
    "info",
  );
  sendRefinementPrompt(pi, touched, plan);
}
