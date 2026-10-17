import { jobs } from "@storyforge/db";
import { createTestDb, resetTestDb } from "@storyforge/db/testing";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runWorker, type RunWorkerOptions } from "./run-worker.js";
import { insertJobs, silentLog, waitFor } from "./test-helpers.js";

const { db, close } = createTestDb();

beforeEach(() => resetTestDb(db));
afterAll(() => close());

const allJobs = () => db.select().from(jobs);

function start(overrides: Partial<RunWorkerOptions> & Pick<RunWorkerOptions, "handlers">) {
    const ac = new AbortController();
    const done = runWorker({
        db,
        workerId: "test-worker",
        log: silentLog,
        signal: ac.signal,
        concurrency: 2,
        idleMs: 10,
        staleAfterMs: 60_000,
        retryBackoff: { baseMs: 1, maxMs: 1 },
        ...overrides,
    });
    return { stop: () => (ac.abort(), done) };
}

describe("runWorker", () => {
    it("runs every job, at most `concurrency` at a time", async () => {
        await insertJobs(db, 6);
        let running = 0;
        let peak = 0;

        const worker = start({
            handlers: {
                clip: async () => {
                    running++;
                    peak = Math.max(peak, running);
                    await new Promise((r) => setTimeout(r, 20));
                    running--;
                },
            },
        });
        await waitFor(async () => (await allJobs()).every((j) => j.status === "succeeded"));
        await worker.stop();

        expect(peak).toBe(2);
    });

    it("respects the global provider limit even with free local slots", async () => {
        await insertJobs(db, 4);
        let running = 0;
        let peak = 0;

        const worker = start({
            concurrency: 3,
            providerConcurrency: 1,
            handlers: {
                clip: async () => {
                    running++;
                    peak = Math.max(peak, running);
                    await new Promise((r) => setTimeout(r, 20));
                    running--;
                },
            },
        });
        await waitFor(async () => (await allJobs()).every((j) => j.status === "succeeded"));
        await worker.stop();

        expect(peak).toBe(1);
    });

    it("retries a failing job and marks it failed after max attempts", async () => {
        await insertJobs(db, 1, "clip", 3);
        let calls = 0;

        const worker = start({
            handlers: {
                clip: async () => {
                    calls++;
                    throw new Error("boom");
                },
            },
        });
        await waitFor(async () => (await allJobs())[0]!.status === "failed");
        await worker.stop();

        expect(calls).toBe(3);
        expect((await allJobs())[0]).toMatchObject({ attempts: 3, lastError: "Error: boom", lockedBy: null });
    });

    it("does not retry what classify marks as permanent", async () => {
        await insertJobs(db, 1);

        const worker = start({
            handlers: { clip: async () => Promise.reject(new Error("bad input")) },
            classify: (err) => ({ retryable: false, message: String(err) }),
        });
        await waitFor(async () => (await allJobs())[0]!.status === "failed");
        await worker.stop();

        expect((await allJobs())[0]!.attempts).toBe(1);
    });

    it("hands a running job back to the queue on shutdown", async () => {
        await insertJobs(db, 1);
        let started = false;

        const worker = start({
            handlers: {
                clip: (_job, ctx) =>
                    new Promise((_resolve, reject) => {
                        started = true;
                        ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason), { once: true });
                    }),
            },
        });
        await waitFor(async () => started);
        await worker.stop();

        expect((await allJobs())[0]).toMatchObject({ status: "queued", lockedBy: null });
    });

    it("ignores job kinds it has no handler for", async () => {
        await insertJobs(db, 1, "stitch");
        const worker = start({ handlers: { clip: async () => {} } });
        await new Promise((r) => setTimeout(r, 100));
        await worker.stop();
        expect((await allJobs())[0]!.status).toBe("queued");
    });
});
