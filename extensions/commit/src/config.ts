import { loadEffectiveExtensionConfig } from "../../shared/config/crumbs-loader.js";

export const DEFAULT_COMMIT_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
];

export interface CommitConfig {
  allowedTypes: string[];
  allowBreakingChangeMarker: boolean;
}

function normalizeAllowedTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_COMMIT_TYPES;

  const types = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  return types.length > 0 ? types : DEFAULT_COMMIT_TYPES;
}

export async function loadCommitConfig(cwd: string): Promise<CommitConfig> {
  const config = await loadEffectiveExtensionConfig(cwd, "commit");

  return {
    allowedTypes: normalizeAllowedTypes(config.allowedTypes),
    allowBreakingChangeMarker: config.allowBreakingChangeMarker !== false,
  };
}
