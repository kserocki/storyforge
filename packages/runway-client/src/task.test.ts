import {describe, expect, it} from "vitest";
import {isTerminalTask, parseTask} from "./task.js";

describe("isTerminalTask", () => {
    it.each(["SUCCEEDED", "FAILED", "CANCELED"] as const)("%s is terminal", (s) => {
        expect(isTerminalTask(s)).toBe(true);
    })

    it.each(["RUNNING", "THROTTLED", "PENDING"] as const)("%s is not terminal", (s) => {
        expect(isTerminalTask(s)).toBe(false);
    })
})

describe("parseTask", () => {
    const base = {id: "t1", createdAt: "2026-10-12T10:00:00Z"};

    it("accepts a valid SUCCEEDED task", () => {
        const task = parseTask({...base, status: "SUCCEEDED", output: ["https://x/clip.mp4"]});
        expect(task).toEqual({...base, status: "SUCCEEDED", output: ["https://x/clip.mp4"]});
    });

    it("throws for SUCCEEDED without output", () => {
        expect(() => parseTask({...base, status: "SUCCEEDED"})).toThrow();
    });

    it("strips unknown fields instead of failing", () => {
        const task = parseTask({...base, status: "RUNNING", progress: 0.5});
        expect(task).toEqual({...base, status: "RUNNING"});
        expect(task).not.toHaveProperty("progress");
    });
});