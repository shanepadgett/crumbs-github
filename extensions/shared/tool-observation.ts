function normalizePathValue(pathValue: string): string | null {
  const normalized = pathValue.trim().replace(/^@/, "");
  return normalized.length > 0 ? normalized : null;
}

function extractPatchText(input: unknown): string | null {
  if (typeof input === "string") return maybeUnwrapApplyPatchInvocation(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  if (typeof record.input === "string") return maybeUnwrapApplyPatchInvocation(record.input);
  if (typeof record.patch === "string") return maybeUnwrapApplyPatchInvocation(record.patch);
  if (typeof record.text === "string") return maybeUnwrapApplyPatchInvocation(record.text);
  return null;
}

function unwrapQuoted(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return null;
  const quote = trimmed[0];
  if ((quote !== "'" && quote !== '"') || trimmed[trimmed.length - 1] !== quote) {
    return null;
  }

  const inner = trimmed.slice(1, -1);
  return quote === '"' ? inner.replace(/\\"/g, '"') : inner;
}

function unwrapShellEnvelope(input: string): string {
  const trimmed = input.trim();
  const wrappers: RegExp[] = [
    /^(?:bash|zsh|sh)\s+-(?:lc|c)\s+([\s\S]+)$/,
    /^(?:powershell|pwsh)\s+(?:-[^\s]+\s+)*-Command\s+([\s\S]+)$/i,
    /^cmd\s+\/c\s+([\s\S]+)$/i,
  ];

  for (const wrapper of wrappers) {
    const match = trimmed.match(wrapper);
    if (!match) continue;
    const unwrapped = unwrapQuoted(match[1] ?? "");
    return unwrapped ?? trimmed;
  }

  return trimmed;
}

function maybeUnwrapApplyPatchInvocation(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith("*** Begin Patch")) return trimmed;

  const shellBody = unwrapShellEnvelope(trimmed);
  const commandMatch = shellBody.match(
    /^(?:cd\s+.+?\s+&&\s+)?(?:apply_patch|applypatch)\b([\s\S]*)$/,
  );
  if (!commandMatch) return null;

  const rest = (commandMatch[1] ?? "").trimStart();
  if (rest.startsWith("*** Begin Patch")) return rest;

  const heredocMatch = rest.match(/^<<\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*\n([\s\S]*?)\n\2\s*$/);
  if (!heredocMatch) return null;

  const patch = heredocMatch[3]?.trim();
  return patch && patch.startsWith("*** Begin Patch") ? patch : null;
}

function collectPatchMutatedPaths(patchText: string): string[] {
  const touched = new Set<string>();
  const lines = patchText.split("\n");
  let lastUpdatedPath: string | null = null;

  for (const line of lines) {
    const addMatch = line.match(/^\*\*\* Add File: (.+)$/);
    if (addMatch) {
      const path = normalizePathValue(addMatch[1] ?? "");
      if (path) touched.add(path);
      lastUpdatedPath = null;
      continue;
    }

    const updateMatch = line.match(/^\*\*\* Update File: (.+)$/);
    if (updateMatch) {
      const path = normalizePathValue(updateMatch[1] ?? "");
      if (path) touched.add(path);
      lastUpdatedPath = path;
      continue;
    }

    if (line.startsWith("*** Delete File:")) {
      lastUpdatedPath = null;
      continue;
    }

    const moveToMatch = line.match(/^\*\*\* Move to: (.+)$/);
    if (moveToMatch) {
      const nextPath = normalizePathValue(moveToMatch[1] ?? "");
      if (lastUpdatedPath) touched.delete(lastUpdatedPath);
      if (nextPath) touched.add(nextPath);
      lastUpdatedPath = nextPath;
    }
  }

  return [...touched];
}

export function isFileMutationTool(toolName: unknown): boolean {
  return toolName === "edit" || toolName === "write" || toolName === "apply_patch";
}

export function collectMutatedPaths(toolName: unknown, input: unknown): string[] {
  if (!isFileMutationTool(toolName)) return [];

  if (toolName === "apply_patch") {
    const patchText = extractPatchText(input);
    if (!patchText) return [];
    return collectPatchMutatedPaths(patchText);
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const record = input as Record<string, unknown>;
  if (typeof record.path !== "string") return [];
  const path = normalizePathValue(record.path);
  return path ? [path] : [];
}

export function extractToolCommand(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (typeof record.command === "string") return record.command;
  if (typeof record.cmd === "string") return record.cmd;
  return null;
}
