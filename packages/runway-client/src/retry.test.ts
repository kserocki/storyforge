import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunwayApiError } from "./errors.js";
import { withRetry, type RetryOptions } from "./retry.js";

const opts: RetryOptions = { maxAttempts: 3, baseMs: 1000, maxMs: 10_000, random: () => 0 };

describe("withRetry", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("retries retryable errors and returns the result", async () => {
        const fn = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new RunwayApiError(503, ""))
            .mockRejectedValueOnce(new RunwayApiError(503, ""))
            .mockResolvedValue("ok");
        const onRetry = vi.fn();

        const p = withRetry(fn, { ...opts, onRetry });
        await vi.advanceTimersByTimeAsync(1000 + 2000);

        await expect(p).resolves.toBe("ok");
        expect(fn).toHaveBeenCalledTimes(3);
        expect(onRetry).toHaveBeenNthCalledWith(1, expect.any(RunwayApiError), 1, 1000);
        expect(onRetry).toHaveBeenNthCalledWith(2, expect.any(RunwayApiError), 2, 2000);
    });

    it("does not retry non-retryable errors", async () => {
        const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new RunwayApiError(400, "bad"));

        await expect(withRetry(fn, opts)).rejects.toMatchObject({ status: 400 });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("throws the last error after maxAttempts", async () => {
        const fn = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new RunwayApiError(503, "first"))
            .mockRejectedValueOnce(new RunwayApiError(502, "second"))
            .mockRejectedValueOnce(new RunwayApiError(504, "last"));

        const p = withRetry(fn, opts);
        const assertion = expect(p).rejects.toMatchObject({ status: 504, body: "last" });
        await vi.advanceTimersByTimeAsync(10_000);

        await assertion;
        expect(fn).toHaveBeenCalledTimes(3);
    });
});