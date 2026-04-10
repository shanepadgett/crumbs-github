import { resolveExistingPath } from "./path-policy.js";

export interface ApplyPatchInvocation {
  patch: string;
  effectiveCwd: string;
  kind: "raw_patch" | "apply_patch" | "applypatch" | "shell_heredoc";
}

function unwrapQuoted(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length < 2) return undefined;
  const quote = trimmed[0];
  if ((quote !== "'" && quote !== '"') || trimmed[trimmed.length - 1] !== quote) {
    return undefined;
  }

  const inner = trimmed.slice(1, -1);
  if (quote === '"') {
    return inner.replace(/\\"/g, '"');
  }
  return inner;
}

function unwrapShellEnvelope(input: string): string {
  const wrappers: RegExp[] = [
    /^(?:bash|zsh|sh)\s+-(?:lc|c)\s+([\s\S]+)$/,
    /^(?:powershell|pwsh)\s+(?:-[^\s]+\s+)*-Command\s+([\s\S]+)$/i,
    /^cmd\s+\/c\s+([\s\S]+)$/i,
  ];

  for (const wrapper of wrappers) {
    const match = input.match(wrapper);
    if (!match) continue;
    const payload = unwrapQuoted(match[1] ?? "");
    if (!payload) {
      throw new Error("Shell-wrapped apply_patch invocations must quote the command body.");
    }
    return payload;
  }

  return input;
}

function parseHeredocPayload(rest: string): string | undefined {
  const heredoc = rest.match(/^<<\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*\n([\s\S]*?)\n\2\s*$/);
  if (!heredoc) return undefined;
  return heredoc[3] ?? "";
}

function parseCommandScript(
  script: string,
): { patch: string; cdPath?: string; kind: ApplyPatchInvocation["kind"] } | undefined {
  const trimmed = script.trim();
  if (trimmed.length === 0) return undefined;

  let cdPath: string | undefined;
  let invocationBody = trimmed;
  const cdMatch = trimmed.match(/^cd\s+(.+?)\s+&&\s+([\s\S]+)$/);
  if (cdMatch) {
    cdPath = cdMatch[1]?.trim();
    invocationBody = cdMatch[2] ?? "";
  }

  if (!invocationBody || invocationBody.includes(";") || invocationBody.includes("||")) {
    return undefined;
  }

  const commandMatch = invocationBody.match(/^(apply_patch|applypatch)\b([\s\S]*)$/);
  if (!commandMatch) return undefined;

  const command = commandMatch[1];
  const rest = (commandMatch[2] ?? "").trimStart();
  const heredocPatch = parseHeredocPayload(rest);
  if (heredocPatch !== undefined) {
    return {
      patch: heredocPatch,
      cdPath,
      kind: "shell_heredoc",
    };
  }

  if (!rest.startsWith("*** Begin Patch")) {
    return undefined;
  }

  return {
    patch: rest,
    cdPath,
    kind: command === "apply_patch" ? "apply_patch" : "applypatch",
  };
}

export async function parseApplyPatchInvocation(
  cwd: string,
  input: string,
): Promise<ApplyPatchInvocation> {
  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (normalized.startsWith("*** Begin Patch")) {
    return {
      patch: normalized,
      effectiveCwd: cwd,
      kind: "raw_patch",
    };
  }

  const shellBody = unwrapShellEnvelope(normalized);
  const parsed = parseCommandScript(shellBody);
  if (!parsed) {
    throw new Error(
      "apply_patch input must be a raw patch or an explicit apply_patch/applypatch invocation.",
    );
  }

  if (!parsed.cdPath) {
    return {
      patch: parsed.patch,
      effectiveCwd: cwd,
      kind: parsed.kind,
    };
  }

  const resolvedCwd = await resolveExistingPath(cwd, parsed.cdPath, "directory");
  return {
    patch: parsed.patch,
    effectiveCwd: resolvedCwd.canonicalPath,
    kind: parsed.kind,
  };
}
