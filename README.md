# todoist-v1-mcp-server

A clean, reliable MCP (Model Context Protocol) server for Todoist — built on the **Todoist unified API v1**.

## Why this exists

The official Todoist web MCP (`todoist-ai`) has a known persistent disconnection bug on the Anthropic side that requires reconnecting daily. Community alternatives are either built on the deprecated REST API v2 or have schema validation bugs that cause failures when Todoist returns additional fields as their API evolves.

This server:
- Targets the **current Todoist API v1** (not deprecated v2)
- Uses **stdio transport** — no cloud dependency, no daily reconnections
- Uses the **modern MCP SDK `registerTool()` API** (not the deprecated `setRequestHandler` pattern)
- **Never enforces strict output schemas** on API responses — Todoist can add new fields freely without breaking anything
- Zero SDK wrapper dependency — direct HTTP calls via axios, so there's no intermediary library drifting from the API

## Tools (31 total)

### Tasks
| Tool | Description |
|------|-------------|
| `todoist_get_tasks` | List/filter tasks — supports Todoist filter strings like `"today"`, `"overdue"`, `"p1"`, `"#ProjectName"`, `"7 days"` |
| `todoist_get_task` | Get a single task by ID |
| `todoist_create_task` | Create a task with natural language due dates (`"tomorrow"`, `"every monday"`, etc.) |
| `todoist_update_task` | Update any field; pass `clear_due_date: true` to remove a due date |
| `todoist_complete_task` | Mark a task as done |
| `todoist_reopen_task` | Reopen a completed task |
| `todoist_delete_task` | Permanently delete a task |

### Projects
| Tool | Description |
|------|-------------|
| `todoist_get_projects` | List all projects |
| `todoist_get_project` | Get a single project by ID |
| `todoist_create_project` | Create a project (with color, view style, parent) |
| `todoist_update_project` | Update a project |
| `todoist_delete_project` | Permanently delete a project and all its tasks |

### Sections
| Tool | Description |
|------|-------------|
| `todoist_get_sections` | List sections within a project |
| `todoist_create_section` | Create a section |
| `todoist_update_section` | Rename a section |
| `todoist_delete_section` | Delete a section |

### Labels
| Tool | Description |
|------|-------------|
| `todoist_get_labels` | List all personal labels |
| `todoist_create_label` | Create a label |
| `todoist_update_label` | Update a label |
| `todoist_delete_label` | Delete a label |

### Comments
| Tool | Description |
|------|-------------|
| `todoist_get_comments` | List comments on a task or project (paginated) |
| `todoist_get_comment` | Get a single comment by ID |
| `todoist_create_comment` | Add a comment to a task or project (Markdown supported) |
| `todoist_update_comment` | Edit an existing comment's content |
| `todoist_delete_comment` | Permanently delete a comment |

### Completed tasks (Pro)
| Tool | Description |
|------|-------------|
| `todoist_get_completed_tasks` | Query completed tasks by completion date (≤3mo) or due date (≤6wk). Pro-only. |

### Reminders (Pro)
| Tool | Description |
|------|-------------|
| `todoist_get_reminders` | List reminders, optionally filtered by `task_id`. Pro-only. |
| `todoist_get_reminder` | Get a single reminder by ID. Pro-only. |
| `todoist_create_reminder` | Create a relative (`minute_offset` before due) or absolute reminder. Pro-only. |
| `todoist_update_reminder` | Update reminder timing or notification service. Pro-only. |
| `todoist_delete_reminder` | Permanently delete a reminder. Pro-only. |

> **Pro-tier handling:** Reminders and completed-task queries require a Todoist Pro subscription. If the API returns a Pro-gate error (HTTP 402, or 403 with a `premium`/`pro`/`upgrade`/`paid`/`subscription` keyword), the server returns a clean message explaining the feature requires Pro rather than leaking the raw API error.

## Setup

### 1. Get your Todoist API token

Go to **Todoist → Settings → Integrations → Developer** and copy your API token.

### 2. Install and build

```bash
git clone https://github.com/christulino/todoist-v1-mcp-server
cd todoist-v1-mcp-server
npm install
npm run build
```

### 3. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "todoist": {
      "command": "node",
      "args": ["/absolute/path/to/todoist-v1-mcp-server/dist/index.js"],
      "env": {
        "TODOIST_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

Restart Claude Desktop. You should see "todoist" in the connected MCP servers.

### 4. Configure Claude Code (optional)

```bash
claude mcp add todoist -- node /absolute/path/to/todoist-v1-mcp-server/dist/index.js
```

Then set the env var:
```bash
export TODOIST_API_TOKEN=your_api_token_here
```

Or add it to your shell profile.

## Usage examples

Once connected, Claude can handle natural language like:

- _"What's on my plate today?"_ → uses `todoist_get_tasks` with `filter: "today"`
- _"Add a task to call the dentist next Tuesday"_ → uses `todoist_create_task`
- _"Mark the dentist task as done"_ → uses `todoist_complete_task`
- _"Show me everything overdue"_ → uses `todoist_get_tasks` with `filter: "overdue"`
- _"Create a project called Home Renovation"_ → uses `todoist_create_project`
- _"What projects do I have?"_ → uses `todoist_get_projects`

## Todoist filter syntax

The `filter` parameter in `todoist_get_tasks` supports Todoist's full natural language filter syntax:

| Filter | Meaning |
|--------|---------|
| `today` | Due today |
| `overdue` | Past due |
| `7 days` | Due in the next 7 days |
| `p1` | Priority urgent |
| `#ProjectName` | Tasks in a specific project |
| `@labelname` | Tasks with a specific label |
| `no due date` | Tasks without a due date |
| `today \| overdue` | Today or overdue (combine with `\|`) |
| `today & @waiting` | Today AND labeled 'waiting' |

Full filter documentation: https://todoist.com/help/articles/introduction-to-filters

## Requirements

- Node.js 18+
- A Todoist account (free tier works)

## Development

```bash
npm run dev   # tsx watch mode with auto-reload
npm run build # compile TypeScript
npm start     # run compiled server
```

## Testing

The test suite hits the live Todoist API and runs a full CRUD cycle across tasks, projects, sections, labels, comments, and reminders, plus a read-only smoke test for completed-task querying. Reminders and completed-task tests detect Pro-tier gating (HTTP 402/403) and report cleanly when the account is on the Free tier. All test data is prefixed with `[mcp-test]` and cleaned up automatically.

```bash
TODOIST_API_TOKEN=your_token npm test
```

Your API token is at **Todoist → Settings → Integrations → Developer** — same token you put in `claude_desktop_config.json`.

## Contributing

PRs welcome. The goal is a minimal, correct implementation that stays current with the Todoist API v1. Priorities:

1. Correctness over cleverness
2. Permissive output handling (never reject unknown API fields)
3. Helpful error messages that tell you what went wrong and how to fix it

## License

MIT
