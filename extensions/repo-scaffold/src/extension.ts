import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runDoctor } from "./doctor.js";
import { sendRefinementPrompt } from "./follow-up.js";
import { PROFILES } from "./profiles.js";
import { runUpgradeWizard } from "./upgrade.js";
import { runScaffoldWizard } from "./wizard.js";

export default function repoScaffoldExtension(pi: ExtensionAPI): void {
  pi.registerCommand("scaffold", {
    description:
      "Scaffold deterministic repo tooling. Usage: /scaffold [profile...] | /scaffold doctor | /scaffold refine | /scaffold upgrade",
    getArgumentCompletions(prefix) {
      const current = prefix.trim().split(/\s+/).at(-1) ?? "";
      const options = ["doctor", "refine", "upgrade", ...PROFILES.map((profile) => profile.id)];
      return options
        .filter((option) => option.startsWith(current))
        .map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const tokens = args.trim().split(/\s+/).filter(Boolean);
      if (tokens[0] === "doctor") {
        const report = await runDoctor(ctx.cwd);
        if (ctx.hasUI) ctx.ui.notify(report, "info");
        return;
      }
      if (tokens[0] === "refine") {
        sendRefinementPrompt(pi, []);
        if (ctx.hasUI) ctx.ui.notify("scaffold: queued refinement prompt", "info");
        return;
      }
      if (tokens[0] === "upgrade") {
        await runUpgradeWizard(pi, ctx);
        return;
      }
      await runScaffoldWizard(pi, ctx, tokens);
    },
  });
}
