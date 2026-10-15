import type { JobStatus } from "./jobs.js";

/** Everything that can happen to a job. Each event moves it from a set of allowed states to exactly one state */
export type JobEvent = "claim" | "submit" | "succeed" | "retry" | "fail" | "cancel" | "release";

const ACTIVE = ["running", "waiting_provider"] as const satisfies readonly JobStatus[];

const TRANSITIONS: Record<JobEvent, { from: readonly JobStatus[]; to: JobStatus }> = {
    claim: { from: ["queued"], to: "running" }, // worker took it from the queue
    submit: { from: ["running"], to: "waiting_provider" }, // provider accepted the task, we are polling
    succeed: { from: ACTIVE, to: "succeeded" },
    retry: { from: ACTIVE, to: "queued" }, // transient error, attempts left → back to the queue with backoff
    fail: { from: ACTIVE, to: "failed" }, // permanent error or attempts exhausted
    cancel: { from: ["queued", ...ACTIVE], to: "cancelled" },
    release: { from: ACTIVE, to: "queued" }, // stale lock / graceful shutdown → someone else may take it
};

export class InvalidTransitionError extends Error {
    constructor(
        readonly from: JobStatus,
        readonly event: JobEvent,
    ) {
        super(`Cannot ${event} a job that is ${from}`);
        this.name = "InvalidTransitionError";
    }
}

export function canTransition(from: JobStatus, event: JobEvent): boolean {
    return TRANSITIONS[event].from.includes(from);
}

/** Next status for `event`, or throws InvalidTransitionError - the single source of truth for job lifecycles. */
export function nextJobStatus(from: JobStatus, event: JobEvent): JobStatus {
    if (!canTransition(from, event)) throw new InvalidTransitionError(from, event);
    return TRANSITIONS[event].to;
}

/** Statuses an event may start from - handy for `WHERE status IN (...)` guards in SQL */
export function allowedFrom(event: JobEvent): readonly JobStatus[] {
    return TRANSITIONS[event].from;
}

export function isTerminalJobStatus(status: JobStatus): boolean {
    return status === "succeeded" || status === "failed" || status === "cancelled";
}
