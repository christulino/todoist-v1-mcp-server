/**
 * Completed-task query MCP tool for Todoist API v1.
 *
 * Wraps two API endpoints behind a single agent-friendly tool:
 *   GET /tasks/completed/by_completion_date   (max range: ~3 months — default)
 *   GET /tasks/completed/by_due_date          (max range: ~6 weeks)
 *
 * Pro-only: Todoist charges completed-task querying as a Pro feature. The
 * client's handleApiError surfaces a clean "Pro required" message when the
 * account lacks access, so the raw API error never reaches the agent.
 *
 * Typical use cases:
 *   - "What did I finish yesterday?" (by_completion_date, since yesterday)
 *   - Sprint retros — "what was completed last week in project X?"
 *   - Due-date archaeology — "what overdue items did I eventually close?"
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, handleApiError } from "../client.js";
import { ResponseFormat } from "../constants.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompletedTask {
  id: string;
  content: string;
  description?: string;
  completed_at?: string | null;
  project_id?: string;
  section_id?: string | null;
  parent_id?: string | null;
  priority?: number;
  labels?: string[];
  due?: { date?: string; string?: string; timezone?: string } | null;
  [key: string]: unknown;
}

interface CompletedListResponse {
  items?: CompletedTask[];
  results?: CompletedTask[];
  next_cursor?: string | null;
  [key: string]: unknown;
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerCompletedTaskTools(server: McpServer): void {
  server.registerTool(
    "todoist_get_completed_tasks",
    {
      title: "Get Todoist Completed Tasks",
      description: `Query tasks that were completed within a date range. Pro-only feature.

Two query modes:
  • by='completion_date' (default) — matches tasks by WHEN they were completed.
    Max range: ~3 months. Use this for "what did I finish yesterday / last week".
  • by='due_date' — matches tasks by the DUE DATE they had when completed.
    Max range: ~6 weeks. Allows extra filters: project_id, section_id, parent_id.

Either mode accepts since+until as ISO 8601 (e.g. "2026-04-17T00:00:00Z").
Both bounds are required. Results are paginated via next_cursor.`,
      inputSchema: z.object({
        since: z
          .string()
          .min(1)
          .describe(
            "Start of range (ISO 8601, e.g. '2026-04-17T00:00:00Z'). Required."
          ),
        until: z
          .string()
          .min(1)
          .describe(
            "End of range (ISO 8601, e.g. '2026-04-18T23:59:59Z'). Required."
          ),
        by: z
          .enum(["completion_date", "due_date"])
          .default("completion_date")
          .describe(
            "'completion_date' (default, up to 3 months) or 'due_date' (up to 6 weeks)"
          ),
        project_id: z
          .string()
          .optional()
          .describe("Filter by project. Only supported when by='due_date'."),
        section_id: z
          .string()
          .optional()
          .describe("Filter by section. Only supported when by='due_date'."),
        parent_id: z
          .string()
          .optional()
          .describe("Filter by parent task. Only supported when by='due_date'."),
        workspace_id: z
          .string()
          .optional()
          .describe("Filter by workspace (optional)."),
        filter_query: z
          .string()
          .optional()
          .describe("Todoist filter query string (e.g. 'p1 & !@someday')."),
        filter_lang: z
          .string()
          .optional()
          .describe("Language for filter_query parsing (e.g. 'en')."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Max results per page (1–200, default 50)."),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor from a prior call."),
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
      const path =
        params.by === "due_date"
          ? "/tasks/completed/by_due_date"
          : "/tasks/completed/by_completion_date";

      // Guard: project/section/parent filters are only valid on the by_due_date
      // variant. Fail fast with a clear message rather than letting the API
      // silently drop the filter.
      if (
        params.by === "completion_date" &&
        (params.project_id || params.section_id || params.parent_id)
      ) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "Error: project_id / section_id / parent_id filters only work " +
                "when by='due_date'. Re-run with by='due_date' or drop those params.",
            },
          ],
        };
      }

      try {
        const query: Record<string, unknown> = {
          since: params.since,
          until: params.until,
          limit: params.limit,
        };
        if (params.workspace_id) query.workspace_id = params.workspace_id;
        if (params.filter_query) query.filter_query = params.filter_query;
        if (params.filter_lang) query.filter_lang = params.filter_lang;
        if (params.cursor) query.cursor = params.cursor;
        if (params.by === "due_date") {
          if (params.project_id) query.project_id = params.project_id;
          if (params.section_id) query.section_id = params.section_id;
          if (params.parent_id) query.parent_id = params.parent_id;
        }

        const data = await apiGet<CompletedListResponse | CompletedTask[]>(
          path,
          query
        );
        const tasks: CompletedTask[] = Array.isArray(data)
          ? data
          : (data.items ?? data.results ?? []);
        const nextCursor: string | null = Array.isArray(data)
          ? null
          : (data.next_cursor ?? null);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify(
            {
              count: tasks.length,
              next_cursor: nextCursor,
              by: params.by,
              since: params.since,
              until: params.until,
              tasks,
            },
            null,
            2
          );
        } else {
          if (!tasks.length) {
            text = `No completed tasks in range (${params.since} → ${params.until}, by=${params.by}).`;
          } else {
            const lines = [
              `# Completed tasks (${tasks.length}) — by ${params.by}`,
              `Range: ${params.since} → ${params.until}`,
              "",
            ];
            for (const t of tasks) {
              const parts = [`**${t.content}** (ID: ${t.id})`];
              if (t.completed_at) parts.push(`completed: ${t.completed_at}`);
              if (t.due?.date) parts.push(`was due: ${t.due.date}`);
              if (t.project_id) parts.push(`project: ${t.project_id}`);
              lines.push(`- ${parts.join(" — ")}`);
            }
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
}
