import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
    it("defaults PROVIDER to fake", () => {
        expect(loadEnv({})).toEqual({ PROVIDER: "fake", RUNWAY_API_KEY: undefined, RUNWAY_API_VERSION: "2024-11-06" });
    });

    it("requires RUNWAY_API_KEY for the runway provider", () => {
        expect(() => loadEnv({ PROVIDER: "runway" })).toThrow(/RUNWAY_API_KEY/);
        expect(() => loadEnv({ PROVIDER: "runway", RUNWAY_API_KEY: "" })).toThrow(/RUNWAY_API_KEY/);
    });

    it("accepts runway with a key", () => {
        expect(loadEnv({ PROVIDER: "runway", RUNWAY_API_KEY: "key_123" }).RUNWAY_API_KEY).toBe("key_123");
    });

    it("rejects an unknown provider", () => {
        expect(() => loadEnv({ PROVIDER: "luma" })).toThrow();
    });
});
