#!/usr/bin/env node
/**
 * todoist-v1-mcp-server
 *
 * MCP server for Todoist API v1. Provides tools for managing tasks, projects,
 * sections, and labels via natural language through AI agents like Claude.
 *
 * Built on the Todoist unified API v1 (https://developer.todoist.com/api/v1/).
 * Uses the modern MCP SDK registerTool() API with stdio transport.
 *
 * Configuration:
 *   TODOIST_API_TOKEN — your Todoist API token (required)
 *     Get it at: https://todoist.com/app/settings/integrations/developer
 *
 * Usage in claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "todoist": {
 *         "command": "node",
 *         "args": ["/path/to/todoist-mcp-server/dist/index.js"],
 *         "env": { "TODOIST_API_TOKEN": "your_token_here" }
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initClient } from "./client.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerSectionTools } from "./tools/sections.js";
import { registerLabelTools } from "./tools/labels.js";
import { registerCommentTools } from "./tools/comments.js";
import { registerCompletedTaskTools } from "./tools/completed.js";
import { registerReminderTools } from "./tools/reminders.js";

// ─── Startup validation ───────────────────────────────────────────────────────

const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN;

if (!TODOIST_API_TOKEN) {
  console.error(
    "ERROR: TODOIST_API_TOKEN environment variable is required.\n" +
      "Get your token at: https://todoist.com/app/settings/integrations/developer"
  );
  process.exit(1);
}

// ─── Server initialization ────────────────────────────────────────────────────

const server = new McpServer({
  name: "todoist-v1-mcp-server",
  version: "1.0.0",
});

// Initialize the HTTP client with the API token
initClient(TODOIST_API_TOKEN);

// Register all tool domains
registerTaskTools(server);
registerProjectTools(server);
registerSectionTools(server);
registerLabelTools(server);
registerCommentTools(server);
registerCompletedTaskTools(server);
registerReminderTools(server);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("todoist-v1-mcp-server running (stdio). 31 tools registered.");
}

main().catch((error: unknown) => {
  console.error("Fatal error starting todoist-v1-mcp-server:", error);
  process.exit(1);
});

// Belt-and-suspenders: catch any async errors that escape tool try-catch blocks
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in todoist-v1-mcp-server:", reason);
});
