/**
 * Reminder MCP tools for Todoist API v1.
 *
 * Reminders are time-based notifications attached to a task. Two flavors:
 *   • relative — fires `minute_offset` minutes BEFORE the task's due date/time.
 *   • absolute — fires at a specific moment defined by the `due` object.
 *
 * NOTE on field naming: the API uses `reminder_type` (not `type`) and
 * `minute_offset` (not `mm_offset`), and the absolute trigger is a `due`
 * object — NOT a flat `due_date`. Don't be misled by the original spec.
 *
 * Pro-only: reminders require a Todoist Pro subscription. The shared client's
 * handleApiError detects Pro-gate errors and returns a clean message.
 *
 * Tools:
 *   todoist_get_reminders    — list reminders (optionally filter by task_id)
 *   todoist_get_reminder     — get a single reminder by ID
 *   todoist_create_reminder  — add a reminder to a task
 *   todoist_update_reminder  — modify timing or service of an existing reminder
 *   todoist_delete_reminder  — permanently delete a reminder
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost, apiDelete, handleApiError } from "../client.js";
import { ResponseFormat } from "../constants.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Reminder {
  id: string;
  task_id?: string;
  notify_uid?: string;
  type?: "relative" | "absolute" | string;
  minute_offset?: number | null;
  due?: {
    string?: string;
    date?: string;
    lang?: string;
    timezone?: string | null;
  } | null;
  service?: "email" | "push" | string | null;
  is_deleted?: boolean;
  is_urgent?: boolean;
  [key: string]: unknown;
}

interface ReminderListResponse {
  results?: Reminder[];
  items?: Reminder[];
  next_cursor?: string | null;
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatReminder(r: Reminder): string {
  const parts = [`**${r.id}**`];
  if (r.task_id) parts.push(`task: ${r.task_id}`);
  if (r.type) parts.push(`type: ${r.type}`);
  if (r.minute_offset != null) parts.push(`offset: ${r.minute_offset}m`);
  if (r.due?.string) parts.push(`due: ${r.due.string}`);
  else if (r.due?.date) parts.push(`due: ${r.due.date}`);
  if (r.service) parts.push(`via: ${r.service}`);
  return `- ${parts.join(" — ")}`;
}

/**
 * Build the absolute-reminder `due` object from flat input fields.
 * Returns undefined if no due-related fields were provided.
 */
