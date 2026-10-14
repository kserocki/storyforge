import {randomUUID} from "node:crypto";
import {RunwayApiError} from "../http/errors.js";
import type {ImageToVideoInput, VideoProvider} from "./provider.js";
import type {Task, TaskStatus} from "../task/task.js";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface FakeRunwayProviderOptions {
    /** Status returned by each consecutive getTask; the last one repeats. */
    script?: TaskStatus[];
    /** Turns the terminal SUCCEEDED step into FAILED with this failure. */
    failWith?: { failure: string; failureCode?: string };
    outputUrl?: string;
    /** How many first getTask calls throw RunwayApiError(503). */
    flakyGetTask?: number;
}

export const DEFAULT_FAKE_SCRIPT: TaskStatus[] = ["PENDING", "THROTTLED", "RUNNING", "RUNNING", "SUCCEEDED"];

// <repo root>/tmp/fake-clip.mp4 — this file lives in packages/runway-client/src/providers.
export const DEFAULT_FAKE_OUTPUT_URL = pathToFileURL(
    path.resolve(import.meta.dirname, "../../../../tmp/fake-clip.mp4"),
).href;

interface FakeTaskState {
    id: string;
    createdAt: string;
    input: ImageToVideoInput;
    step: number;
}

export class FakeRunwayProvider implements VideoProvider {
    private readonly tasks = new Map<string, FakeTaskState>();
    private readonly script: TaskStatus[];
    private flakyLeft: number;

    constructor(private readonly options: FakeRunwayProviderOptions = {}) {
        this.script = options.script ?? DEFAULT_FAKE_SCRIPT;
        if (this.script.length === 0) throw new Error("Script not found");
        this.flakyLeft = options.flakyGetTask ?? 0;
    }

    async startImageToVideo(input: ImageToVideoInput, signal?: AbortSignal): Promise<{ id: string }> {
        signal?.throwIfAborted();
        const id = randomUUID();
        this.tasks.set(id, {id, createdAt: new Date().toISOString(), input, step: 0});
        return {id}
    }

    async getTask(id: string, signal?: AbortSignal): Promise<Task> {
        signal?.throwIfAborted();
        if (this.flakyLeft > 0) {
            this.flakyLeft--;
            throw new RunwayApiError(503, "Fake: Service unavailable")
        }

        const state = this.tasks.get(id);
        if (!state) throw new RunwayApiError(404, `Fake: task ${id} not found`);

        const status = this.script[Math.min(state.step, this.script.length - 1)]!;
        state.step++;

        return this.buildTask(state, status);
    }

    private buildTask(state: FakeTaskState, status: TaskStatus): Task {
        const base = { id: state.id, createdAt: state.createdAt };
        const { failWith } = this.options;
        if (status === "FAILED" || (status === "SUCCEEDED" && failWith)) {
            return { ...base, status: "FAILED", ...(failWith ?? { failure: "Fake: Simulated failure"})};
        }

        if (status === "SUCCEEDED") {
            return { ...base, status, output: [this.options.outputUrl ?? DEFAULT_FAKE_OUTPUT_URL ]};
        }

        return { ...base, status };
    }
}