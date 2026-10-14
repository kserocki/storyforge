import { z } from "zod";
import { type ImageToVideoInput, type VideoProvider } from "./provider.js";
import { runwayFetch, type RunwayHttpConfig } from "../http/http.js";
import { parseTask, type Task } from "../task/task.js";

const StartResponse = z.object({ id: z.string() });

export class RunwayProvider implements VideoProvider {
    constructor(private readonly config: RunwayHttpConfig) {}

    // Deliberately NOT wrapped in withRetry: a 503/timeout may arrive after Runway already
    // accepted the task, so a retry could create (and bill) a second one. Needs idempotency keys.
    async startImageToVideo(input: ImageToVideoInput, signal?: AbortSignal): Promise<{ id: string }> {
        const json = await runwayFetch(this.config, "/v1/image_to_video", {
            method: "POST",
            body: {
                model: input.model ?? "gen4_turbo",
                promptImage: input.promptImage,
                promptText: input.promptText,
                ratio: input.ratio ?? "1280:720",
                duration: input.duration ?? 5,
            },
            signal,
        });
        return StartResponse.parse(json);
    }

    // Safe to retry (read-only); pollTask wraps it in withRetry
    async getTask(id: string, signal?: AbortSignal): Promise<Task> {
        const json = await runwayFetch(this.config, `/v1/tasks/${encodeURIComponent(id)}`, { signal });
        return parseTask(json);
    }
}
