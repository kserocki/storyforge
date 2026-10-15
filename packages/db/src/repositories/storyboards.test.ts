import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jobs, storyboards } from "../schema.js";
import { createTestDb, resetTestDb } from "../testing/index.js";
import { createStoryboard, getStoryboard } from "./storyboards.js";

const { db, close } = createTestDb();

beforeEach(() => resetTestDb(db));
afterAll(() => close());

const input = {
    brief: "20-second ad for headphones, neon city",
    referenceImageUrl: "https://example.com/ref.jpg",
    shots: [
        { prompt: "Wide neon street", durationS: 5 as const },
        { prompt: "Close-up of headphones", durationS: 10 as const },
    ],
};

describe("createStoryboard", () => {
    it("creates shots in order and one queued clip job per shot", async () => {
        const created = await createStoryboard(db, input);

        const sb = await getStoryboard(db, created.storyboardId);
        expect(sb?.referenceImageUrl).toBe(input.referenceImageUrl);
        expect(sb?.shots.map((s) => [s.position, s.prompt, s.durationS])).toEqual([
            [1, "Wide neon street", 5],
            [2, "Close-up of headphones", 10],
        ]);

        const allJobs = await db.select().from(jobs);
        expect(allJobs).toHaveLength(2);
        expect(allJobs.every((j) => j.kind === "clip" && j.status === "queued")).toBe(true);
        expect(new Set(allJobs.map((j) => j.shotId))).toEqual(new Set(created.shotIds));
    });

    it("rejects an empty shot list without touching the database", async () => {
        await expect(createStoryboard(db, { ...input, shots: [] })).rejects.toThrow(/at least one shot/);
        expect(await db.select().from(storyboards)).toHaveLength(0);
    });

    it("returns undefined for an unknown storyboard", async () => {
        expect(await getStoryboard(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
    });
});