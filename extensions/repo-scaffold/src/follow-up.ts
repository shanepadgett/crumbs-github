import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ScaffoldPlan } from "./types.js";

export function sendRefinementPrompt(
  pi: ExtensionAPI,
  touchedFiles: string[],
  plan?: ScaffoldPlan,
): void {
  const profileText = plan
    ? plan.profiles.map((profile) => profile.id).join(", ")
    : "unknown/manual refine";
  const files =
    touchedFiles.length > 0 ? touchedFiles.map((file) => `- ${file}`).join("\n") : "- none listed";
  pi.sendMessage(
    {
      customType: "repo-scaffold-follow-up",
      content: `Repo scaffold follow-up. Inspect repo and propose repo-specific tweaks only; do not edit files unless user asks.\n\nProfiles: ${profileText}\n\nCreated/touched files:\n${files}\n\nLook for local ignore/include needs, placeholder task details, and repo-specific validation wiring. Present concise recommendations, then stop.`,
      display: true,
      details: { touchedFiles, profiles: plan?.profiles.map((profile) => profile.id) ?? [] },
    },
    { deliverAs: "followUp", triggerTurn: true },
  );
}
