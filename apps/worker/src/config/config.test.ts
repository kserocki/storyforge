import { describe, expect, it } from "vitest";
import { createLogger } from "../logger/logger.js";
import { loadWorkerConfig } from "./config.js";

describe("loadWorkerConfig", () => {
    it("applies defaults and coerces numbers from strings", () => {
        const config = loadWorkerConfig({ DATABASE_URL: "postgres://x", WORKER_CONCURRENCY: "4" });
        expect(config).toMatchObject({ PROVIDER: "fake", WORKER_CONCURRENCY: 4, PROVIDER_CONCURRENCY: 1 });
        expect(config.WORKER_ID).toMatch(/-\d+$/);
    });

    it("requires DATABASE_URL and a Runway key for the runway provider", () => {
        expect(() => loadWorkerConfig({})).toThrow(/DATABASE_URL/);
        expect(() => loadWorkerConfig({ DATABASE_URL: "postgres://x", PROVIDER: "runway" })).toThrow(/RUNWAY_API_KEY/);
    });

    it("rejects non-positive numbers", () => {
        expect(() => loadWorkerConfig({ DATABASE_URL: "postgres://x", WORKER_CONCURRENCY: "0" })).toThrow();
    });
});

describe("createLogger", () => {
    it("writes one JSON line with base fields", () => {
        const lines: string[] = [];
        createLogger({ worker: "w1" }, (l) => lines.push(l))("job_claimed", { jobId: "j1" });
        expect(JSON.parse(lines[0]!)).toMatchObject({ event: "job_claimed", worker: "w1", jobId: "j1" });
    });
});
