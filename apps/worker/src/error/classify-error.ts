import { RunwayApiError, TaskFailedError } from "@storyforge/runway-client";
import type { FailureClassification } from "../worker/run-worker.js";
import { InvalidTransitionError } from "@storyforge/shared";
import { ZodError } from "zod";

/**
 * Job-level retry rules. Broader than withRetry (one HTTP request, seconds): a job retry waits minutes
 * in the queue, survives restarts and costs nothing until it runs again — so a network blip is worth it.
 */
export function classifyError(err: unknown): FailureClassification {
    if (err instanceof RunwayApiError) {
        // 429/502–504 transient; 400/401/404/405 are our bug — retrying just burns attempts.
        return { retryable: err.retryable, message: `Runway HTTP ${err.status}: ${err.body.slice(0, 200)}` };
    }

    if (err instanceof TaskFailedError) {
        const { task } = err;
        if (task.status === "CANCELED") return { retryable: false, message: `Runway task ${task.id} was canceled` };
        const code = task.failureCode ?? "UNKNOWN";
        // SAFETY.* = moderation: re-running the same prompt fails again and Runway doesn't refund SAFETY.INPUT.
        // INTERNAL.* (e.g. BAD_OUTPUT) and unknown codes are worth another attempt.
        return { retryable: !code.startsWith("SAFETY."), message: `Runway ${code}: ${task.failure}` };
    }

    // wrong shape of object which we don't understand, and we have a bug :(
    if (err instanceof ZodError) return { retryable: false, message: err.message };
    if (err instanceof InvalidTransitionError) return { retryable: false, message: err.message };
    if (err instanceof PermanentJobError) return { retryable: false, message: err.message };

    return { retryable: true, message: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
}

export class PermanentJobError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PermanentJobError";
    }
}
