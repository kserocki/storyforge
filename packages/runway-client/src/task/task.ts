import {z} from "zod";

// Fields shared by every task variant.
const TaskBase = z.object({
    id: z.string(),
    createdAt: z.string(),
});

export const TaskSchema = z.discriminatedUnion("status", [
    TaskBase.extend({status: z.literal("PENDING")}),
    TaskBase.extend({status: z.literal("THROTTLED")}),
    TaskBase.extend({status: z.literal("RUNNING")}),
    TaskBase.extend({status: z.literal("SUCCEEDED"), output: z.array(z.string())}),
    TaskBase.extend({
        status: z.literal("FAILED"),
        failure: z.string(),
        failureCode: z.string().optional()
    }),
    TaskBase.extend({status: z.literal("CANCELED")}),
])

export type TaskBase = z.infer<typeof TaskBase>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = Task["status"];

export function parseTask(json: unknown): Task {
    return TaskSchema.parse(json);
}

export function isTerminalTask(status: TaskStatus): boolean {
    switch (status) {
        case "PENDING":
        case "THROTTLED":
        case "RUNNING":
            return false;
        case "SUCCEEDED":
        case "FAILED":
        case "CANCELED":
            return true;
        default: {
            // Compile error here if a new status is added and not handled above.
            const unreachable: never = status;
            return unreachable;
        }
    }
}

export function describeTask(task: Task): string {
    switch (task.status) {
        case "PENDING":
            return "⏳ in Runway queue";
        case "THROTTLED":
            return "🐢 slowed down (concurrency limit)";
        case "RUNNING":
            return "🎬 generating…";
        case "SUCCEEDED":
            return `✅ ready: ${task.output[0] ?? "(no URL)"}`;
        case "FAILED":
            return `❌ ${task.failureCode ?? "UNKNOWN"}: ${task.failure}`;
        case "CANCELED":
            return "🚫 cancelled";
    }
}