import { describe, expect, it } from "vitest";
import { computeBackoff } from "./backoff.js";

const base = { baseMs: 1000, maxMs: 30_000 };

describe("computeBackoff", () => {
    it.each([
        [1, 1000],
        [2, 2000],
        [3, 4000],
        [50, 30_000],
    ])("attempt %i without jitter → %i ms", (attempt, expected) => {
        expect(computeBackoff(attempt, { ...base, random: () => 0 })).toBe(expected);
    });

    it.each([
        [1, 1500],
        [2, 3000],
        [3, 6000],
        [50, 45_000],
    ])("attempt %i with full jitter → %i ms", (attempt, expected) => {
        expect(computeBackoff(attempt, { ...base, random: () => 1 })).toBe(expected);
    });

    it("respects a custom jitterRatio", () => {
        expect(computeBackoff(1, { ...base, jitterRatio: 0.2, random: () => 1 })).toBe(1200);
    });

    it("never exceeds maxMs * (1 + jitterRatio)", () => {
        for (let attempt = 1; attempt <= 100; attempt++) {
            expect(computeBackoff(attempt, { ...base, random: () => 1 })).toBeLessThanOrEqual(30_000 * 1.5);
        }
    });
});
