import { type Job, jobs } from "../schema.js";
import type { Db } from "../client.js";
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { JobKind } from "@storyforge/shared";
import { allowedFrom, eventTarget, type JobEvent } from "@storyforge/shared";

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

/** Thrown when a transition matched no row: the job changed status or another worker took it over. */
export class LostJobError extends Error {
    constructor(
        readonly jobId: string,
        readonly event: JobEvent,
    ) {
        super(`Job ${jobId} is no longer ours to ${event} (status changed or lock taken over)`);
        this.name = "LostJobError";
    }
}

// Column values or SQL expressions such as sql`now()` - what .set() accepts
type JobUpdate = PgUpdateSetSource<typeof jobs>;

/**
 * Applies a state-machine event to a job this worker holds. The WHERE clause is the guard:
 * the row must still be in a status the event allows AND still be locked by `workerId`.
 * Like optimistic locking (`WHERE version = ?`) — if someone else moved the job, we get 0 rows.
 */
async function transition(db: Db, jobId: string, workerId: string, event: JobEvent, set: JobUpdate = {}) {
    const [job] = await db
        .update(jobs)
        .set({ ...set, status: eventTarget(event) })
        .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), inArray(jobs.status, [...allowedFrom(event)])))
        .returning();

    if (!job) throw new LostJobError(jobId, event);
    return job;
}

const unlocked = { lockedAt: null, lockedBy: null } satisfies JobUpdate;

/** Provider accepted the task: remember its id *before* polling, so a restart resumes instead of paying twice. */
export function markSubmitted(db: Db, jobId: string, workerId: string, providerTaskId: string): Promise<Job> {
    return transition(db, jobId, workerId, "submit", { providerTaskId, lockedAt: sql`now()` });
}

export function markSucceeded(db: Db, jobId: string, workerId: string): Promise<Job> {
    return transition(db, jobId, workerId, "succeed", { ...unlocked, lastError: null });
}

export interface FailureInput {
    error: string;
    /** Transient error (429/5xx, flaky output)? Permanent ones (400, SAFETY.INPUT.*) never retry */
    retryable: boolean;
    /** Backoff before the next attempt (the worker computes it, e.g. with computeBackoff). */
    retryDelayMs: number;
}

/** Back to the queue with backoff while attempts remain; otherwise `failed` for good. */
export function recordFailure(db: Db, job: Job, workerId: string, failure: FailureInput): Promise<Job> {
    const lastError = failure.error.slice(0, 200);
    if (failure.retryable && job.attempts < job.maxAttempts) {
        return transition(db, job.id, workerId, "retry", {
            ...unlocked,
            lastError,
            runAfter: sql`now() + make_interval(secs => ${failure.retryDelayMs / 1000})`,
        });
    }
    return transition(db, job.id, workerId, "fail", { ...unlocked, lastError });
}

/** Proves the worker is still alive while it polls a long provider task (see requeueStaleJobs). */
export async function heartbeat(db: Db, jobId: string, workerId: string): Promise<void> {
    const rows = await db
        .update(jobs)
        .set({ lockedAt: sql`now()` })
        .where(
            and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), inArray(jobs.status, ["running", "waiting_provider"])),
        )
        .returning({ id: jobs.id });
    if (rows.length === 0) throw new LostJobError(jobId, "release");
}

/** Graceful shutdown: hand the job back untouched (provider_task_id stays, so the next worker resumes polling). */
export function releaseJob(db: Db, jobId: string, workerId: string): Promise<Job> {
    return transition(db, jobId, workerId, "release", { ...unlocked, runAfter: sql`now()` });
}

/**
 * Crash recovery: active jobs whose lock wasn't refreshed (heartbeat) for `staleAfterMs` belong to a dead
 * worker → back to the queue. The attempt it used is NOT refunded: a job that keeps killing workers
 * must eventually hit max_attempts instead of looping forever ("poison message").
 */
export async function requeueStaleJobs(db: Db, staleAfterMs: number): Promise<Job[]> {
    return db
        .update(jobs)
        .set({ ...unlocked, status: eventTarget("release"), runAfter: sql`now()` })
        .where(
            and(
                inArray(jobs.status, [...allowedFrom("release")]),
                lt(jobs.lockedAt, sql`now() - make_interval(secs => ${staleAfterMs / 1000})`),
            ),
        )
        .returning();
}
