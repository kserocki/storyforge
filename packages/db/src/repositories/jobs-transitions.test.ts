import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jobs, storyboards } from "../schema.js";
import { createTestDb, resetTestDb } from "../testing/index.js";
import { claimNextJob, heartbeat, LostJobError, markSubmitted, markSucceeded, recordFailure } from "./jobs.js";

const { db, close } = createTestDb();

beforeEach(() => resetTestDb(db));
afterAll(() => close());

async function claimedJob(maxAttempts = 5) {
    const [sb] = await db.insert(storyboards).values({ brief: "test" }).returning();
    await db.insert(jobs).values({ storyboardId: sb!.id, kind: "clip", maxAttempts });
    const job = await claimNextJob(db, "w1");
    if (!job) throw new Error("expected a job");
    return job;
}

describe("job transitions", () => {
    it("submit → succeed clears the lock", async () => {
        const job = await claimedJob();

        const submitted = await markSubmitted(db, job.id, "w1", "runway-task-1");
        expect(submitted).toMatchObject({ status: "waiting_provider", providerTaskId: "runway-task-1" });

        const done = await markSucceeded(db, job.id, "w1");
        expect(done).toMatchObject({ status: "succeeded", lockedBy: null, lockedAt: null });
    });

    it("retryable failure goes back to the queue with backoff", async () => {
        const job = await claimedJob();

        const retried = await recordFailure(db, job, "w1", { error: "503", retryable: true, retryDelayMs: 30_000 });

        expect(retried).toMatchObject({ status: "queued", lockedBy: null, lastError: "503", attempts: 1 });
        expect(retried.runAfter.getTime() - Date.now()).toBeGreaterThan(25_000);
        expect(await claimNextJob(db, "w1")).toBeUndefined(); // not runnable yet
    });

    it("permanent failure is final", async () => {
        const job = await claimedJob();
        const failed = await recordFailure(db, job, "w1", {
            error: "SAFETY.INPUT.TEXT",
            retryable: false,
            retryDelayMs: 0,
        });
        expect(failed.status).toBe("failed");
    });

    it("fails for good once attempts are exhausted", async () => {
        const job = await claimedJob(1); // attempts = 1 after the claim
        const failed = await recordFailure(db, job, "w1", { error: "503", retryable: true, retryDelayMs: 0 });
        expect(failed.status).toBe("failed");
    });

    it("refuses to touch a job locked by another worker", async () => {
        const job = await claimedJob();
        await expect(markSucceeded(db, job.id, "w2")).rejects.toBeInstanceOf(LostJobError);
        await expect(heartbeat(db, job.id, "w2")).rejects.toBeInstanceOf(LostJobError);
    });

    it("refuses an event the state machine does not allow", async () => {
        const job = await claimedJob();
        await markSucceeded(db, job.id, "w1");
        await db.update(jobs).set({ lockedBy: "w1" }).where(eq(jobs.id, job.id)); // even if still "ours"
        await expect(markSubmitted(db, job.id, "w1", "t")).rejects.toThrow(/no longer ours to submit/);
    });

    it("heartbeat refreshes locked_at", async () => {
        const job = await claimedJob();
        await db
            .update(jobs)
            .set({ lockedAt: sql`now() - interval '10 minutes'` })
            .where(eq(jobs.id, job.id));

        await heartbeat(db, job.id, "w1");

        const [row] = await db.select().from(jobs).where(eq(jobs.id, job.id));
        expect(Date.now() - row!.lockedAt!.getTime()).toBeLessThan(60_000);
    });
});
