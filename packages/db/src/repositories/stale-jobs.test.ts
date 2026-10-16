import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jobs, storyboards } from "../schema.js";
import { createTestDb, resetTestDb } from "../testing/index.js";
import { claimNextJob, markSubmitted, releaseJob, requeueStaleJobs } from "./jobs.js";

const { db, close } = createTestDb();

beforeEach(() => resetTestDb(db));
afterAll(() => close());

async function submittedJob() {
    const [sb] = await db.insert(storyboards).values({ brief: "test" }).returning();
    await db.insert(jobs).values({ storyboardId: sb!.id, kind: "clip" });
    const job = (await claimNextJob(db, "w1"))!;
    return markSubmitted(db, job.id, "w1", "runway-task-1");
}

describe("requeueStaleJobs", () => {
    it("requeues jobs of a dead worker but keeps provider_task_id and the used attempt", async () => {
        const job = await submittedJob();
        await db
            .update(jobs)
            .set({ lockedAt: sql`now() - interval '10 minutes'` })
            .where(eq(jobs.id, job.id));

        const requeued = await requeueStaleJobs(db, 5 * 60_000);

        expect(requeued).toHaveLength(1);
        expect(requeued[0]).toMatchObject({
            status: "queued",
            lockedBy: null,
            providerTaskId: "runway-task-1",
            attempts: 1,
        });
        expect(await claimNextJob(db, "w2")).toMatchObject({
            id: job.id,
            attempts: 2,
            providerTaskId: "runway-task-1",
        });
    });

    it("leaves jobs with a fresh heartbeat alone", async () => {
        await submittedJob();
        expect(await requeueStaleJobs(db, 5 * 60_000)).toHaveLength(0);
    });
});

describe("releaseJob", () => {
    it("puts the job straight back in the queue", async () => {
        const job = await submittedJob();
        const released = await releaseJob(db, job.id, "w1");
        expect(released).toMatchObject({ status: "queued", lockedBy: null, providerTaskId: "runway-task-1" });
        expect(await claimNextJob(db, "w2")).toMatchObject({ id: job.id });
    });
});
