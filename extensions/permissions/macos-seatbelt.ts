/**
 * macOS seatbelt launcher
 *
 * What it does: builds a Codex-style `sandbox-exec` launch command for
 * sandboxed shell commands on macOS.
 *
 * How to use it: call `createMacOsSeatbeltLaunchSpec()` with the shell command
 * plus read/write rules, then spawn the returned program and args.
 *
 * Example:
 * const launch = createMacOsSeatbeltLaunchSpec({
 *   command: "code .",
 *   allowNetwork: true,
 *   readConfig: { denyOnly: [] },
 *   writeConfig: { allowOnly: ["/tmp"], denyWithinAllow: [] },
 * });
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { globToRegex } from "@anthropic-ai/sandbox-runtime/dist/sandbox/macos-sandbox-utils.js";
import {
  containsGlobChars,
  normalizePathForSandbox,
} from "@anthropic-ai/sandbox-runtime/dist/sandbox/sandbox-utils.js";

const SANDBOX_EXECUTABLE = "/usr/bin/sandbox-exec";
const GETCONF_EXECUTABLE = "/usr/bin/getconf";
const DARWIN_USER_CACHE_RULE = /\(allow file-write\*[\s\S]*?DARWIN_USER_CACHE_DIR[\s\S]*?\)\s*$/m;

interface SandboxReadConfig {
  denyOnly?: string[];
}

interface SandboxWriteConfig {
  allowOnly?: string[];
  denyWithinAllow?: string[];
}

interface CodexPolicyParts {
  base: string;
  defaults: string;
  network: string;
}

export interface MacOsSeatbeltLaunchSpec {
  program: string;
  args: string[];
}

interface CreateMacOsSeatbeltLaunchSpecOptions {
  command: string;
  allowNetwork: boolean;
  readConfig: SandboxReadConfig;
  writeConfig: SandboxWriteConfig;
}

let cachedPolicyParts: CodexPolicyParts | null | undefined;
let cachedDarwinUserCacheDir: string | null | undefined;

function uniquePaths(paths: Array<string | undefined>): string[] {
  return Array.from(new Set(paths.filter((path): path is string => Boolean(path))));
}

function escapePath(path: string): string {
  return JSON.stringify(path);
}

function loadCodexPolicyParts(): CodexPolicyParts | null {
  if (cachedPolicyParts !== undefined) return cachedPolicyParts;

  try {
    cachedPolicyParts = {
      base: readFileSync(
        fileURLToPath(
          new URL(
            "../../external/codex/codex-rs/sandboxing/src/seatbelt_base_policy.sbpl",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
      defaults: readFileSync(
        fileURLToPath(
          new URL(
            "../../external/codex/codex-rs/sandboxing/src/restricted_read_only_platform_defaults.sbpl",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
      network: readFileSync(
        fileURLToPath(
          new URL(
            "../../external/codex/codex-rs/sandboxing/src/seatbelt_network_policy.sbpl",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    };
  } catch {
    cachedPolicyParts = null;
  }

  return cachedPolicyParts;
}

function getDarwinUserCacheDir(): string | undefined {
  if (cachedDarwinUserCacheDir !== undefined) {
    return cachedDarwinUserCacheDir ?? undefined;
  }

  if (!existsSync(GETCONF_EXECUTABLE)) {
    cachedDarwinUserCacheDir = null;
    return undefined;
  }

  try {
    const value = execFileSync(GETCONF_EXECUTABLE, ["DARWIN_USER_CACHE_DIR"], {
      encoding: "utf8",
    }).trim();
    cachedDarwinUserCacheDir = value || null;
  } catch {
    cachedDarwinUserCacheDir = null;
  }

  return cachedDarwinUserCacheDir ?? undefined;
}

function buildRule(effect: "allow" | "deny", action: string, qualifier: string, value: string) {
  return `(${effect} ${action}\n  (${qualifier} ${escapePath(value)})\n)`;
}

function buildPathRules(effect: "allow" | "deny", action: string, pathPattern: string): string[] {
  const normalizedPath = normalizePathForSandbox(pathPattern);

  if (containsGlobChars(normalizedPath)) {
    return [buildRule(effect, action, "regex", globToRegex(normalizedPath))];
  }

  if (effect === "deny") {
    return [
      buildRule(effect, action, "literal", normalizedPath),
      buildRule(effect, action, "subpath", normalizedPath),
    ];
  }

  return [buildRule(effect, action, "subpath", normalizedPath)];
}

function getAncestorDirectories(pathStr: string): string[] {
  const ancestors: string[] = [];
  let currentPath = dirname(pathStr);

  while (currentPath !== "/" && currentPath !== ".") {
    ancestors.push(currentPath);
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) break;
    currentPath = parentPath;
  }

  return ancestors;
}

function buildMoveBlockingRules(pathPatterns: string[]): string[] {
  const rules: string[] = [];

  for (const pathPattern of pathPatterns) {
    const normalizedPath = normalizePathForSandbox(pathPattern);

    if (containsGlobChars(normalizedPath)) {
      rules.push(buildRule("deny", "file-write-unlink", "regex", globToRegex(normalizedPath)));

      const staticPrefix = normalizedPath.split(/[*?[\]]/)[0];
      if (!staticPrefix || staticPrefix === "/") continue;

      const baseDir = staticPrefix.endsWith("/")
        ? staticPrefix.slice(0, -1)
        : dirname(staticPrefix);
      rules.push(buildRule("deny", "file-write-unlink", "literal", baseDir));

      for (const ancestorDir of getAncestorDirectories(baseDir)) {
        rules.push(buildRule("deny", "file-write-unlink", "literal", ancestorDir));
      }

      continue;
    }

    rules.push(buildRule("deny", "file-write-unlink", "subpath", normalizedPath));
    for (const ancestorDir of getAncestorDirectories(normalizedPath)) {
      rules.push(buildRule("deny", "file-write-unlink", "literal", ancestorDir));
    }
  }

  return rules;
}

function buildReadPolicy(readConfig: SandboxReadConfig): string {
  const rules = ["; allow read-only file operations", "(allow file-read*)"];

  for (const pathPattern of uniquePaths(readConfig.denyOnly ?? [])) {
    rules.push(...buildPathRules("deny", "file-read*", pathPattern));
  }

  return rules.join("\n");
}

function buildWritePolicy(writeConfig: SandboxWriteConfig): string {
  const rules = ["; allow write operations"];
  const allowOnly = uniquePaths(writeConfig.allowOnly ?? []);
  const denyWithinAllow = uniquePaths(writeConfig.denyWithinAllow ?? []);

  for (const pathPattern of allowOnly) {
    rules.push(...buildPathRules("allow", "file-write*", pathPattern));
  }

  for (const pathPattern of denyWithinAllow) {
    rules.push(...buildPathRules("deny", "file-write*", pathPattern));
  }

  rules.push(...buildMoveBlockingRules(denyWithinAllow));
  return rules.join("\n");
}

function buildNetworkPolicy(
  policyParts: CodexPolicyParts,
  allowNetwork: boolean,
): {
  policy: string;
  darwinUserCacheDir?: string;
} {
  if (!allowNetwork) return { policy: "" };

  const darwinUserCacheDir = getDarwinUserCacheDir();
  const codexNetworkPolicy = darwinUserCacheDir
    ? policyParts.network
    : policyParts.network.replace(DARWIN_USER_CACHE_RULE, "").trim();

  return {
    policy: ["(allow network-outbound)", "(allow network-inbound)", codexNetworkPolicy]
      .filter(Boolean)
      .join("\n"),
    darwinUserCacheDir,
  };
}

export function createMacOsSeatbeltLaunchSpec(
  options: CreateMacOsSeatbeltLaunchSpecOptions,
): MacOsSeatbeltLaunchSpec | null {
  if (process.platform !== "darwin") return null;
  if (!existsSync(SANDBOX_EXECUTABLE)) return null;

  const policyParts = loadCodexPolicyParts();
  if (!policyParts) return null;

  const networkPolicy = buildNetworkPolicy(policyParts, options.allowNetwork);
  const fullPolicy = [
    policyParts.base,
    buildReadPolicy(options.readConfig),
    buildWritePolicy(options.writeConfig),
    networkPolicy.policy,
    policyParts.defaults,
  ]
    .filter(Boolean)
    .join("\n");

  const args = ["-p", fullPolicy];
  if (networkPolicy.darwinUserCacheDir) {
    args.push(`-DDARWIN_USER_CACHE_DIR=${networkPolicy.darwinUserCacheDir}`);
  }

  args.push("--", "/bin/bash", "-lc", options.command);
  return { program: SANDBOX_EXECUTABLE, args };
}
