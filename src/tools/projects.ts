/**
 * Project-related MCP tools for Todoist API v1.
 *
 * Tools:
 *   todoist_get_projects  — list all projects
 *   todoist_get_project   — get a single project by ID
 *   todoist_create_project — create a new project
 *   todoist_update_project — update an existing project
 *   todoist_delete_project — delete a project
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost, apiDelete, handleApiError } from "../client.js";
import { ResponseFormat } from "../constants.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  color?: string;
  parent_id?: string;
  order?: number;
  comment_count?: number;
  is_shared?: boolean;
  is_favorite?: boolean;
  is_inbox_project?: boolean;
  is_team_inbox?: boolean;
  view_style?: string;
  url?: string;
  [key: string]: unknown;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatProject(project: Project): string {
  const lines = [`### ${project.name} (ID: ${project.id})`];
  if (project.color) lines.push(`- **Color**: ${project.color}`);
  if (project.parent_id) lines.push(`- **Parent ID**: ${project.parent_id}`);
  if (project.is_favorite) lines.push(`- **Favorite**: yes`);
  if (project.is_shared) lines.push(`- **Shared**: yes`);
  if (project.url) lines.push(`- **URL**: ${project.url}`);
  return lines.join("\n");
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerProjectTools(server: McpServer): void {
  // ── todoist_get_projects ────────────────────────────────────────────────────
  server.registerTool(
    "todoist_get_projects",
    {
      title: "Get Todoist Projects",
      description: `List all projects in the user's Todoist account.

Returns project IDs, names, colors, hierarchy (parent_id for sub-projects),
and metadata like whether each project is a favorite or shared.

Use project IDs with todoist_get_tasks to fetch tasks for a specific project.`,
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
        const data = await apiGet<Project[] | { items?: Project[]; results?: Project[] }>(
          "/projects"
        );

        const projects: Project[] = Array.isArray(data)
          ? data
          : (data.items ?? data.results ?? []);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify({ count: projects.length, projects }, null, 2);
        } else {
          if (!projects.length) {
            text = "No projects found.";
          } else {
            const lines = [`# Projects (${projects.length})`, ""];
            for (const p of projects) {
              lines.push(formatProject(p));
              lines.push("");
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

  // ── todoist_get_project ─────────────────────────────────────────────────────
  server.registerTool(
    "todoist_get_project",
    {
      title: "Get Todoist Project",
      description: `Retrieve a single Todoist project by its ID.

Returns full project details including name, color, parent project,
comment count, sharing status, and view style.`,
      inputSchema: z.object({
        project_id: z.string().min(1).describe("The project ID to retrieve"),
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
        const project = await apiGet<Project>(`/projects/${params.project_id}`);

        let text: string;
        if (params.response_format === ResponseFormat.JSON) {
          text = JSON.stringify(project, null, 2);
        } else {
          text = ["# Project Details", "", formatProject(project)].join("\n");
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

  // ── todoist_create_project ──────────────────────────────────────────────────
  server.registerTool(
    "todoist_create_project",
    {
      title: "Create Todoist Project",
      description: `Create a new project in Todoist.

Color options: berry_red, red, orange, yellow, olive_green, lime_green, green,
mint_green, teal, sky_blue, light_blue, blue, grape, violet, lavender,
magenta, salmon, charcoal, grey, taupe.

Returns the full created project object including its assigned ID.`,
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(120)
          .describe("Project name (required)"),
        parent_id: z
          .string()
          .optional()
          .describe("Parent project ID to create this as a sub-project"),
        color: z
          .string()
          .optional()
          .describe(
            "Project color name (e.g. 'blue', 'red', 'green'). See description for full list."
          ),
        is_favorite: z
          .boolean()
          .optional()
          .describe("Whether to mark this project as a favorite"),
        view_style: z
          .enum(["list", "board"])
          .optional()
          .describe("View style: 'list' (default) or 'board'"),
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
        if (params.parent_id) body.parent_id = params.parent_id;
        if (params.color) body.color = params.color;
        if (params.is_favorite !== undefined) body.is_favorite = params.is_favorite;
        if (params.view_style) body.view_style = params.view_style;

        const project = await apiPost<Project>("/projects", body);

        const text = ["# Project Created ✓", "", formatProject(project)].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── todoist_update_project ──────────────────────────────────────────────────
  server.registerTool(
    "todoist_update_project",
    {
      title: "Update Todoist Project",
      description: `Update an existing Todoist project. Only include fields to change.`,
      inputSchema: z.object({
        project_id: z.string().min(1).describe("ID of the project to update"),
        name: z.string().min(1).max(120).optional().describe("New project name"),
        color: z.string().optional().describe("New color name"),
        is_favorite: z.boolean().optional().describe("Update favorite status"),
        view_style: z
          .enum(["list", "board"])
          .optional()
          .describe("New view style"),
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
        if (params.is_favorite !== undefined) body.is_favorite = params.is_favorite;
        if (params.view_style !== undefined) body.view_style = params.view_style;

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

        const project = await apiPost<Project>(`/projects/${params.project_id}`, body);

        const text = ["# Project Updated ✓", "", formatProject(project)].join("\n");
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: handleApiError(error) }],
        };
      }
    }
  );

  // ── todoist_delete_project ──────────────────────────────────────────────────
  server.registerTool(
    "todoist_delete_project",
    {
      title: "Delete Todoist Project",
      description: `Permanently delete a Todoist project and all its tasks. This cannot be undone.

WARNING: All tasks within the project will also be deleted.`,
      inputSchema: z.object({
        project_id: z
          .string()
          .min(1)
          .describe("ID of the project to permanently delete"),
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
        await apiDelete(`/projects/${params.project_id}`);
        return {
          content: [
            {
              type: "text",
              text: `Project ${params.project_id} and all its tasks permanently deleted.`,
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
