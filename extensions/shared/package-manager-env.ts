import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_SANDBOX_TMPDIR = "/tmp/claude";

function trimTrailingSlash(value: string): string {
  if (value === "/") return value;
  return value.replace(/\/+$/, "");
}

export function getSandboxTempDir(): string {
  const configured = process.env.CLAUDE_TMPDIR?.trim();
  if (!configured) return DEFAULT_SANDBOX_TMPDIR;
  return trimTrailingSlash(configured);
}

export function getPackageManagerEnvironment(): Record<string, string> {
  const tmpdir = getSandboxTempDir();
  const npmCacheDir = join(tmpdir, "npm-cache");

  return {
    TMPDIR: tmpdir,
    BUN_INSTALL_CACHE_DIR: join(tmpdir, "bun-install-cache"),
    XDG_CACHE_HOME: join(tmpdir, "xdg-cache"),
    NPM_CONFIG_CACHE: npmCacheDir,
    npm_config_cache: npmCacheDir,
  };
}

export function ensurePackageManagerDirectories(): void {
  for (const directory of new Set(Object.values(getPackageManagerEnvironment()))) {
    try {
      mkdirSync(directory, { recursive: true });
    } catch {
      // Best effort only. Commands can still create nested paths later.
    }
  }
}

export function wrapCommandWithPackageManagerEnvironment(command: string, args: string[]) {
  const env = getPackageManagerEnvironment();
  return {
    command: "env",
    args: [...Object.entries(env).map(([key, value]) => `${key}=${value}`), command, ...args],
  };
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function formatCommandForDisplay(command: string, args: string[]): string {
  return [command, ...args].map(shellQuote).join(" ");
}
