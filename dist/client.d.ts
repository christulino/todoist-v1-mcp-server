/**
 * Todoist API v1 HTTP client.
 *
 * Direct HTTP calls using axios — no SDK dependency that can drift from the API.
 * Response objects are passed through as-is; we do NOT enforce strict output schemas.
 * This is intentional: the Todoist API may return additional fields as it evolves,
 * and we want the agent to receive all available data.
 */
import { AxiosInstance } from "axios";
export declare function getClient(): AxiosInstance;
export declare function initClient(apiToken: string): void;
export declare function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T>;
export declare function apiPost<T>(path: string, data?: Record<string, unknown>): Promise<T>;
export declare function apiDelete(path: string): Promise<void>;
export declare function handleApiError(error: unknown): string;
//# sourceMappingURL=client.d.ts.map