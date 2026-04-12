import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerQuietValidator } from "./core.js";
import { markdownlintValidator } from "./markdownlint.js";
import { miseTaskValidator } from "./mise-task.js";
import { xcodeBuildValidator } from "./xcode-build.js";

export default function quietValidatorsExtension(pi: ExtensionAPI): void {
  registerQuietValidator(pi, markdownlintValidator);
  registerQuietValidator(pi, miseTaskValidator);
  registerQuietValidator(pi, xcodeBuildValidator);
}
