import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadMiseTaskConfigs, type MiseTaskConfig } from "./mise/config.js";

function labelForConfig(config: MiseTaskConfig): string {
  return config.name ? `${config.name} (${config.task})` : config.task;
}

function formatCoveredValidator(config: MiseTaskConfig): string {
  return `- ${labelForConfig(config)} for ${config.trackedExtensions.join(", ")}`;
}

export function buildQuietValidatorsPrompt(configs: MiseTaskConfig[]): string | null {
  const coveredConfigs = configs.filter(
    (config) => config.enabled && config.trackedExtensions.length > 0,
  );
  if (coveredConfigs.length === 0) return null;

  return [
    "Quiet validators run automatically in background after relevant file changes.",
    "Configured quiet validators cover:",
    ...coveredConfigs.map(formatCoveredValidator),
    "Do not manually run these configured mise tasks or equivalent validation/checker commands for their covered file extensions unless user explicitly asks in current turn.",
    "You may still run builds, tests, or checks not covered by configured quiet validators when they are useful for the task.",
    "Do not announce that you are skipping covered checks unless user asks.",
    "Assume quiet validators report covered failures separately. Only react when failure output appears in conversation or user explicitly requests manual validation.",
  ].join("\n");
}

export function registerPromptGuidance(pi: ExtensionAPI): void {
  pi.on("before_agent_start", async (event) => {
    const prompt = buildQuietValidatorsPrompt(
      await loadMiseTaskConfigs(event.systemPromptOptions.cwd),
    );
    if (!prompt) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${prompt}`,
    };
  });
}
