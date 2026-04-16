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
import { z } from "zod";
import { apiGet, apiPost, apiDelete, handleApiError } from "../client.js";
import { ResponseFormat, CHARACTER_LIMIT, TaskPriority } from "../constants.js";
// ─── Shared schemas ──────────────────────────────────────────────────────────
const responseFormatSchema = z
    .nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable, 'json' for machine-readable");
const prioritySchema = z
    .nativeEnum(TaskPriority)
    .optional()
    .describe("Task priority: 1=normal, 2=medium, 3=high, 4=urgent");
// ─── Formatting helpers ───────────────────────────────────────────────────────
const PRIORITY_LABELS = {
    1: "normal",
    2: "medium",
    3: "high",
    4: "urgent",
};
function formatTask(task) {
    const lines = [];
    lines.push(`### ${task.content} (ID: ${task.id})`);
    if (task.description) {
        // Prefix every line with > so multi-line descriptions render correctly as blockquotes
        lines.push(task.description.split("\n").map((l) => `> ${l}`).join("\n"));
    }
    if (task.due)
        lines.push(`- **Due**: ${task.due.string ?? task.due.date}`);
    if (task.priority > 1)
        lines.push(`- **Priority**: ${PRIORITY_LABELS[task.priority] ?? task.priority}`);
    if (task.labels?.length)
        lines.push(`- **Labels**: ${task.labels.join(", ")}`);
    if (task.project_id)
        lines.push(`- **Project ID**: ${task.project_id}`);
    if (task.section_id)
        lines.push(`- **Section ID**: ${task.section_id}`);
    if (task.url)
        lines.push(`- **URL**: ${task.url}`);
    return lines.join("\n");
}
function formatTaskList(tasks, title) {
    if (!tasks.length)
        return `No tasks found.`;
    const lines = [`# ${title}`, ``, `Found ${tasks.length} task(s)`, ``];
    for (const task of tasks) {
        lines.push(formatTask(task));
        lines.push("");
    }
    return lines.join("\n");
}
// ─── Tool registration ────────────────────────────────────────────────────────
export function registerTaskTools(server) {
    // ── todoist_get_tasks ───────────────────────────────────────────────────────
    server.registerTool("todoist_get_tasks", {
        title: "Get Todoist Tasks",
        description: `List and filter tasks from Todoist.

Use the \`filter\` parameter for powerful natural-language Todoist filters:
  - "today"       → tasks due today
  - "overdue"     → past-due tasks
  - "7 days"      → due in the next 7 days
  - "p1"          → priority 1 (urgent)
  - "#Work"       → tasks in project named Work
  - "@waiting"    → tasks with label 'waiting'
  - "no due date" → tasks with no due date
  - Combine with & (AND), | (OR): "today | overdue"

Alternatively, filter by project_id, section_id, or label directly.

Returns task IDs, content, due dates, priorities, labels, and project/section IDs.`,
        inputSchema: z.object({
            filter: z
                .string()
                .optional()
                .describe("Todoist filter string, e.g. 'today', 'overdue', 'p1', '#ProjectName', '@label', '7 days'"),
            project_id: z
                .string()
                .optional()
                .describe("Filter tasks by project ID"),
            section_id: z
                .string()
                .optional()
                .describe("Filter tasks by section ID"),
            label: z
                .string()
                .optional()
                .describe("Filter tasks by label name (exact match)"),
            cursor: z
                .string()
                .optional()
                .describe("Pagination cursor from a previous response's next_cursor"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(200)
                .default(50)
                .describe("Maximum number of tasks to return (1–200, default 50)"),
            response_format: responseFormatSchema,
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const query = { limit: params.limit };
            if (params.filter)
                query.filter = params.filter;
            if (params.project_id)
                query.project_id = params.project_id;
            if (params.section_id)
                query.section_id = params.section_id;
            if (params.label)
                query.label = params.label;
            if (params.cursor)
                query.cursor = params.cursor;
            const data = await apiGet("/tasks", query);
            // API v1 may return { items: [...] } or { results: [...] } or a direct array
            const tasks = Array.isArray(data)
                ? data
                : (data.items ?? data.results ?? []);
            const output = {
                count: tasks.length,
                next_cursor: data.next_cursor ?? null,
                has_more: !!data.next_cursor,
                tasks,
            };
            let text;
            if (params.response_format === ResponseFormat.JSON) {
                text = JSON.stringify(output, null, 2);
            }
            else {
                const filterDesc = params.filter
                    ? `Filter: "${params.filter}"`
                    : params.project_id
                        ? `Project: ${params.project_id}`
                        : "All tasks";
                text = formatTaskList(tasks, filterDesc);
                if (data.next_cursor) {
                    text += `\n\n_More tasks available. Use cursor: \`${data.next_cursor}\`_`;
                }
            }
            if (text.length > CHARACTER_LIMIT) {
                text =
                    text.slice(0, CHARACTER_LIMIT) +
                        `\n\n[Response truncated. Use 'limit' or a more specific 'filter' to narrow results.]`;
            }
            return { content: [{ type: "text", text }] };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: handleApiError(error) }],
            };
        }
    });
    // ── todoist_get_task ────────────────────────────────────────────────────────
    server.registerTool("todoist_get_task", {
        title: "Get Todoist Task",
        description: `Retrieve a single Todoist task by its ID.

Returns full task details: content, description, due date, priority, labels,
project/section IDs, comment count, and creation timestamp.`,
        inputSchema: z.object({
            task_id: z.string().min(1).describe("The task ID to retrieve"),
            response_format: responseFormatSchema,
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const task = await apiGet(`/tasks/${params.task_id}`);
            let text;
            if (params.response_format === ResponseFormat.JSON) {
                text = JSON.stringify(task, null, 2);
            }
            else {
                text = [`# Task Details`, "", formatTask(task)].join("\n");
            }
            return { content: [{ type: "text", text }] };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: handleApiError(error) }],
            };
        }
    });
    // ── todoist_create_task ─────────────────────────────────────────────────────
    server.registerTool("todoist_create_task", {
        title: "Create Todoist Task",
        description: `Create a new task in Todoist.

The \`due_string\` field supports natural language: "tomorrow", "every monday",
"Feb 20", "next week", "in 3 hours", etc.

Priority levels: 1=normal (default), 2=medium, 3=high, 4=urgent.

Returns the full created task object including its assigned ID.`,
        inputSchema: z.object({
            content: z
                .string()
                .min(1)
                .max(500)
                .describe("Task name/content (required)"),
            description: z
                .string()
                .max(16383)
                .optional()
                .describe("Optional longer description or notes for the task"),
            project_id: z
                .string()
                .optional()
                .describe("Project ID to add the task to (defaults to Inbox if omitted)"),
            section_id: z
                .string()
                .optional()
                .describe("Section ID within the project"),
            parent_id: z
                .string()
                .optional()
                .describe("Parent task ID to create this as a subtask"),
            due_string: z
                .string()
                .optional()
                .describe("Natural language due date: 'tomorrow', 'every monday', 'Feb 20', 'next week'"),
            due_date: z
                .string()
                .optional()
                .describe("Specific due date in YYYY-MM-DD format (e.g. '2025-06-15')"),
            priority: prioritySchema,
            labels: z
                .array(z.string())
                .optional()
                .describe("Array of label names to apply to the task"),
            order: z
                .number()
                .int()
                .optional()
                .describe("Sort order within the project/section"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const body = { content: params.content };
            if (params.description)
                body.description = params.description;
            if (params.project_id)
                body.project_id = params.project_id;
            if (params.section_id)
                body.section_id = params.section_id;
            if (params.parent_id)
                body.parent_id = params.parent_id;
            if (params.due_string)
                body.due_string = params.due_string;
            if (params.due_date)
                body.due_date = params.due_date;
            if (params.priority !== undefined)
                body.priority = params.priority;
            if (params.labels)
                body.labels = params.labels;
            if (params.order !== undefined)
                body.order = params.order;
            const task = await apiPost("/tasks", body);
            const text = [
                `# Task Created ✓`,
                ``,
                formatTask(task),
            ].join("\n");
            return { content: [{ type: "text", text }] };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: handleApiError(error) }],
            };
        }
    });
    // ── todoist_update_task ─────────────────────────────────────────────────────
    server.registerTool("todoist_update_task", {
        title: "Update Todoist Task",
        description: `Update an existing Todoist task.

Only include the fields you want to change — all fields are optional.
To clear a due date, pass clear_due_date: true (sends due_string: "no date" — empty string is silently ignored and due: null returns 400).
To remove all labels, pass labels as an empty array [].

Priority: 1=normal, 2=medium, 3=high, 4=urgent.`,
        inputSchema: z.object({
            task_id: z.string().min(1).describe("ID of the task to update"),
            content: z.string().min(1).max(500).optional().describe("New task name"),
            description: z
                .string()
                .max(16383)
                .optional()
                .describe("New description/notes"),
            clear_due_date: z
                .boolean()
                .optional()
                .describe("Set to true to remove the due date entirely"),
            due_string: z
                .string()
                .optional()
                .describe("New due date as natural language: 'tomorrow', 'next monday', 'Feb 20', etc."),
            due_date: z
                .string()
                .optional()
                .describe("New due date in YYYY-MM-DD format"),
            priority: prioritySchema,
            labels: z
                .array(z.string())
                .optional()
                .describe("Replacement label list (replaces all existing labels)"),
            project_id: z
                .string()
                .optional()
                .describe("Move task to a different project"),
            section_id: z
                .string()
                .optional()
                .describe("Move task to a different section"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const body = {};
            if (params.content !== undefined)
                body.content = params.content;
            if (params.description !== undefined)
                body.description = params.description;
            // clear_due_date takes precedence; use Todoist's NLP phrase — "due: null" returns 400
            if (params.clear_due_date) {
                body.due_string = "no date";
            }
            else if (params.due_string) {
                body.due_string = params.due_string;
            }
            else if (params.due_date !== undefined) {
                body.due_date = params.due_date;
            }
            if (params.priority !== undefined)
                body.priority = params.priority;
            if (params.labels !== undefined)
                body.labels = params.labels;
            if (params.project_id !== undefined)
                body.project_id = params.project_id;
            if (params.section_id !== undefined)
                body.section_id = params.section_id;
            if (Object.keys(body).length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Error: No fields provided to update. Include at least one field to change.",
                        },
                    ],
                };
            }
            const task = await apiPost(`/tasks/${params.task_id}`, body);
            const text = [
                `# Task Updated ✓`,
                ``,
                formatTask(task),
            ].join("\n");
            return { content: [{ type: "text", text }] };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: handleApiError(error) }],
            };
        }
    });
    // ── todoist_complete_task ───────────────────────────────────────────────────
    server.registerTool("todoist_complete_task", {
        title: "Complete Todoist Task",
        description: `Mark a Todoist task as completed (close it).

This is the standard way to check off a task. For recurring tasks, this advances
to the next occurrence rather than permanently removing it.

Use todoist_delete_task to permanently remove a task instead.`,
        inputSchema: z.object({
            task_id: z.string().min(1).describe("ID of the task to mark as done"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await apiPost(`/tasks/${params.task_id}/close`);
            return {
                content: [
                    {
                        type: "text",
                        text: `Task ${params.task_id} marked as complete ✓`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: handleApiError(error) }],
            };
        }
    });
    // ── todoist_reopen_task ─────────────────────────────────────────────────────
    server.registerTool("todoist_reopen_task", {
        title: "Reopen Todoist Task",
        description: `Reopen (uncomplete) a previously completed Todoist task.

Useful for tasks that were marked done by mistake or need to be revisited.`,
        inputSchema: z.object({
            task_id: z.string().min(1).describe("ID of the completed task to reopen"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await apiPost(`/tasks/${params.task_id}/reopen`);
            return {
                content: [
                    {
                        type: "text",
                        text: `Task ${params.task_id} reopened ✓`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: handleApiError(error) }],
            };
        }
    });
    // ── todoist_delete_task ─────────────────────────────────────────────────────
    server.registerTool("todoist_delete_task", {
        title: "Delete Todoist Task",
        description: `Permanently delete a Todoist task. This action cannot be undone.

For recurring tasks or tasks you just want to mark as done, use
todoist_complete_task instead.`,
        inputSchema: z.object({
            task_id: z
                .string()
                .min(1)
                .describe("ID of the task to permanently delete"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await apiDelete(`/tasks/${params.task_id}`);
            return {
                content: [
                    {
                        type: "text",
                        text: `Task ${params.task_id} permanently deleted.`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                isError: true,
                content: [{ type: "text", text: handleApiError(error) }],
            };
        }
    });
}
//# sourceMappingURL=tasks.js.map