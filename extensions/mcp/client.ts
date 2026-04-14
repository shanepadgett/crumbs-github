import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type McpClient, type McpTool, resolveRecord, type ServerConfig } from "./shared.js";

type AnyTransport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

function shouldFallbackToSse(error: unknown): boolean {
  const code = (error as StreamableHTTPError | undefined)?.code;
  return typeof code === "number" && code >= 400 && code < 500;
}

export class DirectMcpClient implements McpClient {
  private client: Client | null = null;
  private transport: AnyTransport | null = null;
  private _connected = false;

  async connect(name: string, config: ServerConfig): Promise<void> {
    await this.close();

    this.client = new Client({ name: `crumbs-mcp-${name}`, version: "0.1.0" });
    this.client.onclose = () => {
      this._connected = false;
    };

    if (config.mode === "stdio") {
      this.transport = new StdioClientTransport({
        command: config.command ?? "",
        args: config.args ?? [],
        cwd: config.cwd,
        env: {
          ...Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          ),
          ...resolveRecord(config.env),
        },
        stderr: "ignore",
      });
      await this.client.connect(this.transport);
      this._connected = true;
      return;
    }

    const headers = resolveRecord(config.headers);
    const token =
      config.bearerToken?.trim() ||
      (config.bearerTokenEnv ? process.env[config.bearerTokenEnv]?.trim() : undefined);

    if (token && !headers.authorization && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = new URL(config.url ?? "");
    const requestInit = Object.keys(headers).length > 0 ? { headers } : undefined;

    try {
      this.transport = new StreamableHTTPClientTransport(url, { requestInit });
      await this.client.connect(this.transport);
      this._connected = true;
    } catch (error) {
      if (!shouldFallbackToSse(error)) throw error;
      this.transport = new SSEClientTransport(url, { requestInit });
      await this.client.connect(this.transport);
      this._connected = true;
    }
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.client) throw new Error("Not connected");
    const tools: McpTool[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.client.listTools(cursor ? { cursor } : undefined);
      for (const tool of result.tools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
        });
      }
      cursor = result.nextCursor;
    } while (cursor);

    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    if (!this.client) throw new Error("Not connected");
    const result = await this.client.callTool({ name, arguments: args });
    return result as CallToolResult;
  }

  async close(): Promise<void> {
    this._connected = false;
    if (this.transport instanceof StreamableHTTPClientTransport) {
      await this.transport.terminateSession().catch(() => {});
    }
    await this.client?.close().catch(() => {});
    await this.transport?.close().catch(() => {});
    this.client = null;
    this.transport = null;
  }

  get connected(): boolean {
    return this._connected;
  }
}
