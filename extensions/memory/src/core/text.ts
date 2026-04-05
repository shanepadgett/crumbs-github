const KNOWN_FILE_EXT_RE =
  /\.(?:d\.ts|ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|mdx|toml|ya?ml|png|jpe?g|gif|webp|svg|css|scss|less|html?|sh|txt|lock|mp3|wav|ini|conf|log|env|sql)$/i;
const SPECIAL_FILE_BASENAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Gemfile",
  "Procfile",
  ".env",
  ".gitignore",
  ".npmrc",
  ".prettierrc",
  ".eslintrc",
  ".editorconfig",
  ".gitmodules",
]);

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripLeadingAt(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

export function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function uniqueRecentStrings(values: Iterable<string>, max: number): string[] {
  const items = Array.from(values, (value) => value.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const value = items[index] ?? "";
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= max) break;
  }

  return result.reverse();
}

export function firstNonEmptyLine(text: string): string {
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  return line ?? "";
}

export function nonEmptyLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return collapseWhitespace(content);
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const value = part as { type?: unknown; text?: unknown; source?: { mediaType?: string } };
    if (value.type === "text" && typeof value.text === "string") {
      parts.push(value.text);
      continue;
    }
    if (value.type === "image") {
      const mediaType =
        typeof value.source?.mediaType === "string" ? value.source.mediaType : "image";
      parts.push(`[image: ${mediaType}]`);
    }
  }

  return collapseWhitespace(parts.join("\n"));
}

export function extractAssistantTextParts(content: unknown): string[] {
  if (typeof content === "string") return [collapseWhitespace(content)].filter(Boolean);
  if (!Array.isArray(content)) return [];

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const value = part as { type?: unknown; text?: unknown; source?: { mediaType?: string } };
    if (value.type === "text" && typeof value.text === "string") {
      const text = collapseWhitespace(value.text);
      if (text) parts.push(text);
      continue;
    }
    if (value.type === "image") {
      const mediaType =
        typeof value.source?.mediaType === "string" ? value.source.mediaType : "image";
      parts.push(`[image: ${mediaType}]`);
    }
  }

  return parts;
}

function trimPathToken(value: string): string {
  return value
    .replace(/^[^@A-Za-z0-9./_-]+/, "")
    .replace(/[^A-Za-z0-9./_-]+$/, "")
    .replace(/\.+$/, "")
    .trim();
}

function looksLikeFilePath(candidate: string): boolean {
  if (!candidate || candidate === "." || candidate === ".." || candidate === "/") return false;
  if (candidate.includes("://")) return false;

  const basename = candidate.split("/").at(-1) ?? candidate;
  if (SPECIAL_FILE_BASENAMES.has(basename)) return true;
  if (!KNOWN_FILE_EXT_RE.test(basename)) return false;

  const stem = basename.replace(KNOWN_FILE_EXT_RE, "");
  return /[A-Za-z0-9_-]/.test(stem);
}

export function extractProbablePathsFromText(text: string): string[] {
  const matches: string[] = [];

  for (const rawToken of text.split(/[\s<>{}()[\],:;"'`]+/)) {
    const token = trimPathToken(rawToken);
    if (!token) continue;

    const candidate = stripLeadingAt(token);
    if (!candidate) continue;
    if (candidate.includes("@") && !token.startsWith("@")) continue;
    if (!looksLikeFilePath(candidate)) continue;

    matches.push(candidate);
  }

  return uniqueStrings(matches);
}

export function extractToolPaths(args: Record<string, unknown>): string[] {
  const paths: string[] = [];

  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = stripLeadingAt(value.trim());
    if (!normalized) return;
    paths.push(normalized);
  };

  push(args.path);
  push(args.file);

  for (const key of ["paths", "files"] as const) {
    const value = args[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) push(item);
  }

  return uniqueStrings(paths);
}

export function makeSnippet(text: string, query: string, radius = 90): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const loweredText = trimmed.toLowerCase();
  const loweredQuery = query.trim().toLowerCase();
  const index = loweredQuery ? loweredText.indexOf(loweredQuery) : -1;

  if (index === -1) return truncateText(trimmed.replace(/\s+/g, " "), radius * 2);

  const start = Math.max(0, index - radius);
  const end = Math.min(trimmed.length, index + loweredQuery.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < trimmed.length ? "…" : "";
  return `${prefix}${trimmed.slice(start, end).replace(/\s+/g, " ")}${suffix}`;
}
