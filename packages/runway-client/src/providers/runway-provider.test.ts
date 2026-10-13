import { describe, expect, it, vi } from "vitest";
import type { VideoProvider } from "./provider.js";
import { FakeRunwayProvider } from "./fake-provider.js";
import { RunwayProvider } from "./runway-provider.js";

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function providerWith(fetchFn: typeof fetch) {
    return new RunwayProvider({ apiKey: "key_test", apiVersion: "2024-11-06", baseUrl: "https://runway.test", fetchFn });
}

describe("RunwayProvider", () => {
    it("POSTs /v1/image_to_video with defaults", async () => {
        const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ id: "task_1", extra: true }));

        const result = await providerWith(fetchFn).startImageToVideo({ promptImage: "https://x/img.jpg", promptText: "neon city" });

        expect(result).toEqual({ id: "task_1" });
        const [url, init] = fetchFn.mock.calls[0]!;
        expect(String(url)).toBe("https://runway.test/v1/image_to_video");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(init?.body as string)).toEqual({
            model: "gen4_turbo",
            promptImage: "https://x/img.jpg",
            promptText: "neon city",
            ratio: "1280:720",
            duration: 5,
        });
    });

    it("rejects a start response without id", async () => {
        const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({}));
        await expect(providerWith(fetchFn).startImageToVideo({ promptImage: "x" })).rejects.toThrow();
    });

    it("GETs /v1/tasks/{id} and parses the task", async () => {
        const fetchFn = vi.fn<typeof fetch>(async () =>
            jsonResponse({ id: "a/b", createdAt: "2026-10-12T10:00:00Z", status: "SUCCEEDED", output: ["https://x/clip.mp4"] }),
        );

        const task = await providerWith(fetchFn).getTask("a/b");

        expect(String(fetchFn.mock.calls[0]![0])).toBe("https://runway.test/v1/tasks/a%2Fb");
        expect(fetchFn.mock.calls[0]![1]?.method).toBe("GET");
        expect(task).toMatchObject({ status: "SUCCEEDED", output: ["https://x/clip.mp4"] });
    });

    it("is interchangeable with the fake", () => {
        const providers: VideoProvider[] = [providerWith(fetch), new FakeRunwayProvider()];
        expect(providers).toHaveLength(2);
    });
});