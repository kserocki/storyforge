import path from "node:path";
import { pathToFileURL } from "node:url";
import { downloadToFile } from "@storyforge/runway-client";

export interface StoredAsset {
    /** Stable, provider-independent name, e.g. "clips/<shotId>.mp4" — this is what goes into the DB. */
    key: string;
    /** Where the bytes can be read right now (file:// locally, https:// on S3/CloudFront later). */
    url: string;
}

/** Our own copy of generated media. Runway output URLs expire in 24–48 h, so we copy immediately. */
export interface AssetStorage {
    save(key: string, sourceUrl: string, signal?: AbortSignal): Promise<StoredAsset>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/i;

/** Rejects absolute paths and `..` so a key can never escape the storage root (path traversal). */
export function assertSafeKey(key: string): void {
    if (!SAFE_KEY.test(key) || key.split("/").some((part) => part === ".." || part === "")) {
        throw new Error(`Unsafe asset key: ${key}`);
    }
}

export class LocalAssetStorage implements AssetStorage {
    constructor(private readonly rootDir: string) {}

    async save(key: string, sourceUrl: string, signal?: AbortSignal): Promise<StoredAsset> {
        assertSafeKey(key);
        const dest = path.join(this.rootDir, key);
        await downloadToFile(sourceUrl, dest, { signal });
        return { key, url: pathToFileURL(dest).href };
    }
}
