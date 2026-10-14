import path from "node:path";
import { parseArgs } from "node:util";
import {
    downloadToFile,
    FakeRunwayProvider,
    loadEnv,
    RunwayProvider,
    TaskFailedError,
    waitForTask,
    type VideoProvider,
} from "../src/index.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
process.loadEnvFile(path.join(repoRoot, ".env"));
const env = loadEnv();

const { values } = parseArgs({
    options: {
        prompt: { type: "string" },
        image: { type: "string" },
        duration: { type: "string", default: "5" },
    },
});

if (!values.prompt || !values.image) {
    console.error('Usage: pnpm clip --prompt "neon city" --image https://example.com/x.jpg [--duration 5|10]');
    process.exit(1);
}

if (values.duration !== "5" && values.duration !== "10") {
    console.error("--duration must be 5 or 10");
    process.exit(1);
}

const duration = values.duration === "10" ? 10 : 5;
const provider: VideoProvider =
    env.PROVIDER === "runway"
        ? new RunwayProvider({ apiKey: env.RUNWAY_API_KEY!, apiVersion: env.RUNWAY_API_VERSION })
        : new FakeRunwayProvider();

const intervalMs = env.PROVIDER === "runway" ? 5000 : 500;
const ac = new AbortController();
process.on("SIGINT", () => ac.abort(new Error("SIGINT")));

const start = Date.now();
function elapsed(): string {
    const s = Math.round((Date.now() - start) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

try {
    console.log(`Provider: ${env.PROVIDER}`);
    const { id } = await provider.startImageToVideo(
        { promptImage: values.image, promptText: values.prompt, duration },
        ac.signal,
    );
    console.log(`[${elapsed()}] started task ${id}`);

    const task = await waitForTask(provider, id, {
        intervalMs,
        timeoutMs: 10 * 60_000,
        signal: ac.signal,
        onUpdate: (t) => console.log(`[${elapsed()}] ${t.status}`),
    });

    const dest = path.join(repoRoot, "tmp", "clips", `${task.id}.mp4`);
    await downloadToFile(task.output[0]!, dest, { signal: ac.signal });

    console.log(`[${elapsed()}] saved ${path.relative(process.cwd(), dest)}`);
    console.log(dest);
} catch (err) {
    if (ac.signal.aborted) {
        console.error("Canceled");
        process.exit(130);
    }
    if (err instanceof TaskFailedError) {
        console.error(`[${elapsed()}] ${err.message}`);
        process.exit(2);
    }
    throw err;
}
