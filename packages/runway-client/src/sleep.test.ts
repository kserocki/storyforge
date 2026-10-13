import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sleep } from "./sleep.js";

describe("sleep", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("resolves after the given time", async () => {
        let done = false;
        const p = sleep(1000).then(() => (done = true));
        await vi.advanceTimersByTimeAsync(999);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await p;
        expect(done).toBe(true);
    });

    it("rejects and clears the timer when aborted", async () => {
        const ac = new AbortController();
        const p = sleep(1000, ac.signal);
        ac.abort(new Error("stop"));
        await expect(p).rejects.toThrow("stop");
        expect(vi.getTimerCount()).toBe(0);
    });

    it("rejects immediately for an already aborted signal", async () => {
        await expect(sleep(1000, AbortSignal.abort(new Error("already")))).rejects.toThrow("already");
    });
});