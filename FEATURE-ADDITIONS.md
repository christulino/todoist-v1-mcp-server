# Feature Additions — todoist-v1-mcp-server

## Context

This document captures the planned feature additions to `christulino/todoist-v1-mcp-server`.
Use this as the starting prompt for a dedicated coding session.

**Repo location:** `/Users/chris/documents/ai/MorningRoutine/tools/todoist-v1-mcp-server`
**GitHub:** https://github.com/christulino/todoist-v1-mcp-server
**Stack:** Node.js, TypeScript, axios, Zod, @modelcontextprotocol/sdk
**Transport:** stdio
**API:** Todoist unified API v1 (https://developer.todoist.com/api/v1/)
**Current tool count:** 20

## Coding conventions (match existing style)

- `registerTool()` API — not deprecated `setRequestHandler`
- Direct HTTP via axios — no Todoist SDK wrapper
- Permissive output schemas — never enforce strict shapes on API responses
- Helpful error messages that say what went wrong and how to fix it
- All test data prefixed with `[mcp-test]`, cleaned up automatically
- Run `npm test` with `TODOIST_API_TOKEN` set to verify

---

## Features to Add

### 1. Comments (CRUD)

Todoist API v1 supports comments on both tasks and projects.

**Tools to add:**
- `todoist_get_comments` — list comments on a task or project
  - params: `task_id` (string, optional) OR `project_id` (string, optional) — one required
- `todoist_get_comment` — get a single comment by ID
  - params: `comment_id` (string, required)
- `todoist_create_comment` — add a comment to a task or project
  - params: `task_id` OR `project_id` (one required), `content` (string, required)
- `todoist_update_comment` — edit comment content
  - params: `comment_id` (string, required), `content` (string, required)
- `todoist_delete_comment` — delete a comment
  - params: `comment_id` (string, required)

**API endpoints (v1):**
- GET    `https://api.todoist.com/api/v1/comments?task_id={id}`
- GET    `https://api.todoist.com/api/v1/comments/{id}`
- POST   `https://api.todoist.com/api/v1/comments`
- POST   `https://api.todoist.com/api/v1/comments/{id}` (update)
- DELETE `https://api.todoist.com/api/v1/comments/{id}`

**Tests:** Full CRUD cycle using `[mcp-test]` prefix on comment content, attached to a `[mcp-test]` task created and cleaned up in the same test.

---

### 2. Completed Task Querying

Todoist API v1 has an endpoint for retrieving completed/archived tasks. Useful for morning briefings ("what did I finish yesterday?"), retrospectives, and standup updates.

**Tools to add:**
- `todoist_get_completed_tasks` — query completed tasks
  - params:
    - `project_id` (string, optional) — scope to a project
    - `since` (string, optional) — ISO 8601 datetime, e.g. `"2026-04-16T00:00:00"`
    - `until` (string, optional) — ISO 8601 datetime
    - `limit` (number, optional, default 30, max 200)

**API endpoint (v1):**
- GET `https://api.todoist.com/api/v1/tasks/completed/get_all`
  - query params: `project_id`, `since`, `until`, `limit`

**Note:** This is a Todoist Pro feature. The tool should return a clear error message if the account doesn't have access rather than a generic API error.

**Tests:** Query completed tasks for the last 7 days, verify structure. Can't easily test the full cycle (create → complete → query) without relying on timing, so a read-only smoke test against real completed data is acceptable.

---

### 3. Reminders (CRUD)

Todoist Pro feature. Reminders can be time-based (absolute datetime) or relative (N minutes before due date).

**Tools to add:**
- `todoist_get_reminders` — list reminders, optionally filtered by task
  - params: `task_id` (string, optional)
- `todoist_get_reminder` — get a single reminder by ID
  - params: `reminder_id` (string, required)
- `todoist_create_reminder` — set a reminder on a task
  - params:
    - `task_id` (string, required)
    - `type` (enum: `"absolute"` | `"relative"`, required)
    - `due_date` (string, optional) — ISO 8601 datetime, used when type is `"absolute"`
    - `mm_offset` (number, optional) — minutes before due, used when type is `"relative"`
- `todoist_update_reminder` — update a reminder
  - params: `reminder_id` (string, required), then same optional fields as create
- `todoist_delete_reminder` — delete a reminder
  - params: `reminder_id` (string, required)

**API endpoints (v1):**
- GET    `https://api.todoist.com/api/v1/reminders`
- GET    `https://api.todoist.com/api/v1/reminders/{id}`
- POST   `https://api.todoist.com/api/v1/reminders`
- POST   `https://api.todoist.com/api/v1/reminders/{id}` (update)
- DELETE `https://api.todoist.com/api/v1/reminders/{id}`

**Note:** Pro-only. Same as completed tasks — return a clean, human-readable error if the account tier doesn't support it.

**Tests:** Full CRUD cycle. Create a `[mcp-test]` task, add a reminder, update it, delete it, clean up the task.

---

## Summary

| Feature | New tools | API docs |
|---------|-----------|----------|
| Comments | 5 | https://developer.todoist.com/api/v1/#comments |
| Completed tasks | 1 | https://developer.todoist.com/api/v1/#get-all-completed-tasks |
| Reminders | 5 | https://developer.todoist.com/api/v1/#reminders |
| **Total new** | **11** | |

New total: **31 tools**

---

## Before starting

1. Read the existing `src/index.ts` to understand the pattern — each tool follows the same structure
2. Check the actual API endpoints against https://developer.todoist.com/api/v1/ — verify exact parameter names before coding
3. Run `npm test` first to confirm baseline is green
4. Add new tools one group at a time (comments → completed → reminders), test each group before moving on
5. Update README.md tool count and tables when done
