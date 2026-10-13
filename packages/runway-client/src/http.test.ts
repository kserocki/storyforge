import { describe, expect, it, vi } from "vitest";
import { RunwayApiError } from "./errors.js";
import { runwayFetch, type RunwayHttpConfig } from "./http.js";

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function configWith(fetchFn: typeof fetch): RunwayHttpConfig {
    return { apiKey: "key_test", apiVersion: "2024-11-06", fetchFn };
}

describe("runwayFetch", () => {
    it("sends auth + version headers and parses JSON", async () => {
        const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ id: "t1" }));

        const result = await runwayFetch(configWith(fetchFn), "/v1/tasks/t1");

        expect(result).toEqual({ id: "t1" });
        expect(fetchFn).toHaveBeenCalledTimes(1);
        const [url, init] = fetchFn.mock.calls[0]!;
        expect(String(url)).toBe("https://api.dev.runwayml.com/v1/tasks/t1");
        expect(init?.method).toBe("GET");
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer key_test");
        expect(headers["X-Runway-Version"]).toBe("2024-11-06");
    });

    it("serializes the body for POST", async () => {
        const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ id: "t2" }));

        await runwayFetch(configWith(fetchFn), "/v1/image_to_video", { method: "POST", body: { promptText: "x" } });

        const [, init] = fetchFn.mock.calls[0]!;
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ promptText: "x" }));
        expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("throws RunwayApiError for non-2xx responses", async () => {
        const fetchFn = vi.fn<typeof fetch>(async () => new Response("slow down", { status: 429 }));

        const promise = runwayFetch(configWith(fetchFn), "/v1/tasks/t1");

        await expect(promise).rejects.toBeInstanceOf(RunwayApiError);
        await expect(promise).rejects.toMatchObject({ status: 429, body: "slow down", retryable: true });
    });
});

describe("RunwayApiError.retryable", () => {
    it.each([
        [400, false],
        [401, false],
        [404, false],
        [405, false],
        [429, true],
        [502, true],
        [503, true],
        [504, true],
    ])("status %i → retryable %s", (status, expected) => {
        expect(new RunwayApiError(status, "").retryable).toBe(expected);
    });

    it("has a readable name", () => {
        expect(new RunwayApiError(500, "").name).toBe("RunwayApiError");
    });
});