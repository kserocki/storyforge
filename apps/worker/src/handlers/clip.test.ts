import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createStoryboard, jobs, shots } from "@storyforge/db";
import { createTestDb, resetTestDb } from "@storyforge/db/testing";
import { FakeRunwayProvider, type FakeRunwayProviderOptions } from "@storyforge/runway-client";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClipHandler } from "./clip.js";
import { LocalAssetStorage } from "../storage/storage.js";
import { runWorker } from "../worker/run-worker.js";
import { silentLog, waitFor } from "../worker/test-helpers.js";

const { db, close } = createTestDb();
let dir: string;
let sourceUrl: string;

beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sf-clip-"));
    await writeFile(path.join(dir, "fake.mp4"), "video");
    sourceUrl = pathToFileURL(path.join(dir, "fake.mp4")).href;
});
beforeEach(() => resetTestDb(db));
afterAll(() => close());

const storyboard = (shotCount = 2) =>
    createStoryboard(db, {
        brief: "ad",
        referenceImageUrl: "https://example.com/ref.jpg",
        shots: Array.from({ length: shotCount }, (_, i) => ({ prompt: `shot ${i + 1}`, durationS: 5 as const })),
    });

async function runUntilSettled(provider: FakeRunwayProvider) {
    const ac = new AbortController();
    const storage = new LocalAssetStorage(path.join(dir, "assets"));
    const done = runWorker({
        db,
        workerId: "w1",
        handlers: {
            clip: createClipHandler({
                provider,
                storage,
                pollIntervalMs: 1,
                pollRetry: { maxAttempts: 5, baseMs: 1, maxMs: 1 },
            }),
        },
        log: silentLog,
        signal: ac.signal,
        concurrency: 2,
        idleMs: 10,
        staleAfterMs: 60_000,
        retryBackoff: { baseMs: 1, maxMs: 1 },
    });
    await waitFor(async () => (await db.select().from(jobs)).every((j) => ["succeeded", "failed"].includes(j.status)));
    ac.abort();
    await done;
}

const fake = (options: FakeRunwayProviderOptions = {}) => new FakeRunwayProvider({ outputUrl: sourceUrl, ...options });

describe("clip handler", () => {
    it("generates every shot's clip and stores our own copy", async () => {
        const created = await storyboard(2);

        await runUntilSettled(fake());

        const allJobs = await db.select().from(jobs);
        expect(allJobs.every((j) => j.status === "succeeded" && j.providerTaskId)).toBe(true);
        for (const shotId of created.shotIds) {
            const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
            expect(shot!.clipUrl).toContain(`clips/${shotId}.mp4`);
            expect(await readFile(new URL(shot!.clipUrl!), "utf8")).toBe("video");
        }
    });

    it("resumes an already started provider task instead of paying for a new one", async () => {
        const created = await storyboard(1);
        const provider = fake();
        const { id: taskId } = await provider.startImageToVideo({ promptImage: "x" });
        await db.update(jobs).set({ providerTaskId: taskId }).where(eq(jobs.id, created.jobIds[0]!));
        const start = vi.spyOn(provider, "startImageToVideo");

        await runUntilSettled(provider);

        expect(start).not.toHaveBeenCalled();
        expect((await db.select().from(jobs))[0]).toMatchObject({ status: "succeeded", providerTaskId: taskId });
    });

    it("fails permanently on a moderation failure", async () => {
        await storyboard(1);

        await runUntilSettled(fake({ failWith: { failure: "Prompt rejected", failureCode: "SAFETY.INPUT.TEXT" } }));

        expect((await db.select().from(jobs))[0]).toMatchObject({ status: "failed", attempts: 1 });
        expect((await db.select().from(jobs))[0]!.lastError).toContain("SAFETY.INPUT.TEXT");
    });

    it("retries through transient 503s from the provider", async () => {
        await storyboard(1);
        await runUntilSettled(fake({ flakyGetTask: 3 })); // polling's own withRetry absorbs these
        expect((await db.select().from(jobs))[0]!.status).toBe("succeeded");
    });
});
