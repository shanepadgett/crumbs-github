import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DirectMcpClient } from "./client.js";
import { type McpTool, type ServerConfig } from "./shared.js";

interface RawServerConfig {
  enabled?: boolean;
  lifecycle?: "lazy" | "eager";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  serverUrl?: string;
  headers?: Record<string, string>;
  bearerToken?: string;
  bearerTokenEnv?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeServerConfig(raw: RawServerConfig): ServerConfig | null {
  if (raw.enabled === false) return null;

  const lifecycle = raw.lifecycle === "eager" ? "eager" : "lazy";
  if (typeof raw.command === "string" && raw.command.trim()) {
    return {
      mode: "stdio",
      lifecycle,
      command: raw.command,
      args: Array.isArray(raw.args) ? raw.args.filter((x) => typeof x === "string") : [],
      env: raw.env,
      cwd: raw.cwd,
    };
  }

  const url = raw.url ?? raw.serverUrl;
  if (typeof url === "string" && url.trim()) {
    return {
      mode: "http",
      lifecycle,
      url,
      headers: raw.headers,
      bearerToken: raw.bearerToken,
      bearerTokenEnv: raw.bearerTokenEnv,
    };
  }

  return null;
}

function readConfigFile(path: string): Record<string, RawServerConfig> {
  if (!existsSync(path)) return {};

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      mcpServers?: Record<string, RawServerConfig>;
    };
    return parsed.mcpServers ?? {};
  } catch {
    return {};
  }
}

function readCrumbsMcpServers(cwd: string): Record<string, RawServerConfig> {
  const path = resolve(cwd, ".pi", "crumbs.json");
  if (!existsSync(path)) return {};

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const root = asRecord(parsed);
    const rootServers = asRecord(root?.mcpServers);
    const extensions = asRecord(root?.extensions);
    const mcpDirect = asRecord(extensions?.mcpDirect);
    const extensionServers = asRecord(mcpDirect?.mcpServers);

    return {
      ...(rootServers as Record<string, RawServerConfig> | undefined),
      ...(extensionServers as Record<string, RawServerConfig> | undefined),
    };
  } catch {
    return {};
  }
}

export function loadServersConfig(cwd: string): Record<string, ServerConfig> {
  const globalConfig = readConfigFile(join(homedir(), ".pi", "agent", "mcp.json"));
  const projectConfig = readConfigFile(resolve(cwd, ".pi", "mcp.json"));
  const crumbsConfig = readCrumbsMcpServers(cwd);

  const mergedRaw = { ...globalConfig, ...projectConfig, ...crumbsConfig };
  const normalized: Record<string, ServerConfig> = {};

  for (const [name, raw] of Object.entries(mergedRaw)) {
    const config = normalizeServerConfig(raw);
    if (config) normalized[name] = config;
  }

  return normalized;
}

export async function connectAndDiscover(
  name: string,
  config: ServerConfig,
): Promise<{ client: DirectMcpClient; tools: McpTool[] }> {
  const client = new DirectMcpClient();
  await client.connect(name, config);
  const tools = await client.listTools();
  return { client, tools };
}
