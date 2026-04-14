import { promises as fs } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  loadPathVisibilityConfig,
  normalizePath,
  type FocusConfig,
  type FocusMode,
} from "./settings.js";

export interface PathVisibilityPolicy {
  enabled: boolean;
  injectPromptHint: boolean;
  hardDeny: string[];
  focus: FocusConfig;
  isHardDenied: (targetPath: string) => Promise<boolean>;
  isOutsideFocus: (targetPath: string) => Promise<boolean>;
  referencesHardDeniedPath: (command: string) => Promise<boolean>;
  referencesOutsideFocusPath: (command: string) => Promise<boolean>;
  rewriteBashCommand: (command: string) => string;
  sanitizeBashContent: (content: unknown) => unknown | null;
}

interface PathRule {
  regex: RegExp;
  absolute: boolean;
}

const FILESYSTEM_COMMAND_RE =
  /\b(ls|find|fd|fdfind|rg|grep|tree|cat|bat|head|tail|less|more|sed|awk)\b/;
const COMPLEX_SHELL_RE = /\|\||&&|[|;`]|\$\(|\bxargs\b|\beval\b/;
const FOCUSABLE_DISCOVERY_TOOLS = new Set(["find", "rg", "ls", "tree", "fd", "fdfind"]);

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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
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

function isBroadPathToken(token: string): boolean {
  const value = token.trim();
  return value === "." || value === "./" || value === "/" || value === "~" || value === "~/";
}

function getPathArgs(tool: string, tokens: string[]): string[] {
  return tokens.slice(1).filter((token) => shouldInspectToken(tool, token));
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

function isPathLikeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/\s{2,}|\t/.test(trimmed)) return false;
  if (trimmed.includes(" ")) return false;
  return (
    trimmed.includes("/") ||
    trimmed.startsWith(".") ||
    trimmed.startsWith("~") ||
    /^[^\s]+\.[^\s]+$/.test(trimmed) ||
    /^[A-Za-z0-9._-]+$/.test(trimmed)
  );
}

function normalizeFocus(config: FocusConfig): FocusConfig {
  return {
    enabled: config.enabled,
    mode: config.mode,
    roots: config.roots.map((value) => normalizePath(value.trim())).filter(Boolean),
    alwaysAllow: config.alwaysAllow.map((value) => normalizePath(value.trim())).filter(Boolean),
  };
}

function rewriteBashCommand(command: string, hardDeny: string[], focus: FocusConfig): string {
  const trimmed = command.trim();
  const tokens = tokenizeShell(trimmed);
  const tool = tokens[0];
  if (!tool || isComplexBash(trimmed)) return command;

  const relativeGlobs = hardDeny
    .map((item) => normalizeGlob(item))
    .filter(
      (item) => item && !item.startsWith("/") && !item.startsWith("~/") && !item.includes(" "),
    );

  let next = command;

  if (tool === "rg" && relativeGlobs.length > 0) {
    const suffix = relativeGlobs.map((glob) => ` --glob '!${glob}'`).join("");
    next = `${next}${suffix}`;
  }

  if (tool === "find" && relativeGlobs.length > 0) {
    const excluded = relativeGlobs
      .map((glob) => stripGlobSuffix(glob))
      .filter(Boolean)
      .map((prefix) => ` -not -path './${prefix}*' -not -path '${prefix}*'`)
      .join("");
    next = `${next}${excluded}`;
  }

  const focusActive = focus.enabled && focus.roots.length > 0;
  if (!focusActive || focus.mode === "soft") return next;
  if (!FOCUSABLE_DISCOVERY_TOOLS.has(tool)) return next;

  const pathArgs = getPathArgs(tool, tokens);
  if (pathArgs.some((arg) => !isBroadPathToken(arg))) return next;

  const quotedRoots = focus.roots.map((root) => shellQuote(root));
  if (quotedRoots.length === 0) return next;

  if (tool === "find") {
    const rest = trimmed.replace(/^find\b\s*/, "");
    const restWithoutBroadPrefix = rest.replace(/^(\.\/?|\/|~\/?)(\s+|$)/, "$2");
    return `find ${quotedRoots.join(" ")} ${restWithoutBroadPrefix}`.trim();
  }

  return `${next}${quotedRoots.map((root) => ` ${root}`).join("")}`;
}

function sanitizeBashOutput(
  content: unknown,
  hardDenyTokens: string[],
  focusAllowTokens: string[],
  focusMode: FocusMode,
): unknown | null {
  const shouldHideLine = (line: string): boolean => {
    const normalized = normalizePath(line);
    const hiddenByHardDeny = hardDenyTokens.some((token) => token && normalized.includes(token));
    const hideByFocus =
      focusMode !== "soft" &&
      focusAllowTokens.length > 0 &&
      isPathLikeLine(line) &&
      !focusAllowTokens.some((token) => token && normalized.includes(token));
    return hiddenByHardDeny || hideByFocus;
  };

  if (typeof content === "string") {
    const lines = content.split(/\r?\n/);
    const filtered = lines.filter((line) => !shouldHideLine(line));
    if (filtered.length === lines.length) return null;
    return filtered.length > 0 ? filtered.join("\n") : "No matching files.";
  }

  if (!Array.isArray(content)) return null;

  let changed = false;
  const next = content.map((part) => {
    if (!part || typeof part !== "object") return part;
    const typed = part as { type?: unknown; text?: unknown };
    if (typed.type !== "text" || typeof typed.text !== "string") return part;

    const originalLines = typed.text.split(/\r?\n/);
    let partChanged = false;
    const filtered = originalLines.filter((line) => {
      const hidden = shouldHideLine(line);
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
  if (deny.length === 0) return "";
  const listed = deny
    .slice(0, 12)
    .map((entry) => `- ${entry}`)
    .join("\n");
  return [
    "Path visibility hard policy:",
    "Never access or reference hard-denied paths.",
    "Hard-denied patterns:",
    listed,
  ].join("\n");
}

function buildFocusPromptHint(focus: FocusConfig): string {
  if (!focus.enabled || focus.roots.length === 0) return "";

  const modeInstruction =
    focus.mode === "soft"
      ? "Focus mode soft: stay inside focus roots unless direct evidence proves boundary missing."
      : focus.mode === "hidden"
        ? "Focus mode hidden: stay inside focus roots; avoid outside exploration unless direct dependency requires it."
        : "Focus mode hard: do not access paths outside focus roots or always-allow list.";

  const roots =
    focus.roots
      .slice(0, 12)
      .map((item) => `- ${item}`)
      .join("\n") || "- (none)";
  const allow =
    focus.alwaysAllow
      .slice(0, 12)
      .map((item) => `- ${item}`)
      .join("\n") || "- (none)";

  return [
    "Focus policy:",
    modeInstruction,
    "Focus roots:",
    roots,
    "Always-allow paths:",
    allow,
  ].join("\n");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

type PrefixRule = { value: string; absolute: boolean };

function toPrefixRule(input: string): PrefixRule | null {
  const expanded = expandHome(input);
  const stripped = normalizePath(stripGlobSuffix(expanded));
  if (!stripped) return null;
  return { value: stripped, absolute: isAbsolute(stripped) };
}

async function pathMatchesPrefixRules(
  cwd: string,
  targetPath: string,
  rules: PrefixRule[],
): Promise<boolean> {
  if (rules.length === 0) return false;

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
        pathIsOrContains(absoluteTarget, rule.value) ||
        pathIsOrContains(realTarget, rule.value)
      ) {
        return true;
      }
      continue;
    }

    if (
      (relativeAbs &&
        !relativeAbs.startsWith("../") &&
        pathIsOrContains(relativeAbs, rule.value)) ||
      (relativeReal &&
        !relativeReal.startsWith("../") &&
        pathIsOrContains(relativeReal, rule.value)) ||
      pathIsOrContains(normalizedTarget.replace(/^\.\//, ""), rule.value)
    ) {
      return true;
    }
  }

  return false;
}

export async function createPathVisibilityPolicy(
  cwd: string,
  options?: { focusOverride?: Partial<FocusConfig> },
): Promise<PathVisibilityPolicy> {
  const config = await loadPathVisibilityConfig(cwd);
  const hardDeny = config.hardDeny.map((item) => normalizePath(item.trim())).filter(Boolean);
  const override = options?.focusOverride;
  const focus = normalizeFocus({
    enabled: override?.enabled ?? config.focus.enabled,
    mode: override?.mode ?? config.focus.mode,
    roots: override?.roots ?? config.focus.roots,
    alwaysAllow: override?.alwaysAllow ?? config.focus.alwaysAllow,
  });

  const rules = hardDeny
    .map((pattern) => normalizeRule(pattern))
    .filter((rule) => rule.normalized.length > 0)
    .map<PathRule>((rule) => {
      if (rule.absolute) {
        return { regex: globToRegExp(rule.normalized), absolute: true };
      }
      return { regex: globToRegExp(rule.normalized), absolute: false };
    });

  const hardDenyPrefixes = hardDeny
    .map((pattern) => stripGlobSuffix(expandHome(pattern)))
    .map((token) => normalizePath(token))
    .filter((token) => token.length > 0);

  const focusRules = dedupe([...focus.roots, ...focus.alwaysAllow])
    .map((value) => toPrefixRule(value))
    .filter((value): value is PrefixRule => Boolean(value));

  const focusActive = focus.enabled && focus.roots.length > 0;

  async function isHardDenied(targetPath: string): Promise<boolean> {
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
          hardDenyPrefixes.some((prefix) => pathIsOrContains(absoluteTarget, prefix)) ||
          hardDenyPrefixes.some((prefix) => pathIsOrContains(realTarget, prefix))
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
          hardDenyPrefixes.some((prefix) => pathIsOrContains(relativeAbs, prefix))) ||
        (relativeReal &&
          !relativeReal.startsWith("../") &&
          hardDenyPrefixes.some((prefix) => pathIsOrContains(relativeReal, prefix)))
      ) {
        return true;
      }
    }

    return false;
  }

  async function isOutsideFocus(targetPath: string): Promise<boolean> {
    if (!focusActive) return false;
    const inside = await pathMatchesPrefixRules(cwd, targetPath, focusRules);
    return !inside;
  }

  async function referencesHardDeniedPath(command: string): Promise<boolean> {
    const tokens = tokenizeShell(command);
    const tool = tokens[0] ?? "";
    if (!tool || !FILESYSTEM_COMMAND_RE.test(tool)) return false;

    for (const token of tokens.slice(1)) {
      if (!shouldInspectToken(tool, token)) continue;
      if (await isHardDenied(token)) return true;
    }

    return false;
  }

  async function referencesOutsideFocusPath(command: string): Promise<boolean> {
    if (!focusActive) return false;

    const tokens = tokenizeShell(command);
    const tool = tokens[0] ?? "";
    if (!tool || !FILESYSTEM_COMMAND_RE.test(tool)) return false;

    for (const token of tokens.slice(1)) {
      if (!shouldInspectToken(tool, token)) continue;
      if (await isOutsideFocus(token)) return true;
    }

    return false;
  }

  const hardDenyOutputTokens = [
    ...new Set([...hardDenyPrefixes, ...hardDenyPrefixes.map((prefix) => basenameToken(prefix))]),
  ].filter(Boolean);

  const focusOutputTokens = [
    ...new Set(
      (focusActive ? [...focus.roots, ...focus.alwaysAllow] : []).map((item) =>
        stripGlobSuffix(item),
      ),
    ),
  ]
    .map((item) => normalizePath(item))
    .filter(Boolean);

  return {
    enabled: config.enabled,
    injectPromptHint: config.injectPromptHint,
    hardDeny,
    focus,
    isHardDenied,
    isOutsideFocus,
    referencesHardDeniedPath,
    referencesOutsideFocusPath,
    rewriteBashCommand: (command: string) => rewriteBashCommand(command, hardDeny, focus),
    sanitizeBashContent: (content: unknown) =>
      sanitizeBashOutput(content, hardDenyOutputTokens, focusOutputTokens, focus.mode),
  };
}

export function buildCombinedPromptHint(policy: PathVisibilityPolicy): string {
  const hardHint = buildPromptHint(policy.hardDeny);
  const focusHint = buildFocusPromptHint(policy.focus);
  return [hardHint, focusHint].filter(Boolean).join("\n\n");
}
