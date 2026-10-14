import { createWriteStream } from "node:fs";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";

export interface DownloadOptions {
    signal?: AbortSignal;
    fetchFn?: typeof fetch;
}

export async function downloadToFile(url: string, destPath: string, options: DownloadOptions = {}): Promise<void> {
    const parsed = new URL(url);
    await mkdir(path.dirname(destPath), {recursive: true});

    if (parsed.protocol === "file:") {
        await copyFile(fileURLToPath(parsed), destPath);
        return;
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }

    const res = await (options.fetchFn ?? fetch)(parsed, { signal: options.signal})
    if (!res.ok || !res.body) {
        throw new Error(`Download failed: HTTP ${res.status} for ${parsed.origin}${parsed.pathname}`)
    }
    try {
        await pipeline(
            Readable.fromWeb(res.body as NodeWebReadableStream<Uint8Array>),
            createWriteStream(destPath),
            { signal: options.signal }
        );
    } catch (error) {
        await rm(destPath, { force: true });
        throw error;
    }
}