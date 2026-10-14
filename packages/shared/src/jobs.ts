import { z } from "zod";

/** Every job kind the worker knows how to run. Order matters only for display. */
export const JOB_KINDS = ["keyframe", "clip", "stitch"] as const;
export const JobKindSchema = z.enum(JOB_KINDS);
export type JobKind = z.infer<typeof JobKindSchema>;

/** Lifecycle of a job row: queued → running → waiting_provider → succeeded | failed | cancelled. */
export const JOB_STATUSES = ["queued", "running", "waiting_provider", "succeeded", "failed", "cancelled"] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** Kinds that call a paid provider (Runway) and therefore count towards its concurrency limit. */
export const PROVIDER_JOB_KINDS = ["keyframe", "clip"] as const satisfies readonly JobKind[];
