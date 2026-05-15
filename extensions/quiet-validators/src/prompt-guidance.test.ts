import { describe, expect, test } from "bun:test";
import type { MiseTaskConfig } from "./mise/config.js";
import { buildQuietValidatorsPrompt } from "./prompt-guidance.js";

function config(overrides: Partial<MiseTaskConfig> = {}): MiseTaskConfig {
  return {
    enabled: true,
    name: null,
    task: "check:ts",
    trackedExtensions: [".ts", ".tsx"],
    globalExcludeGlobs: [],
    includeGlobs: [],
    excludeGlobs: [],
    ...overrides,
  };
}

describe("quiet validators prompt guidance", () => {
  test("lists configured covered validators", () => {
    const prompt = buildQuietValidatorsPrompt([
      config({ name: "ts", task: "check:ts", trackedExtensions: [".ts", ".tsx"] }),
      config({ name: "markdown", task: "check:markdown", trackedExtensions: [".md"] }),
    ]);

    expect(prompt?.includes("- ts (check:ts) for .ts, .tsx")).toBe(true);
    expect(prompt?.includes("- markdown (check:markdown) for .md")).toBe(true);
    expect(prompt?.includes("You may still run builds, tests, or checks not covered")).toBe(true);
  });

  test("omits disabled and unsupported configs", () => {
    const prompt = buildQuietValidatorsPrompt([
      config({ enabled: false, name: "disabled" }),
      config({ name: "empty", trackedExtensions: [] }),
    ]);

    expect(prompt).toBe(null);
  });
});
