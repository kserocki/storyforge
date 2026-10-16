import {
    claimNextJob,
    type Db,
    type Job,
    LostJobError,
    markSucceeded,
    recordFailure,
    releaseJob,
    requeueStaleJobs,
} from "@storyforge/db";
import type { Logger } from "../logger/logger.js";
import type { JobKind } from "@storyforge/shared";
import { type BackoffOptions, computeBackoff, sleep } from "@storyforge/runway-client";
import { Semaphore } from "../semaphore/semaphore.js";
import { classifyError } from "../error/classify-error.js";

export interface JobContext {
    db: Db;
    workerId: string;
    log: Logger;
    signal: AbortSignal;
}

// Does the work for one job
export type JobHandler = (job: Job, ctx: JobContext) => Promise<void>;

export interface FailureClassification {
    retryable: boolean;
    message: string;
}

export interface RunWorkerOptions {
    db: Db;
    workerId: string;
    handlers: Partial<Record<JobKind, JobHandler>>;
    log: Logger;
    signal: AbortSignal;
    concurrency: number;
    idleMs: number;
    staleAfterMs: number;
    // Decides retry vs permanent failure (default: classifyError)
    classify?: (err: unknown) => FailureClassification;
    retryBackoff?: BackoffOptions;
}

const DEFAULT_RETRY_BACKOFF: BackoffOptions = { baseMs: 5_000, maxMs: 5 * 60_000 };

export async function runWorker(options: RunWorkerOptions): Promise<void> {
    const { db, workerId, handlers, log, signal, idleMs, staleAfterMs } = options;
    const classify = options.classify ?? classifyError;
    const retryBackoff = options.retryBackoff ?? DEFAULT_RETRY_BACKOFF;
    const kinds = Object.keys(handlers) as JobKind[];
    const slots = new Semaphore(options.concurrency);
    const inFlight = new Set<Promise<void>>();
    let lastStaleCheck = 0;

    async function runJob(job: Job): Promise<void> {
        const handler = handlers[job.kind]!;
        const ctx: JobContext = { db, workerId, log, signal };
        log("job_started", { jobId: job.id, kind: job.kind, attempt: job.attempts });
        try {
            await handler(job, ctx);
            await markSucceeded(db, job.id, workerId);
            log("job_succeeded", { jobId: job.id });
        } catch (err) {
            if (err instanceof LostJobError) {
                log("job_lost", { jobId: job.id, error: err.message }); // someone else own it now
            } else if (signal.aborted) {
                await releaseJob(db, job.id, workerId); // shutdown, not the job's fault
                log("job_released", { jobId: job.id });
            } else {
                const { retryable, message } = classify(err);
                const retryDelayMs = computeBackoff(job.attempts, retryBackoff);
                const updated = await recordFailure(db, job, workerId, { error: message, retryable, retryDelayMs });
                log(updated.status === "queued" ? "job_retry_scheduled" : "job_failed", {
                    jobId: job.id,
                    error: message,
                    ...(updated.status === "queued" && { retryDelayMs }),
                });
            }
        }
    }

    while (!signal.aborted) {
        if (Date.now() - lastStaleCheck >= staleAfterMs / 2) {
            lastStaleCheck = Date.now();
            const requeued = await requeueStaleJobs(db, staleAfterMs);
            if (requeued.length > 0) log("stale_jobs_requeued", { jobIds: requeued.map((j) => j.id) });
        }

        let release: () => void;
        try {
            release = await slots.acquire(signal);
        } catch {
            break;
        }

        const job = await claimNextJob(db, workerId, { kinds });
        if (!job) {
            release();
            await sleep(idleMs, signal).catch(() => {});
            continue;
        }

        const running: Promise<void> = runJob(job)
            .catch((err: unknown) => log("job_crashed", { jobId: job.id, error: String(err) }))
            .finally(() => {
                release();
                inFlight.delete(running);
            });
        inFlight.add(running);
    }

    await Promise.allSettled(inFlight);
}
