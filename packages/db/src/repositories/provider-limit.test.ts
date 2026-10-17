import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { jobs, storyboards } from "../schema.js";
import { createTestDb, resetTestDb } from "../testing/index.js";
import { claimNextJobWithinLimit, markSucceeded, type ProviderLimit } from "./jobs.js";

const { db, close } = createTestDb();
const other = createTestDb();

beforeEach(() => resetTestDb(db));
afterAll(async () => {
    await close();
    await other.close();
});

const limit = (max: number): ProviderLimit => ({ providerKinds: ["keyframe", "clip"], max });

async function insert(kinds: ("clip" | "stitch")[]) {
    const [sb] = await db.insert(storyboards).values({ brief: "test" }).returning();
    await db.insert(jobs).values(kinds.map((kind) => ({ storyboardId: sb!.id, kind })));
}

describe("claimNextJobWithinLimit", () => {
    it("stops handing out provider jobs at the limit, but still hands out other kinds", async () => {
        await insert(["clip", "clip", "stitch"]);

        const first = await claimNextJobWithinLimit(db, "w1", limit(1), { kinds: ["clip"] });
        expect(first?.kind).toBe("clip");
        expect(await claimNextJobWithinLimit(db, "w1", limit(1), { kinds: ["clip"] })).toBeUndefined();
        expect((await claimNextJobWithinLimit(db, "w1", limit(1)))?.kind).toBe("stitch");

        await markSucceeded(db, first!.id, "w1");
        expect((await claimNextJobWithinLimit(db, "w1", limit(1)))?.kind).toBe("clip");
    });

    it("holds the limit under concurrent claims from many workers", async () => {
        await insert(Array.from({ length: 10 }, () => "clip" as const));

        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) => claimNextJobWithinLimit(i % 2 ? db : other.db, `w${i}`, limit(3))),
        );

        expect(results.filter(Boolean)).toHaveLength(3);
    });
});
