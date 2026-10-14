import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { downloadToFile } from "./download.js";

const payload = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
let server: Server;
let baseUrl: string;
let dir: string;

beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "download-test-"));
    server = createServer((req, res) => {
        if (req.url === "/clip.mp4") {
            res.writeHead(200, { "Content-Type": "video/mp4" });
            res.end(payload);
        } else {
            res.writeHead(404).end();
        }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
});

describe("downloadToFile", () => {
    it("streams an HTTP response to disk (creating directories)", async () => {
        const dest = path.join(dir, "nested", "clip.mp4");
        await downloadToFile(`${baseUrl}/clip.mp4`, dest);
        expect(await readFile(dest)).toEqual(payload);
    });

    it("copies file: URLs", async () => {
        const src = path.join(dir, "src.mp4");
        await writeFile(src, payload);
        const dest = path.join(dir, "copy.mp4");
        await downloadToFile(pathToFileURL(src).href, dest);
        expect(await readFile(dest)).toEqual(payload);
    });

    it("throws on HTTP errors", async () => {
        await expect(downloadToFile(`${baseUrl}/missing`, path.join(dir, "x.mp4"))).rejects.toThrow(/404/);
    });
});