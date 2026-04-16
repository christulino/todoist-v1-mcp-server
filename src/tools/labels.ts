/**
 * Label-related MCP tools for Todoist API v1.
 *
 * Tools:
 *   todoist_get_labels    — list all personal labels
 *   todoist_create_label  — create a new label
 *   todoist_update_label  — rename/recolor a label
 *   todoist_delete_label  — delete a label
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost, apiDelete, handleApiError } from "../client.js";
import { ResponseFormat } from "../constants.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Label {
  id: string;
  name: string;
  color?: string;
  order?: number;
  is_favorite?: boolean;
  [key: string]: unknown;
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerLabelTools(server: McpServer): void {
  // ── todoist_get_labels ──────────────────────────────────────────────────────
  server.registerTool(
    "todoist_get_labels",
    {
      title: "Get Todoist Labels",
      description: `List all personal labels in the user's Todoist account.

Returns label IDs, names, colors, and sort order.
Use label names (not IDs) when creating or updating tasks.`,
      inputSchema: z.object({
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
        const data = await apiGet<Label[] | { items?: Label[]; results?: Label[] }>(
          "/labels"
        );

        const labels: Label[] = Array.isArray(data)
          ? data
          : (data.items ?? data.results ?? []);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ count: labels.length, labels }, null, 2);
        } else {
          if (!labels.length) {
            text = "No labels found.";
          } else {
            const lines = [`# Labels (${labels.length})`, ""];
            for (const l of labels) {
              const parts = [`**${l.name}** (ID: ${l.id})`];
              if (l.color) parts.push(`color: ${l.color}`);
              if (l.is_favorite) parts.push(`★ favorite`);
              lines.push(`- ${parts.join(" — ")}`);
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

  // ── todoist_create_label ────────────────────────────────────────────────────
  server.registerTool(
    "todoist_create_label",
    {
      title: "Create Todoist Label",
      description: `Create a new personal label in Todoist.

Returns the created label's ID and name. Use the label name (not ID)
when assigning labels to tasks with todoist_create_task or todoist_update_task.`,
      inputSchema: z.object({
        name: z.string().min(1).max(60).describe("Label name (required)"),
        color: z
          .string()
          .optional()
          .describe(
            "Label color name (e.g. 'blue', 'red', 'green', 'orange', 'grape')"
          ),
        order: z
          .number()
          .int()
          .optional()
          .describe("Sort position in the label list"),
        is_favorite: z
          .boolean()
          .optional()
          .describe("Whether to mark this label as a favorite"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = { name: params.name };
        if (params.color) body.color = params.color;
        if (params.order !== undefined) body.order = params.order;
        if (params.is_favorite !== undefined) body.is_favorite = params.is_favorite;

        const label = await apiPost<Label>("/labels", body);

        return {
          content: [
            {
              type: "text",
              text: `Label created ✓ — "${label.name}" (ID: ${label.id})`,
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

  // ── todoist_update_label ────────────────────────────────────────────────────
  server.registerTool(
    "todoist_update_label",
    {
      title: "Update Todoist Label",
      description: `Update an existing Todoist label. Only include fields to change.`,
      inputSchema: z.object({
        label_id: z.string().min(1).describe("ID of the label to update"),
        name: z.string().min(1).max(60).optional().describe("New label name"),
        color: z.string().optional().describe("New color name"),
        order: z.number().int().optional().describe("New sort position"),
        is_favorite: z.boolean().optional().describe("Update favorite status"),
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
        const body: Record<string, unknown> = {};
        if (params.name !== undefined) body.name = params.name;
        if (params.color !== undefined) body.color = params.color;
        if (params.order !== undefined) body.order = params.order;
        if (params.is_favorite !== undefined) body.is_favorite = params.is_favorite;

        if (Object.keys(body).length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "Error: No fields provided to update.",
              },
            ],
          };
        }

        const label = await apiPost<Label>(`/labels/${params.label_id}`, body);

        return {
          content: [
            {
              type: "text",
              text: `Label updated ✓ — "${label.name}" (ID: ${label.id})`,
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

  // ── todoist_delete_label ────────────────────────────────────────────────────
  server.registerTool(
    "todoist_delete_label",
    {
      title: "Delete Todoist Label",
      description: `Permanently delete a personal Todoist label.

The label will be removed from all tasks that currently use it.
This cannot be undone.`,
      inputSchema: z.object({
        label_id: z
          .string()
          .min(1)
          .describe("ID of the label to permanently delete"),
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
        await apiDelete(`/labels/${params.label_id}`);
        return {
          content: [
            {
              type: "text",
              text: `Label ${params.label_id} permanently deleted.`,
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
