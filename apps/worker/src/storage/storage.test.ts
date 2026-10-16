import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { assertSafeKey, LocalAssetStorage } from "./storage.js";

describe("LocalAssetStorage", () => {
    it("copies the source into <root>/<key> and returns its file URL", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "sf-storage-"));
        const source = path.join(dir, "source.mp4");
        await writeFile(source, "fake video bytes");

        const asset = await new LocalAssetStorage(path.join(dir, "assets")).save(
            "clips/shot-1.mp4",
            pathToFileURL(source).href,
        );

        expect(asset.key).toBe("clips/shot-1.mp4");
        expect(await readFile(new URL(asset.url), "utf8")).toBe("fake video bytes");
    });

    it("save asserts asserts unsafe asset key", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "sf-storage-"));
        const source = path.join(dir, "source.mp4");
        const storage = new LocalAssetStorage(path.join(dir, "assets"));
        await expect(storage.save("../x.mp4", pathToFileURL(source).href)).rejects.toThrow(/Unsafe asset key/);
    });
});

describe("assertSafeKey", () => {
    it.each(["clips/a.mp4", "keyframes/shot_1.png"])("accepts %s", (key) => {
        expect(() => assertSafeKey(key)).not.toThrow();
    });

    it.each(["../etc/passwd", "clips/../../x", "/abs/path.mp4", "clips//a.mp4", ""])("rejects %j", (key) => {
        expect(() => assertSafeKey(key)).toThrow(/Unsafe asset key/);
    });
});
