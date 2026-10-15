import type { JobKind } from "@storyforge/shared";
import { type Job, jobs } from "../schema.js";
import type { Db } from "../client.js";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

export interface ClaimOptions {
    /** Only claim jobs of these kinds (default: any kind). */
    kinds?: readonly JobKind[];
}

export async function claimNextJob(db: Db, workerId: string, options: ClaimOptions = {}): Promise<Job | undefined> {
    const runnable = and(
        eq(jobs.status, "queued"),
        lte(jobs.runAfter, sql`now()`),
        options.kinds ? inArray(jobs.kind, [...options.kinds]) : undefined,
    );

    const next = db
        .select({ id: jobs.id })
        .from(jobs)
        .where(runnable)
        .orderBy(asc(jobs.runAfter), asc(jobs.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });

    const [job] = await db
        .update(jobs)
        .set({
            status: "running",
            lockedAt: sql`now()`,
            lockedBy: workerId,
            attempts: sql`${jobs.attempts} + 1`,
        })
        .where(inArray(jobs.id, next))
        .returning();

    return job;
}
