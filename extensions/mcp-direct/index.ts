/**
 * MCP Direct Extension
 *
 * What it does:
 * - Loads MCP servers from `.pi/mcp.json` and `~/.pi/agent/mcp.json`.
 * - Connects with stdio for local servers and Streamable HTTP (with SSE fallback) for remote servers.
 * - Registers discovered MCP tools directly as Pi tools.
 *
 * How to use it:
 * - Add server entries under `mcpServers` in config.
 * - Use `/mcp-direct` to view status.
 * - Use `/mcp-direct reconnect [server]` to reconnect.
 *
 * Example:
 * - `{"mcpServers":{"exa":{"url":"https://mcp.exa.ai/mcp","lifecycle":"eager"}}}`
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { errorMessage, LOG_PREFIX, type ServerState } from "./shared.js";
import { connectAndDiscover, loadServersConfig } from "./config.js";
import { registerServerTool } from "./tools.js";

export default function mcpDirectExtension(pi: ExtensionAPI): void {
  const servers = new Map<string, ServerState>();
  const registeredTools = new Set<string>();
  const toolOwners = new Map<string, string>();

  function releaseServerTools(name: string): void {
    const state = servers.get(name);
    if (!state) return;

    for (const toolName of state.tools) {
      if (toolOwners.get(toolName) === name) {
        toolOwners.delete(toolName);
        registeredTools.delete(toolName);
      }
    }
  }

  async function connectServer(name: string, cwd: string): Promise<string[]> {
    const current = servers.get(name);
    if (current) {
      releaseServerTools(name);
      await current.client.close();
      servers.delete(name);
    }

    const config = loadServersConfig(cwd)[name];
    if (!config) throw new Error(`Unknown server: ${name}`);

    const { client, tools } = await connectAndDiscover(name, config);
    const toolNames = tools.map((tool) => tool.name);
    servers.set(name, { client, config, tools: toolNames });

    for (const tool of tools) {
      if (registeredTools.has(tool.name)) {
        console.warn(
          `${LOG_PREFIX} Tool "${tool.name}" already owned by "${toolOwners.get(tool.name)}", skipping "${name}"`,
        );
        continue;
      }
      registeredTools.add(tool.name);
      toolOwners.set(tool.name, name);
      registerServerTool(pi, tool, name, servers);
    }

    return toolNames;
  }

  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "startup" && event.reason !== "reload") return;

    const config = loadServersConfig(ctx.cwd);
    const entries = Object.entries(config);
    if (entries.length === 0) return;

    const results = await Promise.allSettled(
      entries.map(async ([name]) => {
        const toolNames = await connectServer(name, ctx.cwd);
        const state = servers.get(name);
        if (state && state.config.lifecycle !== "eager") {
          await state.client.close();
        }
        return { name, toolCount: toolNames.length };
      }),
    );

    const lines: string[] = [];
    let hasError = false;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const name = entries[i][0];
      if (result.status === "fulfilled") {
        lines.push(`  ✓ ${name}: ${result.value.toolCount} tools`);
      } else {
        hasError = true;
        lines.push(`  ✗ ${name}: ${errorMessage(result.reason)}`);
      }
    }

    ctx.ui.notify(`${LOG_PREFIX}\n${lines.join("\n")}`, hasError ? "error" : "info");
  });

  pi.on("session_shutdown", async () => {
    for (const server of servers.values()) {
      await server.client.close();
    }
    servers.clear();
    registeredTools.clear();
    toolOwners.clear();
  });

  pi.registerCommand("mcp-direct", {
    description: "MCP direct status and reconnect. Usage: /mcp-direct [reconnect [server]]",
    getArgumentCompletions(prefix) {
      const trimmed = prefix.trimStart();

      if (!trimmed.includes(" ")) {
        const items = [
          {
            value: "reconnect",
            label: "reconnect",
            description: "Reconnect MCP server(s)",
          },
        ];
        const filtered = items.filter((item) => item.value.startsWith(trimmed));
        return filtered.length > 0 ? filtered : null;
      }

      const parts = trimmed.split(/\s+/);
      if (parts[0] === "reconnect" && parts.length <= 2) {
        const serverPrefix = parts[1] ?? "";
        const config = loadServersConfig(process.cwd());
        const items = Object.keys(config).map((name) => {
          const connected = servers.get(name)?.client.connected ?? false;
          return {
            value: `reconnect ${name}`,
            label: name,
            description: connected ? "connected" : "disconnected",
          };
        });
        const filtered = items.filter((item) => item.label.startsWith(serverPrefix));
        return filtered.length > 0 ? filtered : null;
      }

      return null;
    },
    handler: async (args, ctx) => {
      const [subcommand, target] = (args ?? "").trim().split(/\s+/).filter(Boolean);
      const config = loadServersConfig(ctx.cwd);

      if (subcommand === "reconnect") {
        const targets = target ? [target] : Object.keys(config);

        if (target && !config[target]) {
          ctx.ui.notify(`${LOG_PREFIX} Unknown server: ${target}`, "error");
          return;
        }

        for (const name of targets) {
          try {
            const tools = await connectServer(name, ctx.cwd);
            ctx.ui.notify(`${LOG_PREFIX} ${name}: connected (${tools.length} tools)`, "info");
          } catch (error) {
            ctx.ui.notify(`${LOG_PREFIX} ${name}: ${errorMessage(error)}`, "error");
          }
        }
        return;
      }

      const names = Object.keys(config);
      if (names.length === 0) {
        ctx.ui.notify(`${LOG_PREFIX} No servers configured`, "info");
        return;
      }

      const lines = names.map((name) => {
        const state = servers.get(name);
        const connected = state?.client.connected ? "✓ connected" : "○ disconnected";
        const count = state?.tools.length ?? 0;
        const mode = config[name].mode;
        const lifecycle = config[name].lifecycle;
        return `  ${connected}  ${name} (${count} tools, ${mode}, ${lifecycle})`;
      });

      ctx.ui.notify(["MCP Direct Servers:", ...lines].join("\n"), "info");
    },
  });
}
