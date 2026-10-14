import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const jobKind = pgEnum("job_kind", ["keyframe", "clip", "stitch"]);
export const jobStatus = pgEnum("job_status", [
    "queued",
    "running",
    "waiting_provider",
    "succeeded",
    "failed",
    "cancelled",
]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const storyboards = pgTable("storyboards", {
    id: uuid("id").primaryKey().defaultRandom(),
    brief: text("brief").notNull(),
    createdAt: createdAt(),
});

export const shots = pgTable("shots", {
    id: uuid("id").primaryKey().defaultRandom(),
    storyboardId: uuid("storyboard_id")
        .notNull()
        .references(() => storyboards.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    prompt: text("prompt").notNull(),
    durationS: integer("duration_s").notNull(),
    keyframeUrl: text("keyframe_url"),
    clipUrl: text("clip_url"),
    createdAt: createdAt(),
});

export const jobs = pgTable(
    "jobs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        storyboardId: uuid("storyboard_id")
            .notNull()
            .references(() => storyboards.id, { onDelete: "cascade" }),
        // Null for "stitch" jobs, which concern the whole storyboard.
        shotId: uuid("shot_id").references(() => shots.id, { onDelete: "cascade" }),
        kind: jobKind("kind").notNull(),
        status: jobStatus("status").notNull().default("queued"),
        attempts: integer("attempts").notNull().default(0),
        maxAttempts: integer("max_attempts").notNull().default(5),
        // Earliest time a worker may pick the job up; backoff moves it into the future.
        runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
        lockedAt: timestamp("locked_at", { withTimezone: true }),
        lockedBy: text("locked_by"),
        providerTaskId: text("provider_task_id"), // task id on Runway's side
        lastError: text("last_error"),
        createdAt: createdAt(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [index("jobs_status_run_after_idx").on(t.status, t.runAfter)],
);

export type Storyboard = typeof storyboards.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
