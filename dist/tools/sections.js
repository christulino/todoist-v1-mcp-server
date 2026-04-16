/**
 * Section-related MCP tools for Todoist API v1.
 *
 * Tools:
 *   todoist_get_sections   — list sections for a project
 *   todoist_create_section — create a new section
 *   todoist_update_section — rename a section
 *   todoist_delete_section — delete a section
 */
import { z } from "zod";
import { apiGet, apiPost, apiDelete, handleApiError } from "../client.js";
import { ResponseFormat } from "../constants.js";
// ─── Tool registration ────────────────────────────────────────────────────────
export function registerSectionTools(server) {
    // ── todoist_get_sections ────────────────────────────────────────────────────
    server.registerTool("todoist_get_sections", {
        title: "Get Todoist Sections",
        description: `List all sections within a Todoist project.

Sections are used to organize tasks within a project into groups.
Returns section IDs, names, and sort order.

Use section IDs with todoist_get_tasks (section_id param) or
todoist_create_task (section_id param) to work with tasks in specific sections.`,
        inputSchema: z.object({
            project_id: z
                .string()
                .min(1)
                .describe("Project ID to list sections for"),
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
    }, async (params) => {
        try {
            const data = await apiGet("/sections", { project_id: params.project_id });
            const sections = Array.isArray(data)
                ? data
                : (data.items ?? data.results ?? []);
            let text;
            if (params.response_format === ResponseFormat.JSON) {
                text = JSON.stringify({ count: sections.length, sections }, null, 2);
            }
            else {
                if (!sections.length) {
                    text = `No sections found in project ${params.project_id}.`;
                }
                else {
                    const lines = [`# Sections in Project ${params.project_id}`, ""];
                    for (const s of sections) {
                        lines.push(`### ${s.name} (ID: ${s.id})`);
                        if (s.order !== undefined)
                            lines.push(`- **Order**: ${s.order}`);
                        lines.push("");
                    }
                    text = lines.join("\n");
                }
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
    // ── todoist_create_section ──────────────────────────────────────────────────
    server.registerTool("todoist_create_section", {
        title: "Create Todoist Section",
        description: `Create a new section within a Todoist project.

Returns the created section's ID and details. Use the section ID when
creating tasks (todoist_create_task) to add them directly to this section.`,
        inputSchema: z.object({
            name: z.string().min(1).max(120).describe("Section name (required)"),
            project_id: z
                .string()
                .min(1)
                .describe("Project ID to create the section in"),
            order: z
                .number()
                .int()
                .optional()
                .describe("Sort position within the project (optional)"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const body = {
                name: params.name,
                project_id: params.project_id,
            };
            if (params.order !== undefined)
                body.order = params.order;
            const section = await apiPost("/sections", body);
            const text = [
                `# Section Created ✓`,
                ``,
                `**${section.name}** (ID: ${section.id})`,
                `- **Project ID**: ${section.project_id}`,
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
    // ── todoist_update_section ──────────────────────────────────────────────────
    server.registerTool("todoist_update_section", {
        title: "Update Todoist Section",
        description: `Rename an existing Todoist section.`,
        inputSchema: z.object({
            section_id: z.string().min(1).describe("ID of the section to update"),
            name: z.string().min(1).max(120).describe("New section name"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const section = await apiPost(`/sections/${params.section_id}`, {
                name: params.name,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Section updated ✓ — "${section.name}" (ID: ${section.id})`,
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
    // ── todoist_delete_section ──────────────────────────────────────────────────
    server.registerTool("todoist_delete_section", {
        title: "Delete Todoist Section",
        description: `Permanently delete a Todoist section.

Tasks within the section are NOT deleted — they are moved to the parent project
(unsectioned). The section itself is permanently removed and cannot be undone.`,
        inputSchema: z.object({
            section_id: z
                .string()
                .min(1)
                .describe("ID of the section to permanently delete"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            await apiDelete(`/sections/${params.section_id}`);
            return {
                content: [
                    {
                        type: "text",
                        text: `Section ${params.section_id} and its tasks permanently deleted.`,
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
//# sourceMappingURL=sections.js.map