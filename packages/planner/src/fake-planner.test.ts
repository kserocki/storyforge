import { describe, expect, it } from "vitest";
import { createPlanner } from "./create-planner.js";
import { FakeShotPlanner } from "./fake-planner.js";
import { LlmShotPlanner } from "./gemini-planner.js";

describe("FakeShotPlanner", () => {
    it("is deterministic and totals 20 seconds", async () => {
        const planner = new FakeShotPlanner();
        const a = await planner.plan("headphones in a neon city");
        const b = await planner.plan("headphones in a neon city");

        expect(a).toEqual(b);
        expect(a.shots.reduce((sum, s) => sum + s.durationS, 0)).toBe(20);
        expect(a.shots.every((s) => s.prompt.startsWith("headphones in a neon city"))).toBe(true);
    });
});

describe("createPlanner", () => {
    it("picks the implementation from config", () => {
        expect(createPlanner({ PLANNER: "fake" })).toBeInstanceOf(FakeShotPlanner);
        expect(createPlanner({ PLANNER: "gemini", GEMINI_API_KEY: "key" })).toBeInstanceOf(LlmShotPlanner);
    });

    it("requires a key for gemini", () => {
        expect(() => createPlanner({ PLANNER: "gemini" })).toThrow(/GEMINI_API_KEY/);
    });
});
