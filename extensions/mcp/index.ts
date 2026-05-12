/**
 * MCP Extension
 *
 * What it does: loads MCP servers, registers discovered tools, and adds `/mcp` management UI.
 * How to use it: configure `mcpServers`, then run `/mcp` or `/mcp reconnect [server]`.
 * Example: `/mcp`
 */

export { default } from "./src/extension.js";
