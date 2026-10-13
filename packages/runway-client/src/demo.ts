import path from "node:path";
import { ZodError } from "zod";
import { describeTask, parseTask, type Task } from "./task.js";
import {loadEnv} from "./env.js";

const tasks: Task[] = [
    { id: "t1", createdAt: "2026-10-12T10:00:00Z", status: "THROTTLED" },
    { id: "t2", createdAt: "2026-10-12T10:00:00Z", status: "SUCCEEDED", output: ["https://example.com/clip.mp4"] },
    { id: "t3", createdAt: "2026-10-12T10:00:00Z", status: "FAILED", failure: "Prompt rejected", failureCode: "SAFETY.INPUT.TEXT" },
];
for (const task of tasks) {
    console.log(`${task.id}: ${describeTask(task)}`);
}

// Valid JSON from the network.
console.log(describeTask(parseTask({ id: "t4", createdAt: "2026-10-12T10:00:00Z", status: "RUNNING", progress: 0.4 })));

// Invalid: SUCCEEDED without output.
try {
    parseTask({ id: "t5", createdAt: "2026-10-12T10:00:00Z", status: "SUCCEEDED" });
} catch (err) {
    if (err instanceof ZodError) console.error("Invalid task JSON:", err.issues);
    else throw err;
}

// Resolved from this file (src/ → runway-client → packages → repo root), not from the CWD.
process.loadEnvFile(path.resolve(import.meta.dirname, "../../..", ".env"));
const env = loadEnv();

console.log(env);