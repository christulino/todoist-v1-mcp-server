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
export {};
//# sourceMappingURL=index.d.ts.map