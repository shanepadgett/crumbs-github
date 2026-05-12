# MCP Extension

Loads MCP servers and exposes their tools inside Pi.

## User-facing surface

- `/mcp` opens server/tool management UI.
- `/mcp reconnect [server]` reconnects all servers or one server.
- MCP tools from enabled servers register as Pi tools.

## How it works

The extension reads MCP server config from project/global crumbs config and MCP config files, connects over stdio or HTTP, caches discovered tools, and gates servers by Caveman powers when configured.
