import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { detectPrimaryJsRuntime, detectScopes } from "./detect.js";
import { sendRefinementPrompt } from "./follow-up.js";
import { buildPlan } from "./plan.js";
import { activeToolsForProfile, getProfile, PROFILES } from "./profiles.js";
import { previewPlan, writePlan } from "./writers.js";
import { resolveToolVersions } from "./versions.js";
import type { Profile, ScaffoldOptions, ToolSpec } from "./types.js";

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
  for (const profile of profiles)
    for (const tool of activeToolsForProfile(profile, options)) byId.set(tool.id, tool);
  return [...byId.values()];
}

async function chooseProfiles(
  ctx: ExtensionCommandContext,
  requested: string[],
): Promise<Profile[]> {
  const unknown = requested.filter((id) => !getProfile(id));
  if (unknown.length > 0) throw new Error(`Unknown scaffold profile(s): ${unknown.join(", ")}`);

  const requestedProfiles = requested
    .map(getProfile)
    .filter((profile): profile is Profile => !!profile);
  if (requestedProfiles.length > 0) return withImplicitProfiles(requestedProfiles);

  const detected = await detectScopes(ctx.cwd);
  const selected: Profile[] = [];
  for (const profile of PROFILES) {
    const recommended = profile.defaultOn || detected.has(profile.id);
    const include = await ctx.ui.confirm(
      `Include ${profile.label}?`,
      `${profile.description}\nRecommended: ${recommended ? "yes" : "no"}`,
    );
    if (include) selected.push(profile);
  }
  return withImplicitProfiles(selected);
}

function orderedOptions<T extends string>(options: T[], preferred: T): T[] {
  return [preferred, ...options.filter((option) => option !== preferred)];
}

async function chooseOptions(
  ctx: ExtensionCommandContext,
  profiles: Profile[],
): Promise<ScaffoldOptions> {
  let primaryJsRuntime = await detectPrimaryJsRuntime(ctx.cwd);
  let jsQualityStack: ScaffoldOptions["jsQualityStack"] = "ox";
  if (profiles.some((profile) => profile.id === "ts")) {
    primaryJsRuntime =
      ((await ctx.ui.select(
        "Primary JS runner",
        orderedOptions(["bun", "node"], primaryJsRuntime),
      )) as "bun" | "node" | undefined) ?? primaryJsRuntime;
    jsQualityStack =
      ((await ctx.ui.select("JS/TS quality stack", ["ox", "biome"])) as
        | "ox"
        | "biome"
        | undefined) ?? "ox";
  }
  return { primaryJsRuntime, jsQualityStack };
}

async function chooseVersions(
  ctx: ExtensionCommandContext,
  tools: ToolSpec[],
): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const tool of tools) {
    let candidates: string[];
    try {
      candidates = await resolveToolVersions(tool);
    } catch (error) {
      ctx.ui.notify(
        `scaffold: cannot resolve ${tool.label}: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      throw error;
    }
    const selected = await ctx.ui.select(`Select ${tool.label} version`, candidates);
    if (!selected) throw new Error(`No version selected for ${tool.label}`);
    versions[tool.id] = selected;
  }
  return versions;
}

export async function runScaffoldWizard(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  requested: string[],
): Promise<void> {
  if (!ctx.hasUI) return;
  const profiles = await chooseProfiles(ctx, requested);
  if (profiles.length === 0) {
    ctx.ui.notify("scaffold: no profiles selected", "warning");
    return;
  }
  const options = await chooseOptions(ctx, profiles);
  const versions = await chooseVersions(ctx, uniqueTools(profiles, options));
  const plan = buildPlan(profiles, versions, options);
  const preview = await previewPlan(ctx.cwd, plan);
  const overwrite = await ctx.ui.confirm(
    "Write scaffold?",
    `${preview.join("\n")}\n\nReplace existing scaffold files when path conflicts?`,
  );
  if (!overwrite) {
    const proceedSkip = await ctx.ui.confirm(
      "Skip existing files and write new/mergeable files?",
      preview.join("\n"),
    );
    if (!proceedSkip) return;
  }
  const touched = await writePlan(ctx.cwd, plan, overwrite);
  ctx.ui.notify(`scaffold: touched ${touched.length} file(s)\n${touched.join("\n")}`, "info");
  sendRefinementPrompt(pi, touched, plan);
}
