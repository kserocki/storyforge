import * as path from "node:path";
import { loadWorkerConfig } from "./config/config.js";
import { createLogger } from "./logger/logger.js";
import { createDb, pingDb } from "@storyforge/db";
import { runWorker } from "./worker/run-worker.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
process.loadEnvFile(path.join(repoRoot, ".env"));

const config = loadWorkerConfig();
const log = createLogger({ worker: config.WORKER_ID });
const { db, close } = createDb(config.DATABASE_URL);

// Any stop trigger -> stop taking new jobs, let running ones hand back cleanly, then exit.
const shutdown = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
        log("shutdown_requested", { signal });
        shutdown.abort();
    });
}

try {
    await pingDb(db);
    log("worker_started", { provider: config.PROVIDER, concurrency: config.WORKER_CONCURRENCY });
    await runWorker({
        db: db,
        workerId: config.WORKER_ID,
        handlers: {},
        log: log,
        signal: shutdown.signal,
        concurrency: config.WORKER_CONCURRENCY,
        idleMs: config.IDLE_POLL_MS,
        staleAfterMs: config.STALE_AFTER_MS,
    });
} finally {
    await close();
    log("worker_stopped");
}
