import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jobs, storyboards } from "../schema.js";
import { createTestDb, resetTestDb } from "../testing/index.js";
import { claimNextJob } from "./jobs.js";

const { db, close } = createTestDb();
const other = createTestDb(); // a second pool = a second "worker process"

beforeEach(() => resetTestDb(db));
afterAll(async () => {
    await close();
    await other.close();
});

async function insertJobs(count: number, overrides: Partial<typeof jobs.$inferInsert> = {}) {
    const [sb] = await db.insert(storyboards).values({ brief: "test" }).returning();
    return db
        .insert(jobs)
        .values(Array.from({ length: count }, () => ({ storyboardId: sb!.id, kind: "clip" as const, ...overrides })))
        .returning();
}

describe("claimNextJob", () => {
    it("marks the job running, locked by the worker, and counts the attempt", async () => {
        const [inserted] = await insertJobs(1);

        const job = await claimNextJob(db, "worker-a");

        expect(job).toMatchObject({ id: inserted!.id, status: "running", lockedBy: "worker-a", attempts: 1 });
        expect(job!.lockedAt).toBeInstanceOf(Date);
        expect(await claimNextJob(db, "worker-a")).toBeUndefined();
    });

    it("skips jobs whose run_after is in the future", async () => {
        await insertJobs(1, { runAfter: new Date(Date.now() + 60_000) });
        expect(await claimNextJob(db, "worker-a")).toBeUndefined();
    });

    it("filters by kind", async () => {
        await insertJobs(1, { kind: "stitch" });
        expect(await claimNextJob(db, "worker-a", { kinds: ["clip"] })).toBeUndefined();
        expect(await claimNextJob(db, "worker-a", { kinds: ["stitch"] })).toMatchObject({ kind: "stitch" });
    });

    it("never hands the same job to two concurrent workers", async () => {
        const inserted = await insertJobs(20);

        // 30 claims at once from two pools: exactly 20 succeed, all distinct.
        const results = await Promise.all(
            Array.from({ length: 30 }, (_, i) => claimNextJob(i % 2 ? db : other.db, `worker-${i}`)),
        );
        const claimed = results.filter((j) => j !== undefined).map((j) => j.id);

        expect(claimed).toHaveLength(20);
        expect(new Set(claimed)).toEqual(new Set(inserted.map((j) => j.id)));
    });

    it("skips a row locked by another transaction instead of waiting for it", async () => {
        const [first, second] = await insertJobs(2);
        await db
            .update(jobs)
            .set({ createdAt: sql`now() - interval '1 hour'` })
            .where(eq(jobs.id, first!.id));

        await other.db.transaction(async (tx) => {
            // Another worker holds `first` (oldest) mid-transaction…
            await tx.execute(sql`SELECT id FROM jobs WHERE id = ${first!.id} FOR UPDATE`);
            // …so this claim returns `second` immediately rather than blocking.
            const job = await claimNextJob(db, "worker-b");
            expect(job?.id).toBe(second!.id);
        });
    });
});
