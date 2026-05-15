import { activeToolsForProfile } from "./profiles.js";
import type { MiseToolValue, Profile, ScaffoldOptions, ScaffoldPlan } from "./types.js";

export function buildPlan(
  profiles: Profile[],
  versions: Record<string, string>,
  options: ScaffoldOptions,
): ScaffoldPlan {
  const files = new Map<string, ReturnType<Profile["files"]>[number]>();
  const quietValidators = profiles.flatMap((profile) => profile.quietValidators);
  const miseTools: Record<string, MiseToolValue> = {};
  const packageDevDependencies: Record<string, string> = {};

  for (const profile of profiles) {
    for (const tool of activeToolsForProfile(profile, options)) {
      const version = versions[tool.id];
      if (!version) continue;
      if (tool.miseKey) miseTools[tool.miseKey] = tool.miseValue?.(version, versions) ?? version;
      if (tool.packageDevDependency) packageDevDependencies[tool.packageDevDependency] = version;
    }
    for (const file of profile.files(versions, options)) files.set(file.path, file);
  }

  return {
    profiles,
    versions,
    options,
    files: [...files.values()],
    quietValidators,
    miseTools,
    packageDevDependencies,
  };
}
