import { promises as fs } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { loadPathVisibilityConfig, normalizePath } from "./settings.js";

export interface PathVisibilityPolicy {
  enabled: boolean;
  injectPromptHint: boolean;
  deny: string[];
  isDenied: (targetPath: string) => Promise<boolean>;
  referencesDeniedPath: (command: string) => Promise<boolean>;
  sanitizeBashContent: (content: unknown) => unknown[] | null;
}

interface PathRule {
  regex: RegExp;
  absolute: boolean;
}

const FILESYSTEM_COMMAND_RE =
  /\b(ls|find|fd|fdfind|rg|grep|tree|cat|bat|head|tail|less|more|sed|awk)\b/;
const COMPLEX_SHELL_RE = /\|\||&&|[|;`]|\$\(|\bxargs\b|\beval\b/;

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(glob: string): RegExp {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      const next = glob[index + 1];
      if (next === "*") {
        pattern += ".*";
        index += 1;
        continue;
      }
      pattern += "[^/]*";
      continue;
    }
    if (char === "?") {
      pattern += "[^/]";
      continue;
    }
    pattern += escapeRegex(char);
  }

  pattern += "$";
  return new RegExp(pattern);
}

function normalizeGlob(raw: string): string {
  const normalized = normalizePath(raw.trim());
  if (!normalized) return "";
  if (normalized.endsWith("/")) return `${normalized}**`;
  return normalized;
}

function expandHome(pattern: string): string {
  if (!pattern.startsWith("~/")) return pattern;
  const home = process.env.HOME;
  if (!home) return pattern;
  return normalizePath(`${home}/${pattern.slice(2)}`);
}

function stripGlobSuffix(value: string): string {
  const wildcardIndex = value.search(/[*?[\]{}]/);
  const stripped = wildcardIndex >= 0 ? value.slice(0, wildcardIndex) : value;
  return stripped.replace(/^\.\//, "").replace(/\/$/, "");
}

function normalizeRule(pattern: string): { normalized: string; absolute: boolean } {
  const withHome = expandHome(pattern);
  if (isAbsolute(withHome)) {
    return { normalized: normalizeGlob(withHome), absolute: true };
  }
  return { normalized: normalizeGlob(withHome), absolute: false };
}

function tokenizeShell(command: string): string[] {
  const matches = command.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) ?? [];
  return matches.map((token) => token.replace(/^['"]|['"]$/g, ""));
}

function looksLikePathToken(token: string): boolean {
  if (!token || token.startsWith("-")) return false;
  return (
    token.includes("/") || token.startsWith(".") || token.startsWith("~") || token.startsWith("/")
  );
}

function shouldInspectToken(tool: string, token: string): boolean {
  if (["cat", "bat", "head", "tail", "less", "more"].includes(tool)) return !token.startsWith("-");
  return looksLikePathToken(token);
}

function pathIsOrContains(pathValue: string, candidate: string): boolean {
  if (!candidate) return false;
  return pathValue === candidate || pathValue.startsWith(`${candidate}/`);
}

function basenameToken(pathValue: string): string {
  const normalized = pathValue.replace(/\/$/, "");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

async function resolveRealPath(pathValue: string): Promise<string> {
  try {
    return normalizePath(await fs.realpath(pathValue));
  } catch {
    return normalizePath(pathValue);
  }
}

function isComplexBash(command: string): boolean {
  return COMPLEX_SHELL_RE.test(command);
}

export function maybeRewriteBashCommand(command: string, deny: string[]): string {
  const trimmed = command.trim();
  const tokens = tokenizeShell(trimmed);
  const tool = tokens[0];
  if (!tool || isComplexBash(trimmed)) return command;

  const relativeGlobs = deny
    .map((item) => normalizeGlob(item))
    .filter(
      (item) => item && !item.startsWith("/") && !item.startsWith("~/") && !item.includes(" "),
    );

  if (tool === "rg" && relativeGlobs.length > 0) {
    const suffix = relativeGlobs.map((glob) => ` --glob '!${glob}'`).join("");
    return `${command}${suffix}`;
  }

  if (tool === "find" && relativeGlobs.length > 0) {
    const excluded = relativeGlobs
      .map((glob) => stripGlobSuffix(glob))
      .filter(Boolean)
      .map((prefix) => ` -not -path './${prefix}*' -not -path '${prefix}*'`)
      .join("");
    return `${command}${excluded}`;
  }

  return command;
}

function sanitizeBashOutput(content: unknown, pathTokens: string[]): unknown[] | null {
  if (!Array.isArray(content)) return null;

  let changed = false;
  const next = content.map((part) => {
    if (!part || typeof part !== "object") return part;
    const typed = part as { type?: unknown; text?: unknown };
    if (typed.type !== "text" || typeof typed.text !== "string") return part;

    const originalLines = typed.text.split(/\r?\n/);
    let partChanged = false;
    const filtered = originalLines.filter((line) => {
      const normalized = normalizePath(line);
      const hidden = pathTokens.some((token) => token && normalized.includes(token));
      if (hidden) {
        changed = true;
        partChanged = true;
      }
      return !hidden;
    });

    if (!partChanged) return part;
    if (filtered.length === 0) {
      return { type: "text" as const, text: "No matching files." };
    }

    return { type: "text" as const, text: filtered.join("\n") };
  });

  if (!changed) return null;
  return next;
}

export function buildPromptHint(deny: string[]): string {
  const listed = deny
    .slice(0, 12)
    .map((entry) => `- ${entry}`)
    .join("\n");
  return [
    "Path visibility policy:",
    "Do not access or reference denied paths.",
    "Denied patterns:",
    listed,
  ].join("\n");
}

export async function createPathVisibilityPolicy(cwd: string): Promise<PathVisibilityPolicy> {
  const config = await loadPathVisibilityConfig(cwd);
  const deny = config.deny.map((item) => normalizePath(item.trim())).filter(Boolean);

  const rules = deny
    .map((pattern) => normalizeRule(pattern))
    .filter((rule) => rule.normalized.length > 0)
    .map<PathRule>((rule) => {
      if (rule.absolute) {
        return { regex: globToRegExp(rule.normalized), absolute: true };
      }
      return { regex: globToRegExp(rule.normalized), absolute: false };
    });

  const pathPrefixes = deny
    .map((pattern) => stripGlobSuffix(expandHome(pattern)))
    .map((token) => normalizePath(token))
    .filter((token) => token.length > 0);

  async function isDenied(targetPath: string): Promise<boolean> {
    const normalizedTarget = normalizePath(targetPath);
    const absoluteTarget = isAbsolute(normalizedTarget)
      ? normalizedTarget
      : normalizePath(resolve(cwd, normalizedTarget));
    const realTarget = await resolveRealPath(absoluteTarget);

    const relativeAbs = normalizePath(relative(cwd, absoluteTarget)).replace(/^\.\//, "");
    const relativeReal = normalizePath(relative(cwd, realTarget)).replace(/^\.\//, "");

    for (const rule of rules) {
      if (rule.absolute) {
        if (
          rule.regex.test(absoluteTarget) ||
          rule.regex.test(realTarget) ||
          pathPrefixes.some((prefix) => pathIsOrContains(absoluteTarget, prefix)) ||
          pathPrefixes.some((prefix) => pathIsOrContains(realTarget, prefix))
        ) {
          return true;
        }
        continue;
      }

      if (
        (relativeAbs && !relativeAbs.startsWith("../") && rule.regex.test(relativeAbs)) ||
        (relativeReal && !relativeReal.startsWith("../") && rule.regex.test(relativeReal)) ||
        rule.regex.test(normalizedTarget.replace(/^\.\//, "")) ||
        (relativeAbs &&
          !relativeAbs.startsWith("../") &&
          pathPrefixes.some((prefix) => pathIsOrContains(relativeAbs, prefix))) ||
        (relativeReal &&
          !relativeReal.startsWith("../") &&
          pathPrefixes.some((prefix) => pathIsOrContains(relativeReal, prefix)))
      ) {
        return true;
      }
    }

    return false;
  }

  async function referencesDeniedPath(command: string): Promise<boolean> {
    const tokens = tokenizeShell(command);
    const tool = tokens[0] ?? "";
    if (!tool || !FILESYSTEM_COMMAND_RE.test(tool)) return false;

    for (const token of tokens.slice(1)) {
      if (!shouldInspectToken(tool, token)) continue;
      if (await isDenied(token)) return true;
    }

    return false;
  }

  const outputTokens = [
    ...new Set([...pathPrefixes, ...pathPrefixes.map((prefix) => basenameToken(prefix))]),
  ].filter(Boolean);

  return {
    enabled: config.enabled,
    injectPromptHint: config.injectPromptHint,
    deny,
    isDenied,
    referencesDeniedPath,
    sanitizeBashContent: (content: unknown) => sanitizeBashOutput(content, outputTokens),
  };
}
