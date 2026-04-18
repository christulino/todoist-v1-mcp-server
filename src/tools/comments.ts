/**
 * Comment-related MCP tools for Todoist API v1.
 *
 * Comments can be attached to tasks OR projects. The list endpoint requires
 * exactly one of `task_id` or `project_id` to be set.
 *
 * Tools:
 *   todoist_get_comments    — list comments on a task or project
 *   todoist_get_comment     — get a single comment by ID
 *   todoist_create_comment  — add a comment to a task or project
 *   todoist_update_comment  — edit an existing comment's content
 *   todoist_delete_comment  — permanently delete a comment
 *
 * API: POST/GET/DELETE https://api.todoist.com/api/v1/comments[/{id}]
 * The list endpoint is paginated; we surface `next_cursor` if more results exist.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost, apiDelete, handleApiError } from "../client.js";
import { ResponseFormat } from "../constants.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Comment {
  id: string;
  content: string;
  posted_at?: string;
  poster_id?: string;
  task_id?: string | null;
  project_id?: string | null;
  attachment?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface CommentListResponse {
  results?: Comment[];
  items?: Comment[];
  next_cursor?: string | null;
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatComment(c: Comment): string {
  const parts = [`**${c.id}**`];
  if (c.posted_at) parts.push(`posted: ${c.posted_at}`);
  if (c.poster_id) parts.push(`by: ${c.poster_id}`);
  if (c.task_id) parts.push(`task: ${c.task_id}`);
  if (c.project_id) parts.push(`project: ${c.project_id}`);
  const header = parts.join(" — ");
  const body = c.content || "(empty)";
  const attachLine = c.attachment ? `\n  📎 attachment: ${JSON.stringify(c.attachment)}` : "";
  return `- ${header}\n  ${body.replace(/\n/g, "\n  ")}${attachLine}`;
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerCommentTools(server: McpServer): void {
  // ── todoist_get_comments ────────────────────────────────────────────────────
  server.registerTool(
    "todoist_get_comments",
    {
      title: "Get Todoist Comments",
      description: `List comments attached to a task or project.

Provide EITHER task_id OR project_id (exactly one). Results are paginated;
use the returned cursor for additional pages if next_cursor is set.`,
      inputSchema: z.object({
        task_id: z
          .string()
          .min(1)
          .optional()
          .describe("Task ID to list comments for (provide this OR project_id)"),
        project_id: z
          .string()
          .min(1)
          .optional()
          .describe("Project ID to list comments for (provide this OR task_id)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe("Maximum comments per page (1–200, default 50)"),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor returned by a prior call"),
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
      const hasTask = !!params.task_id;
      const hasProject = !!params.project_id;
      if (hasTask === hasProject) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "Error: Provide exactly one of `task_id` or `project_id` " +
                "(you provided " +
                (hasTask ? "both" : "neither") +
                ").",
            },
          ],
        };
      }

      try {
        const query: Record<string, unknown> = { limit: params.limit };
        if (params.task_id) query.task_id = params.task_id;
        if (params.project_id) query.project_id = params.project_id;
        if (params.cursor) query.cursor = params.cursor;

        const data = await apiGet<CommentListResponse | Comment[]>("/comments", query);
        const comments: Comment[] = Array.isArray(data)
          ? data
          : (data.results ?? data.items ?? []);
        const nextCursor: string | null = Array.isArray(data)
          ? null
          : (data.next_cursor ?? null);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify(
            { count: comments.length, next_cursor: nextCursor, comments },
            null,
            2
          );
        } else {
          const scope = params.task_id
            ? `task ${params.task_id}`
            : `project ${params.project_id}`;
          if (!comments.length) {
            text = `No comments on ${scope}.`;
          } else {
            const lines = [`# Comments on ${scope} (${comments.length})`, ""];
            for (const c of comments) lines.push(formatComment(c));
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

  // ── todoist_get_comment ─────────────────────────────────────────────────────
  server.registerTool(
    "todoist_get_comment",
    {
      title: "Get Todoist Comment",
      description: `Retrieve a single comment by its ID.`,
      inputSchema: z.object({
        comment_id: z.string().min(1).describe("ID of the comment to retrieve"),
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
        const c = await apiGet<Comment>(`/comments/${params.comment_id}`);
        const lines = [`# Comment ${c.id}`, ""];
        if (c.posted_at) lines.push(`Posted: ${c.posted_at}`);
        if (c.poster_id) lines.push(`Author: ${c.poster_id}`);
        if (c.task_id) lines.push(`Task: ${c.task_id}`);
        if (c.project_id) lines.push(`Project: ${c.project_id}`);
        lines.push("", c.content || "(empty)");
        if (c.attachment) {
          lines.push("", `📎 ${JSON.stringify(c.attachment)}`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── todoist_create_comment ──────────────────────────────────────────────────
  server.registerTool(
    "todoist_create_comment",
    {
      title: "Create Todoist Comment",
      description: `Add a comment to a task or project.

Provide EITHER task_id OR project_id (exactly one). Content supports Markdown.`,
      inputSchema: z.object({
        content: z
          .string()
          .min(1)
          .max(15000)
          .describe("Comment text (Markdown supported, up to 15000 chars)"),
        task_id: z
          .string()
          .min(1)
          .optional()
          .describe("Task ID to comment on (provide this OR project_id)"),
        project_id: z
          .string()
          .min(1)
          .optional()
          .describe("Project ID to comment on (provide this OR task_id)"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      const hasTask = !!params.task_id;
      const hasProject = !!params.project_id;
      if (hasTask === hasProject) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                "Error: Provide exactly one of `task_id` or `project_id` " +
                "(you provided " +
                (hasTask ? "both" : "neither") +
                ").",
            },
          ],
        };
      }

      try {
        const body: Record<string, unknown> = { content: params.content };
        if (params.task_id) body.task_id = params.task_id;
        if (params.project_id) body.project_id = params.project_id;

        const c = await apiPost<Comment>("/comments", body);
        const scope = c.task_id ? `task ${c.task_id}` : `project ${c.project_id}`;
        return {
          content: [
            {
              type: "text",
              text: `Comment created ✓ — ID ${c.id} on ${scope}`,
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

  // ── todoist_update_comment ──────────────────────────────────────────────────
  server.registerTool(
    "todoist_update_comment",
    {
      title: "Update Todoist Comment",
      description: `Edit a comment's content. Only the content field is mutable via this endpoint.`,
      inputSchema: z.object({
        comment_id: z.string().min(1).describe("ID of the comment to update"),
        content: z
          .string()
          .min(1)
          .max(15000)
          .describe("New content (Markdown supported, up to 15000 chars)"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const c = await apiPost<Comment>(`/comments/${params.comment_id}`, {
          content: params.content,
        });
        return {
          content: [
            {
              type: "text",
              text: `Comment updated ✓ — ID ${c.id}`,
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

  // ── todoist_delete_comment ──────────────────────────────────────────────────
  server.registerTool(
    "todoist_delete_comment",
    {
      title: "Delete Todoist Comment",
      description: `Permanently delete a comment. This cannot be undone.`,
      inputSchema: z.object({
        comment_id: z
          .string()
          .min(1)
          .describe("ID of the comment to permanently delete"),
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
        await apiDelete(`/comments/${params.comment_id}`);
        return {
          content: [
            {
              type: "text",
              text: `Comment ${params.comment_id} permanently deleted.`,
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
