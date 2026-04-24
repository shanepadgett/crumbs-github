import { describe, expect, test } from "bun:test";
import {
  asBoolean,
  asRecord,
  asStringArray,
  escapeRegex,
  globToRegExp,
  matchesAny,
  normalizePath,
} from "./config.js";

describe("quiet validator config helpers", () => {
  test("asRecord accepts only non-array objects", () => {
    const record = { enabled: true };

    expect(asRecord(record)).toBe(record);
    expect(asRecord(null)).toBe(null);
    expect(asRecord(["enabled"])).toBe(null);
    expect(asRecord("enabled")).toBe(null);
  });

  test("asStringArray keeps non-empty strings", () => {
    expect(asStringArray(["alpha", "", "  ", 1, false, "beta"])).toEqual(["alpha", "beta"]);
    expect(asStringArray("alpha")).toEqual([]);
  });

  test("asBoolean returns fallback for non-booleans", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false, true)).toBe(false);
    expect(asBoolean("true", true)).toBe(true);
    expect(asBoolean(1)).toBe(false);
  });

  test("normalizePath converts Windows separators", () => {
    expect(normalizePath("extensions\\quiet-validators\\config.ts")).toBe(
      "extensions/quiet-validators/config.ts",
    );
  });

  test("escapeRegex escapes regex metacharacters", () => {
    const escaped = escapeRegex("a+b?(c)[d]{e}|f\\g.h^i$j");
    const regex = new RegExp(`^${escaped}$`);

    expect(regex.test("a+b?(c)[d]{e}|f\\g.h^i$j")).toBe(true);
  });

  test("globToRegExp handles star, double star, and question mark", () => {
    expect(globToRegExp("external/**").test("external/nested/file.ts")).toBe(true);
    expect(globToRegExp("*.ts").test("config.ts")).toBe(true);
    expect(globToRegExp("*.ts").test("src/config.ts")).toBe(false);
    expect(globToRegExp("file-?.ts").test("file-a.ts")).toBe(true);
    expect(globToRegExp("file-?.ts").test("file-ab.ts")).toBe(false);
  });

  test("matchesAny matches normalized glob patterns", () => {
    expect(matchesAny("docs/_hidden/plan.md", ["external/**", "docs\\_hidden\\**"])).toBe(true);
    expect(matchesAny("extensions/web/search.ts", ["external/**", "docs/_hidden/**"])).toBe(false);
  });
});
