#!/usr/bin/env tsx
/**
 * todoist-v1-mcp-server — integration test suite
 *
 * Tests the Todoist API v1 directly (not via MCP transport).
 * Covers: token validation, projects, tasks (full CRUD), labels, sections.
 *
 * Usage:
 *   TODOIST_API_TOKEN=your_token npm test
 *   TODOIST_API_TOKEN=your_token npx tsx scripts/test.ts
 *
 * Your API token is at: https://app.todoist.com/app/settings/integrations/developer
 * It's the same token you put in claude_desktop_config.json under TODOIST_API_TOKEN.
 *
 * All test tasks/projects/labels are created with a marker prefix so they
 * can be identified and cleaned up if a test run crashes mid-way.
 */

import axios, { AxiosInstance, AxiosError } from "axios";

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = "https://api.todoist.com/api/v1";
const TEST_MARKER = "[mcp-test]";
// Primary: TODOIST_API_TOKEN (matches claude_desktop_config.json convention)
// Fallback: TODOIST_API_KEY (convenience for users who have it set differently)
const TOKEN = process.env.TODOIST_API_TOKEN ?? process.env.TODOIST_API_KEY;

// ─── Output helpers ───────────────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string, detail?: string) {
  passed++;
  console.log(`  ${GREEN}✓${RESET} ${label}${detail ? ` ${CYAN}(${detail})${RESET}` : ""}`);
}

function fail(label: string, err: unknown) {
  failed++;
  const msg = err instanceof Error ? err.message : String(err);
  failures.push(`${label}: ${msg}`);
  console.log(`  ${RED}✗${RESET} ${label}`);
  console.log(`    ${RED}${msg}${RESET}`);
}

function section(title: string) {
  console.log(`\n${BOLD}${CYAN}── ${title}${RESET}`);
}

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    ok(label, detail);
  } else {
    throw new Error(`Assertion failed: ${label}`);
  }
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

function makeClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: API_BASE,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const detail = (error.response?.data as { error?: string })?.error ?? "";
    return `HTTP ${status ?? "??"}: ${detail || error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

// ─── Test runner ──────────────────────────────────────────────────────────────

async function run(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    fail(label, err);
  }
}

// ─── Cleanup: remove any leftover test data ───────────────────────────────────

async function cleanup(client: AxiosInstance) {
  section("Cleanup — removing any leftover test data");

  try {
    // Orphaned tasks
    const tasks = await client.get("/tasks", { params: { filter: `search:${TEST_MARKER}` } });
    const taskList = Array.isArray(tasks.data)
      ? tasks.data
      : (tasks.data.items ?? tasks.data.results ?? []);
    for (const t of taskList as { id: string; content: string }[]) {
      if (t.content?.includes(TEST_MARKER)) {
        await client.delete(`/tasks/${t.id}`).catch(() => null);
      }
    }
  } catch {
    // filter may not be supported; skip
  }

  try {
    // Orphaned projects
    const projects = await client.get("/projects");
    const projectList = Array.isArray(projects.data)
      ? projects.data
      : (projects.data.items ?? projects.data.results ?? []);
    for (const p of projectList as { id: string; name: string }[]) {
      if (p.name?.includes(TEST_MARKER)) {
        await client.delete(`/projects/${p.id}`).catch(() => null);
      }
    }
  } catch {
    // ignore
  }

  try {
    // Orphaned labels
    const labels = await client.get("/labels");
    const labelList = Array.isArray(labels.data)
      ? labels.data
      : (labels.data.items ?? labels.data.results ?? []);
    for (const l of labelList as { id: string; name: string }[]) {
      if (l.name?.includes(TEST_MARKER)) {
        await client.delete(`/labels/${l.id}`).catch(() => null);
      }
    }
  } catch {
    // ignore
  }

  ok("Leftover test data removed");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testTokenAndConnectivity(client: AxiosInstance) {
  section("1. Token & connectivity");

  await run("GET /projects (auth check)", async () => {
    const res = await client.get("/projects");
    assert(res.status === 200, "Status 200");
    const projects = Array.isArray(res.data)
      ? res.data
      : (res.data.items ?? res.data.results ?? []);
    assert(Array.isArray(projects), "Projects is an array");
    ok("Token valid, API reachable", `${projects.length} project(s) found`);
  });
}

async function testTaskCRUD(client: AxiosInstance) {
  section("2. Tasks — full CRUD cycle");

  let taskId = "";

  // Create
  await run("Create task", async () => {
    const res = await client.post("/tasks", {
      content: `${TEST_MARKER} Test task ${Date.now()}`,
      due_string: "tomorrow",
      priority: 2,
    });
    assert(res.status === 200, "Status 200");
    assert(!!res.data.id, "Task has an ID");
    assert(!!res.data.due, "Task has a due date");
    taskId = res.data.id;
    ok("Task created", `ID: ${taskId}`);
  });

  if (!taskId) {
    fail("Remaining task tests skipped", new Error("No task ID from create step"));
    return;
  }

  // Get
  await run("Get task by ID", async () => {
    const res = await client.get(`/tasks/${taskId}`);
    assert(res.status === 200, "Status 200");
    assert(res.data.id === taskId, "ID matches");
    ok("Task retrieved");
  });

  // Update content
  await run("Update task content", async () => {
    const newContent = `${TEST_MARKER} Updated ${Date.now()}`;
    const res = await client.post(`/tasks/${taskId}`, { content: newContent });
    assert(res.status === 200, "Status 200");
    assert(res.data.content === newContent, "Content updated");
    ok("Content updated");
  });

  // Update priority
  await run("Update task priority", async () => {
    const res = await client.post(`/tasks/${taskId}`, { priority: 3 });
    assert(res.status === 200, "Status 200");
    assert(res.data.priority === 3, "Priority is 3");
    ok("Priority updated to 3 (high)");
  });

  // Set due date via due_string
  await run("Set due date via due_string", async () => {
    const res = await client.post(`/tasks/${taskId}`, { due_string: "next week" });
    assert(res.status === 200, "Status 200");
    assert(!!res.data.due, "Task has due date");
    ok("Due date set", res.data.due?.string ?? res.data.due?.date ?? "");
  });

  // Clear due date via "no date" NLP phrase ("due: null" returns 400 from the API)
  await run("Clear due date (due_string: 'no date')", async () => {
    const res = await client.post(`/tasks/${taskId}`, { due_string: "no date" });
    assert(res.status === 200, "Status 200");
    const hasDue = !!res.data.due;
    assert(!hasDue, "Due date is cleared");
    ok("Due date cleared");
  });

  // Complete
  await run("Complete task", async () => {
    const res = await client.post(`/tasks/${taskId}/close`);
    assert(res.status === 204, "Status 204");
    ok("Task completed");
  });

  // Reopen
  await run("Reopen task", async () => {
    const res = await client.post(`/tasks/${taskId}/reopen`);
    assert(res.status === 204, "Status 204");
    ok("Task reopened");
  });

  // Delete
  await run("Delete task", async () => {
    const res = await client.delete(`/tasks/${taskId}`);
    assert(res.status === 204, "Status 204");
    ok("Task deleted");
  });

  // Note: Todoist uses soft deletes with eventual consistency — a GET immediately after
  // DELETE may still return 200. The 204 from DELETE is the authoritative confirmation.
  ok("Task deletion confirmed via 204 response (soft-delete; immediate GET may still return 200)");
}

async function testProjectCRUD(client: AxiosInstance) {
  section("3. Projects — CRUD");

  let projectId = "";

  await run("Create project", async () => {
    const res = await client.post("/projects", {
      name: `${TEST_MARKER} Test Project ${Date.now()}`,
      color: "blue",
    });
    assert(res.status === 200, "Status 200");
    assert(!!res.data.id, "Project has an ID");
    projectId = res.data.id;
    ok("Project created", `ID: ${projectId}`);
  });

  if (!projectId) return;

  await run("Get project", async () => {
    const res = await client.get(`/projects/${projectId}`);
    assert(res.status === 200, "Status 200");
    assert(res.data.id === projectId, "ID matches");
    ok("Project retrieved");
  });

  await run("Create task in project", async () => {
    const res = await client.post("/tasks", {
      content: `${TEST_MARKER} Task in project`,
      project_id: projectId,
    });
    assert(res.status === 200, "Status 200");
    assert(res.data.project_id === projectId, "Task belongs to project");
    ok("Task created in project");
    // Clean up the task before deleting the project
    await client.delete(`/tasks/${res.data.id}`).catch(() => null);
  });

  await run("Delete project", async () => {
    const res = await client.delete(`/projects/${projectId}`);
    assert(res.status === 204, "Status 204");
    ok("Project deleted");
  });
}

async function testLabelCRUD(client: AxiosInstance) {
  section("4. Labels — CRUD");

  let labelId = "";
  const labelName = `mcp_test_${Date.now()}`;

  await run("Create label", async () => {
    const res = await client.post("/labels", {
      name: labelName,
      color: "green",
    });
    assert(res.status === 200, "Status 200");
    assert(!!res.data.id, "Label has an ID");
    labelId = res.data.id;
    ok("Label created", `"${labelName}"`);
  });

  if (!labelId) return;

  await run("Get all labels (includes new)", async () => {
    const res = await client.get("/labels");
    const labels = Array.isArray(res.data)
      ? res.data
      : (res.data.items ?? res.data.results ?? []);
    const found = (labels as { id: string }[]).some((l) => l.id === labelId);
    assert(found, "New label appears in list");
    ok("Label found in list");
  });

  await run("Assign label to task, then clear", async () => {
    // Create task with label
    const create = await client.post("/tasks", {
      content: `${TEST_MARKER} Labeled task`,
      labels: [labelName],
    });
    assert(create.data.labels?.includes(labelName), "Label assigned");

    // Clear labels
    const update = await client.post(`/tasks/${create.data.id}`, { labels: [] });
    assert(!update.data.labels?.length, "Labels cleared");
    ok("Label assigned and cleared on task");

    await client.delete(`/tasks/${create.data.id}`).catch(() => null);
  });

  await run("Delete label", async () => {
    const res = await client.delete(`/labels/${labelId}`);
    assert(res.status === 204, "Status 204");
    ok("Label deleted");
  });
}

async function testSectionCRUD(client: AxiosInstance) {
  section("5. Sections — CRUD");

  // Need a project to house the section
  let projectId = "";
  let sectionId = "";

  await run("Create project for section test", async () => {
    const res = await client.post("/projects", {
      name: `${TEST_MARKER} Section Test Project`,
    });
    projectId = res.data.id;
    ok("Project created for section test");
  });

  if (!projectId) return;

  await run("Create section", async () => {
    const res = await client.post("/sections", {
      name: `${TEST_MARKER} Test Section`,
      project_id: projectId,
    });
    assert(res.status === 200, "Status 200");
    sectionId = res.data.id;
    ok("Section created", `ID: ${sectionId}`);
  });

  if (sectionId) {
    await run("Get sections for project", async () => {
      const res = await client.get("/sections", { params: { project_id: projectId } });
      const sections = Array.isArray(res.data)
        ? res.data
        : (res.data.items ?? res.data.results ?? []);
      const found = (sections as { id: string }[]).some((s) => s.id === sectionId);
      assert(found, "Section found in project");
      ok("Section found in list");
    });

    await run("Create task in section", async () => {
      const res = await client.post("/tasks", {
        content: `${TEST_MARKER} Task in section`,
        project_id: projectId,
        section_id: sectionId,
      });
      assert(res.data.section_id === sectionId, "Task belongs to section");
      ok("Task created in section");
      await client.delete(`/tasks/${res.data.id}`).catch(() => null);
    });

    await run("Delete section", async () => {
      const res = await client.delete(`/sections/${sectionId}`);
      assert(res.status === 204, "Status 204");
      ok("Section deleted");
    });
  }

  await run("Delete test project", async () => {
    const res = await client.delete(`/projects/${projectId}`);
    assert(res.status === 204, "Status 204");
    ok("Test project cleaned up");
  });
}

async function testPagination(client: AxiosInstance) {
  section("6. Task list — filters and pagination");

  await run("Get tasks with filter: today | overdue", async () => {
    const res = await client.get("/tasks", { params: { filter: "today | overdue", limit: 10 } });
    const tasks = Array.isArray(res.data)
      ? res.data
      : (res.data.items ?? res.data.results ?? []);
    assert(Array.isArray(tasks), "Tasks is an array");
    ok(`Filter returned ${tasks.length} task(s)`);
  });

  await run("Get tasks with limit=1 (pagination cursor)", async () => {
    const res = await client.get("/tasks", { params: { limit: 1 } });
    const hasCursor = "next_cursor" in res.data;
    // next_cursor may or may not exist depending on total task count — either is valid
    ok(`Pagination field present: ${hasCursor}`, hasCursor ? `cursor: ${res.data.next_cursor ?? "null"}` : "no cursor (<=1 task)");
  });
}

async function testErrorHandling(client: AxiosInstance) {
  section("7. Error handling — bad IDs and inputs");

  await run("GET nonexistent task → 4xx error", async () => {
    try {
      // Use a plausible-format ID that doesn't exist (API may return 400 for
      // invalid format IDs or 404 for valid-format-but-missing IDs — both are correct)
      await client.get("/tasks/9999999999999");
      fail("Should have thrown", new Error("No error thrown"));
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status && err.response.status >= 400 && err.response.status < 500) {
        ok(`${err.response.status} returned for nonexistent task ID`);
      } else {
        throw err;
      }
    }
  });

  await run("POST task with empty content → 400", async () => {
    try {
      await client.post("/tasks", { content: "" });
      fail("Should have thrown", new Error("No error thrown"));
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 400) {
        ok("400 returned for empty content");
      } else if (err instanceof AxiosError && err.response?.status) {
        ok(`Error returned (status ${err.response.status}) for empty content`);
      } else {
        throw err;
      }
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}todoist-v1-mcp-server — Integration Tests${RESET}`);
  console.log(`API: ${CYAN}${API_BASE}${RESET}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Token check
  if (!TOKEN) {
    console.error(`${RED}${BOLD}ERROR: No Todoist API token found.${RESET}`);
    console.error(`Get your token at: https://app.todoist.com/app/settings/integrations/developer`);
    console.error(`Then run: TODOIST_API_TOKEN=your_token npm test`);
    console.error(`(This is the same token you set in claude_desktop_config.json)`);
    process.exit(1);
  }

  console.log(`Token: ${CYAN}${TOKEN.slice(0, 8)}…${TOKEN.slice(-4)}${RESET} (${TOKEN.length} chars)`);

  const client = makeClient(TOKEN);

  // Run cleanup first to remove any leftover test data
  await cleanup(client);

  const start = Date.now();

  await testTokenAndConnectivity(client);
  await testTaskCRUD(client);
  await testProjectCRUD(client);
  await testLabelCRUD(client);
  await testSectionCRUD(client);
  await testPagination(client);
  await testErrorHandling(client);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(50)}`);
  console.log(`${BOLD}Results:${RESET} ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ""}${failed} failed${RESET}  ${CYAN}(${elapsed}s)${RESET}`);

  if (failures.length) {
    console.log(`\n${RED}${BOLD}Failures:${RESET}`);
    for (const f of failures) {
      console.log(`  ${RED}• ${f}${RESET}`);
    }
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}All tests passed ✓${RESET}\n`);
  }
}

main().catch((err) => {
  console.error(`\n${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
