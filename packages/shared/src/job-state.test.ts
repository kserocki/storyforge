import { describe, expect, it } from "vitest";
import { InvalidTransitionError, isTerminalJobStatus, nextJobStatus, type JobEvent } from "./job-state.js";
import { JOB_STATUSES, type JobStatus } from "./jobs.js";

// The full matrix: every (status, event) pair → expected next status, or null when forbidden.
const EXPECTED: Record<JobStatus, Record<JobEvent, JobStatus | null>> = {
    queued: {
        claim: "running",
        submit: null,
        succeed: null,
        retry: null,
        fail: null,
        cancel: "cancelled",
        release: null,
    },
    running: {
        claim: null,
        submit: "waiting_provider",
        succeed: "succeeded",
        retry: "queued",
        fail: "failed",
        cancel: "cancelled",
        release: "queued",
    },
    waiting_provider: {
        claim: null,
        submit: null,
        succeed: "succeeded",
        retry: "queued",
        fail: "failed",
        cancel: "cancelled",
        release: "queued",
    },
    succeeded: { claim: null, submit: null, succeed: null, retry: null, fail: null, cancel: null, release: null },
    failed: { claim: null, submit: null, succeed: null, retry: null, fail: null, cancel: null, release: null },
    cancelled: { claim: null, submit: null, succeed: null, retry: null, fail: null, cancel: null, release: null },
};

const cases = JOB_STATUSES.flatMap((from) =>
    (Object.keys(EXPECTED[from]) as JobEvent[]).map((event) => [from, event, EXPECTED[from][event]] as const),
);

describe("nextJobStatus", () => {
    it.each(cases)("%s + %s → %s", (from, event, expected) => {
        if (expected === null) expect(() => nextJobStatus(from, event)).toThrow(InvalidTransitionError);
        else expect(nextJobStatus(from, event)).toBe(expected);
    });

    it("has a readable error", () => {
        expect(() => nextJobStatus("succeeded", "retry")).toThrow("Cannot retry a job that is succeeded");
    });
});

describe("isTerminalJobStatus", () => {
    it.each(JOB_STATUSES)("%s", (status) => {
        expect(isTerminalJobStatus(status)).toBe(["succeeded", "failed", "cancelled"].includes(status));
    });
});
