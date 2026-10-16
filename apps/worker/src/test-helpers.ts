import type { JobKind } from "@storyforge/shared";
import { type Db, jobs, storyboards } from "@storyforge/db";

export async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000, everyMs = 20): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
        if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeoutMs} ms`);
        await new Promise((r) => setTimeout(r, everyMs));
    }
}

export async function insertJobs(db: Db, count: number, kind: JobKind = "clip", maxAttempts = 5) {
    const [sb] = await db.insert(storyboards).values({ brief: "test" }).returning();
    return db
        .insert(jobs)
        .values(Array.from({ length: count }, () => ({ storyboardId: sb!.id, kind, maxAttempts })))
        .returning();
}

export const silentLog = () => {};
