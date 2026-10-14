import { RunwayApiError } from "./errors.js";

export interface RunwayHttpConfig {
    apiKey: string;
    apiVersion: string; // "2024-11-06"
    baseUrl?: string; // default "https://api.dev.runwayml.com"
    fetchFn?: typeof fetch;
}

export const DEFAULT_RUNWAY_BASE_URL = "https://api.dev.runwayml.com";

// Network errors (fetch throws TypeError) are NOT RunwayApiError, so withRetry's default
// treats them as non-retryable; callers can opt in via isRetryable. Aborts are never retried.
export async function runwayFetch(
    config: RunwayHttpConfig,
    path: string, // e.g. "/v1/tasks/abc"
    init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; signal?: AbortSignal },
): Promise<unknown> {
    const fetchFn = config.fetchFn ?? fetch;
    const url = new URL(path, config.baseUrl ?? DEFAULT_RUNWAY_BASE_URL);

    const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        "X-Runway-Version": config.apiVersion,
    };

    if (init?.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetchFn(url, {
        method: init?.method ?? "GET",
        headers,
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        signal: init?.signal,
    });

    if (!res.ok) {
        throw new RunwayApiError(res.status, await res.text());
    }

    // DELETE returns 204 with no content
    if (res.status === 204) return undefined;

    return res.json();
}
