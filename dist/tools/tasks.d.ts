/**
 * Task-related MCP tools for Todoist API v1.
 *
 * Tools:
 *   todoist_get_tasks    — list/filter tasks
 *   todoist_get_task     — get single task by ID
 *   todoist_create_task  — create a new task
 *   todoist_update_task  — update an existing task
 *   todoist_complete_task — mark task as done
 *   todoist_reopen_task  — reopen a completed task
 *   todoist_delete_task  — permanently delete a task
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export declare function registerTaskTools(server: McpServer): void;
//# sourceMappingURL=tasks.d.ts.map