export const TODOIST_API_BASE = "https://api.todoist.com/api/v1";
export const CHARACTER_LIMIT = 25000;

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

export enum TaskPriority {
  NORMAL = 1,
  MEDIUM = 2,
  HIGH = 3,
  URGENT = 4,
}
