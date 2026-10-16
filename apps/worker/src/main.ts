import * as path from "node:path";
import { loadWorkerConfig } from "./config/config.js";
import { createLogger } from "./logger/logger.js";
import { createDb, pingDb } from "@storyforge/db";
import { runWorker } from "./worker/run-worker.js";
import { FakeRunwayProvider, RunwayProvider, type VideoProvider } from "@storyforge/runway-client";
import { LocalAssetStorage } from "./storage/storage.js";
import { createClipHandler } from "./handlers/clip.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
process.loadEnvFile(path.join(repoRoot, ".env"));

const config = loadWorkerConfig();
const log = createLogger({ worker: config.WORKER_ID });
const { db, close } = createDb(config.DATABASE_URL);

const provider: VideoProvider =
    config.PROVIDER === "runway"
        ? new RunwayProvider({ apiKey: config.RUNWAY_API_KEY!, apiVersion: config.RUNWAY_API_VERSION! })
        : new FakeRunwayProvider();
const storage = new LocalAssetStorage(config.ASSETS_DIR ?? path.join(repoRoot, "tmp", "assets"));
const clip = createClipHandler({ provider, storage, pollIntervalMs: config.PROVIDER === "runway" ? 5000 : 200 });

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
        handlers: { clip },
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
