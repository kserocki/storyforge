import { type RetryOptions, withRetry } from "../http/retry.js";
import { isTerminalTask, type Task } from "./task.js";
import { type VideoProvider } from "../providers/provider.js";
import { sleep } from "../http/sleep.js";

export interface PollOptions {
    intervalMs?: number;
    jitterRatio?: number;
    random?: () => number;
    signal?: AbortSignal;
    retry?: Omit<RetryOptions, "signal">;
}

export type SucceededTask = Extract<Task, { status: "SUCCEEDED" }>;
export type FailedTask = Extract<Task, { status: "FAILED" | "CANCELED" }>;

const DEFAULT_GET_RETRY: Omit<RetryOptions, "signal"> = { maxAttempts: 5, baseMs: 1000, maxMs: 30_000 };

export async function* pollTask(provider: VideoProvider, id: string, options: PollOptions = {}): AsyncGenerator<Task> {
    const { intervalMs = 5000, jitterRatio = 0.2, random = Math.random, signal } = options;
    const retry = { ...(options.retry ?? DEFAULT_GET_RETRY), signal };

    while (true) {
        const task = await withRetry(() => provider.getTask(id, signal), retry);
        yield task;
        if (isTerminalTask(task.status)) return;
        await sleep(intervalMs + intervalMs * jitterRatio * random(), signal);
    }
}

export class TaskFailedError extends Error {
    constructor(readonly task: FailedTask) {
        super(
            task.status === "FAILED"
                ? `Task ${task.id} failed: ${task.failureCode ?? "UNKNOWN"} ${task.failure}`
                : `Task ${task.id} was canceled`,
        );
        this.name = "TaskFailedError";
    }
}

export interface WaitOptions extends PollOptions {
    timeoutMs?: number;
    onUpdate?: (task: Task) => void;
}

export async function waitForTask(provider: VideoProvider, id: string, options: WaitOptions): Promise<SucceededTask> {
    const { timeoutMs, onUpdate, ...pollOptions } = options;

    const timeout = new AbortController();
    const timer =
        timeoutMs === undefined
            ? undefined
            : setTimeout(
                  () => timeout.abort(new DOMException(`Task ${id} timed out after ${timeoutMs} ms`, "TimeoutError")),
                  timeoutMs,
              );
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;

    try {
        for await (const task of pollTask(provider, id, { ...pollOptions, signal })) {
            onUpdate?.(task);
            if (task.status === "SUCCEEDED") return task;
            if (task.status === "FAILED" || task.status === "CANCELED") throw new TaskFailedError(task);
        }
        throw new Error("unreachable: pollTask ended without a terminal task");
    } finally {
        clearTimeout(timer);
    }
}
