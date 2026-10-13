import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRunwayProvider } from "../providers/fake-provider.js";
import { pollTask, TaskFailedError, waitForTask } from "./poll.js";

const input = { promptImage: "https://example.com/x.jpg" };
const noJitter = { intervalMs: 5000, random: () => 0 };

describe("pollTask / waitForTask", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("yields every status from the script (for await)", async () => {
        vi.useRealTimers(); // tiny interval, real time is fine here
        const fake = new FakeRunwayProvider();
        const { id } = await fake.startImageToVideo(input);

        const statuses = [];
        for await (const task of pollTask(fake, id, { intervalMs: 1, random: () => 0 })) statuses.push(task.status);

        expect(statuses).toEqual(["PENDING", "THROTTLED", "RUNNING", "RUNNING", "SUCCEEDED"]);
    });

    it("waits at least intervalMs between reads", async () => {
        const fake = new FakeRunwayProvider();
        const getTask = vi.spyOn(fake, "getTask");
        const { id } = await fake.startImageToVideo(input);

        const p = waitForTask(fake, id, noJitter);
        await vi.advanceTimersByTimeAsync(0);
        expect(getTask).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(4999);
        expect(getTask).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(getTask).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(60_000);
        await expect(p).resolves.toMatchObject({ status: "SUCCEEDED" });
        expect(getTask).toHaveBeenCalledTimes(5);
    });

    it("calls onUpdate and resolves with the SUCCEEDED task", async () => {
        const fake = new FakeRunwayProvider({ outputUrl: "https://cdn/x.mp4" });
        const { id } = await fake.startImageToVideo(input);
        const onUpdate = vi.fn();

        const p = waitForTask(fake, id, { ...noJitter, onUpdate });
        await vi.advanceTimersByTimeAsync(60_000);

        await expect(p).resolves.toMatchObject({ status: "SUCCEEDED", output: ["https://cdn/x.mp4"] });
        expect(onUpdate.mock.calls.map(([t]) => t.status)).toEqual(["PENDING", "THROTTLED", "RUNNING", "RUNNING", "SUCCEEDED"]);
    });

    it("throws TaskFailedError for FAILED", async () => {
        const fake = new FakeRunwayProvider({ failWith: { failure: "bad output", failureCode: "INTERNAL.BAD_OUTPUT" } });
        const { id } = await fake.startImageToVideo(input);

        const p = waitForTask(fake, id, noJitter);
        const assertion = expect(p).rejects.toBeInstanceOf(TaskFailedError);
        await vi.advanceTimersByTimeAsync(60_000);

        await assertion;
        await expect(p).rejects.toMatchObject({ task: { status: "FAILED", failureCode: "INTERNAL.BAD_OUTPUT" } });
    });

    it("keeps polling through transient 503s", async () => {
        const fake = new FakeRunwayProvider({ flakyGetTask: 2 });
        const { id } = await fake.startImageToVideo(input);

        const p = waitForTask(fake, id, { ...noJitter, retry: { maxAttempts: 3, baseMs: 100, maxMs: 1000, random: () => 0 } });
        await vi.advanceTimersByTimeAsync(60_000);

        await expect(p).resolves.toMatchObject({ status: "SUCCEEDED" });
    });

    it("aborts polling after timeoutMs", async () => {
        const fake = new FakeRunwayProvider({ script: ["RUNNING"] }); // never finishes
        const { id } = await fake.startImageToVideo(input);

        const p = waitForTask(fake, id, { ...noJitter, timeoutMs: 20_000 });
        const assertion = expect(p).rejects.toMatchObject({ name: "TimeoutError" });
        await vi.advanceTimersByTimeAsync(20_000);

        await assertion;
        expect(vi.getTimerCount()).toBe(0);
    });

    it("stops when the caller aborts", async () => {
        const fake = new FakeRunwayProvider({ script: ["RUNNING"] });
        const { id } = await fake.startImageToVideo(input);
        const ac = new AbortController();

        const p = waitForTask(fake, id, { ...noJitter, signal: ac.signal });
        const assertion = expect(p).rejects.toThrow("user cancel");
        await vi.advanceTimersByTimeAsync(7000);
        ac.abort(new Error("user cancel"));

        await assertion;
    });
});