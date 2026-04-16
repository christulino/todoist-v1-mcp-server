/**
 * Todoist API v1 HTTP client.
 *
 * Direct HTTP calls using axios — no SDK dependency that can drift from the API.
 * Response objects are passed through as-is; we do NOT enforce strict output schemas.
 * This is intentional: the Todoist API may return additional fields as it evolves,
 * and we want the agent to receive all available data.
 */

import axios, { AxiosError, AxiosInstance } from "axios";
import { TODOIST_API_BASE } from "./constants.js";

let _client: AxiosInstance | null = null;

export function getClient(): AxiosInstance {
  if (!_client) {
    throw new Error(
      "Todoist client not initialized. Call initClient(token) first."
    );
  }
  return _client;
}

export function initClient(apiToken: string): void {
  _client = axios.create({
    baseURL: TODOIST_API_BASE,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });
}

// ─── Generic request helpers ────────────────────────────────────────────────

export async function apiGet<T>(
  path: string,
  params?: Record<string, unknown>
): Promise<T> {
  const response = await getClient().get<T>(path, { params });
  return response.data;
}

export async function apiPost<T>(
  path: string,
  data?: Record<string, unknown>
): Promise<T> {
  const response = await getClient().post<T>(path, data);
  return response.data;
}

export async function apiDelete(path: string): Promise<void> {
  await getClient().delete(path);
}

// ─── Error handling ──────────────────────────────────────────────────────────

export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const detail =
        (error.response.data as { error?: string })?.error ?? "";
      switch (status) {
        case 400:
          return `Error 400: Bad request. ${detail} — Check your input parameters.`;
        case 401:
          return "Error 401: Unauthorized. Your TODOIST_API_TOKEN is invalid or expired.";
        case 403:
          return "Error 403: Forbidden. You don't have permission to access this resource.";
        case 404:
          return `Error 404: Resource not found. Check that the ID is correct. ${detail}`;
        case 429:
          return "Error 429: Rate limit exceeded. Wait a moment before retrying.";
        case 500:
          return "Error 500: Todoist server error. Try again in a few moments.";
        case 503:
          return "Error 503: Todoist service unavailable. Try again shortly.";
        default:
          return `Error ${status}: ${detail || error.message}`;
      }
    }
    if (error.code === "ECONNABORTED") {
      return "Error: Request timed out. Check your connection and try again.";
    }
    if (error.code === "ENOTFOUND") {
      return "Error: Cannot reach api.todoist.com. Check your internet connection.";
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
