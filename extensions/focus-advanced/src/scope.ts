import { promises as fs } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { normalizePath, uniquePaths, type EffectiveFocusState } from "./settings.js";

const DISCOVERY_TOOLS = new Set(["ls", "find", "fd", "fdfind", "rg", "grep", "tree"]);
const READ_LIKE_TOOLS = new Set(["cat", "bat", "head", "tail", "less", "more", "sed", "awk"]);
const SHELL_WRAPPERS = new Set(["bash", "sh", "zsh"]);
const DISCOVERY_RE = /(^|[^A-Za-z0-9_])(ls|find|fd|fdfind|rg|grep|tree)([^A-Za-z0-9_]|$)/;

export function isFocusActive(state: EffectiveFocusState): boolean {
  return state.enabled && state.roots.length > 0;
}

export function tokenizeShell(command: string): string[] {
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
  if (READ_LIKE_TOOLS.has(tool)) return !token.startsWith("-");
  return looksLikePathToken(token);
}

function pathIsOrContains(pathValue: string, candidate: string): boolean {
  return pathValue === candidate || pathValue.startsWith(`${candidate}/`);
}

async function resolveRealPath(pathValue: string): Promise<string> {
  try {
    return normalizePath(await fs.realpath(pathValue));
  } catch {
    return normalizePath(pathValue);
  }
}

async function normalizeAbsolutePath(
  cwd: string,
  targetPath: string,
): Promise<{ absolute: string; real: string; relativeAbs: string; relativeReal: string }> {
  const normalizedTarget = normalizePath(targetPath);
  const absolute = isAbsolute(normalizedTarget)
    ? normalizedTarget
    : normalizePath(resolve(cwd, normalizedTarget));
  const real = await resolveRealPath(absolute);
  return {
    absolute,
    real,
    relativeAbs: normalizePath(relative(cwd, absolute)).replace(/^\.\//, ""),
    relativeReal: normalizePath(relative(cwd, real)).replace(/^\.\//, ""),
  };
}

export async function isPathAllowed(
  cwd: string,
  state: EffectiveFocusState,
  targetPath: string,
): Promise<boolean> {
  const allowed = uniquePaths([...state.roots, ...state.alwaysAllow]);
  if (allowed.length === 0) return false;

  const target = await normalizeAbsolutePath(cwd, targetPath);
  for (const rawAllowed of allowed) {
    const normalizedAllowed = normalizePath(rawAllowed);
    const absoluteAllowed = isAbsolute(normalizedAllowed)
      ? normalizedAllowed
      : normalizePath(resolve(cwd, normalizedAllowed));
    const realAllowed = await resolveRealPath(absoluteAllowed);
    const relativeAllowed = normalizePath(relative(cwd, absoluteAllowed)).replace(/^\.\//, "");
    const relativeRealAllowed = normalizePath(relative(cwd, realAllowed)).replace(/^\.\//, "");

    if (
      pathIsOrContains(target.absolute, absoluteAllowed) ||
      pathIsOrContains(target.real, realAllowed)
    ) {
      return true;
    }

    if (
      (target.relativeAbs &&
        !target.relativeAbs.startsWith("../") &&
        pathIsOrContains(target.relativeAbs, relativeAllowed)) ||
      (target.relativeReal &&
        !target.relativeReal.startsWith("../") &&
        pathIsOrContains(target.relativeReal, relativeRealAllowed))
    ) {
      return true;
    }
  }

  return false;
}

export function buildFocusAdvancedPromptHint(state: EffectiveFocusState): string {
  const roots =
    state.roots
      .slice(0, 16)
      .map((item) => `- ${item}`)
      .join("\n") || "- (none)";
  const allow =
    state.alwaysAllow
      .slice(0, 16)
      .map((item) => `- ${item}`)
      .join("\n") || "- (none)";
  const modeInstruction =
    state.mode === "soft"
      ? "Focus Advanced soft mode: prefer focus tools and stay inside focus roots unless direct evidence requires crossing boundary."
      : state.mode === "hidden"
        ? "Focus Advanced hidden mode: use focus tools for repo discovery. Do not use bash discovery commands like rg/find/ls/tree/grep. Outside-scope path access may require explicit user approval."
        : "Focus Advanced hard mode: use focus tools for repo discovery. Outside-scope path access requires explicit user approval unless already allowed.";

  return [
    "Focus Advanced policy:",
    modeInstruction,
    "Preferred tools:",
    "- focus_list_files for scoped file discovery",
    "- focus_search_text for scoped text search",
    "- focus_read for scoped file reads",
    "- apply_patch for edits",
    "Bash guidance:",
    "- Use bash for git, build, test, or targeted one-off shell work.",
    "- Do not use bash for general repository discovery while Focus Advanced is active.",
    "Focus roots:",
    roots,
    "Always-allow paths:",
    allow,
  ].join("\n");
}

export function bashDiscoveryBlockReason(
  command: string,
  state: EffectiveFocusState,
): string | undefined {
  if (!isFocusActive(state) || state.mode === "soft") return undefined;
  const tokens = tokenizeShell(command.trim());
  const tool = tokens[0] ?? "";
  if (!tool) return undefined;

  if (DISCOVERY_TOOLS.has(tool)) {
    return "Blocked by Focus Advanced: use focus_list_files or focus_search_text instead of bash for repository discovery.";
  }

  if (SHELL_WRAPPERS.has(tool) && DISCOVERY_RE.test(command)) {
    return "Blocked by Focus Advanced: use focus_list_files or focus_search_text instead of wrapped shell discovery commands.";
  }

  return undefined;
}

export async function bashOutsideFocusReason(
  command: string,
  state: EffectiveFocusState,
  cwd: string,
): Promise<string | undefined> {
  if (!isFocusActive(state) || state.mode !== "hard") return undefined;

  const targets = await findOutsideFocusTargets(command, state, cwd);
  const first = targets[0];
  if (first) {
    return `Blocked by Focus Advanced hard mode: path outside active focus roots: ${first}`;
  }

  return undefined;
}

export async function findOutsideFocusTargets(
  command: string,
  state: EffectiveFocusState,
  cwd: string,
): Promise<string[]> {
  if (!isFocusActive(state)) return [];

  const tokens = tokenizeShell(command.trim());
  const tool = tokens[0] ?? "";
  if (!tool || SHELL_WRAPPERS.has(tool)) return [];

  const blocked = new Set<string>();
  for (const token of tokens.slice(1)) {
    if (!shouldInspectToken(tool, token)) continue;
    if (!(await isPathAllowed(cwd, state, token))) blocked.add(token);
  }

  return [...blocked];
}

export function extractPatchTargets(input: string): string[] {
  const targets = new Set<string>();
  const normalized = input.replace(/\r\n/g, "\n");
  const fileMatches = normalized.matchAll(/^\*\*\* (?:Add|Delete|Update) File: (.+)$/gm);
  for (const match of fileMatches) {
    const pathValue = match[1]?.trim();
    if (pathValue) targets.add(pathValue);
  }
  const moveMatches = normalized.matchAll(/^\*\*\* Move to: (.+)$/gm);
  for (const match of moveMatches) {
    const pathValue = match[1]?.trim();
    if (pathValue) targets.add(pathValue);
  }
  return [...targets];
}
