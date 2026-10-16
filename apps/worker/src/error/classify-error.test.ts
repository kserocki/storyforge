import { RunwayApiError, TaskFailedError } from "@storyforge/runway-client";
import { InvalidTransitionError } from "@storyforge/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifyError } from "./classify-error.js";

const failed = (failureCode?: string) =>
    new TaskFailedError({
        id: "t1",
        createdAt: "2026-10-14T10:00:00Z",
        status: "FAILED",
        failure: "nope",
        failureCode,
    });

describe("classifyError", () => {
    it.each([
        [429, true],
        [503, true],
        [400, false],
        [401, false],
    ])("Runway HTTP %i → retryable %s", (status, retryable) => {
        expect(classifyError(new RunwayApiError(status, "body")).retryable).toBe(retryable);
    });

    it.each([
        ["SAFETY.INPUT.TEXT", false],
        ["SAFETY.OUTPUT.VIDEO", false],
        ["INTERNAL.BAD_OUTPUT.CODE01", true],
        [undefined, true],
    ])("task failure %s → retryable %s", (code, retryable) => {
        const result = classifyError(failed(code));
        expect(result.retryable).toBe(retryable);
        expect(result.message).toContain(code ?? "UNKNOWN");
    });

    it("never retries a canceled task, a bad response shape or an invalid transition", () => {
        const canceled = new TaskFailedError({ id: "t1", createdAt: "2026-10-14T10:00:00Z", status: "CANCELED" });
        const zodError = z.object({ id: z.string() }).safeParse({}).error;
        expect(classifyError(canceled).retryable).toBe(false);
        expect(classifyError(zodError).retryable).toBe(false);
        expect(classifyError(new InvalidTransitionError("succeeded", "retry")).retryable).toBe(false);
    });

    it("retries network errors and unknown throws", () => {
        expect(classifyError(new TypeError("fetch failed"))).toEqual({
            retryable: true,
            message: "TypeError: fetch failed",
        });
        expect(classifyError("weird")).toEqual({ retryable: true, message: "weird" });
    });
});