function buildDue(params: {
  due_string?: string;
  due_datetime?: string;
  due_date?: string;
  due_lang?: string;
  due_timezone?: string;
}): Record<string, unknown> | undefined {
  const due: Record<string, unknown> = {};
  if (params.due_string) due.string = params.due_string;
  // The API's `due.date` field accepts both ISO date ("2026-04-20") and
  // ISO datetime ("2026-04-20T15:00:00Z"). Datetime takes precedence if both given.
  const dateValue = params.due_datetime ?? params.due_date;
  if (dateValue) due.date = dateValue;
  if (params.due_lang) due.lang = params.due_lang;
  if (params.due_timezone) due.timezone = params.due_timezone;
  return Object.keys(due).length > 0 ? due : undefined;
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerReminderTools(server: McpServer): void {
  // ── todoist_get_reminders ───────────────────────────────────────────────────
  server.registerTool(
    "todoist_get_reminders",
    {
      title: "Get Todoist Reminders",
      description: `List reminders. Pro-only feature.

Without filters, returns all reminders the user has set. Pass task_id to scope
results to a single task. Results are paginated via next_cursor.`,
      inputSchema: z.object({
        task_id: z
          .string()
          .min(1)
          .optional()
          .describe("Optional task ID to scope reminders"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Max reminders per page (1–200, default 50)"),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor from a prior call"),
        response_format: z
          .nativeEnum(ResponseFormat)
          .default(ResponseFormat.MARKDOWN)
          .describe("'markdown' for human-readable, 'json' for machine-readable"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const query: Record<string, unknown> = { limit: params.limit };
        if (params.task_id) query.task_id = params.task_id;
        if (params.cursor) query.cursor = params.cursor;

        const data = await apiGet<ReminderListResponse | Reminder[]>(
          "/reminders",
          query
        );
        const reminders: Reminder[] = Array.isArray(data)
          ? data
          : (data.results ?? data.items ?? []);
        const nextCursor: string | null = Array.isArray(data)
          ? null
          : (data.next_cursor ?? null);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify(
            { count: reminders.length, next_cursor: nextCursor, reminders },
            null,
            2
          );
        } else {
          if (!reminders.length) {
            text = params.task_id
              ? `No reminders on task ${params.task_id}.`
              : `No reminders set.`;
          } else {
            const scope = params.task_id ? ` on task ${params.task_id}` : "";
            const lines = [`# Reminders${scope} (${reminders.length})`, ""];
            for (const r of reminders) lines.push(formatReminder(r));
            if (nextCursor) {
              lines.push("", `_more results available — pass cursor=${nextCursor}_`);
            }
            text = lines.join("\n");
          }
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── todoist_get_reminder ────────────────────────────────────────────────────
  server.registerTool(
    "todoist_get_reminder",
    {
      title: "Get Todoist Reminder",
      description: `Retrieve a single reminder by its ID. Pro-only feature.`,
      inputSchema: z.object({
        reminder_id: z.string().min(1).describe("ID of the reminder to retrieve"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const r = await apiGet<Reminder>(`/reminders/${params.reminder_id}`);
        return {
          content: [{ type: "text", text: formatReminder(r) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── todoist_create_reminder ─────────────────────────────────────────────────
  server.registerTool(
    "todoist_create_reminder",
    {
      title: "Create Todoist Reminder",
      description: `Set a reminder on a task. Pro-only feature.

Two modes:
  • reminder_type='relative' (default): provide minute_offset — fires N minutes
    before the task's due time. Task must already have a due time.
  • reminder_type='absolute': provide one of due_string ("tomorrow at 3pm"),
    due_datetime (ISO 8601), or due_date (ISO date). Optional due_lang/due_timezone.

Optional service controls delivery channel ('email' or 'push').`,
      inputSchema: z.object({
        task_id: z.string().min(1).describe("Task to attach the reminder to"),
        reminder_type: z
          .enum(["relative", "absolute"])
          .default("relative")
          .describe("'relative' (offset before due) or 'absolute' (specific time)"),
        minute_offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Minutes before the task's due time to fire. Use with reminder_type='relative'."
          ),
        due_string: z
          .string()
          .optional()
          .describe(
            "Natural-language trigger time (e.g. 'tomorrow at 3pm'). Use with reminder_type='absolute'."
          ),
        due_datetime: z
          .string()
          .optional()
          .describe(
            "ISO 8601 datetime trigger (e.g. '2026-04-20T15:00:00Z'). Use with reminder_type='absolute'."
          ),
        due_date: z
          .string()
          .optional()
          .describe(
            "ISO date trigger (e.g. '2026-04-20'). Use with reminder_type='absolute'."
          ),
        due_lang: z
          .string()
          .optional()
          .describe("Language for due_string parsing (e.g. 'en')"),
        due_timezone: z
          .string()
          .optional()
          .describe("IANA timezone (e.g. 'America/New_York') for the trigger"),
        service: z
          .enum(["email", "push"])
          .optional()
          .describe("Notification channel"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      // Validate that the right fields are present for the chosen mode.
      if (params.reminder_type === "relative") {
        if (params.minute_offset == null) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  "Error: reminder_type='relative' requires minute_offset (minutes before due).",
              },
            ],
          };
        }
      } else {
        // absolute
        if (!params.due_string && !params.due_datetime && !params.due_date) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text:
                  "Error: reminder_type='absolute' requires one of due_string, " +
                  "due_datetime, or due_date.",
              },
            ],
          };
        }
      }

      try {
        const body: Record<string, unknown> = {
          task_id: params.task_id,
          reminder_type: params.reminder_type,
        };
        if (params.minute_offset != null) body.minute_offset = params.minute_offset;
        const due = buildDue(params);
        if (due) body.due = due;
        if (params.service) body.service = params.service;

        const r = await apiPost<Reminder>("/reminders", body);
        return {
          content: [
            {
              type: "text",
              text: `Reminder created ✓ — ID ${r.id} on task ${r.task_id ?? params.task_id}`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── todoist_update_reminder ─────────────────────────────────────────────────
  server.registerTool(
    "todoist_update_reminder",
    {
      title: "Update Todoist Reminder",
      description: `Update a reminder's timing or delivery service. Pro-only feature.

Only include fields you want to change. You cannot change task_id or
reminder_type via update — delete and recreate for those.`,
      inputSchema: z.object({
        reminder_id: z.string().min(1).describe("ID of the reminder to update"),
        minute_offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("New offset (relative reminders)"),
        due_string: z
          .string()
          .optional()
          .describe("New natural-language trigger time"),
        due_datetime: z
          .string()
          .optional()
          .describe("New ISO 8601 datetime trigger"),
        due_date: z.string().optional().describe("New ISO date trigger"),
        due_lang: z.string().optional().describe("New language for due_string"),
        due_timezone: z.string().optional().describe("New IANA timezone"),
        service: z
          .enum(["email", "push"])
          .optional()
          .describe("New notification channel"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const body: Record<string, unknown> = {};
      if (params.minute_offset != null) body.minute_offset = params.minute_offset;
      const due = buildDue(params);
      if (due) body.due = due;
      if (params.service) body.service = params.service;

      if (Object.keys(body).length === 0) {
        return {
          isError: true,
          content: [
            { type: "text", text: "Error: No fields provided to update." },
          ],
        };
      }

      try {
        const r = await apiPost<Reminder>(
          `/reminders/${params.reminder_id}`,
          body
        );
        return {
          content: [
            { type: "text", text: `Reminder updated ✓ — ID ${r.id}` },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── todoist_delete_reminder ─────────────────────────────────────────────────
  server.registerTool(
    "todoist_delete_reminder",
    {
      title: "Delete Todoist Reminder",
      description: `Permanently delete a reminder. Pro-only feature. Cannot be undone.`,
      inputSchema: z.object({
        reminder_id: z
          .string()
          .min(1)
          .describe("ID of the reminder to permanently delete"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        await apiDelete(`/reminders/${params.reminder_id}`);
        return {
          content: [
            {
              type: "text",
              text: `Reminder ${params.reminder_id} permanently deleted.`,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );
}
