/**
 * Subagents Extension
 *
 * What it does: adds `subagent` tool and `/subagents` commands for focused child agents.
 * How to use it: call `subagent` with `agent` and `task`, or run `/subagents list`.
 * Example: `subagent({ agent: "scout", task: "Map repo structure." })`
 */

export { default } from "./src/extension.js";
