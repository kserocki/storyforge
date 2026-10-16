import { type RetryOptions, type VideoProvider, waitForTask } from "@storyforge/runway-client";
import type { AssetStorage } from "../storage/storage.js";
import type { JobHandler } from "../worker/run-worker.js";
import { PermanentJobError } from "../error/classify-error.js";
import { getShotWithReference, heartbeat, markSubmitted, setShotClipUrl } from "@storyforge/db";

export interface ClipHandlerDeps {
    provider: VideoProvider;
    storage: AssetStorage;
    pollIntervalMs: number;
    timeoutMs?: number;
    pollRetry?: Omit<RetryOptions, "signal">;
}

export function createClipHandler(deps: ClipHandlerDeps): JobHandler {
    return async (job, ctx) => {
        if (!job.shotId) throw new PermanentJobError(`clip job ${job.id} has no shot`);

        const row = await getShotWithReference(ctx.db, job.shotId);
        if (!row) throw new PermanentJobError(`shot ${job.shotId} not found`);

        const { shot, referenceImageUrl } = row;
        if (!referenceImageUrl) throw new PermanentJobError(`storyboard of shot ${shot.id} has no reference image`);

        let taskId = job.providerTaskId;
        if (taskId) {
            ctx.log("provider_task_resumed", { jobId: job.id, taskId: taskId });
        } else {
            const started = await deps.provider.startImageToVideo(
                { promptImage: referenceImageUrl, promptText: shot.prompt, duration: shot.durationS === 10 ? 10 : 5 },
                ctx.signal,
            );
            taskId = started.id;
            ctx.log("provider_task_started", { jobId: job.id, taskId: taskId });
        }

        await markSubmitted(ctx.db, job.id, ctx.workerId, taskId);

        // Heartbeat on every status update; if we lost the job (requeued as stale), stop polling.
        const lost = new AbortController();
        const task = await waitForTask(deps.provider, taskId, {
            intervalMs: deps.pollIntervalMs,
            timeoutMs: deps.timeoutMs ?? 10 * 60_000,
            ...(deps.pollRetry && { retry: deps.pollRetry }),
            signal: AbortSignal.any([ctx.signal, lost.signal]),
            onUpdate: (t) => {
                ctx.log("provider_task_status", { jobId: job.id, taskId: taskId, status: t.status });
                heartbeat(ctx.db, job.id, ctx.workerId).catch((err: unknown) => lost.abort(err));
            },
        });

        const asset = await deps.storage.save(`clips/${shot.id}.mp4`, task.output[0]!, ctx.signal);
        await setShotClipUrl(ctx.db, shot.id, asset.url);
        ctx.log("clip_saved", { jobId: job.id, shotId: shot.id, key: asset.key });
    };
}
