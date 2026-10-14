import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jobs, storyboards } from "./schema.js";
import { createTestDb, resetTestDb } from "./testing/index.js";

const { db, close } = createTestDb();

beforeEach(() => resetTestDb(db));
afterAll(() => close());

describe("jobs table defaults", () => {
    it("inserts a queued job with only the required columns", async () => {
        const [sb] = await db.insert(storyboards).values({ brief: "test" }).returning();
        const [job] = await db.insert(jobs).values({ storyboardId: sb!.id, kind: "stitch" }).returning();

        expect(job).toMatchObject({ status: "queued", attempts: 0, maxAttempts: 5, lockedAt: null, lockedBy: null });
        expect(job!.runAfter).toBeInstanceOf(Date);
    });

    it("deletes jobs together with their storyboard (cascade)", async () => {
        const [sb] = await db.insert(storyboards).values({ brief: "test" }).returning();
        await db.insert(jobs).values({ storyboardId: sb!.id, kind: "stitch" });

        await db.delete(storyboards).where(eq(storyboards.id, sb!.id));

        expect(await db.select().from(jobs)).toHaveLength(0);
    });
});
