import { describe, expect, it } from "vitest";
import { RunwayApiError } from "../http/errors.js";
import { FakeRunwayProvider } from "./fake-provider.js";
import { TaskSchema } from "../task/task.js";

const input = { promptImage: "https://example.com/x.jpg", promptText: "neon city" };

describe("FakeRunwayProvider", () => {
    it("walks a task through the whole default script", async () => {
        const fake = new FakeRunwayProvider({ outputUrl: "https://cdn.example/clip.mp4" });
        const { id } = await fake.startImageToVideo(input);

        const statuses = [];
        for (let i = 0; i < 6; i++) {
            const task = await fake.getTask(id);
            expect(TaskSchema.parse(task)).toEqual(task); // fake output must be valid API shape
            statuses.push(task.status);
        }

        expect(statuses).toEqual(["PENDING", "THROTTLED", "RUNNING", "RUNNING", "SUCCEEDED", "SUCCEEDED"]);
        expect(await fake.getTask(id)).toMatchObject({ status: "SUCCEEDED", output: ["https://cdn.example/clip.mp4"] });
    });

    it("ends with FAILED when failWith is set", async () => {
        const fake = new FakeRunwayProvider({
            script: ["RUNNING", "SUCCEEDED"],
            failWith: { failure: "Prompt rejected", failureCode: "SAFETY.INPUT.TEXT" },
        });
        const { id } = await fake.startImageToVideo(input);

        await fake.getTask(id);
        const task = await fake.getTask(id);

        expect(TaskSchema.parse(task)).toEqual(task);
        expect(task).toMatchObject({ status: "FAILED", failure: "Prompt rejected", failureCode: "SAFETY.INPUT.TEXT" });
    });

    it("simulates transient 503s on getTask", async () => {
        const fake = new FakeRunwayProvider({ flakyGetTask: 2 });
        const { id } = await fake.startImageToVideo(input);

        await expect(fake.getTask(id)).rejects.toMatchObject({ status: 503, retryable: true });
        await expect(fake.getTask(id)).rejects.toBeInstanceOf(RunwayApiError);
        await expect(fake.getTask(id)).resolves.toMatchObject({ status: "PENDING" });
    });

    it("returns 404 for unknown tasks and unique ids", async () => {
        const fake = new FakeRunwayProvider();
        const a = await fake.startImageToVideo(input);
        const b = await fake.startImageToVideo(input);
        expect(a.id).not.toBe(b.id);
        await expect(fake.getTask("nope")).rejects.toMatchObject({ status: 404 });
    });
});
