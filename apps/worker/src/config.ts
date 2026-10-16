import { z } from "zod";
import * as os from "node:os";

const intFromEnv = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const WorkerConfigSchema = z
    .object({
        DATABASE_URL: z.string().min(1),
        PROVIDER: z.enum(["fake", "runway"]).default("fake"),
        RUNWAY_API_KEY: z
            .string()
            .optional()
            .transform((v) => v || undefined),
        RUNWAY_API_VERSION: z.string().default("2024-11-06"),
        /** Identifies this process in jobs.locked_by. */
        WORKER_ID: z.string().default(`${os.hostname()}-${process.pid}`),
        /** Jobs this process runs at the same time. */
        WORKER_CONCURRENCY: intFromEnv(2),
        /** Global cap on jobs talking to Runway at once — your Runway tier (Tier 1: 1–2). */
        PROVIDER_CONCURRENCY: intFromEnv(1),
        /** How long to sleep when the queue is empty. */
        IDLE_POLL_MS: intFromEnv(1000),
        /** No heartbeat for this long → the job's worker is considered dead. */
        STALE_AFTER_MS: intFromEnv(120_00),
        ASSETS_DIR: z.string().optional(),
    })
    .superRefine((env, ctx) => {
        if (env.PROVIDER === "runway" && !env.RUNWAY_API_KEY) {
            ctx.addIssue({
                code: "custom",
                message: "RUNWAY_API_KEY is required when PROVIDER=runway",
                path: ["RUNWAY_API_KEY"],
            });
        }
    });

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function loadWorkerConfig(source: Record<string, string | undefined> = process.env): WorkerConfig {
    return WorkerConfigSchema.parse(source);
}
